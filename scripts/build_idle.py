# -*- coding: utf-8 -*-
"""
Construye el ciclo de reposo del personaje desde UN SOLO cuadro.

Por que: la hoja anterior eran cuatro generaciones independientes del modelo, no
cuatro momentos del mismo dibujo. Medido, entre cuadros consecutivos cambiaban
2.000 a 6.000 pixeles repartidos por TODO el cuerpo, piernas y pies incluidos.
Una persona que respira no mueve las zapatillas: eso no se lee como animacion,
se lee como parpadeo de la imagen.

Aca los cuatro cuadros salen del mismo dibujo y sólo cambia lo que debe:
  0  reposo
  1  respiracion: el cuerpo de la cadera para arriba baja 1 px
  2  parpadeo: los ojos se cierran
  3  el grafico del terminal cambia

Todo lo demas queda IDENTICO pixel a pixel, que es lo que hace que se lea como
un personaje quieto y no como ruido.

Uso: python build_idle.py
"""
from PIL import Image

HOJA = 'public/pixel/analyst-idle.png'
N = 4

# Bandas medidas sobre el cuadro base, no estimadas.
CADERA = 0.60          # de la cadera para arriba se mueve al respirar
OJOS_Y = (95, 140)     # banda donde viven los ojos
PANTALLA = (100, 220, 148, 270)  # el terminal que sostiene


def es_ojo(p):
    """Verde-agua del iris. Excluye el lima de la vincha, que tiene r alto."""
    return p[3] > 200 and p[1] > p[0] + 25 and p[1] > p[2] + 15 and p[1] > 120 and p[0] < 170


def construir():
    hoja = Image.open(HOJA).convert('RGBA')
    w, h = hoja.size
    C = w // N
    base = hoja.crop((0, 0, C, h))
    viejo3 = hoja.crop((3 * C, 0, 4 * C, h))  # de aca se rescata SOLO la pantalla
    W, H = base.size

    # ---- cuadro 1: respiracion -------------------------------------------
    respira = base.copy()
    corte = int(H * CADERA)
    arriba = base.crop((0, 0, W, corte))
    respira.paste(Image.new('RGBA', (W, corte), (0, 0, 0, 0)), (0, 0))
    respira.paste(arriba, (0, 1), arriba)

    # ---- cuadro 2: parpadeo ----------------------------------------------
    # Un parpadeo NO es quitarle el color al iris: hay que TAPAR el ojo entero
    # y dejar la linea del parpado. Reemplazar solo los pixeles verde-agua
    # dejaba el resto del dibujo del ojo y seguia leyendose abierto (probado).
    parpadea = base.copy()
    px = parpadea.load()
    bp = base.load()
    pts = [(x, y) for y in range(*OJOS_Y) for x in range(W) if es_ojo(bp[x, y])]
    if not pts:
        raise SystemExit('no se encontraron pixeles de ojo: revisar OJOS_Y')

    # separar los dos ojos por el hueco horizontal mas grande entre columnas
    cols = sorted({x for x, _ in pts})
    corte_x = max(((cols[i + 1] - cols[i], cols[i]) for i in range(len(cols) - 1)))[1]
    ojos = [[p for p in pts if p[0] <= corte_x], [p for p in pts if p[0] > corte_x]]

    cerrados = 0
    for grupo in ojos:
        if not grupo:
            continue
        gx = [x for x, _ in grupo]
        gy = [y for _, y in grupo]
        x0, x1 = min(gx) - 1, max(gx) + 1
        y0, y1 = min(gy) - 1, max(gy) + 1
        # piel de la mejilla, bien por debajo del delineado inferior
        piel = bp[(x0 + x1) // 2, min(H - 1, y1 + 8)]
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if bp[x, y][3] > 200:
                    px[x, y] = piel
                    cerrados += 1
        # la linea del parpado cerrado, en el tono del delineado del propio dibujo
        linea = min((bp[x, y] for x, y in grupo), key=lambda c: c[0] + c[1] + c[2])
        yl = (y0 + y1) // 2
        for x in range(x0, x1 + 1):
            if bp[x, yl][3] > 200:
                px[x, yl] = linea

    # ---- cuadro 3: el grafico del terminal --------------------------------
    grafico = base.copy()
    x0, y0, x1, y1 = PANTALLA
    grafico.paste(viejo3.crop((x0, y0, x1, y1)), (x0, y0))

    # ---- armado ------------------------------------------------------------
    salida = Image.new('RGBA', (C * N, h), (0, 0, 0, 0))
    for i, f in enumerate([base, respira, parpadea, grafico]):
        salida.paste(f, (i * C, 0), f)
    salida.save(HOJA)
    print(f'hoja reconstruida: {salida.size}, {N} cuadros de {C}')
    print(f'  respiracion: cuerpo de la cadera (y={corte}) para arriba, 1 px')
    print(f'  parpadeo: {cerrados} pixeles tapados en 2 ojos')
    return salida, C, h


def verificar(hoja, C, h):
    """Un cuadro de reposo bien hecho cambia POCO y en un solo lugar."""
    from PIL import ImageChops
    fr = [hoja.crop((i * C, 0, (i + 1) * C, h)) for i in range(N)]
    bandas = [('cabeza', 0, int(h * 0.30)), ('torso', int(h * 0.30), int(h * 0.62)),
              ('piernas', int(h * 0.62), int(h * 0.86)), ('pies', int(h * 0.86), h)]
    print('\ncambios contra el cuadro de reposo:')
    for i in (1, 2, 3):
        d = ImageChops.difference(fr[0].convert('RGB'), fr[i].convert('RGB')).convert('L')
        px = d.load()
        reparto = []
        for nm, a, b in bandas:
            n = sum(1 for y in range(a, b) for x in range(C) if px[x, y] > 40)
            reparto.append(f'{nm}={n}')
        print(f'  cuadro {i}: ' + '  '.join(reparto))


hoja, C, h = construir()
verificar(hoja, C, h)
