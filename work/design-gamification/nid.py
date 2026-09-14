"""Le dessin des nids de la jauge. Un seul endroit où la forme est décidée."""
import math

NECK = 'M48 10 C48 4 64 4 64 10 L62 24 C60 30 52 30 50 24 Z'
# Même col resserré de 55 % autour de x=56 : sec, pas tombant.
NECK_FIN = 'M52.4 10 C52.4 4 59.6 4 59.6 10 L58.7 24 C57.8 30 54.2 30 53.3 24 Z'
BODY = 'M56 20 C39 20 28 36 28 56 C28 76 39 94 56 94 C73 94 84 76 84 56 C84 36 73 20 56 20 Z'
TILES = [
    ('M45.5 40.5 L49.5 40.5 A5 5 0 0 1 54.5 45.5 L54.5 55.5 L44.5 55.5 A5 5 0 0 1 39.5 50.5 L39.5 46.5 A6 6 0 0 1 45.5 40.5 Z', '#dbe3ce'),
    ('M62.5 40.5 L66.5 40.5 A6 6 0 0 1 72.5 46.5 L72.5 50.5 A5 5 0 0 1 67.5 55.5 L57.5 55.5 L57.5 45.5 A5 5 0 0 1 62.5 40.5 Z', '#dde7ef'),
    ('M44.5 58.5 L54.5 58.5 L54.5 68.5 A5 5 0 0 1 49.5 73.5 L45.5 73.5 A6 6 0 0 1 39.5 67.5 L39.5 63.5 A5 5 0 0 1 44.5 58.5 Z', '#f2e0c4'),
    ('M57.5 58.5 L67.5 58.5 A5 5 0 0 1 72.5 63.5 L72.5 67.5 A6 6 0 0 1 66.5 73.5 L62.5 73.5 A5 5 0 0 1 57.5 68.5 Z', '#e3d8d4'),
]
# L'ellipse qui épouse le corps du nid : c'est sur elle que les feuilles se posent.
CX, CY, RX, RY = 56, 57, 28, 37

def _lame(x, y, angle, L, W):
    """Ovale pointu : base à l'origine, pointe en (L, 0)."""
    d = f'M0 0 Q {L*0.40:.1f} -{W/2:.1f} {L} 0 Q {L*0.40:.1f} {W/2:.1f} 0 0 Z'
    return f'<path d="{d}" transform="translate({x:.1f} {y:.1f}) rotate({angle:.1f})" />'

def couronne(n, L=21, W=12):
    """Des feuilles qui sortent DIRECTEMENT du nid, en couronne.

    Plus de rameau : la base de chaque feuille est posée sur le corps et sa
    pointe file vers l'extérieur. L'angle est la NORMALE à l'ellipse, pas le
    rayon — sur une ellipse les deux diffèrent, et suivre le rayon faisait
    bâiller les feuilles des flancs.
    """
    out = []
    for i in range(n):
        a = math.radians(-90 + i * 360 / n)
        x, y = CX + RX * math.cos(a), CY + RY * math.sin(a)
        angle = math.degrees(math.atan2(math.sin(a) / RY, math.cos(a) / RX))
        out.append(_lame(x, y, angle, L, W))
    return ''.join(out)

def rayons(rayons_n=18, r0=14, r1=66, teinte='#f2dc9c', opacite=0.38):
    """Le fond de lumière du dernier cran.

    Des lames franches plutôt qu'un dégradé radial : le dégradé se serait perdu
    sur le fond crème de la carte. Secteur à ANGLE constant, donc la lame
    s'élargit vers l'extérieur comme sur un drapeau au soleil levant.
    """
    pas = 360 / rayons_n
    d = math.radians(pas * 0.5 / 2)
    lames = []
    for i in range(rayons_n):
        a = math.radians(i * pas)
        p = [(56 + r * math.cos(a + s), 56 + r * math.sin(a + s))
             for r, s in ((r0, -d), (r1, -d), (r1, d), (r0, d))]
        lames.append('M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in p) + ' Z')
    return (f'\n          <g fill="{teinte}" opacity="{opacite}">'
            + ''.join(f'<path d="{x}" />' for x in lames) + '</g>')

def nid(size, n=0, halo=False, sec=False, pale=False, vide=False, hollow=None,
        body='#c67139', flex=True):
    sw = 3.2 if size < 50 else 2.6
    st = ' style="flex: none;"' if flex else ''
    s = f'<svg viewBox="4 0 104 100" width="{size}" height="{size}"{st} aria-hidden="true">'
    if halo:
        s += rayons()
    # Les feuilles passent DERRIÈRE le corps : leur base disparaît sous le nid,
    # donc elles en sortent au lieu d'y être collées.
    if n:
        s += f'\n          <g fill="#7a8a5e">{couronne(n)}</g>'
    if sec:
        s += f'\n          <g transform="rotate(8 56 14)"><path d="{NECK_FIN}" fill="none" stroke="#c0b6a5" stroke-width="{sw}" /></g>'
        s += f'\n          <path d="{BODY}" fill="#f2ece1" stroke="#c0b6a5" stroke-width="{sw}" stroke-dasharray="7 4" />'
        s += f'\n          <g fill="none" stroke="#c0b6a5" stroke-width="{sw - 0.8}">' + ''.join(f'<path d="{d}" />' for d, _ in TILES) + '</g>'
        return s + '\n        </svg>'
    s += f'\n          <g transform="rotate(8 56 14)"><path d="{NECK}" fill="{body if pale else "#c67139"}" /></g>'
    s += f'\n          <path d="{BODY}" fill="{body}" />'
    if vide:
        s += f'\n          <g fill="none" stroke="#c49a7c" stroke-width="{sw - 0.7}">' + ''.join(f'<path d="{d}" />' for d, _ in TILES) + '</g>'
    else:
        for i, (d, fill) in enumerate(TILES):
            s += (f'\n          <path d="{d}" fill="none" stroke="#f6e7d6" stroke-width="2.6" stroke-dasharray="3 2.6" />'
                  if hollow == i else f'\n          <path d="{d}" fill="{fill}" />')
    return s + '\n        </svg>'
