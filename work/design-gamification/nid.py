"""Générateur des nids de la rampe. Un seul endroit où le dessin est décidé."""
import math, re

BRANCHES = [
    "M30 36 C22 31 18 32 13 28", "M82 36 C90 31 94 32 99 28",
    "M28 52 C20 50 16 52 11 50", "M84 52 C92 50 96 52 101 50",
    "M41 26 C37 18 33 15 30 10", "M71 26 C75 18 79 15 82 10",
    "M30 70 C22 72 18 75 13 77", "M82 70 C90 72 94 75 101 77",
    "M36 82 C30 86 27 90 24 94", "M76 82 C82 86 85 90 88 94",
]
NECK  = 'M48 10 C48 4 64 4 64 10 L62 24 C60 30 52 30 50 24 Z'
# Même col resserré de 55 % autour de x=56 : sec, pas tombant.
NECK_FIN = 'M52.4 10 C52.4 4 59.6 4 59.6 10 L58.7 24 C57.8 30 54.2 30 53.3 24 Z'
BODY  = 'M56 20 C39 20 28 36 28 56 C28 76 39 94 56 94 C73 94 84 76 84 56 C84 36 73 20 56 20 Z'
TILES = [
    ('M45.5 40.5 L49.5 40.5 A5 5 0 0 1 54.5 45.5 L54.5 55.5 L44.5 55.5 A5 5 0 0 1 39.5 50.5 L39.5 46.5 A6 6 0 0 1 45.5 40.5 Z', '#dbe3ce'),
    ('M62.5 40.5 L66.5 40.5 A6 6 0 0 1 72.5 46.5 L72.5 50.5 A5 5 0 0 1 67.5 55.5 L57.5 55.5 L57.5 45.5 A5 5 0 0 1 62.5 40.5 Z', '#dde7ef'),
    ('M44.5 58.5 L54.5 58.5 L54.5 68.5 A5 5 0 0 1 49.5 73.5 L45.5 73.5 A6 6 0 0 1 39.5 67.5 L39.5 63.5 A5 5 0 0 1 44.5 58.5 Z', '#f2e0c4'),
    ('M57.5 58.5 L67.5 58.5 A5 5 0 0 1 72.5 63.5 L72.5 67.5 A6 6 0 0 1 66.5 73.5 L62.5 73.5 A5 5 0 0 1 57.5 68.5 Z', '#e3d8d4'),
]

def feuille(branche, longueur=11.5, largeur=4.2):
    """La feuille part du BOUT du rameau et suit sa tangente.

    Une ellipse centrée sur l'extrémité, orientée à l'estime, donnait un rameau
    qui traverse sa propre feuille de part en part. Ici la base est posée sur le
    point d'arrivée et la nervure prolonge la dernière poignée de la courbe :
    c'est la tangente réelle, pas un angle deviné.
    """
    n = [float(v) for v in re.findall(r'-?\d+\.?\d*', branche)]
    (c2x, c2y), (ex, ey) = (n[4], n[5]), (n[6], n[7])
    angle = math.degrees(math.atan2(ey - c2y, ex - c2x))
    L, W = longueur, largeur / 2
    # Ovale pointu : base à l'origine, pointe en (L, 0).
    d = f'M0 0 Q {L*0.42:.1f} -{W} {L} 0 Q {L*0.42:.1f} {W} 0 0 Z'
    return f'<path d="{d}" transform="translate({ex} {ey}) rotate({angle:.1f})" />'

def nid(size, n=0, sec=False, pale=False, vide=False, hollow=None, body='#c67139', flex=True):
    sw = 3.2 if size < 50 else 2.6
    st = ' style="flex: none;"' if flex else ''
    s = f'<svg viewBox="4 0 104 100" width="{size}" height="{size}"{st} aria-hidden="true">'
    if n:
        tw = ''.join(f'<path d="{b}" />' for b in BRANCHES[:n])
        s += f'\n          <g stroke="#a8763f" stroke-width="{sw}" stroke-linecap="round" fill="none">{tw}</g>'
        s += '\n          <g fill="#7a8a5e">' + ''.join(feuille(b) for b in BRANCHES[:n]) + '</g>'
    if sec:
        s += f'\n          <g transform="rotate(8 56 14)"><path d="{NECK_FIN}" fill="none" stroke="#c0b6a5" stroke-width="{sw}" /></g>'
        s += f'\n          <path d="{BODY}" fill="#f2ece1" stroke="#c0b6a5" stroke-width="{sw}" stroke-dasharray="7 4" />'
        s += f'\n          <g fill="none" stroke="#c0b6a5" stroke-width="{sw - 0.8}">' + ''.join(f'<path d="{d}" />' for d, _ in TILES) + '</g>'
        return s + '\n        </svg>'
    s += f'\n          <g transform="rotate(8 56 14)"><path d="{NECK}" fill="{body if pale else "#c67139"}" /></g>'
    s += f'\n          <path d="{BODY}" fill="{body}" />'
    if vide:
        # « Il ne porte plus rien » : les quatre cases sont des cavités, pas des tuiles.
        s += f'\n          <g fill="none" stroke="#c49a7c" stroke-width="{sw - 0.7}">' + ''.join(f'<path d="{d}" />' for d, _ in TILES) + '</g>'
    else:
        for i, (d, fill) in enumerate(TILES):
            s += (f'\n          <path d="{d}" fill="none" stroke="#f6e7d6" stroke-width="2.6" stroke-dasharray="3 2.6" />'
                  if hollow == i else f'\n          <path d="{d}" fill="{fill}" />')
    return s + '\n        </svg>'
