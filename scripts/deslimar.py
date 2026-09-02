# -*- coding: utf-8 -*-
"""
Baja el lima de los assets del personaje que se muestran con el mercado CERRADO.

POR QUE. La regla dura de la pagina es que el lima #CCFF00 sólo aparece con
Wall Street abierta, y siempre como superficie. Medido sobre las hojas:

    analyst-idle    5.593 px de lima  <- se muestra en LAS CUATRO fases
    analyst-day     2.660 px          <- correcto: day = mercado abierto
    analyst-dawn    2.690 px          <- MAL: dawn es mercado cerrado
    analyst-night      30 px (#4d8d12)  <- ya resuelto, y de aca sale el destino
    analyst-dusk        0 px          <- ya resuelto

O sea que con el mercado cerrado el objeto de mayor contraste de la pagina era
el acento que significa "el mercado esta abierto". La senial dejaba de seniar.

EL DESTINO NO SE INVENTA: es el oliva #4d8d12 que la propia hoja de noche ya
usa para la misma vincha. Se conserva el sombreado interno escalando el valor
de cada pixel en vez de aplastar la familia a un color plano.

Uso:  python scripts/deslimar.py
"""
import colorsys
import numpy as np
from PIL import Image

DIR = 'public/pixel/'
# Medido sobre analyst-night.png, no elegido a ojo.
OLIVA = (0x4d, 0x8d, 0x12)

# La familia lima, con el mismo criterio con el que se midio.
H_MIN, H_MAX, S_MIN, V_MIN = 50.0, 95.0, 0.55, 0.55


def mascara_lima(a):
    rgb = a[:, :, :3] / 255.0
    mx = rgb.max(2)
    mn = rgb.min(2)
    d = np.maximum(mx - mn, 1e-6)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    return (h >= H_MIN) & (h <= H_MAX) & (s >= S_MIN) & (mx >= V_MIN) & (a[:, :, 3] > 128)


def deslimar(nombre, salida):
    im = Image.open(DIR + nombre).convert('RGBA')
    a = np.asarray(im).astype(float).copy()
    m = mascara_lima(a)
    n = int(m.sum())
    if n == 0:
        print(f'  {nombre}: ya no tiene lima, se copia tal cual')
        im.save(DIR + salida)
        return 0

    oh, os_, ov = colorsys.rgb_to_hsv(*[c / 255.0 for c in OLIVA])
    v_lima = (a[:, :, :3].max(2) / 255.0)[m]
    escala = ov / max(v_lima.mean(), 1e-6)

    ys, xs = np.nonzero(m)
    for y, x in zip(ys, xs):
        v = a[y, x, :3].max() / 255.0
        # H y S van al oliva; V conserva el sombreado relativo de la vincha.
        nv = min(1.0, v * escala)
        r, g, b = colorsys.hsv_to_rgb(oh, os_, nv)
        a[y, x, 0], a[y, x, 1], a[y, x, 2] = r * 255, g * 255, b * 255

    Image.fromarray(a.astype(np.uint8), 'RGBA').save(DIR + salida)
    print(f'  {nombre} -> {salida}: {n} px de lima bajados a la familia #{OLIVA[0]:02x}{OLIVA[1]:02x}{OLIVA[2]:02x}')
    return n


print('deslimando los assets que se muestran con el mercado cerrado:')
deslimar('analyst-idle.png', 'analyst-idle-closed.png')
deslimar('analyst-dawn.png', 'analyst-dawn.png')
