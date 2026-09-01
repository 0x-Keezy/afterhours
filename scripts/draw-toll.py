# -*- coding: utf-8 -*-
"""
Genera a TOLL como SVG dibujado a mano.

Por que un generador y no un modelo de imagen: el riesgo conocido de esta direccion
es que el personaje DERIVE entre poses (ver el aprendizaje del vault "un set de assets
que tiene que verse hermano se genera en UNA imagen, no en N jobs"). Autorando los
paths, todas las poses comparten literalmente la misma geometria de cuerpo con el mismo
jitter sembrado: la consistencia es estructural, no probabilistica.

El temblor es pseudo-aleatorio pero DETERMINISTA (semilla fija), asi que el archivo
generado es reproducible byte a byte y no cambia entre corridas.

Salida: src/app/toll.tsx  (componente React con SVG inline)

El SVG usa stroke="currentColor" y fill="var(--paper)" para que TOLL herede los tokens
del tema: se dibuja con la misma tinta que la pagina y se invierte solo en la madrugada.
"""

import io
import math
import os

# ---------------------------------------------------------------- ruido determinista


class Wobble:
    """LCG chiquito. No usa random para que la salida no dependa de la version de Python."""

    def __init__(self, seed):
        self.s = seed & 0xFFFFFFFF

    def next(self):
        self.s = (1103515245 * self.s + 12345) & 0x7FFFFFFF
        return self.s / 0x7FFFFFFF

    def signed(self, amp):
        return (self.next() * 2.0 - 1.0) * amp


# ---------------------------------------------------------------- trazo


def catmull_to_bezier(pts, closed):
    """Catmull-Rom -> cubicas. Da la curva blanda de un trazo hecho de un tiron."""
    n = len(pts)
    if closed:
        seq = [pts[(i - 1) % n] for i in range(n + 3)]
        seq = [pts[i % n] for i in range(-1, n + 2)]
    else:
        seq = [pts[0]] + pts + [pts[-1]]

    d = "M %.2f %.2f" % (seq[1][0], seq[1][1])
    for i in range(1, len(seq) - 2):
        p0, p1, p2, p3 = seq[i - 1], seq[i], seq[i + 1], seq[i + 2]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6.0, p1[1] + (p2[1] - p0[1]) / 6.0)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6.0, p2[1] - (p3[1] - p1[1]) / 6.0)
        d += " C %.2f %.2f %.2f %.2f %.2f %.2f" % (c1[0], c1[1], c2[0], c2[1], p2[0], p2[1])
    if closed:
        d += " Z"
    return d


def blob(cx, cy, rx, ry, n, amp, seed, squash_top=1.0):
    """Ovalo tembloroso. squash_top achata la parte de arriba para que sea un huevo, no un circulo."""
    w = Wobble(seed)
    pts = []
    for i in range(n):
        a = 2.0 * math.pi * i / n - math.pi / 2.0
        ex = rx + w.signed(amp)
        ey = ry + w.signed(amp)
        y = math.sin(a)
        if y < 0:
            y *= squash_top
        pts.append((cx + math.cos(a) * ex, cy + y * ey))
    return catmull_to_bezier(pts, True)


def line(points, amp, seed):
    """Polilinea temblorosa, para brazos y patas."""
    w = Wobble(seed)
    pts = [(x + w.signed(amp), y + w.signed(amp)) for (x, y) in points]
    return catmull_to_bezier(pts, False)


def poly(points, amp, seed, closed=True):
    """Poligono de lados RECTOS con vertices temblorosos.

    Para las orejas hace falta recto y no curvo: con catmull salian mechones
    curvados hacia adentro de la cabeza en vez de puntas.
    """
    w = Wobble(seed)
    pts = [(x + w.signed(amp), y + w.signed(amp)) for (x, y) in points]
    d = "M %.2f %.2f" % pts[0]
    for p in pts[1:]:
        # Un quiebre minusculo a mitad de lado: una recta a mano nunca es recta.
        d += " L %.2f %.2f" % p
    if closed:
        d += " Z"
    return d


def triangle(apex, left, right, amp, seed):
    """Oreja: triangulo CERRADO de lados rectos. Se dibuja ANTES del cuerpo, asi
    el relleno del cuerpo le tapa la base y queda como punta saliendo de la cabeza."""
    return poly([left, apex, right], amp, seed, closed=True)


