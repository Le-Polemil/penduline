"""Découpe ET volume. C'était le chaînon manquant des deux essais précédents.

NidClay : le volume sans la découpe — un ovale en plastique.
NidSilhouette : la découpe sans le volume — un aplat, pas une icône.

Et le volume de l'asset de référence n'est PAS un dégradé. C'est le contresens
que faisait NidClay : `streak-freeze.svg` ne contient aucun `linearGradient`.
La profondeur y vient de PLANS francs superposés — une masse claire, un cœur
saturé, un motif vif, puis un plan translucide en diagonale et des éclats
blancs à arêtes nettes. Des facettes, pas de l'aérographe. C'est ce qui tient à
20 px là où un dégradé devient une bouillie.

Et aucun contour : le trait noir épais de NidClay faisait autocollant.
"""
# La poche : large en haut, resserrée à la taille, arrondie en bas. Ce n'est
# plus l'ovale — un nid de rémiz PEND, il ne repose pas.
POCHE = ('M56 16 C35 16 21 33 21 53 C21 66 24 77 31 85 '
         'C38 93 46 99 56 99 C66 99 74 93 81 85 '
         'C88 77 91 66 91 53 C91 33 77 16 56 16 Z')
COEUR = ('M56 28 C41 28 31 40 31 54 C31 64 33 72 39 79 '
         'C44 85 50 89 56 89 C62 89 68 85 73 79 '
         'C79 72 81 64 81 54 C81 40 71 28 56 28 Z')
COL = 'M48 10 C48 3 65 3 65 10 L62.5 25 C60 31 53 31 50.5 25 Z'
FACETTE = 'M4 62 L68 -2 L104 6 L16 96 Z'
TUILES = [
    ('M44 42 h7 a5.5 5.5 0 0 1 5.5 5.5 v8.5 h-12.5 a5.5 5.5 0 0 1 -5.5 -5.5 v-2.5 a5.5 5.5 0 0 1 5.5 -5.5 Z', 0),
    ('M61 42 h7 a5.5 5.5 0 0 1 5.5 5.5 v2.5 a5.5 5.5 0 0 1 -5.5 5.5 h-12.5 v-8.5 a5.5 5.5 0 0 1 5.5 -5.5 Z', 1),
    ('M41 58.5 h15.5 v8.5 a5.5 5.5 0 0 1 -5.5 5.5 h-7 a5.5 5.5 0 0 1 -5.5 -5.5 v-2.5 a5.5 5.5 0 0 1 2.5 -6 Z', 2),
    ('M57.5 58.5 h10.5 a5.5 5.5 0 0 1 5.5 5.5 v2.5 a5.5 5.5 0 0 1 -5.5 5.5 h-5 a5.5 5.5 0 0 1 -5.5 -5.5 Z', 3),
]
VIFS = ['#7FAE4A', '#4A8FBF', '#E0A62B', '#CE4D32']

# Les brins d'« Hérissé » : des éclisses effilées, posées une par une. Un semis
# régulier aurait fait soleil ; c'est l'irrégularité qui fait paille.
BRINS = ['M28 36 L34 31 L10 13 L15 28 Z', 'M46 19 L54 17 L49 -3 L41 12 Z',
         'M79 31 L85 38 L106 21 L92 20 Z', 'M90 52 L91 60 L112 62 L100 51 Z',
         'M82 82 L77 88 L97 102 L92 88 Z', 'M31 81 L26 74 L4 83 L17 90 Z',
         'M21 58 L22 49 L0 43 L9 56 Z']
TUBE = 'M31 40 C21 34 9 32 4 36 C-1 40 -1 50 4 53 C10 57 21 55 32 50 Z'
GLACONS = ('M56 16 C35 16 21 33 21 53 C21 66 24 77 31 85 L35 104 L41 87 '
           'L47 112 L53 89 L59 108 L65 88 L71 101 L76 84 C87 76 91 66 91 53 '
           'C91 33 77 16 56 16 Z')
GIVRE_HAUT = 'M35 25 L28 8 L44 18 Z M76 24 L86 10 L86 28 Z'
BRECHE = ('M56 16 C35 16 21 33 21 53 C21 66 24 77 31 85 C38 93 46 99 56 99 '
          'C63 99 69 96 74 91 L65 86 L78 80 L68 73 L81 67 L70 60 L83 54 '
          'L72 47 L85 41 L74 34 L87 29 C82 21 70 16 56 16 Z')
CHUTE = ('M30 105 L35 104 L40 119 L34 120 Z M50 108 L55 108 L55 122 L49 122 Z '
         'M67 105 L72 106 L75 119 L69 119 Z')

def _eclat(cx, cy, t, op=1.0):
    d = t / 2
    return (f'<rect fill="#FFF" opacity="{op}" x="{cx-d:.1f}" y="{cy-d:.1f}" width="{t}" height="{t}" '
            f'rx="{t*0.14:.2f}" transform="rotate(45 {cx} {cy})" />')

def icone(uid, variante, size=168, clair='#F0A468', sature='#C95F1F', facette='#FFE2C4'):
    corps = {'givre': GLACONS, 'eclate': BRECHE}.get(variante, POCHE)
    s = (f'<svg viewBox="-4 -6 120 132" width="{size}" height="{size}" aria-hidden="true">'
         f'<defs><clipPath id="i{uid}"><path d="{corps}" /></clipPath></defs>')
    # 1 · la masse, ton clair — brins et tube EN FONT PARTIE, ils ne sont pas posés dessus
    if variante == 'herisse':
        s += ''.join(f'<path d="{b}" fill="{clair}" />' for b in BRINS)
    if variante == 'givre':
        s += f'<path d="{GIVRE_HAUT}" fill="{clair}" />'
    if variante == 'eclate':
        s += f'<path d="{CHUTE}" fill="{clair}" />'
    s += f'<g transform="rotate(8 56 14)"><path d="{COL}" fill="{clair}" /></g>'
    if variante == 'tube':
        s += f'<path d="{TUBE}" fill="{clair}" />'
    s += f'<path d="{corps}" fill="{clair}" />'
    # 2 · le cœur, ton saturé
    s += f'<path d="{COEUR}" fill="{sature}" />'
    if variante == 'tube':
        s += '<ellipse cx="6" cy="44.5" rx="4.5" ry="8.5" fill="#8E3D10" />'
    # 3 · le motif, tons vifs
    s += ''.join(f'<path d="{d}" fill="{VIFS[i]}" />' for d, i in TUILES)
    # 4 · le plan de facette, détouré sur la masse
    s += f'<g clip-path="url(#i{uid})"><path d="{FACETTE}" fill="{facette}" opacity="0.42" /></g>'
    # 5 · les éclats
    s += _eclat(37, 33, 12) + _eclat(75, 76, 8, 0.85)
    return s + '</svg>'

VARIANTES = [
    ('tube', 'Tube', "L'entrée latérale en manchon — la signature de la rémiz penduline, et de personne d'autre."),
    ('herisse', 'Hérissé', "Sept éclisses sortent de la masse. L'équivalent direct des gouttes figées du bloc de glace."),
    ('poche', 'Poche', "La découpe seule : large en haut, resserrée à la taille. On voit que ça pend."),
    ('givre', 'Givré', "Stalactites prises dans le bord bas, givre sur le dessus. Dit « en veille » par la forme."),
    ('eclate', 'Éclaté', "Une brèche dentelée sur le flanc, des brins qui tombent. Dit « sec » sans une couleur."),
]
