"""Traduction de la technique relevée dans streak-freeze.svg.

Cinq couches, dans cet ordre, et pas une de plus :
  1. la silhouette, dans le ton CLAIR ;
  2. un cœur plus petit, dans le ton SATURÉ ;
  3. le motif, dans le ton le plus VIF, plein — jamais au trait ;
  4. un plan de facette translucide (#B4E7FF à 0,593 dans l'original), détouré
     sur la silhouette ;
  5. un ou deux éclats : des carrés blancs aux coins arrondis, tournés de 45°.

Ce que l'original NE fait pas, et que la version précédente faisait : pas de
contour, pas d'anneau, pas de disque sombre décalé sous la forme. La profondeur
vient de la superposition, pas d'un biseau.
"""
PIERRE = ('M50 4 C68 4 88 14 92 32 C96 50 94 70 84 82 C74 94 56 98 42 96 '
          'C24 93 10 82 6 64 C2 46 8 24 22 13 C30 7 40 4 50 4 Z')
COEUR  = ('M50 18 C64 18 78 26 81 40 C84 54 82 68 74 76 C66 84 52 86 42 84 '
          'C28 81 18 72 15 58 C12 44 18 28 30 21 Z')
FACETTE = 'M10 58 L64 4 L98 10 L18 90 Z'

MOTIFS = {
    'corbeille': ('M32 40 L68 40 L63.5 77 C63.2 80 61 82 58 82 L42 82 '
                  'C39 82 36.8 80 36.5 77 Z '
                  'M27 31 L73 31 C75.2 31 77 32.8 77 35 C77 37.2 75.2 39 73 39 '
                  'L27 39 C24.8 39 23 37.2 23 35 C23 32.8 24.8 31 27 31 Z '
                  'M43 21 L57 21 C59.2 21 61 22.8 61 25 L61 30 L54 30 L54 28 '
                  'L46 28 L46 30 L39 30 L39 25 C39 22.8 40.8 21 43 21 Z'),
    'fleche':    ('M22 44 L52 44 L52 30 C52 27 55 25.5 57 27.5 L78 47 '
                  'C79.5 48.5 79.5 51.5 78 53 L57 72.5 C55 74.5 52 73 52 70 '
                  'L52 56 L22 56 C19 56 17 54 17 51 L17 49 C17 46 19 44 22 44 Z'),
    'agenda':    ('M24 30 L76 30 C79 30 81 32 81 35 L81 76 C81 79 79 81 76 81 '
                  'L24 81 C21 81 19 79 19 76 L19 35 C19 32 21 30 24 30 Z '
                  'M31 16 C33.8 16 36 18.2 36 21 L36 32 C36 34.8 33.8 37 31 37 '
                  'C28.2 37 26 34.8 26 32 L26 21 C26 18.2 28.2 16 31 16 Z '
                  'M69 16 C71.8 16 74 18.2 74 21 L74 32 C74 34.8 71.8 37 69 37 '
                  'C66.2 37 64 34.8 64 32 L64 21 C64 18.2 66.2 16 69 16 Z'),
    'horloge':   ('M50 16 C68.8 16 84 31.2 84 50 C84 68.8 68.8 84 50 84 '
                  'C31.2 84 16 68.8 16 50 C16 31.2 31.2 16 50 16 Z'),
    'sommet':    ('M20 66 L42 42 L56 55 L76 28 L76 44 L84 32 L84 62 L20 62 Z'),
    'cadenas':   ('M28 48 L72 48 C75 48 77 50 77 53 L77 79 C77 82 75 84 72 84 '
                  'L28 84 C25 84 23 82 23 79 L23 53 C23 50 25 48 28 48 Z '
                  'M50 12 C61 12 70 21 70 32 L70 48 L60 48 L60 32 '
                  'C60 26.5 55.5 22 50 22 C44.5 22 40 26.5 40 32 L40 48 '
                  'L30 48 L30 32 C30 21 39 12 50 12 Z'),
}

def eclat(cx, cy, taille):
    d = taille / 2
    return (f'<rect fill="#FFF" x="{cx-d:.1f}" y="{cy-d:.1f}" width="{taille}" '
            f'height="{taille}" rx="{taille*0.12:.2f}" transform="rotate(45 {cx} {cy})" />')

def badge(uid, size, motif, clair, sature, vif, facette, eclats=((30, 30, 11), (72, 66, 8))):
    s = (f'<svg viewBox="0 0 100 100" width="{size}" height="{size}" '
         f'style="flex: none;" aria-hidden="true">'
         f'<defs><clipPath id="c{uid}"><path d="{PIERRE}" /></clipPath></defs>'
         f'<path d="{PIERRE}" fill="{clair}" />'
         f'<path d="{COEUR}" fill="{sature}" />'
         f'<path d="{MOTIFS[motif]}" fill="{vif}" opacity="0.92" />'
         f'<g clip-path="url(#c{uid})"><path d="{FACETTE}" fill="{facette}" opacity="0.593" /></g>')
    for cx, cy, t in eclats:
        s += eclat(cx, cy, t)
    return s + '</svg>'
