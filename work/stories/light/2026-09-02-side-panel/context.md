---
story: "Extension : passer du popup au panneau latéral"
story_code: "side-panel"
created: 2026-09-02
---

# Contexte

## Description fonctionnelle

L'extension s'affiche aujourd'hui dans une fenêtre surgissante de 400 × 600 px
qui **disparaît dès qu'on clique ailleurs**. C'est la contrainte structurante du
produit côté navigateur : on ne peut pas relire la page pendant qu'on saisit une
tâche, ni garder ses matrices sous les yeux en travaillant. Chaque geste en
plusieurs temps — corriger un titre capturé, renommer, choisir une destination —
se fait sous la menace d'une fermeture.

Le panneau latéral (`chrome.sidePanel`, Chrome 114+) supprime cette menace. Il
se docke à droite de la fenêtre, reste ouvert quand on navigue et change
d'onglet, occupe toute la hauteur disponible et se redimensionne à la main.
L'entrée reste la même : un clic sur l'icône de la barre d'outils.

**Aucune fonctionnalité ne change.** C'est un déplacement d'hôte : mêmes écrans,
mêmes gestes, mêmes données. Le bénéfice est entièrement dans ce que l'hôte
cesse d'interdire — et dans ce qu'il débloque pour la suite : #95 (replier le
menu `⋯`, rendre la carte lisible) voyait trois de ses arbitrages dictés par les
400 px, pas par le besoin.

Contrepartie assumée : on perd l'ouvrir/fermer d'un seul geste, plus léger pour
une capture éclair. Maintenir les deux hôtes doublerait la surface pour un seul
produit — l'arbitrage a été tranché en faveur du panneau.

**Critères d'acceptation** — le panneau s'ouvre au clic sur l'icône et survit à
un clic dans la page ; il tient sans débordement horizontal de 240 px (minimum
imposé par Chrome) à ~600 px ; une capture par clic droit l'ouvre sur le
formulaire, qu'il fût fermé **ou déjà ouvert** ; aucune capture n'est perdue si
l'ouverture échoue ; `host_permissions` reste absent du manifeste.

## Vue architecturale

Trois composants bougent, et un seul contrat change.

```
        AVANT                                    APRÈS

  clic icône ──> action.default_popup      clic icône ──> setPanelBehavior
                      │                                   openPanelOnActionClick
                      v                                          │
                 popup.html                                      v
                 (400×600, meurt au blur)                  sidepanel.html
                                                           (fluide, persistant)

  clic droit ──> setPending()              clic droit ──> sidePanel.open()   ← geste
                      │                                        │               utilisateur
                      v                                        v
                 action.openPopup()                       setPending()
                 (Chrome 127+, fragile)                        │
                      │ échec                                  │ échec de open()
                      v                                        v
                 écriture directe                         écriture directe
```

**L'inversion d'ordre est le point technique du lot.** `sidePanel.open()` exige
un geste utilisateur, et tout `await` intercalé rompt la chaîne : l'ouverture
doit précéder l'écriture de la capture en attente. Or le panneau lisait cette
capture **au montage seulement** (`getPending()`), ce qui crée une course : il
peut se monter avant que la capture ne soit déposée.

La réponse est un abonnement à `chrome.storage.session.onChanged`, et elle
couvre d'un seul mécanisme deux situations distinctes : la course ci-dessus, et
le **cas entièrement nouveau** d'une capture reçue alors que le panneau est déjà
monté — impossible auparavant, puisque le popup se fermait au premier clic droit
dans la page.

Le repli reste intact dans son principe : si `open()` échoue, on écrit
directement. C'est le point non négociable hérité de #78 — une capture perdue en
silence est pire que l'absence de formulaire.

**Impact sur le reste du système : nul.** `packages/shared`, `apps/web`, le
schéma Supabase et `store.ts` ne bougent pas. `pending-capture.ts` reste le
canal entre le service worker et l'interface ; seule sa cadence d'écriture
s'allège, l'écriture à chaque frappe n'ayant été qu'une parade au blur.

Côté dossier Chrome Web Store, la permission `sidePanel` s'ajoute à `storage` et
`contextMenus`. Elle n'affiche aucun avertissement à l'installation et ne
déclenche pas d'examen approfondi — la ligne rouge documentée dans
`work/publication-extension.md` est `host_permissions`, qui reste absent.

## Impacts UX

Le changement d'hôte redistribue l'espace plus qu'il ne change les écrans.

```
   AVANT — popup 400×600, volatil      APRÈS — panneau docké, persistant
  ┌───────────────┐                   ┌──────────┬──────────────────┐
  │  ▣ Penduline  │  ← flotte         │          │  ▣ Penduline     │
  │  Faire     3  │     au-dessus     │   page   │  Faire        3  │
  │  ○ Tâche…     │     de la page    │   web    │  ○ Tâche longue  │
  │  ○ Tâche…     │                   │          │  ○ Tâche…        │
  │               │  ← 600 px cap     │  reste   │  ○ …             │
  └───────────────┘                   │  cliqua- │                  │
   disparaît au 1ᵉʳ clic dehors       │  ble     │  toute la hauteur│
                                      └──────────┴──────────────────┘
                                        240 px ←─ redimensionnable ─→
```

Deux acquis pour l'utilisateur. **La persistance** : relire la page pendant
qu'on corrige un titre capturé devient possible — c'est précisément le geste que
le popup rendait impossible, et la raison d'être du formulaire de #78.
**La hauteur** : la liste n'est plus coupée à 600 px, donc moins de défilement
et un menu `⋯` qui cesse d'être rogné en bas de case.

Un point de vigilance : la largeur devient **variable, et peut descendre à
240 px**. Toute mise en page qui supposait 400 px doit être reprise — le menu
`⋯` à 210 px fixes en particulier. La cible de test est donc double, 240 px et
~600 px, et rien ne doit déborder horizontalement au plus étroit.

Accessibilité : le panneau étant une région persistante du navigateur, le focus
n'est plus arraché à chaque perte de focus — ce qui rend enfin praticables au
clavier les parcours en plusieurs étapes (renommer, choisir une destination).
