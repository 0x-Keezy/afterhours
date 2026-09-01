# -*- coding: utf-8 -*-
"""
Alfabeto de trazo dibujado a mano para los titulos de AFTERHOURS.

Por que no una fuente: la §7 pide lettering a mano, y una fuente "handwriting" de
Google no comparte la mano con TOLL. Aca las letras pasan por el MISMO generador de
temblor que el personaje (misma clase Wobble, misma amplitud, mismo grosor de trazo),
asi que el titulo y el personaje estan dibujados por la misma mano. Eso no se compra
con una fuente.

Cada glifo es monolinea: una o mas polilineas sobre una grilla de 10 x 14 (y hacia
abajo, 0 = altura de mayuscula, 14 = linea de base). Se hornean TRES variantes de cada
letra con semillas distintas y se elige por posicion, asi dos "A" de la misma palabra
no salen calcadas. Determinista: sin random en runtime.

Salida: src/app/lettering.tsx
"""

import io
import os

ANCHO = 10.0
ALTO = 14.0
AVANCE = 13.6      # ancho + kerning
ESPACIO = 8.0
VARIANTES = 3

# ---------------------------------------------------------------- el alfabeto
# Cada letra: lista de polilineas. Solo mayusculas: el registro es de cartel.

GLIFOS = {
    "A": [[(0, 14), (5, 0), (10, 14)], [(1.8, 9.5), (8.2, 9.5)]],
    "B": [[(0, 0), (0, 14)], [(0, 0), (6.6, 0), (9.2, 2.2), (9.2, 4.8), (6.6, 7), (0, 7)],
          [(0, 7), (7.2, 7), (9.8, 9.4), (9.8, 11.8), (7.2, 14), (0, 14)]],
    "C": [[(9.6, 2.8), (7, 0), (3.2, 0), (0.7, 3), (0, 7), (0.7, 11), (3.2, 14), (7, 14), (9.6, 11.2)]],
    "D": [[(0, 0), (0, 14)], [(0, 0), (6, 0), (9.4, 3.4), (10, 7), (9.4, 10.6), (6, 14), (0, 14)]],
    "E": [[(9.6, 0), (0, 0), (0, 14), (9.6, 14)], [(0, 7), (7.4, 7)]],
    "F": [[(9.6, 0), (0, 0), (0, 14)], [(0, 6.6), (7.4, 6.6)]],
    "G": [[(9.6, 2.8), (7, 0), (3.2, 0), (0.7, 3), (0, 7), (0.7, 11), (3.2, 14), (7, 14), (9.8, 11.4), (9.8, 8.2), (5.6, 8.2)]],
    "H": [[(0, 0), (0, 14)], [(10, 0), (10, 14)], [(0, 7), (10, 7)]],
    "I": [[(1.6, 0), (8.4, 0)], [(5, 0), (5, 14)], [(1.6, 14), (8.4, 14)]],
    "J": [[(9, 0), (9, 10.6), (7, 14), (3.4, 14), (1, 11.4)]],
    "K": [[(0, 0), (0, 14)], [(9.6, 0), (0.6, 7.6)], [(3, 5.6), (10, 14)]],
    "L": [[(0, 0), (0, 14), (9.4, 14)]],
    "M": [[(0, 14), (0, 0), (5, 8.4), (10, 0), (10, 14)]],
    "N": [[(0, 14), (0, 0), (10, 14), (10, 0)]],
    "O": [[(5, 0), (1.2, 2.6), (0, 7), (1.2, 11.4), (5, 14), (8.8, 11.4), (10, 7), (8.8, 2.6), (5, 0)]],
    "P": [[(0, 14), (0, 0), (6.8, 0), (9.6, 2.4), (9.6, 5.6), (6.8, 8), (0, 8)]],
    "Q": [[(5, 0), (1.2, 2.6), (0, 7), (1.2, 11.4), (5, 14), (8.8, 11.4), (10, 7), (8.8, 2.6), (5, 0)], [(6.2, 10.2), (10.6, 15.4)]],
    "R": [[(0, 14), (0, 0), (6.8, 0), (9.6, 2.4), (9.6, 5.6), (6.8, 8), (0, 8)], [(4.6, 8), (10, 14)]],
    "S": [[(9.4, 2.4), (6.6, 0), (3, 0), (0.6, 2.2), (0.9, 5), (4, 6.6), (6.6, 7.4), (9.4, 9), (9.6, 11.8), (7, 14), (3, 14), (0.4, 11.6)]],
    "T": [[(0, 0), (10, 0)], [(5, 0), (5, 14)]],
    "U": [[(0, 0), (0, 10.4), (2.6, 14), (7.4, 14), (10, 10.4), (10, 0)]],
    "V": [[(0, 0), (5, 14), (10, 0)]],
    "W": [[(0, 0), (2.6, 14), (5, 4.6), (7.4, 14), (10, 0)]],
    "X": [[(0, 0), (10, 14)], [(10, 0), (0, 14)]],
    "Y": [[(0, 0), (5, 7.4), (10, 0)], [(5, 7.4), (5, 14)]],
    "Z": [[(0, 0), (10, 0), (0, 14), (10, 14)]],
    "0": [[(5, 0), (1.2, 2.6), (0, 7), (1.2, 11.4), (5, 14), (8.8, 11.4), (10, 7), (8.8, 2.6), (5, 0)]],
    "1": [[(2, 2.6), (5.4, 0), (5.4, 14)], [(2, 14), (8.8, 14)]],
    "2": [[(0.6, 2.6), (3.4, 0), (7, 0), (9.6, 2.4), (9.4, 5.4), (0.4, 14), (9.8, 14)]],
    "3": [[(0.6, 2.2), (3.4, 0), (7.2, 0), (9.4, 2.4), (9, 5.2), (5.4, 6.8)], [(5.4, 6.8), (9.2, 8.4), (9.6, 11.6), (7, 14), (3.2, 14), (0.4, 11.8)]],
    "4": [[(7.6, 0), (0, 10), (10, 10)], [(7.6, 5), (7.6, 14)]],
    "5": [[(9.4, 0), (1, 0), (0.4, 6.4), (5, 5.6), (9, 7.4), (9.6, 11), (7, 14), (3, 14), (0.4, 11.8)]],
    "6": [[(9, 1), (5, 0), (1.4, 2.6), (0, 7.6), (0.6, 11.6), (3.6, 14), (7, 14), (9.6, 11.8), (9.2, 8.4), (5.6, 6.8), (1.4, 8)]],
    "7": [[(0, 0), (10, 0), (4, 14)]],
    "8": [[(5, 6.8), (1.6, 5.2), (1.2, 2.4), (4, 0), (7, 0), (9, 2.4), (8.4, 5.2), (5, 6.8), (1, 8.6), (0.6, 11.6), (3.4, 14), (7, 14), (9.6, 11.6), (9, 8.6), (5, 6.8)]],
    "9": [[(1, 13), (5, 14), (8.6, 11.4), (10, 6.4), (9.4, 2.4), (6.4, 0), (3, 0), (0.4, 2.2), (0.8, 5.6), (4.4, 7.2), (8.6, 6)]],
    ".": [[(4.6, 13.4), (5.4, 13.4)]],
    ":": [[(4.6, 4.6), (5.4, 4.6)], [(4.6, 13.4), (5.4, 13.4)]],
    "'": [[(5, 0), (4.2, 3.4)]],
}


