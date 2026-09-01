#!/usr/bin/env bash
# Cuantas de las 96 ranuras de 15 minutos de las ultimas 24 h quedaron con
# lectura. Es LA metrica del poller, y no "cuantas veces disparo el cron":
# con `concurrency` y un job de ~40 min, tres de cada cuatro disparos caen
# sobre una corrida viva y se descartan — y eso es el diseno, porque mientras
# un job corre la cobertura ya esta ocurriendo.
#
# Lee del REPO y no de la pagina, por dos razones medidas:
#   - la home y /archive cachean distinto (dieron 15 y 13 en el mismo minuto);
#   - React intercala `<!-- -->` entre expresiones JSX, asi que un grep del
#     tipo '[0-9]* of 96 scheduled runs' NUNCA matchea. Ese comando estuvo mal
#     escrito en el handoff y habria devuelto vacio, que se lee como "cero".
#
# Uso:  bash scripts/cobertura.sh
set -euo pipefail
cd "$(dirname "$0")/.."
git fetch -q origin

# La ventana de 24 h puede cruzar la medianoche UTC, asi que se leen el archivo
# de hoy y el de ayer.
HOY=$(date -u +%F)
AYER=$(date -u -d '1 day ago' +%F)

{
  git show "origin/main:data/raw/$AYER.jsonl" 2>/dev/null || true
  git show "origin/main:data/raw/$HOY.jsonl"  2>/dev/null || true
} | python -c "
import sys, json, time, datetime
ahora = time.time()
ts = sorted({json.loads(l)['t'] for l in sys.stdin if l.strip()})
rec = [x for x in ts if x > ahora - 86400]
if not rec:
    print('0 de 96 — no hay ninguna lectura en 24 h')
    raise SystemExit(0)
ult = max(rec)
hueco = int((ahora - ult) / 60)
print(f'{len(rec)} de 96 ranuras con lectura en las ultimas 24 h')
print(f'ultima: {datetime.datetime.utcfromtimestamp(ult):%H:%M:%S} UTC, hace {hueco} min')
print()
print('PISO DEL 2026-09-01, cuando se cambio el cron: 15 de 96.')
print('Si no sube claramente de ahi, la hipotesis del minuto se cayo y el paso')
print('siguiente es un disparador independiente (cron de Vercel -> workflow_dispatch).')
"
