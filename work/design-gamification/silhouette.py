"""Des nids dont le CONTOUR dit quelque chose.

La version précédente posait un filtre — dégradé, contour épais, reflet — sur
une silhouette inchangée : de loin, une pastille de plus. Le bloc de glace de
Duolingo ne marche pas comme ça. Sa découpe EST un bloc de glace : arête en
toit, gradins sur le côté, gouttes figées en bas. On sait ce que c'est avant la
première couleur.

Ici c'est donc la découpe qui porte le sens. Chaque variante se juge silhouette
pleine, sans couleur : si elle ne se lit pas en noir sur blanc, elle ne se lit
pas du tout.
"""
import math

CX, CY, RX, RY = 56, 58, 34, 37

def _pt(a, k=1.0):
    return (CX + RX * k * math.cos(math.radians(a)), CY + RY * k * math.sin(math.radians(a)))

def _poly(points, ferme=True):
    d = 'M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in points)
    return d + (' Z' if ferme else '')

def herisse():
    """Des brins qui dépassent du contour, comme la paille d'un vrai nid.

    L'équivalent exact des gouttes du bloc de glace : ce ne sont pas des traits
    posés à côté, ils font partie de la découpe.
    """
    brins = {-96: .34, -62: .20, -28: .30, 4: .17, 36: .27, 68: .13,
             104: .24, 138: .33, 172: .19, 206: .28, 238: .15, 272: .22}
    pts = []
    for a in range(-180, 180, 4):
        pique = next((k for k, v in brins.items() if abs(((a - k + 180) % 360) - 180) < 3), None)
        if pique is None:
            pts.append(_pt(a))
    for a, L in brins.items():
        pts += [_pt(a - 3.2), _pt(a, 1 + L), _pt(a + 3.2)]
    pts.sort(key=lambda p: math.atan2(p[1] - CY, p[0] - CX))
    return _poly(pts)

def goutte():
    """Le nid de la rémiz pend et s'effile : la masse est en haut, la pointe en bas."""
    return ('M56 12 C33 12 18 30 18 50 C18 66 26 78 35 89 '
            'C44 100 51 108 56 118 C61 108 68 100 77 89 '
            'C86 78 94 66 94 50 C94 30 79 12 56 12 Z')

def tube():
    """L'entrée en tube sur le flanc — la signature de ce nid-là, et d'aucun autre."""
    return ('M62 20 C40 20 26 38 26 60 C26 82 40 99 62 99 C84 99 96 82 96 60 '
            'C96 38 84 20 62 20 Z '
            'M32 43 C23 38 11 35 5 38 C-1 41 -1 51 5 54 C11 57 23 55 32 51 Z')

def ajoure():
    """Un tressage laisse passer le jour : le contour est percé, pas plein."""
    corps = ('M56 16 C33 16 20 36 20 58 C20 82 34 100 56 100 C78 100 92 82 92 58 '
             'C92 36 79 16 56 16 Z')
    trous = []
    for a, r, rr in ((-140, .78, 5.4), (-108, .86, 4.2), (-74, .8, 5.0),
                     (-42, .86, 4.4), (166, .74, 4.6), (18, .8, 4.0)):
        x, y = _pt(a, r)
        trous.append(f'M{x - rr:.1f} {y:.1f} a{rr} {rr} 0 1 0 {rr * 2} 0 a{rr} {rr} 0 1 0 {-rr * 2} 0 Z')
    return corps + ' ' + ' '.join(trous)

def eclate():
    """Le nid qui se défait : une brèche dans le flanc, des brins qui tombent."""
    return ('M56 16 C34 16 21 35 21 57 C21 72 27 85 37 93 L44 84 L52 95 L60 82 '
            'L69 92 C83 85 91 72 91 57 C91 47 88 38 83 32 L74 41 L79 28 L67 33 '
            'L70 20 C66 17 61 16 56 16 Z '
            'M32 100 L35 100 L39 112 L36 113 Z '
            'M46.5 103 L49.5 103 L49 116 L46 116 Z '
            'M62 101 L65 101 L69 113 L66 114 Z')

def givre():
    """Des stalactites prises dans la découpe, et du givre sur le dessus."""
    corps = ('M56 14 C34 14 21 34 21 56 C21 70 26 82 35 89 L40 104 L47 90 '
             'L53 112 L60 90 L66 106 L72 88 C84 81 91 70 91 56 C91 34 78 14 56 14 Z')
    pointes = ('M34 27 L29 13 L41 21 Z M72 22 L79 9 L81 24 Z M56 12 L53 0 L62 9 Z')
    return corps + ' ' + pointes

VARIANTES = [
    ('herisse', 'Hérissé',  herisse(), 'nonzero',
     "Des brins dépassent de la découpe. C'est l'équivalent direct des gouttes du bloc de glace : la matière sort du contour."),
    ('goutte', 'Goutte',    goutte(), 'nonzero',
     "La masse en haut, la pointe en bas. On voit que ça PEND avant de voir ce que c'est."),
    ('tube', 'Tube',        tube(), 'nonzero',
     "L'entrée en tube sur le flanc. La signature de la rémiz penduline — et de personne d'autre."),
    ('ajoure', 'Ajouré',    ajoure(), 'evenodd',
     "Le contour est percé : un tressage laisse passer le jour. Se lit même en tout petit."),
    ('eclate', 'Éclaté',    eclate(), 'nonzero',
     "Une brèche dans le flanc, des brins qui tombent. La découpe dit « sec » sans une seule couleur."),
    ('givre', 'Givré',      givre(), 'nonzero',
     "Stalactites prises dans la découpe, givre sur le dessus. Dit « en veille » par la forme."),
]
