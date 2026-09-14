"""Le nid en « clay » : formes rebondies, contour net, volume doux, reflet.

Le brief demande des images ; ici il faut du vecteur. La traduction tient en
cinq gestes, et chaque variante les rejoue à l'identique :
  1. une ombre portée sous l'objet ;
  2. la masse, en dégradé du clair (haut-gauche) au foncé (bas-droite) ;
  3. un croissant d'ombre interne en bas, détouré sur la masse ;
  4. un contour épais, dans un ton foncé de la MÊME teinte — jamais du noir,
     qui aurait fait sticker plutôt que pâte ;
  5. un reflet blanc en haut-gauche, adouci.
"""
CORPS = ('M56 16 C33 16 20 36 20 58 C20 80 35 97 56 97 '
         'C77 97 92 80 92 58 C92 36 79 16 56 16 Z')
COL   = ('M46 8 C46 -1 66 -1 66 8 L63.5 27 C61 34 51 34 48.5 27 Z')
TUILES = [
    ('M43 40 h8 a6 6 0 0 1 6 6 v9 h-14 a6 6 0 0 1 -6 -6 v-3 a6 6 0 0 1 6 -6 Z', 0),
    ('M61 40 h8 a6 6 0 0 1 6 6 v3 a6 6 0 0 1 -6 6 h-14 v-9 a6 6 0 0 1 6 -6 Z', 1),
    ('M40 58 h17 v9 a6 6 0 0 1 -6 6 h-8 a6 6 0 0 1 -6 -6 v-3 a6 6 0 0 1 3 -6 Z', 2),
    ('M57 58 h12 a6 6 0 0 1 6 6 v3 a6 6 0 0 1 -6 6 h-6 a6 6 0 0 1 -6 -6 Z', 3),
]
# Terracotta et cases du produit, poussées en saturation comme le brief le demande.
TEINTES = [('#7BA83F', '#4E7325'), ('#3E8FC0', '#265C80'), ('#E0A423', '#9C6C0C'), ('#D4503A', '#8E2E1E')]

def _defs(uid, clair, base, fonce):
    return (f'<defs>'
            f'<linearGradient id="g{uid}" x1="0.2" y1="0" x2="0.85" y2="1">'
            f'<stop offset="0" stop-color="{clair}" /><stop offset="0.55" stop-color="{base}" />'
            f'<stop offset="1" stop-color="{fonce}" /></linearGradient>'
            f'<clipPath id="k{uid}"><path d="{CORPS}" /></clipPath>'
            f'</defs>')

def nid_clay(uid, variante, size=170, base='#E07B39', clair='#F6AC6A', fonce='#C05F22', trait='#96431395'):
    T = '#9A4514'
    s = (f'<svg viewBox="0 0 112 118" width="{size}" height="{size}" aria-hidden="true">'
         f'{_defs(uid, clair, base, fonce)}'
         f'<ellipse cx="56" cy="107" rx="30" ry="5.5" fill="#1f1a15" opacity="0.10" />')

    # Le col, derrière la masse — sauf en « suspendu », où il devient le sujet.
    if variante == 'suspendu':
        s += (f'<path d="M14 12 C34 6 78 6 98 12" fill="none" stroke="#8C6A4A" stroke-width="7" stroke-linecap="round" />'
              f'<path d="M14 12 C34 6 78 6 98 12" fill="none" stroke="#A9835E" stroke-width="3.4" stroke-linecap="round" />')
    s += f'<g transform="rotate(8 56 14)"><path d="{COL}" fill="url(#g{uid})" stroke="{T}" stroke-width="4.5" stroke-linejoin="round" /></g>'
    s += f'<path d="{CORPS}" fill="url(#g{uid})" stroke="{T}" stroke-width="5" stroke-linejoin="round" />'
    # Ombre interne : un croissant en bas, détouré sur la masse.
    s += (f'<g clip-path="url(#k{uid})"><path d="M8 78 C30 96 82 96 104 74 L104 120 L8 120 Z" '
          f'fill="{fonce}" opacity="0.45" /></g>')

    if variante == 'tresse':
        s += (f'<g clip-path="url(#k{uid})" fill="none" stroke="{T}" stroke-width="3.6" stroke-linecap="round" opacity="0.55">'
              f'<path d="M14 40 C34 33 78 33 98 40" /><path d="M12 62 C34 55 78 55 100 62" />'
              f'<path d="M16 82 C36 75 76 75 96 82" /></g>')
    if variante in ('oeufs', 'coupe', 'tresse', 'bombe', 'suspendu'):
        for (d, i) in TUILES:
            c, o = TEINTES[i]
            if variante == 'oeufs':
                cx = 45 if i in (0, 2) else 67
                cy = 50 if i in (0, 1) else 70
                s += (f'<ellipse cx="{cx}" cy="{cy}" rx="11" ry="13" fill="{c}" stroke="{o}" stroke-width="3.6" />'
                      f'<ellipse cx="{cx-3.5}" cy="{cy-5}" rx="3.4" ry="4.6" fill="#fff" opacity="0.42" transform="rotate(-20 {cx-3.5} {cy-5})" />')
            else:
                s += f'<path d="{d}" fill="{c}" stroke="{o}" stroke-width="3.4" stroke-linejoin="round" />'
    if variante == 'coupe':
        # Le bord avant repasse DEVANT les tuiles : le nid devient une coupe.
        s += (f'<path d="M20 62 C20 84 35 97 56 97 C77 97 92 84 92 62 C92 76 78 84 56 84 C34 84 20 76 20 62 Z" '
              f'fill="url(#g{uid})" stroke="{T}" stroke-width="5" stroke-linejoin="round" />')

    # Reflet : deux lames adoucies, jamais un simple cercle blanc.
    s += (f'<g clip-path="url(#k{uid})" fill="#fff">'
          f'<ellipse cx="38" cy="34" rx="13" ry="7" opacity="0.42" transform="rotate(-34 38 34)" />'
          f'<ellipse cx="28" cy="52" rx="5" ry="3" opacity="0.30" transform="rotate(-34 28 52)" /></g>')
    return s + '</svg>'
