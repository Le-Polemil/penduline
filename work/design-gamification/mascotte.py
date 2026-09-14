"""Une mascotte rémiz penduline, dans la grammaire de construction de Duo.

Ce qui est repris, c'est la GRAMMAIRE, pas le personnage : aplats sans contour,
tête et corps en une seule masse, yeux surdimensionnés, pattes détachées du
corps, un plan plus clair pour la face. Duo est un hibou vert ; ici c'est une
rémiz — autre espèce, autre silhouette, autre palette.

Et le hasard fait bien les choses : le masque noir de la rémiz tombe exactement
là où Duo porte ses grandes taches oculaires. La signature de l'oiseau EST la
pièce maîtresse de cette grammaire.
"""
# Palette relevée sur la photo, désaturée juste ce qu'il faut pour l'aplat.
CRANE   = '#F1EDE6'   # calotte blanc-gris
CRANE_O = '#DCD5C9'   # son ombre
MASQUE  = '#2A2622'   # le bandeau noir
DOS     = '#A8552A'   # manteau marron
DOS_C   = '#C4703E'   # sa variante claire
VENTRE  = '#EBD9BC'   # poitrine chamois
VENTRE_O= '#D8C09B'
BEC     = '#6B6E72'   # bec ardoise, conique
BEC_C   = '#8A8D91'
PATTE   = '#E39A3C'   # pattes ocre — la passerelle avec le terracotta du produit
OEIL    = '#3A3632'

def _oeil(cx, cy, rx=9.5, ry=11, ferme=False):
    if ferme:
        return (f'<path d="M{cx-rx:.0f} {cy} C{cx-rx*0.5:.0f} {cy+ry*0.62:.0f} '
                f'{cx+rx*0.5:.0f} {cy+ry*0.62:.0f} {cx+rx:.0f} {cy}" fill="none" '
                f'stroke="{CRANE}" stroke-width="3.4" stroke-linecap="round" />')
    return (f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="#FFF" />'
            f'<ellipse cx="{cx+rx*0.16:.1f}" cy="{cy+ry*0.14:.1f}" rx="{rx*0.5:.1f}" ry="{ry*0.55:.1f}" fill="{OEIL}" />'
            f'<circle cx="{cx-rx*0.12:.1f}" cy="{cy-ry*0.26:.1f}" r="{rx*0.19:.1f}" fill="#FFF" />')

def _patte(cx, cy, w=13, h=8, rot=0):
    return (f'<rect x="{cx-w/2:.1f}" y="{cy-h/2:.1f}" width="{w}" height="{h}" rx="{h/2}" '
            f'fill="{PATTE}" transform="rotate({rot} {cx} {cy})" />')

def portrait(uid, ferme=False):
    """Tête de face. La pose qui sert de vignette, d'avatar, d'icône d'app."""
    s = '<svg viewBox="0 0 120 124" width="200" height="207" aria-hidden="true">'
    # La masse : ni ronde ni symétrique — le crâne est plus plein à gauche.
    s += (f'<path d="M59 11 C87 11 106 31 106 59 C106 85 88 104 59 104 '
          f'C31 104 13 85 13 58 C13 30 32 11 59 11 Z" fill="{CRANE}" />')
    # Le manteau marron, qui déborde du crâne par les tempes.
    s += (f'<path d="M59 11 C77 11 92 19 100 33 C92 29 84 30 79 35 '
          f'C72 27 66 24 59 24 C52 24 45 27 39 35 C34 30 26 29 18 33 '
          f'C26 19 41 11 59 11 Z" fill="{DOS}" />')
    # Le bandeau : il plonge au milieu, il ne barre pas la face d'un trait.
    s += (f'<path d="M17 51 C21 39 31 32 44 33 C51 34 56 39 60 44 '
          f'C64 39 70 34 77 33 C89 32 99 39 103 51 '
          f'C99 63 89 70 77 68 C69 67 64 61 60 56 '
          f'C56 61 51 67 44 68 C31 70 21 63 17 51 Z" fill="{MASQUE}" />')
    s += _oeil(38, 50, ferme=ferme) + _oeil(82, 50, ferme=ferme)
    # La joue chamois, posée sous le bandeau.
    s += f'<path d="M60 62 C74 62 86 70 88 82 C79 92 70 96 60 96 C50 96 41 92 32 82 C34 70 46 62 60 62 Z" fill="{VENTRE}" />'
    # Le bec, conique et court — celui de la rémiz, pas celui d'un hibou.
    s += (f'<path d="M60 60 L69 73 C66 77 54 77 51 73 Z" fill="{BEC_C}" />'
          f'<path d="M60 60 L69 73 C67 75 62 76 60 76 Z" fill="{BEC}" />')
    s += _patte(48, 112, rot=-8) + _patte(72, 112, rot=8)
    return s + '</svg>'