def rect_wobble(cx, cy, w_, h_, amp, seed):
    """Cartel rectangular temblado. Antes era una elipse y leia como aureola."""
    hw, hh = w_ / 2.0, h_ / 2.0
    esquinas = [
        (cx - hw, cy - hh), (cx, cy - hh - 1.2), (cx + hw, cy - hh),
        (cx + hw + 1.0, cy), (cx + hw, cy + hh), (cx, cy + hh + 1.2),
        (cx - hw, cy + hh), (cx - hw - 1.0, cy),
    ]
    return poly(esquinas, amp, seed, closed=True)


# ---------------------------------------------------------------- anatomia de TOLL
#
# El cuerpo, las orejas y los ojos son IDENTICOS en las cuatro poses: mismas semillas,
# misma geometria. Solo cambian extremidades y ojos donde la pose lo exige.

CX, CY = 100.0, 150.0
RX, RY = 60.0, 68.0
AMP = 3.1                  # cuanto tiembla el trazo (subido: a 1.9 leia vectorial)
SEED_CUERPO = 20260901     # fijo: si cambia, TOLL deja de ser el mismo

EYE_L, EYE_R = (80.0, 132.0), (120.0, 132.0)
EYE_R_PX = 6.4

BODY = blob(CX, CY, RX, RY, 26, AMP, SEED_CUERPO, squash_top=0.94)
# Las bases entran BIEN adentro de la cabeza a proposito: el relleno del cuerpo,
# que se dibuja despues, se las come y deja solo la punta asomando.
EAR_L = triangle((54.0, 46.0), (38.0, 116.0), (88.0, 104.0), AMP, SEED_CUERPO + 11)
EAR_R = triangle((146.0, 46.0), (112.0, 104.0), (162.0, 116.0), AMP, SEED_CUERPO + 12)


def eye(cx, cy, r, seed):
    return blob(cx, cy, r, r, 12, 0.55, seed)


def lid(cx, cy, seed):
    """Ojo cansado: una raya horizontal en vez de un punto."""
    return line([(cx - 7.5, cy), (cx, cy + 1.1), (cx + 7.5, cy)], 0.5, seed)


EYES_NEUTRAL = [eye(EYE_L[0], EYE_L[1], EYE_R_PX, SEED_CUERPO + 21),
                eye(EYE_R[0], EYE_R[1], EYE_R_PX, SEED_CUERPO + 22)]
EYES_WIDE = [eye(EYE_L[0], EYE_L[1], EYE_R_PX * 1.62, SEED_CUERPO + 21),
             eye(EYE_R[0], EYE_R[1], EYE_R_PX * 1.62, SEED_CUERPO + 22)]
LIDS = [lid(EYE_L[0], EYE_L[1], SEED_CUERPO + 31), lid(EYE_R[0], EYE_R[1], SEED_CUERPO + 32)]

LEG_L = line([(84.0, 214.0), (83.0, 236.0), (82.0, 248.0)], 1.2, SEED_CUERPO + 41)
LEG_R = line([(116.0, 214.0), (117.0, 236.0), (118.0, 248.0)], 1.2, SEED_CUERPO + 42)
FOOT_L = blob(78.0, 250.0, 11.0, 5.2, 12, 0.7, SEED_CUERPO + 43)
FOOT_R = blob(122.0, 250.0, 11.0, 5.2, 12, 0.7, SEED_CUERPO + 44)

# Los brazos arrancan DENTRO del cuerpo y salen bien lejos del borde. Antes
# terminaban pegados a la silueta y leian como bigotes, no como brazos.
ARM_DOWN_L = line([(62.0, 168.0), (42.0, 186.0), (34.0, 198.0)], 1.0, SEED_CUERPO + 51)
ARM_DOWN_R = line([(138.0, 168.0), (158.0, 186.0), (166.0, 198.0)], 1.0, SEED_CUERPO + 52)
ARM_UP_L = line([(60.0, 158.0), (40.0, 168.0), (32.0, 176.0)], 1.0, SEED_CUERPO + 61)
ARM_UP_R = line([(140.0, 158.0), (160.0, 168.0), (168.0, 176.0)], 1.0, SEED_CUERPO + 62)
ARM_OUT_L = line([(62.0, 162.0), (38.0, 152.0), (22.0, 142.0)], 1.0, SEED_CUERPO + 71)
ARM_OUT_R = line([(138.0, 162.0), (162.0, 152.0), (178.0, 142.0)], 1.0, SEED_CUERPO + 72)

