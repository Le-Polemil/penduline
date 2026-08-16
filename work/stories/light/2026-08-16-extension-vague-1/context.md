---
story: "Lot Vague 1 — extension"
story_code: "extension-vague-1"
issues: [11, 29, 16, 52]
created: 2026-08-16
---

# Contexte

## Description fonctionnelle

Quatre tickets touchent le popup de l'extension Chrome. Réunis en une story parce
qu'ils partagent une contrainte de livraison : **chaque version d'extension repasse
en review au Chrome Web Store**, et l'un d'eux modifie le manifeste. Les livrer
séparément coûterait quatre examens pour trois jours de travail.

Deux d'entre eux réparent des impossibilités plutôt qu'ils n'ajoutent des
fonctionnalités. **#11** : les tâches classées « À trier » sur le web n'apparaissent
tout simplement pas dans l'extension — du point de vue de l'utilisateur, elles ont
disparu. **#29** : on ne peut pas créer de matrice depuis le popup, si bien que la
toute première utilisation de l'extension oblige à quitter l'extension. Ce sont
deux moments où le produit se contredit lui-même.

Les deux autres l'étendent. **#16** donne aux carrés de sélection la lecture d'une
matrice unique — coins extérieurs arrondis, coins centraux carrés, cinquième
élément rond au centre — plutôt que quatre boutons juxtaposés. **#52** fait entrer
l'extension dans le flux de navigation : un menu contextuel « Ajouter à Penduline »
sur une sélection, un lien ou une page. C'est là que naissent la plupart des
tâches, et c'est aujourd'hui le seul endroit où l'extension ne sert à rien.

Critères d'acceptation principaux : une tâche « À trier » du web est visible et
filtrable dans le popup ; on peut créer une matrice depuis un compte vide sans
quitter l'extension ; les cinq éléments de sélection se lisent comme une matrice ;
un clic droit crée une tâche dans « À trier » de la matrice voulue, et l'échec —
notamment l'absence de session — ne perd jamais la tâche en silence.

## Vue architecturale

Trois des quatre tickets restent dans le popup React. Le quatrième réveille un
composant jusqu'ici vide.

```
  AVANT                              APRÈS
  ─────                              ─────
  background.ts  (6 lignes,          background.ts
   un console.log)                    ├─ contextMenus  (création + clic)
                                      ├─ client Supabase (via chromeStorage)
                                      └─ badge chrome.action (retour visuel)
                                            ▲
  popup (React) ──────────────────────┐     │ sendMessage(liste des matrices)
   ├─ ExtStore : addTask, patchTask   └─────┘
   └─ Detail : QUADS (4 cases)        popup
                                       ├─ ExtStore : + addBoard
                                       └─ Detail : ALL (5 cases)
```

**Le point le moins évident est la synchronisation des menus.** `chrome.contextMenus`
exige que les entrées soient enregistrées **à l'avance** : impossible de construire
la liste des matrices au moment du clic droit. Deux voies s'offraient — faire
interroger Supabase par le service worker, ou lui faire transmettre par le popup la
liste qu'il a déjà chargée. La seconde a été retenue : elle évite une seconde source
de vérité et un appel réseau dans un worker qui peut être tué à tout moment. Un
cache `chrome.storage.local` couvre le démarrage à froid, quand le popup n'a pas
encore été ouvert.

**La session dans le worker ne demande aucune réarchitecture.** L'adaptateur
`chromeStorage` (`storage.ts`) a été écrit dès l'origine pour fonctionner dans le
worker MV3, où `localStorage` n'existe pas — son commentaire le dit explicitement.
Le worker instancie donc le même client que le popup et lit la même session.

**Contrainte de manifeste.** `contextMenus` s'ajoute à `storage`. Cette permission
n'affiche aucun avertissement à l'installation, mais toute modification du manifeste
repasse en review — d'où le regroupement des quatre tickets. Le retour visuel après
capture passe par le **badge de l'icône** et non par `chrome.notifications`, qui
exigerait une permission de plus : tout le travail consigné dans
`work/publication-extension.md` a consisté à garder ce manifeste minimal, et il n'y
a pas de raison de l'entamer pour un accusé de réception.

**Ordre d'exécution contraint** : #11 avant #16. #11 fait apparaître une cinquième
case dans une grille câblée en 2×2 ; livré seul, il produirait un carré orphelin sur
une troisième ligne. #16 est précisément ce qui lui donne sa géométrie.

## Impacts UX

Le changement le plus visible est celui des carrés de sélection. Aujourd'hui quatre
boutons de 16 px dans une grille 2×2, ils doivent se lire comme **une matrice** —
la même figure que le logo du produit, dont les tuiles gardent déjà leur coin
intérieur carré.

```
   AVANT              APRÈS
   ┌──┐┌──┐          ╭──┐┌──╮
   │ 3││ 1│          │ 3││ 1│
   └──┘└──┘          └──┘└──┘      le rond central = « À trier »
   ┌──┐┌──┐          ┌─╱⬤╲─┐
   │ 2││ 0│          │ 2││ 0│
   └──┘└──┘          ╰──┘└──╯
```

La difficulté est géométrique : le rond chevauche la jonction de **quatre fonds de
couleurs différentes**, et à 16 px de côté il ne peut guère dépasser 10 px sans
manger les compteurs. C'est ce qui justifie une maquette dans le design system
« Organic » avant intégration, plutôt qu'un arbitrage au jugé dans le CSS.

La création de matrice reprend le motif du web — bouton au repos, champ à la
saisie, Entrée valide, Échap annule — mais le formulaire pleine largeur ne se
transpose pas dans 400 px : il faut le resserrer. Et l'état vide cesse de renvoyer
vers le web pour proposer la création sur place, ce qui supprime le seul moment où
l'extension avoue son incomplétude.

Le menu contextuel introduit un parcours qui ne passe plus par le popup du tout.
Son point d'attention est le **retour** : sans accusé de réception, l'utilisateur
ne sait pas si sa tâche est partie. Le badge de l'icône remplit ce rôle sans voler
le focus à la page — et surtout, il doit aussi couvrir l'échec. Une capture perdue
en silence parce que la session a expiré serait pire que pas de capture du tout.

Accessibilité : les cinq éléments de sélection restent des `<button>` avec `title`,
et l'état sélectionné ne doit pas reposer sur la seule couleur — l'existant utilise
déjà un `outline`, à préserver sur le rond central comme sur les carrés.