def debout(uid):
    """Trois-quarts, corps entier. La pose de présentation."""
    s = '<svg viewBox="0 0 120 124" width="200" height="207" aria-hidden="true">'
    s += (f'<path d="M58 14 C82 14 99 33 99 58 C99 72 96 84 90 93 '
          f'C84 101 72 106 58 106 C44 106 33 101 27 92 C21 83 19 71 19 57 '
          f'C19 32 35 14 58 14 Z" fill="{VENTRE}" />')
    # Le dos et l'aile, d'un seul tenant, posés en écharpe.
    s += (f'<path d="M58 14 C80 14 97 32 99 56 C100 74 94 88 84 95 '
          f'C88 84 88 71 84 61 C80 50 72 42 62 39 C70 33 78 33 86 36 '
          f'C79 23 70 16 58 14 Z" fill="{DOS}" />')
    s += f'<path d="M84 61 C88 71 88 84 84 95 C79 98 73 99 68 98 C79 90 84 76 84 61 Z" fill="{DOS_C}" />'
    # La queue, longue et effilée : elle dépasse franchement de la masse.
    s += f'<path d="M92 88 C102 96 112 106 116 116 C107 114 96 106 88 97 Z" fill="{DOS}" />'
    s += (f'<path d="M50 16 C68 12 84 20 88 34 C80 29 71 28 64 31 '
          f'C56 25 48 23 40 26 C41 21 44 17 50 16 Z" fill="{CRANE}" />')
    s += (f'<path d="M22 44 C25 33 34 27 45 28 C51 29 56 33 59 38 '
          f'C63 34 68 30 74 30 C84 30 91 36 94 45 '
          f'C90 55 82 60 73 59 C66 58 62 53 59 49 '
          f'C55 54 50 59 44 59 C33 60 25 54 22 44 Z" fill="{MASQUE}" />')
    s += _oeil(40, 43, 8.5, 10) + _oeil(78, 43, 8.5, 10)
    s += (f'<path d="M59 52 L68 64 C65 68 54 68 51 64 Z" fill="{BEC_C}" />'
          f'<path d="M59 52 L68 64 C66 66 61 67 59 67 Z" fill="{BEC}" />')
    s += _patte(47, 114, rot=-6) + _patte(70, 114, rot=6)
    return s + '</svg>'

