# -*- coding: utf-8 -*-
"""
Limpia un asset de pixel art que volvió como JPEG.

Gemini entrega JPEG, y el JPEG le mete ruido de compresión al pixel art: donde
debería haber 3 tonos planos aparecen miles de tonos casi iguales. Además el
lienzo viene a 1024 px pero la grilla lógica es mucho más gruesa.

Pasos: detectar la grilla real -> bajar a esa grilla (el color de cada celda por
mediana, que ignora el ruido del borde) -> cuantizar a paleta chica -> remapear
la familia verde al lima exacto de Robinhood -> subir por vecino más cercano.

Uso: python clean_pixel.py entrada.png salida.png [--no-lime]
"""
import sys
from collections import Counter

from PIL import Image

LIMA_RH = (0xCC, 0xFF, 0x00)  # medido en robinhood.com (fondo de sus CTA)


def detectar_escala(im: Image.Image) -> int:
    """La escala es el paso que hace que las celdas queden uniformes."""
    w, h = im.size
    mejor, mejor_score = 1, -1.0
    for escala in range(2, 17):
        if w % escala or h % escala:
            continue
        chico = im.resize((w // escala, h // escala), Image.NEAREST)
        devuelta = chico.resize((w, h), Image.NEAREST)
        iguales = sum(1 for a, b in zip(im.getdata(), devuelta.getdata()) if a == b)
        score = iguales / (w * h) * escala  # premia la escala más gruesa que sigue fiel
        if score > mejor_score:
            mejor, mejor_score = escala, score
    return mejor


def color_celda(px, x0, y0, escala, w):
    """Color dominante de la celda: el modo ignora el halo del JPEG en los bordes."""
    cuenta = Counter()
    for y in range(y0 + 1, y0 + escala - 1):
        for x in range(x0 + 1, x0 + escala - 1):
            cuenta[px[y * w + x]] += 1
    if not cuenta:
        return px[y0 * w + x0]
    return cuenta.most_common(1)[0][0]


def es_verde(rgb):
    r, g, b = rgb
    return g > r + 12 and g > b + 30 and g > 80


def main():
    entrada, salida = sys.argv[1], sys.argv[2]
    aplicar_lima = '--no-lime' not in sys.argv

    im = Image.open(entrada).convert('RGB')
    w, h = im.size
    escala = detectar_escala(im)
    print(f'lienzo {w}x{h} · grilla detectada: {escala} px por celda -> {w // escala}x{h // escala}')

    px = list(im.getdata())
    gw, gh = w // escala, h // escala
    celdas = [
        color_celda(px, gx * escala, gy * escala, escala, w)
        for gy in range(gh)
        for gx in range(gw)
    ]

    chico = Image.new('RGB', (gw, gh))
    chico.putdata(celdas)

    antes = len(set(celdas))

    # La máscara se toma ANTES de cuantizar: el acento es ~0,3% de la imagen y
    # MEDIANCUT lo funde con sus vecinos si se lo deja para después.
    mascara = [i for i, c in enumerate(celdas) if es_verde(c)]

    chico = chico.quantize(colors=24, method=Image.MEDIANCUT, dither=Image.NONE).convert('RGB')
    datos = list(chico.getdata())
    print(f'colores: {antes} -> {len(set(datos))} tras cuantizar')

    if aplicar_lima:
        if mascara:
            for i in mascara:
                datos[i] = LIMA_RH
            chico.putdata(datos)
            print(f'acento remapeado a #CCFF00: {len(mascara)} celdas de {gw * gh}')
        else:
            print('AVISO: no se encontró familia verde para remapear')

    chico.save(salida.replace('.png', '-grid.png'))
    chico.resize((gw * 8, gh * 8), Image.NEAREST).save(salida)
    print(f'guardado {salida} ({gw * 8}x{gh * 8}) y la grilla nativa {gw}x{gh}')


main()
