# -*- coding: utf-8 -*-
"""
Recorta el fondo crema de un asset pixel y lo deja transparente.

Por qué importa: el papel de AFTERHOURS es el reloj. Con el fondo crema metido
en la imagen, los dos paneles del personaje quedaban como parches claros sobre
el papel oscuro de la fase noche, contradiciendo el mecanismo central.

Se hace por RELLENO desde los bordes, no por coincidencia global de color: el
personaje tiene crema adentro (zapatillas, brillos) y un match global se la
comería. La lección ya estaba escrita:
[[flood-fill-por-color-falla-si-sombra-comparte-hue-con-fondo]].

Uso: python cut_bg.py entrada.png salida.png [tolerancia]
"""
import sys
from collections import deque

from PIL import Image


def recortar(entrada: str, salida: str, tol: int = 26) -> None:
    im = Image.open(entrada).convert('RGBA')
    w, h = im.size
    px = im.load()

    # El color del fondo se toma de las cuatro esquinas, no de una: si una
    # esquina cayera sobre el personaje, la mediana la descarta.
    esquinas = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    fondo = tuple(sorted(c[i] for c in esquinas)[1] for i in range(3))

    def parecido(c) -> bool:
        return abs(c[0] - fondo[0]) <= tol and abs(c[1] - fondo[1]) <= tol and abs(c[2] - fondo[2]) <= tol

    visto = bytearray(w * h)
    cola = deque()
    for x in range(w):
        for y in (0, h - 1):
            if parecido(px[x, y]):
                cola.append((x, y)); visto[y * w + x] = 1
    for y in range(h):
        for x in (0, w - 1):
            if parecido(px[x, y]) and not visto[y * w + x]:
                cola.append((x, y)); visto[y * w + x] = 1

    borrados = 0
    while cola:
        x, y = cola.popleft()
        px[x, y] = (fondo[0], fondo[1], fondo[2], 0)
        borrados += 1
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not visto[ny * w + nx] and parecido(px[nx, ny]):
                visto[ny * w + nx] = 1
                cola.append((nx, ny))

    # Recorte al contenido: sin esto, el panel muestra el margen vacío que traía
    # el lienzo cuadrado y el personaje queda chico y perdido.
    caja = im.getbbox()
    if caja:
        im = im.crop(caja)

    im.save(salida)
    pct = 100 * borrados / (w * h)
    print(f'{salida}: fondo {fondo} recortado, {borrados} px ({pct:.1f}%) -> {im.size}')


recortar(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 26)