def en_vol(uid):
    """Ailes hautes, corps basculé. La pose des moments de récompense."""
    s = '<svg viewBox="0 0 120 124" width="200" height="207" aria-hidden="true">'
    s += f'<path d="M26 22 C40 10 62 14 72 30 C78 40 76 52 68 60 C58 70 40 68 30 56 C22 46 20 31 26 22 Z" fill="{DOS}" transform="rotate(-16 50 40)" />'
    s += (f'<path d="M56 30 C82 26 102 44 104 68 C105 86 95 100 78 104 '
          f'C60 108 44 98 38 82 C33 68 38 48 56 30 Z" fill="{VENTRE}" />')
    s += (f'<path d="M56 30 C80 26 100 44 103 66 C96 58 86 54 77 56 '
          f'C72 45 64 37 54 35 Z" fill="{DOS}" />')
    s += f'<path d="M96 96 C108 100 116 108 119 118 C108 117 98 111 91 103 Z" fill="{DOS}" />'
    s += (f'<path d="M44 52 C46 42 54 36 63 37 C69 38 73 42 76 46 '
          f'C80 43 85 40 90 41 C99 42 105 49 106 57 '
          f'C102 66 95 70 87 69 C81 68 77 63 74 59 '
          f'C70 64 65 68 60 68 C50 68 45 61 44 52 Z" fill="{MASQUE}" />')
    s += _oeil(60, 52, 8.5, 10) + _oeil(93, 55, 8, 9.5)
    s += (f'<path d="M76 62 L85 74 C82 78 71 78 68 74 Z" fill="{BEC_C}" />'
          f'<path d="M76 62 L85 74 C83 76 78 77 76 77 Z" fill="{BEC}" />')
    s += _patte(64, 114, 12, 7, -20) + _patte(84, 116, 12, 7, 16)
    return s + '</svg>'

def au_nid(uid):
    """La tête sort du manchon du nid. Celle qui raconte le produit."""
    s = '<svg viewBox="0 0 120 124" width="200" height="207" aria-hidden="true">'
    # Le nid, en retrait : c'est la mascotte le sujet, pas lui.
    s += (f'<path d="M64 30 C40 30 26 48 26 70 C26 92 40 110 64 110 '
          f'C88 110 102 92 102 70 C102 48 88 30 64 30 Z" fill="#C67139" />')
    s += (f'<path d="M34 50 C24 44 10 42 5 47 C-1 52 -1 66 5 71 '
          f'C12 75 25 72 36 66 C33 60 33 55 34 50 Z" fill="#C67139" />')
    s += f'<path d="M64 30 C46 30 34 42 30 58 C36 44 48 37 64 37 C80 37 92 44 98 58 C94 42 82 30 64 30 Z" fill="#DA8B56" />'
    # La tête, qui émerge du manchon.
    s += f'<path d="M30 40 C42 34 56 38 60 50 C63 60 57 70 46 73 C33 76 22 69 20 57 C19 49 23 43 30 40 Z" fill="{CRANE}" />'
    s += f'<path d="M30 40 C40 35 51 37 57 45 C50 43 43 44 38 48 C34 43 32 41 30 40 Z" fill="{DOS}" />'
    s += (f'<path d="M20 52 C22 45 28 41 35 42 C39 43 42 46 44 49 '
          f'C47 47 51 46 55 48 C59 50 61 55 60 60 '
          f'C56 65 50 66 45 64 C42 63 40 60 39 57 '
          f'C36 61 31 63 27 62 C22 61 19 57 20 52 Z" fill="{MASQUE}" />')
    s += _oeil(32, 53, 7.5, 8.5) + _oeil(52, 55, 6.5, 7.5)
    s += (f'<path d="M14 58 L2 62 C1 59 3 54 6 53 Z" fill="{BEC_C}" />')
    return s + '</svg>'

POSES = [
    ('portrait', 'Portrait', "De face, masse unique, yeux surdimensionnés. La pose qui sert d'avatar et de tuile d'app."),
    ('debout', 'Debout', "Trois-quarts, corps entier, queue longue. Celle qui montre l'oiseau en entier."),
    ('en_vol', 'En vol', "Corps basculé, aile haute. Pour les moments de récompense — un badge obtenu, une matrice au net."),
    ('au_nid', 'Au nid', "La tête sort du manchon. La seule qui raconte le produit et pas seulement l'oiseau."),
    ('dort', 'En veille', "Mêmes aplats, yeux fermés en deux arcs. L'état « matrice en pause », sans rien redessiner."),
]

def rendu(cle, uid):
    if cle == 'dort':
        return portrait(uid, ferme=True)
    return {'portrait': portrait, 'debout': debout, 'en_vol': en_vol, 'au_nid': au_nid}[cle](uid)