class Wobble:
    """La MISMA clase que scripts/draw-toll.py. Si cambia una, cambia la otra."""

    def __init__(self, seed):
        self.s = seed & 0xFFFFFFFF

    def next(self):
        self.s = (1103515245 * self.s + 12345) & 0x7FFFFFFF
        return self.s / 0x7FFFFFFF

    def signed(self, amp):
        return (self.next() * 2.0 - 1.0) * amp


def catmull(pts):
    seq = [pts[0]] + pts + [pts[-1]]
    d = "M %.2f %.2f" % (seq[1][0], seq[1][1])
    for i in range(1, len(seq) - 2):
        p0, p1, p2, p3 = seq[i - 1], seq[i], seq[i + 1], seq[i + 2]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6.0, p1[1] + (p2[1] - p0[1]) / 6.0)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6.0, p2[1] - (p3[1] - p1[1]) / 6.0)
        d += " C %.2f %.2f %.2f %.2f %.2f %.2f" % (c1[0], c1[1], c2[0], c2[1], p2[0], p2[1])
    return d


AMP = 0.34          # el temblor de la letra: menos que el del cuerpo, o no se lee
SEED_BASE = 20260901


def glifo(ch, variante):
    """Devuelve los paths de una letra con su temblor horneado."""
    trazos = GLIFOS[ch]
    seed = SEED_BASE + variante * 7919 + (ord(ch) * 131)
    w = Wobble(seed)
    salida = []
    for tr in trazos:
        pts = []
        for (x, y) in tr:
            pts.append((x + w.signed(AMP), y + w.signed(AMP)))
        # Una letra a mano no arranca ni termina exactamente donde deberia.
        salida.append(catmull(pts))
    return salida


