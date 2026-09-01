# -*- coding: utf-8 -*-
"""
Convierte el take de Higgsfield en el asset de la fachada + el mapa de ventanas.

EL TAKE NO ESTA EN EL REPO (pesa 4,3 MB y el vault no versiona media pesada). Se
regenera con:

    higgsfield generate create nano_banana_2 --aspect_ratio 21:9 --resolution 2k       --wait --json --image public/pixel/analyst-day.png       --prompt "<el prompt esta en la nota Afterhours del vault>"

y se guarda como `take1.png` al lado de este script. Lo que SI esta versionado es
el resultado: `public/pixel/street.png` (5,3 KB) y `src/app/street-windows.ts`.

Dos cosas que NO se le piden al modelo y se imponen por codigo (gotcha del vault
[[gemini-acierta-el-lugar-del-acento-pero-no-el-hex]]):
  - el HEX exacto de la paleta de la pagina;
  - la POSICION de cada ventana, medida sobre el PNG y no adivinada.

Salida:
  public/pixel/street.png     fachada, todas las ventanas APAGADAS
  src/app/street-windows.json cajas de cada ventana en %, en orden de lectura
"""
import json
import numpy as np
from PIL import Image

SRC = 'take1.png'
TOP, BOT = 196, 804          # banda medida: cielo + cornisa + 3 filas de ventanas
ANCHO_SALIDA = 1898          # 2x del ancho de panel a 1440 (949 px)

# La paleta de la pagina, no la del modelo.
PALETA = [
    (0x14, 0x14, 0x26),   # tinta / cielo / vidrio
    (0x1e, 0x23, 0x40),   # piedra
    (0xed, 0xe4, 0xc8),   # crema
    (0xe8, 0x53, 0x1f),   # naranja congelado
    (0x2b, 0x4a, 0x9b),   # cobalto
]

src = Image.open(SRC).convert('RGB')
a = np.asarray(src).astype(int)
H, W, _ = a.shape

# ---------------------------------------------------------------- ventanas
# La reja se mide por PROYECCION, no por blobs: la elevacion es ortografica, asi
# que las columnas y las filas son rectas y proyectar es mas estable que etiquetar.
lum = a.mean(2)
crema = lum > 120

def tramos(perfil, umbral):
    out, s = [], None
    for i, v in enumerate(perfil):
        if v > umbral and s is None:
            s = i
        elif v <= umbral and s is not None:
            out.append((s, i - 1))
            s = None
    if s is not None:
        out.append((s, len(perfil) - 1))
    return out

# filas: los ledges horizontales de crema delimitan cada fila de ventanas
ledges = [t for t in tramos(crema.mean(1), 0.25) if TOP <= t[0] <= BOT]
filas = []
for i in range(len(ledges) - 1):
    y0, y1 = ledges[i][1] + 1, ledges[i + 1][0] - 1
    if y1 - y0 >= 40:                       # un hueco chico es junta, no ventana
        filas.append((y0, y1))
filas = [f for f in filas if f[0] >= TOP and f[1] <= BOT]

# columnas: los mullions verticales, medidos DENTRO del edificio
mull = tramos(crema[filas[0][0]:filas[-1][1]].mean(0), 0.35)
huecos = [(mull[i][1] + 1, mull[i + 1][0] - 1) for i in range(len(mull) - 1)]
huecos = [h for h in huecos if h[1] - h[0] + 1 >= 30]   # los de 14 px son juntas

# El VIDRIO, no la celda: dentro de cada celda se busca la caja oscura real, asi
# el marco crema sobrevive y la ventana encendida se lee como ventana y no como
# un rectangulo de color. Medido por celda, no un margen adivinado.
oscuro = lum < 80

def caja_vidrio(x0, x1, y0, y1):
    sub = oscuro[y0:y1 + 1, x0:x1 + 1]
    if sub.size == 0:
        return None
    fc = sub.mean(0)
    fr = sub.mean(1)
    cs = np.flatnonzero(fc > 0.6)
    rs = np.flatnonzero(fr > 0.6)
    if cs.size < 6 or rs.size < 10:
        return None
    return (x0 + cs[0], y0 + rs[0], cs[-1] - cs[0] + 1, rs[-1] - rs[0] + 1)

ventanas = []
for (y0, y1) in filas:
    for (x0, x1) in huecos:
        c = caja_vidrio(x0, x1, y0, y1)
        if c is None:
            continue
        ventanas.append(c)

print(f'filas de ventanas: {len(filas)}  columnas: {len(huecos)}  ventanas: {len(ventanas)}')

# ---------------------------------------------------------------- paleta
banda = a[TOP:BOT]
P = np.array(PALETA)
d = ((banda[:, :, None, :] - P[None, None, :, :]) ** 2).sum(3)
idx = d.argmin(2)
quant = P[idx].astype(np.uint8)
print('reparto de paleta:', {('#%02x%02x%02x' % tuple(PALETA[i])): int((idx == i).sum()) for i in range(len(PALETA))})

img = Image.fromarray(quant)
alto_salida = round(img.height * ANCHO_SALIDA / img.width)
img = img.resize((ANCHO_SALIDA, alto_salida), Image.NEAREST)
img = img.convert('P', palette=Image.ADAPTIVE, colors=8)
img.save('C:/Users/PC/Afterhours/public/pixel/street.png', optimize=True)
print(f'street.png {ANCHO_SALIDA}x{alto_salida}  ratio {ANCHO_SALIDA/alto_salida:.3f}:1')

# ---------------------------------------------------------------- mapa
BW, BH = W, BOT - TOP
mapa = {
    'ratio': round(ANCHO_SALIDA / alto_salida, 4),
    'ventanas': [
        {
            'x': round(100 * x / BW, 3),
            'y': round(100 * (y - TOP) / BH, 3),
            'w': round(100 * w / BW, 3),
            'h': round(100 * h / BH, 3),
        }
        for (x, y, w, h) in ventanas
    ],
}
with open('windows.json', 'w', encoding='utf-8') as f:
    json.dump(mapa, f, indent=0)
print('ventanas en el mapa:', len(mapa['ventanas']))

# ---------------------------------------------------------------- modulo TS
TS = """// GENERADO por scripts/build-street.py. No editar a mano.
//
// Cada ventana de la fachada, MEDIDA sobre el PNG y no adivinada: se detecta la
// reja por proyeccion (la elevacion es ortografica, asi que filas y columnas son
// rectas) y dentro de cada celda se busca la caja oscura real del vidrio, para
// que al encenderla el marco crema siga leyendose como marco.
//
// [x, y, ancho, alto] en %% de la imagen, en orden de lectura.

/** Relacion de aspecto del asset. La usa el panel para no saltar al cargar. */
export const STREET_RATIO = %s

export const STREET_WINDOWS: readonly (readonly [number, number, number, number])[] = [
%s
]
"""
filas_ts = '\n'.join(
    '  [%s, %s, %s, %s],' % (v['x'], v['y'], v['w'], v['h']) for v in mapa['ventanas']
)
with open('C:/Users/PC/Afterhours/src/app/street-windows.ts', 'w', encoding='utf-8') as f:
    f.write(TS % (mapa['ratio'], filas_ts))
print('street-windows.ts escrito')
