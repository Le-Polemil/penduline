#!/usr/bin/env bash
#
# Penduline — applique les migrations sur le Postgres auto-hébergé.
#
# ⚠️ Ce script est une COMMANDE FORCÉE SSH. Il est le seul programme que la clé
# de déploiement peut lancer :
#
#   command="/usr/local/bin/penduline-migrate.sh",no-agent-forwarding,\
#   no-port-forwarding,no-pty,no-user-rc,no-X11-forwarding ssh-ed25519 AAAA… ci
#
# Sans cette ligne dans `authorized_keys`, la clé donne un shell sur la machine
# de production à quiconque peut modifier un workflow du dépôt. Avec elle, elle
# ne sait faire que « lister », « appliquer » et « vérifier » — et rien de ce
# qu'elle reçoit n'est jamais interprété comme du shell.
#
# Installation, une fois :
#   sudo install -m 0755 penduline-migrate.sh /usr/local/bin/penduline-migrate.sh
#   # puis la ligne ci-dessus dans ~/.ssh/authorized_keys de l'utilisateur visé

set -euo pipefail

# ── Ce que la commande forcée reçoit ─────────────────────────────────────────
# `SSH_ORIGINAL_COMMAND` porte ce que le client a demandé. Il n'est JAMAIS
# évalué : on le découpe en mots et on ne garde que ceux qu'on reconnaît.
read -r -a mots <<< "${SSH_ORIGINAL_COMMAND:-}"
sous_commande="${mots[0]:-}"

erreur() { echo "penduline-migrate: $*" >&2; exit 1; }

# La sous-commande est validée AVANT tout : une demande refusée ne doit pas
# d'abord échouer sur autre chose, et n'a aucune raison de toucher à Docker.
case "$sous_commande" in
  applied | apply | record | verify) ;;
  *) erreur "sous-commande refusée : « ${sous_commande:-(vide)} » — attendu : applied | apply | record | verify" ;;
esac

# Réglages de l'HÔTE, jamais du client. Sert à fixer le conteneur quand la
# machine héberge plusieurs stacks Supabase :
#   echo 'PENDULINE_DB_CONTAINER=supabase-db-xxxx' > /etc/default/penduline-migrate
# Et, si l'image n'accorde pas la confiance à `supabase_admin` sur le socket
# local, le mot de passe à lui passer :
#   echo 'PENDULINE_DB_PASSWORD=…' >> /etc/default/penduline-migrate
# shellcheck source=/dev/null
[ -r /etc/default/penduline-migrate ] && . /etc/default/penduline-migrate

# ── Le conteneur, découvert et non configuré ─────────────────────────────────
# Un nom de conteneur en secret vieillirait mal : Coolify le recompose à chaque
# redéploiement. On le retrouve, et on refuse d'agir si le compte n'est pas 1 —
# se tromper de base est le seul échec dont on ne revient pas.
trouver_db() {
  if [ -n "${PENDULINE_DB_CONTAINER:-}" ]; then
    docker inspect -f '{{.Name}}' "$PENDULINE_DB_CONTAINER" >/dev/null 2>&1 \
      || erreur "conteneur « $PENDULINE_DB_CONTAINER » introuvable (voir /etc/default/penduline-migrate)"
    printf '%s' "$PENDULINE_DB_CONTAINER"
    return
  fi
  local trouves
  trouves=$(docker ps --format '{{.Names}}' | grep -E 'supabase[-_]db' || true)
  local n=0
  [ -n "$trouves" ] && n=$(printf '%s\n' "$trouves" | wc -l | tr -d ' ')
  case "$n" in
    1) printf '%s' "$trouves" ;;
    0) erreur "aucun conteneur Postgres Supabase en cours d'exécution" ;;
    *) erreur "plusieurs conteneurs candidats, refus d'en choisir un : $(echo "$trouves" | tr '\n' ' ') — fixez PENDULINE_DB_CONTAINER dans /etc/default/penduline-migrate" ;;
  esac
}

DB=$(trouver_db)

# `supabase_admin`, jamais `postgres` : les tables de `public` appartiennent à
# `supabase_admin`, et `postgres` n'est pas membre de ce rôle. Un `create table`
# en `postgres` réussit mais crée une table invisible à PostgREST — la panne ne
# se voit qu'à l'exécution. Voir apps/supabase/README.md.
psql_admin() {
  # Le mot de passe n'est passé que s'il est réglé : sur l'instance de
  # production, `supabase_admin` se connecte par confiance sur le socket local
  # et un `PGPASSWORD` vide suffirait à casser ça.
  if [ -n "${PENDULINE_DB_PASSWORD:-}" ]; then
    docker exec -e PGPASSWORD="$PENDULINE_DB_PASSWORD" -i "$DB" psql -U supabase_admin -d postgres "$@"
  else
    docker exec -i "$DB" psql -U supabase_admin -d postgres "$@"
  fi
}