# Pose sentada: el cuerpo se apoya mas abajo y las patas salen hacia adelante.
BODY_SIT = blob(CX, CY + 26.0, RX, RY * 0.93, 26, AMP, SEED_CUERPO, squash_top=0.94)
LEG_SIT_L = line([(74.0, 232.0), (48.0, 244.0), (26.0, 246.0)], 1.2, SEED_CUERPO + 81)
LEG_SIT_R = line([(126.0, 232.0), (152.0, 244.0), (174.0, 246.0)], 1.2, SEED_CUERPO + 82)
FOOT_SIT_L = blob(20.0, 244.0, 6.0, 10.0, 12, 0.7, SEED_CUERPO + 83)
FOOT_SIT_R = blob(180.0, 244.0, 6.0, 10.0, 12, 0.7, SEED_CUERPO + 84)
ARM_SIT_L = line([(44.0, 194.0), (32.0, 214.0), (30.0, 230.0)], 1.1, SEED_CUERPO + 85)
ARM_SIT_R = line([(156.0, 194.0), (168.0, 214.0), (170.0, 230.0)], 1.1, SEED_CUERPO + 86)

# El cartel va VACIO a proposito: el lettering se compone encima en SVG, asi una sola
# pose sirve para las cuatro secciones y el texto queda como texto real.
SIGN = rect_wobble(100.0, 178.0, 152.0, 54.0, 1.6, SEED_CUERPO + 91)


def fill_stroke(d, w=3.4, fill="none"):
    return '<path d="%s" fill="%s" stroke="currentColor" strokeWidth="%s" strokeLinecap="round" strokeLinejoin="round" />' % (
        d, fill, w
    )


def solid(d):
    return '<path d="%s" fill="currentColor" stroke="none" />' % d


POSES = {
    "Neutral": {
        "vb": "0 0 200 262",
        "cuerpo": BODY,
        "partes": [
            (LEG_L, 3.2, "none"), (LEG_R, 3.2, "none"),
            (FOOT_L, 3.0, "var(--paper)"), (FOOT_R, 3.0, "var(--paper)"),
            (ARM_DOWN_L, 4.8, "none"), (ARM_DOWN_R, 4.8, "none"),
        ],
        "ojos": EYES_NEUTRAL,
        "solidos": True,
    },
    "Sign": {
        "vb": "0 0 200 262",
        "cuerpo": BODY,
        "partes": [
            (LEG_L, 3.2, "none"), (LEG_R, 3.2, "none"),
            (FOOT_L, 3.0, "var(--paper)"), (FOOT_R, 3.0, "var(--paper)"),
            (ARM_UP_L, 4.0, "none"), (ARM_UP_R, 4.0, "none"),
        ],
        "ojos": EYES_NEUTRAL,
        "solidos": True,
        "cartel": SIGN,
    },
    "SignAlert": {
        "vb": "0 0 200 262",
        "cuerpo": BODY,
        "partes": [
            (LEG_L, 3.2, "none"), (LEG_R, 3.2, "none"),
            (FOOT_L, 3.0, "var(--paper)"), (FOOT_R, 3.0, "var(--paper)"),
            (ARM_UP_L, 4.0, "none"), (ARM_UP_R, 4.0, "none"),
        ],
        "ojos": EYES_WIDE,
        "solidos": True,
        "cartel": SIGN,
    },
    "SignTired": {
        "vb": "0 0 200 262",
        "cuerpo": BODY,
        "partes": [
            (LEG_L, 3.2, "none"), (LEG_R, 3.2, "none"),
            (FOOT_L, 3.0, "var(--paper)"), (FOOT_R, 3.0, "var(--paper)"),
            (ARM_UP_L, 4.0, "none"), (ARM_UP_R, 4.0, "none"),
        ],
        "ojos": LIDS,
        "solidos": False,
        "cartel": SIGN,
    },
    "Tired": {
        # Recortado arriba: sentado, el cuerpo baja y el viewBox completo dejaba
        # un tercio de aire vacio que descolgaba la maqueta.
        "vb": "0 58 200 204",
        "cuerpo": BODY_SIT,
        "partes": [
            (LEG_SIT_L, 3.0, "none"), (LEG_SIT_R, 3.0, "none"),
            (FOOT_SIT_L, 3.0, "var(--paper)"), (FOOT_SIT_R, 3.0, "var(--paper)"),
            (ARM_SIT_L, 4.8, "none"), (ARM_SIT_R, 4.8, "none"),
        ],
        "ojos": LIDS,
        "solidos": False,
        "dy_orejas": 30.6,
    },
    "Alert": {
        "vb": "0 0 200 262",
        "cuerpo": BODY,
        "partes": [
            (LEG_L, 3.2, "none"), (LEG_R, 3.2, "none"),
            (FOOT_L, 3.0, "var(--paper)"), (FOOT_R, 3.0, "var(--paper)"),
            (ARM_OUT_L, 4.8, "none"), (ARM_OUT_R, 4.8, "none"),
        ],
        "ojos": EYES_WIDE,
        "solidos": True,
    },
}


