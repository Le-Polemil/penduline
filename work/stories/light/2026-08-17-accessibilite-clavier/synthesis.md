---
story: "Accessibilité : alternative clavier au glisser-déposer"
story_code: "accessibilite-clavier"
issues: [38]
pr: 69
created: 2026-08-17
completed: 2026-08-17
status: "Done"
---

# Synthèse

## Résumé

Réordonner se fait au clavier — les tâches dans une case, et les matrices sur
l'accueil. Focus visible partout, texte conforme AA, boutons nommés, dialogues
qui se ferment sur `Échap` et rendent le focus.

## Décisions et leur raison

**Deux chemins clavier, et c'est délibéré.** Les entrées de menu rendent la
fonction **découvrable** ; `Alt`+↑/↓ la rend **praticable** quand on déplace
plusieurs tâches. L'entrée porte son raccourci en clair — c'est ainsi qu'on
apprend `Ctrl+S`, en lisant le menu. Un raccourci que rien n'annonce n'existe pas.

**Le raccourci est capté sur `.card-wrap`, pas sur la carte.** L'événement remonte
du contrôle qui a réellement le focus, ce qui donne le geste **sans ajouter un
seul arrêt de tabulation**. Une case en compte déjà un par contrôle de chaque
tâche ; en ajouter un par carte doublerait le parcours.

**La vue globale n'en reçoit rien**, par omission de la prop `reorder` — comme
elle omet déjà `split`. Les entrées n'existent pas dans son arbre plutôt que d'y
exister désactivées. #18 y avait retiré le réordonnancement à dessein.

**L'annonce dit la position atteinte, jamais le geste.** « Montée » obligerait à
relire la case entière pour se resituer, ce qui annule le bénéfice.

**Le texte secondaire passe en `--color-neutral-700`, pas dans une couleur
inventée.** Les deux gris en usage échouaient (2,42:1 et 3,61:1 pour 4,5 requis) et,
ramenés au seuil, **convergeaient sur la même teinte** : ils ne pouvaient plus
être deux couleurs de texte distinctes. La hiérarchie s'aplatit — contrepartie
assumée, à rattraper par la taille et la graisse.

**Périmètre élargi aux matrices**, que le ticket ignorait : l'accueil les
réordonne et les range dans un univers par le même geste, sans chemin clavier.
**L'extension reste dehors**, explicitement.

## Ce que le travail a mis au jour

**🐛 Deux défauts d'`insertPosition`.** Elle ancrait chaque ligne sur sa position
**minimale**, alors qu'une ligne appairée en occupe deux. Insérer en fin donnait
`min + 1` — soit exactement la seconde carte de la paire. Insérer après une ligne
appairée pouvait tomber **entre ses deux moitiés**.

Aucun des deux n'était atteignable par le glisser : ses interstices s'arrêtent à
l'avant-dernière ligne, et la fin de liste passe par `endPosition`. **Le code avait
raison tant que personne ne s'en servait.** Le clavier emprunte les deux chemins.

**Un test peut passer pour de mauvaises raisons.** Celui qui couvrait ce terrain
affirmait une valeur exacte sur une paire serrée à 0,001 d'écart — si serrée que
les deux bornes se confondaient, et que le calcul faux passait quand même.
Réécrit pour affirmer la **propriété**, sur une paire large.

**🐛 `@media (hover: none)` retirait les actions de ligne par `display: none`.**
Une tablette munie d'un clavier rapporte elle aussi `hover: none` : le seul chemin
clavier qu'on venait d'ouvrir y aurait disparu de l'arbre d'accessibilité.
Remplacé par un repli que le focus déplie.

**Le contraste des cases était déjà bon, celui des gris non.** Mesurer avant de
corriger a évité de retoucher des teintes conformes — et a montré que le vrai
défaut était ailleurs : un focus à 1,27:1, et un champ d'ajout sans aucun anneau.

**`Confirm` et `BinModal` n'étaient pas au plan** et avaient le même défaut que la
feuille : ni rôle, ni `Échap`, ni gestion du focus. Corrigés par un `useDialog`
partagé plutôt que par trois copies.

## Fichiers modifiés

- `packages/shared/src/layout.ts`, `layout.test.ts`
- `packages/shared/src/contrast.test.ts` *(nouveau)*
- `apps/web/src/a11y/announce.tsx`, `useDialog.ts` *(nouveaux)*
- `apps/web/src/components/TaskCard.tsx`, `BinModal.tsx`, `Confirm.tsx`
- `apps/web/src/screens/Matrix.tsx`, `Home.tsx`, `Global.tsx`
- `apps/web/src/App.tsx`, `styles.css`

Aucune migration.

## Tests et validation

- **Tests automatiques** : ✅ **82** (52 → 82) · **Typecheck / build** : ✅ · **CI** : ✅
- **Dans Chrome**, base locale, console sans erreur : 0 bouton nommé par son seul
  glyphe ou son compteur · 1 région `aria-live` · les deux raccourcis opérants
  depuis la case à cocher **et** depuis le `⋯` · entrées grisées aux extrémités ·
  **vue globale : 0 entrée, `Alt`+flèches sans effet ni annonce** · feuille devenue
  un vrai dialogue rendant le focus sur `Échap` · anneau résolu à
  `--color-accent-600` · **28 éléments focusables de l'accueil, tous avec un
  anneau visible**
- **Lecteur d'écran** : ⛔ non testé. Aucun contrôle automatique ne dit si une
  annonce est *compréhensible* — c'est la limite de cette validation.

## Et après

Le jalon « Mise en conformité » garde **#36** (RGPD : suppression de compte et
export). Et la Vague 0 — **#34** (les échecs d'écriture sont invisibles) et **#35**
(suivi des erreurs) — reste le vrai préalable à une ouverture publique.

À ouvrir : l'alternative clavier dans **l'extension**, laissée hors périmètre ici.