# ── La table de suivi ────────────────────────────────────────────────────────
# Cette instance n'a pas été créée par le CLI Supabase : la table peut manquer.
# Sa forme suit celle du CLI, pour qu'un futur `db diff` s'y retrouve.
assurer_suivi() {
  psql_admin -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
-- Les « already exists, skipping » de `if not exists` partent sur stderr à
-- chaque appel : du bruit dans tous les journaux, pour une non-information.
set client_min_messages = warning;
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version    text primary key,
  name       text,
  statements text[]
);
SQL
}

# ── Validation des arguments ─────────────────────────────────────────────────
# Rien de ce qui vient du client n'entre dans une requête sans être borné : la
# version est un horodatage, le nom un identifiant. Tout le reste est refusé.
valider_version() {
  [[ "$1" =~ ^[0-9]{14}$ ]] || erreur "version invalide : « $1 » (14 chiffres attendus)"
}
valider_nom() {
  [[ "$1" =~ ^[a-zA-Z0-9_]{1,100}$ ]] || erreur "nom de migration invalide : « $1 »"
}

case "$sous_commande" in

  # Les versions déjà appliquées, une par ligne. C'est ce que le workflow
  # compare aux fichiers du dépôt pour savoir ce qu'il reste à faire.
  applied)
    assurer_suivi
    psql_admin -At -c "select version from supabase_migrations.schema_migrations order by version"
    ;;

  # Applique UNE migration, lue sur l'entrée standard.
  #
  # ⚠️ L'enregistrement de la version part dans la MÊME transaction que le DDL,
  # avec `-1`. La procédure manuelle les séparait en deux étapes : une migration
  # appliquée mais non enregistrée se serait re-appliquée au passage suivant.
  # Ici, ou les deux tiennent, ou rien ne tient.
  apply)
    version="${mots[1]:-}"; nom="${mots[2]:-}"
    valider_version "$version"; valider_nom "$nom"
    assurer_suivi

    sql=$(mktemp); trap 'rm -f "$sql"' EXIT
    cat > "$sql"
    [ -s "$sql" ] || erreur "migration vide reçue pour $version"

    {
      cat "$sql"
      echo
      # `on conflict` : rejouer une migration déjà enregistrée ne doit pas
      # transformer une reprise en échec.
      printf "insert into supabase_migrations.schema_migrations (version, name) values ('%s', '%s') on conflict (version) do nothing;\n" "$version" "$nom"
      # PostgREST garde le schéma en cache : sans ce réveil, la table existe,
      # elle est correcte, et l'API répond 404. Dans la transaction, la
      # notification ne part qu'au commit — donc jamais si la migration échoue.
      printf "notify pgrst, 'reload schema';\n"
    } | psql_admin -1 -v ON_ERROR_STOP=1

    echo "appliquée : ${version}_${nom}"
    ;;

  # Enregistre des versions SANS les appliquer — la mise à niveau d'une base
  # dont l'historique n'a jamais été suivi. Entrée standard : « version<TAB>nom »
  # par ligne.
  #
  # ⚠️ À n'utiliser qu'une fois, à la main, pour déclarer ce qui est DÉJÀ en
  # base. L'employer sur une migration non appliquée la ferait disparaître du
  # radar pour de bon.
  record)
    assurer_suivi
    n=0
    while IFS=$'\t' read -r version nom; do
      [ -z "$version" ] && continue
      valider_version "$version"; valider_nom "$nom"
      psql_admin -q -v ON_ERROR_STOP=1 -c \
        "insert into supabase_migrations.schema_migrations (version, name) values ('$version', '$nom') on conflict (version) do nothing"
      echo "enregistrée sans exécution : ${version}_${nom}"
      n=$((n + 1))
    done
    echo "$n version(s) enregistrée(s)."
    ;;

  # Les quatre contrôles du README, en lecture seule, sur tout le schéma public.
  # Le propriétaire doit être `supabase_admin`, le RLS actif, la policy présente,
  # et surtout les droits identiques à ceux des tables déjà en service : c'est le
  # seul des quatre qui prouve que l'application pourra lire la table.
  verify)
    psql_admin -v ON_ERROR_STOP=1 \
      -c "select tablename, tableowner, rowsecurity from pg_tables where schemaname='public' order by 1" \
      -c "select tablename, policyname from pg_policies where schemaname='public' order by 1, 2" \
      -c "select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as droits
            from information_schema.role_table_grants
           where table_schema='public' and grantee in ('anon','authenticated','service_role')
           group by 1, 2 order by 1, 2"
    ;;

esac
