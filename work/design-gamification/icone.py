"""Découpe ET volume — en courbes, et rien qui flotte.

Trois choses que les essais précédents rataient :

1. Les découpes étaient POLYGONALES : des suites de `L`, donc des arêtes
   droites et des angles vifs. Un dessinateur d'icônes trace des courbes. Tout
   ce qui n'était pas la poche est repassé en béziers — les brins sont des
   lames effilées à double courbure, les stalactites des pendeloques arrondies,
   la brèche un bord festonné.

2. Des éléments FLOTTAIENT autour du nid — brins qui tombent, givre en
   suspension. Supprimés : tout ce qui est dessiné touche la masse.

3. Les cases avaient été redessinées sans raison. Elles reviennent aux tracés
   d'`icon.svg`, au pixel : ce sont eux qui font l'identité, la direction
   artistique ne porte que sur la matière.

Et le volume reste fait de plans francs — `streak-freeze.svg` ne contient aucun
`linearGradient`. Des facettes, pas de l'aérographe ; aucun contour non plus.
"""
import math

# ── Ce qui vient d'icon.svg, inchangé ────────────────────────────────────────
COL = 'M48 10 C48 4 64 4 64 10 L62 24 C60 30 52 30 50 24 Z'
TUILES = [
    'M45.5 40.5 L49.5 40.5 A5 5 0 0 1 54.5 45.5 L54.5 55.5 L44.5 55.5 A5 5 0 0 1 39.5 50.5 L39.5 46.5 A6 6 0 0 1 45.5 40.5 Z',
    'M62.5 40.5 L66.5 40.5 A6 6 0 0 1 72.5 46.5 L72.5 50.5 A5 5 0 0 1 67.5 55.5 L57.5 55.5 L57.5 45.5 A5 5 0 0 1 62.5 40.5 Z',
    'M44.5 58.5 L54.5 58.5 L54.5 68.5 A5 5 0 0 1 49.5 73.5 L45.5 73.5 A6 6 0 0 1 39.5 67.5 L39.5 63.5 A5 5 0 0 1 44.5 58.5 Z',
    'M57.5 58.5 L67.5 58.5 A5 5 0 0 1 72.5 63.5 L72.5 67.5 A6 6 0 0 1 66.5 73.5 L62.5 73.5 A5 5 0 0 1 57.5 68.5 Z',
]
VIFS = ['#7FAE4A', '#4A8FBF', '#E0A62B', '#CE4D32']

# ── Les découpes ─────────────────────────────────────────────────────────────
POCHE = ('M56 18 C36 18 23 34 23 54 C23 67 26 78 33 86 '
         'C40 94 47 99 56 99 C65 99 72 94 79 86 '
         'C86 78 89 67 89 54 C89 34 76 18 56 18 Z')
COEUR = ('M56 29 C42 29 32 41 32 55 C32 65 34 73 40 80 '
         'C45 86 50 89 56 89 C62 89 67 86 72 80 '
         'C78 73 80 65 80 55 C80 41 70 29 56 29 Z')
FACETTE = 'M2 64 L70 -4 L106 6 L16 98 Z'
TUBE = ('M32 39 C22 32 10 30 5 34 C-1 39 -1 50 5 54 C11 58 22 56 33 50 '
        'C31 46 31 43 32 39 Z')
# Le bord bas devient une suite de pendeloques : que des courbes.
def _pendeloques(gouttes):
    """Le bord bas en pendeloques, chacune réglée à part.

    `gouttes` = (centre, profondeur, rayon de pointe). Le rayon arrondit le bout
    plus ou moins ; des pointes strictement égales et régulièrement espacées
    auraient fait peigne, d'où les écarts et les profondeurs dépareillés.
    """
    d = ''
    for cx, prof, r in gouttes:
        y = 86 + prof
        d += (f' C{cx - 4:.0f} {86 + prof * 0.55:.0f} {cx - r:.1f} {y - r:.1f} {cx:.1f} {y:.1f}'
              f' C{cx + r:.1f} {y - r:.1f} {cx + 4:.0f} {86 + prof * 0.55:.0f} {cx + 6:.0f} 87')
    return d

# 1ʳᵉ et 4ᵉ raccourcies, la 2ᵉ rapprochée de la 3ᵉ, les trois dernières
# arrondies comme la première : plus aucune symétrie à lire.
GLACONS = ('M56 18 C36 18 23 34 23 54 C23 67 26 78 33 86'
           + _pendeloques([(38, 14, 2.6), (52, 27, 2.4), (64, 21, 2.6), (76, 9, 2.2)])
           + ' C87 77 89 67 89 54 C89 34 76 18 56 18 Z')
# Le flanc rongé : un feston, pas une dent de scie.
BRECHE = ('M56 18 C36 18 23 34 23 54 C23 67 26 78 33 86 '
          'C40 94 47 99 56 99 C62 99 68 96 73 92 '
          'C67 90 65 86 70 83 C75 80 72 76 67 74 '
          'C62 72 65 68 71 67 C77 66 74 61 69 59 '
          'C64 57 67 53 73 52 C79 51 76 46 71 44 '
          'C66 42 69 38 75 37 C81 36 77 31 72 29 '
          'C69 27 71 23 75 22 C70 19 64 18 56 18 Z')

def _lame(x, y, angle, L, W):
    """Une éclisse : deux courbes qui se rejoignent en pointe, jamais un triangle."""
    d = (f'M0 -{W/2:.1f} C {L*0.42:.1f} -{W*0.62:.1f} {L*0.78:.1f} -{W*0.3:.1f} {L} 0 '
         f'C {L*0.78:.1f} {W*0.24:.1f} {L*0.42:.1f} {W*0.52:.1f} 0 {W/2:.1f} Z')
    return f'<path d="{d}" transform="translate({x:.1f} {y:.1f}) rotate({angle:.1f})" />'

