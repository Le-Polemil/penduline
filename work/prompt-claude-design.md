# Prompt de recherche pour Claude Design

> Copie-colle le bloc ci-dessous dans Claude Design.

---

Je conçois une app perso appelée **Penduline**. Objectif :
gérer une **matrice d'Eisenhower** (2×2 urgent/important) pour **chaque pièce de
ma maison**, accessible en web sur n'importe quel device, avec une **extension
Chrome compagnon** pour consulter/alimenter mes matrices rapidement. Multi-compte
(chacun ses matrices, isolées). Backend déjà choisi : Supabase.

**Modèle figé** : 4 cases, une couleur par case — rouge = urgent+important
(*Faire*), bleu = important pas urgent (*Planifier*), doré/jaune = urgent pas
important (*Déléguer*), vert = ni/ni (*Éliminer/plus tard*). Hiérarchie :
pièces → matrices (rattachables à une pièce) → tâches (dans une case).

**Contrainte esthétique** : je veux fuir le « look IA » générique — pas de
gradients violet/bleu, pas de blur, pas d'emoji décoratif, pas de police
générique. Je cherche une direction visuelle distinctive et assumée (le bleu
reste autorisé, mais uniquement comme couleur fonctionnelle d'une case).

Fais-moi une **recherche produit + UX**, structurée, avec ces axes :

1. **Benchmark** — comment Todoist, TickTick, Focus Matrix, Priority Matrix,
   Eisenhower.me traitent la matrice 2×2 : patterns à reprendre, pièges à éviter.
2. **Responsive de la grille 2×2 sur mobile** — le vrai casse-tête. Compare
   pile verticale / onglets par case / vue liste filtrable, avec recommandation
   argumentée. Comment garder lisible la sémantique urgent×important sur petit écran.
3. **Interaction tâches** — ajout rapide, déplacement entre cases (drag & drop vs
   tap-to-move), édition, complétion. Ce qui marche au doigt comme à la souris.
4. **Navigation multi-matrices/pièces** — écran d'accueil, bascule entre pièces
   et matrices, cas « beaucoup de pièces ». Un modèle mental clair.
5. **UX de l'extension Chrome** — popup vs side panel ; consultation + ajout
   rapide ; comment choisir la pièce/matrice cible ; capture depuis le contexte.
6. **Système de couleurs & accessibilité** — exploiter mes 4 couleurs de façon
   lisible, contrastes AA, cas daltonisme (ne pas reposer que sur la couleur).
7. **Rappels/notifications** (piste future) — PWA Web Push vs alternatives, quoi
   rappeler et quand sans devenir intrusif (digest « aujourd'hui », échéances).
8. **Direction visuelle distinctive** — 2-3 pistes d'ambiance avec références
   concrètes, cohérentes avec la contrainte anti-« look IA ».

**Livrables attendus** : reco UX par axe avec le *pourquoi*, descriptions de
wireframes (accueil, matrice desktop, matrice mobile, popup extension), une
coupe **MVP** (v1) vs plus tard, et les risques/angles morts.