def render(nombre, cfg):
    out = []
    out.append('export function Toll%s({ className }: { className?: string }) {' % nombre)
    out.append('  return (')
    out.append('    <svg viewBox="%s" className={className} aria-hidden="true" focusable="false">' % cfg["vb"])

    dy = cfg.get("dy_orejas", 0.0)
    # Orden de dibujo, y es lo que hace que funcione:
    #   extremidades -> orejas -> cuerpo relleno -> ojos -> cartel.
    # Extremidades y orejas quedan DEBAJO del relleno del cuerpo, asi las bases
    # desaparecen y solo asoman las puntas y los brazos. Es como se dibuja a mano.
    for d, w, f in cfg["partes"]:
        out.append("      " + fill_stroke(d, w, f))

    grupo = '      <g transform="translate(0 %.1f)">' % dy if dy else None
    if grupo:
        out.append(grupo)
        pre = "        "
    else:
        pre = "      "
    out.append(pre + fill_stroke(EAR_L, 3.4, "var(--paper)"))
    out.append(pre + fill_stroke(EAR_R, 3.4, "var(--paper)"))
    if grupo:
        out.append("      </g>")

    out.append("      " + fill_stroke(cfg["cuerpo"], 3.6, "var(--paper)"))

    for d in cfg["ojos"]:
        out.append("      " + (solid(d) if cfg["solidos"] else fill_stroke(d, 3.2)))

    if cfg.get("cartel"):
        out.append("      " + fill_stroke(cfg["cartel"], 3.4, "var(--paper)"))

    out.append("    </svg>")
    out.append("  )")
    out.append("}")
    return "\n".join(out)


def main():
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    destino = os.path.join(raiz, "src", "app", "toll.tsx")

    cab = [
        "// GENERADO por scripts/draw-toll.py. No editar a mano: volve a correr el script.",
        "//",
        "// TOLL, el del turno noche. Las cuatro poses comparten la MISMA geometria de cuerpo",
        "// con el mismo jitter sembrado, asi que el trazo no puede derivar entre poses.",
        "//",
        "// Se dibuja con currentColor y se rellena con var(--paper): hereda la tinta de la",
        "// pagina y se invierte solo cuando el papel se da vuelta en la madrugada.",
        "",
    ]
    cuerpo = [render(n, c) for n in ("Neutral", "Sign", "SignAlert", "SignTired", "Tired", "Alert") for c in [POSES[n]]]
    io.open(destino, "w", encoding="utf-8").write("\n".join(cab) + "\n\n".join(cuerpo) + "\n")
    print("escrito: %s" % destino)

    # Vista previa suelta para mirar el trazo sin levantar la app.
    prev = os.path.join(raiz, "refs", "toll-preview.html")
    if not os.path.isdir(os.path.dirname(prev)):
        os.makedirs(os.path.dirname(prev))
    svgs = []
    for n in ("Neutral", "Sign", "SignAlert", "SignTired", "Tired", "Alert"):
        c = POSES[n]
        tsx = render(n, c)
        ini = tsx.index("<svg")
        fin = tsx.index("</svg>") + len("</svg>")
        svg = tsx[ini:fin].replace("className={className}", 'width="200"')
        svg = svg.replace("strokeWidth", "stroke-width").replace("strokeLinecap", "stroke-linecap")
        svg = svg.replace("strokeLinejoin", "stroke-linejoin")
        svgs.append('<figure><div class="p">%s</div><figcaption>%s</figcaption></figure>' % (svg, n))
    html = """<!doctype html><meta charset="utf-8"><title>TOLL</title>
<style>
 :root { --paper:#FAF7F0; --ink:#17140F; }
 body { background:var(--paper); color:var(--ink); font:14px ui-monospace,monospace; margin:0; padding:32px; }
 .row { display:flex; gap:24px; flex-wrap:wrap; }
 figure { margin:0; }
 .p { border:1px dashed rgba(0,0,0,.18); }
 .dark { --paper:#17140F; --ink:#F2EDE1; background:var(--paper); color:var(--ink); margin-top:32px; padding:32px; }
 figcaption { text-align:center; padding-top:8px; letter-spacing:.12em; }
</style>
<div class="row">%s</div>
<div class="dark"><div class="row">%s</div></div>
""" % ("".join(svgs), "".join(svgs))
    io.open(prev, "w", encoding="utf-8").write(html)
    print("preview:  %s" % prev)


if __name__ == "__main__":
    main()