def _brins():
    """Sept éclisses sortant de la masse, longueurs et angles irréguliers.

    Posées sur la NORMALE à la poche : au rayon, celles des flancs bâillaient.
    """
    cx, cy, rx, ry = 56, 58, 33, 40
    # ⚠️ Le secteur du col — environ -90° ± 20° — reste VIDE : une éclisse qui
    # passe derrière la queue la coupe en deux et casse la lecture du pendu.
    plan = [(-138, 26, 7.5), (-116, 20, 6.5), (-52, 24, 7), (-14, 18, 6),
            (34, 25, 7.5), (96, 20, 6.5), (152, 23, 7)]
    out = []
    for deg, L, W in plan:
        a = math.radians(deg)
        x, y = cx + rx * math.cos(a), cy + ry * math.sin(a)
        ang = math.degrees(math.atan2(math.sin(a) / ry, math.cos(a) / rx))
        out.append(_lame(x, y, ang, L, W))
    return ''.join(out)

def _eclat(cx, cy, t, op=1.0):
    d = t / 2
    return (f'<rect fill="#FFF" opacity="{op}" x="{cx-d:.1f}" y="{cy-d:.1f}" width="{t}" height="{t}" '
            f'rx="{t*0.14:.2f}" transform="rotate(45 {cx} {cy})" />')

# Le sec ne brille pas : le lustre est un signal de MATIÈRE, pas un ornement.
MAT = ('#D7B896', '#A67F55', '#EFE3D2')
# Une fissure se propage en segments droits et CHANGE DE CAP aux embranchements.
# C'est le seul endroit du jeu où le polygonal est juste : une fente lissée en
# bézier fait un cheveu, pas une cassure. Deux troncs, cinq ramifications, et le
# trait s'affine sur les branches — elles naissent après, elles portent moins.
FENTE_TRONC = ('M35 36 L39 45 L35 51 L40 59 L36 66 L41 74 '
               'M79 43 L74 50 L78 58 L72 65 L75 72')
FENTE_RAMEAU = ('M39 45 L46 48 L49 45 M40 59 L47 62 L53 59 M36 66 L30 70 '
                'M74 50 L67 52 M78 58 L84 62')

def icone(uid, variante, size=168, clair='#F0A468', sature='#C95F1F', facette='#FFE2C4'):
    corps = {'givre': GLACONS, 'eclate': BRECHE}.get(variante, POCHE)
    mat = variante == 'eclate'
    if mat:
        clair, sature, facette = MAT
    s = (f'<svg viewBox="-4 -4 120 124" width="{size}" height="{size}" aria-hidden="true">'
         f'<defs><clipPath id="i{uid}"><path d="{corps}" /></clipPath></defs>')
    # 1 · la masse. Brins et tube en FONT partie — même ton, même couche.
    if variante == 'herisse':
        s += f'<g fill="{clair}">{_brins()}</g>'
    s += f'<g transform="rotate(8 56 14)"><path d="{COL}" fill="{clair}" /></g>'
    if variante == 'tube':
        s += f'<path d="{TUBE}" fill="{clair}" />'
    s += f'<path d="{corps}" fill="{clair}" />'
    # 2 · le cœur
    s += f'<path d="{COEUR}" fill="{sature}" />'
    if variante == 'tube':
        s += '<ellipse cx="6" cy="44" rx="4.6" ry="8.6" fill="#8E3D10" />'
    # 3 · les cases, au tracé d'icon.svg
    s += ''.join(f'<path d="{d}" fill="{VIFS[i]}" />' for i, d in enumerate(TUILES))
    # 4 · le plan de facette — rasant sur le sec, franc sur le givre
    op = 0.14 if mat else (0.52 if variante == 'givre' else 0.42)
    s += f'<g clip-path="url(#i{uid})"><path d="{FACETTE}" fill="{facette}" opacity="{op}" /></g>'
    # 5 · éclats, ou fentes sur le sec
    if mat:
        s += (f'<g clip-path="url(#i{uid})" fill="none" stroke="#8A6742" stroke-linecap="round" opacity="0.55">'
              f'<path d="{FENTE_TRONC}" stroke-width="1.9" />'
              f'<path d="{FENTE_RAMEAU}" stroke-width="1.2" /></g>')
    else:
        s += _eclat(38, 34, 12) + _eclat(74, 76, 8, 0.85)
        if variante == 'givre':
            s += _eclat(63, 29, 7, 0.9)
    return s + '</svg>'

# « Poche » est retirée : c'était le témoin, pas une variante. La poche est la
# base COMMUNE aux quatre autres, donc la montrer seule ne disait rien de plus
# — et une carte qui ne dit rien se lit comme une proposition creuse.
VARIANTES = [
    ('herisse', 'Hérissé', "Sept éclisses à double courbure sortent de la masse. Aucune ne flotte, aucune ne passe derrière le col."),
    ('tube', 'Tube', "L'entrée latérale en manchon. La seule qui soit intransmissible — et la seule qui demande qu'on l'explique."),
    ('givre', 'Givré', "Le bord bas devient quatre pendeloques dépareillées. Dit « en veille » par la forme."),
    ('eclate', 'Éclaté', "Flanc rongé en feston, fini mat, fissures ramifiées. Le sec ne brille pas."),
]