def main():
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    destino = os.path.join(raiz, "src", "app", "lettering.tsx")

    filas = []
    for ch in sorted(GLIFOS.keys()):
        variantes = []
        for v in range(VARIANTES):
            paths = glifo(ch, v)
            variantes.append("[" + ", ".join("'%s'" % p for p in paths) + "]")
        clave = "'%s'" % (ch if ch != "'" else "\\'")
        filas.append("  %s: [%s]," % (clave, ", ".join(variantes)))

    tsx = """// GENERADO por scripts/draw-lettering.py. No editar a mano.
//
// Alfabeto de trazo dibujado a mano. Pasa por el mismo generador de temblor que TOLL
// (scripts/draw-toll.py), asi que el titulo y el personaje comparten la mano.
//
// Tres variantes por letra, elegidas por posicion: dos "A" de la misma palabra no
// salen calcadas. Horneado, deterministico, sin random en runtime.

const ANCHO = %s
const ALTO = %s
const AVANCE = %s
const ESPACIO = %s
const INTERLINEA = 1.42

const GLIFOS: Record<string, string[][]> = {
%s
}

/**
 * Titulo rotulado a mano. `text` se lee igual por un lector de pantalla porque va
 * tambien en <title>; lo que se dibuja son trazos, no una fuente.
 */
export function HandText({
  text,
  className,
  strokeWidth = 1.15,
}: {
  text: string
  className?: string
  strokeWidth?: number
}) {
  // Un titulo largo en una sola linea se encoge hasta ser ilegible dentro del
  // cartel. Se parte por saltos de linea explicitos y se apilan.
  const lineas = text.toUpperCase().split('\\n')

  const puestos: { d: string; x: number; y: number }[] = []
  let ancho = ANCHO
  lineas.forEach((linea, fila) => {
    let x = 0
    const y = fila * (ALTO * INTERLINEA)
    linea.split('').forEach((ch, i) => {
      if (ch === ' ') {
        x += ESPACIO
        return
      }
      const variantes = GLIFOS[ch]
      if (!variantes) {
        x += AVANCE
        return
      }
      const v = variantes[(i + fila) %% variantes.length]
      v.forEach((d) => puestos.push({ d, x, y }))
      x += AVANCE
    })
    ancho = Math.max(ancho, x - (AVANCE - ANCHO))
  })

  const alto = ALTO + (lineas.length - 1) * ALTO * INTERLINEA
  const m = strokeWidth + 0.6 // aire para que el trazo no se coma en el borde

  return (
    <svg
      viewBox={`${-m} ${-m} ${ancho + m * 2} ${alto + m * 2}`}
      className={className}
      role="img"
      aria-label={text.replace(/\\n/g, ' ')}
    >
      <title>{text.replace(/\\n/g, ' ')}</title>
      {puestos.map((p, i) => (
        <path
          key={i}
          d={p.d}
          transform={`translate(${p.x} ${p.y})`}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  )
}
""" % (ANCHO, ALTO, AVANCE, ESPACIO, "\n".join(filas))

    io.open(destino, "w", encoding="utf-8").write(tsx)
    print("escrito: %s" % destino)

    # Vista previa: los titulos reales que usa la pagina.
    prev = os.path.join(raiz, "refs", "lettering-preview.html")
    titulos = ["AFTERHOURS", "THE CLOCK", "THE BOARD", "WHAT THIS MEASURES", "THE ARCHIVE"]
    bloques = []
    for t in titulos:
        x = 0.0
        paths = []
        for i, ch in enumerate(t):
            if ch == " ":
                x += ESPACIO
                continue
            for d in glifo(ch, i % VARIANTES):
                paths.append('<path d="%s" transform="translate(%.2f 0)" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/>' % (d, x))
            x += AVANCE
        ancho = max(x - (AVANCE - ANCHO), ANCHO)
        bloques.append(
            '<div class="t"><svg viewBox="-1.8 -1.8 %.2f %.2f" height="64">%s</svg></div>'
            % (ancho + 3.6, ALTO + 3.6, "".join(paths))
        )
    html = """<!doctype html><meta charset="utf-8"><title>lettering</title>
<style>
 :root { --paper:#FAF7F0; --ink:#17140F; }
 body { background:var(--paper); color:var(--ink); margin:0; padding:36px; font:13px ui-monospace,monospace; }
 .t { margin-bottom:26px; }
 .dark { --paper:#17140F; --ink:#F2EDE1; background:var(--paper); color:var(--ink); padding:36px; margin-top:24px; }
</style>
%s
<div class="dark">%s</div>
""" % ("".join(bloques), "".join(bloques))
    io.open(prev, "w", encoding="utf-8").write(html)
    print("preview:  %s" % prev)


if __name__ == "__main__":
    main()
