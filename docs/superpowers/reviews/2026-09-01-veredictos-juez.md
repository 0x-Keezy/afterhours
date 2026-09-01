# AFTERHOURS — dos veredictos del juez visual (2026-09-01)

> **Para quien siga construyendo la página, sea cual sea la piel.** Estos veredictos son de
> `landing-visual-judge` sobre la versión doodle (commit `d48f666`), pero **la mayoría de los
> defectos son del PRODUCTO y no de la estética**, así que sobreviven a cualquier rediseño.
> Dejo esto como archivo y no como mensaje entre sesiones para que no se pierda.
>
> Contexto: la versión doodle quedó descartada por decisión de Jose y la página se rehace en
> pixel-art. Los defectos de abajo NO los arregla el cambio de piel.

---

## Ronda 1 · 6/10 · REVISE

`mold_risk` false · `fits_vertical` true.

### Lo que se arregló (commit `d48f666`)

1. **El tablero ocupaba el 50 % del scroll sin dejar ver la anomalía.** La columna repetía
   `CALIBRATING 1 %` en 34 filas idénticas, y `WYFI 34,99 %` pesaba visualmente lo mismo que
   `AAPL 0,03 %`. → Una sola línea de nota en vez de la columna, barra proporcional al gap, y las
   3 mayores en tinta plena.
2. **Cero superficie de verificación.** → Ruta `/archive` que sirve el JSONL crudo, bloque de
   procedencia en el pie y tira temporal de corridas.
3. **"Robinhood Chain" aparecía a 5.400 px de scroll** y el criterio de los diez segundos fallaba
   de forma objetiva. → Línea de qué-mide arriba del fold y leyenda de las cuatro fases.

---

## Ronda 2 · 7/10 · REVISE

Juez nuevo, en frío, sin saber que había habido una ronda previa ni qué se tocó.
`mold_risk` false · `fits_vertical` true.

### Lo que sigue ABIERTO, y aplica a la versión pixel igual

#### 1. El tablero no muestra los dos precios de los que sale el gap

`BoardRow` (`src/core/board.ts`) lleva `symbol`, `gapPct`, `z`, `calibrating`, `progress`,
`liquidityUsd`. **No lleva `onchain` ni `reference`**, así que la página muestra sólo el número
derivado y **un escéptico no puede comprobar una sola resta**.

Además **incumple la §4 de la spec**, instrumento 2, que pide textualmente *"un panel por ticker:
precio on-chain vs último precio real, gap %"*.

→ Los dos campos ya existen en `Sample`. Agregarlos a `BoardRow` y renderizarlos como dos columnas
antes de GAP en ≥900 px.

#### 2. Las fuentes del pie son texto plano

`DexScreener`, `Yahoo Finance` y `GitHub Actions` no son links. El único link de la página es
`/archive`. La desviación de registro se concedió con el argumento de que la confianza necesaria
era **epistémica**; eso obliga a que las fuentes sean auditables, no nombrables.

→ Link a la pair URL de DexScreener por ticker, al quote de la referencia, y a `/actions` del repo.

#### 3. La tira del archivo no está diseñada para el estado lleno

Hoy se ve bien con 1 corrida. **A 96 corridas/día son ticks de 2 px cada ~10 px**: va a leerse como
una trama sólida y **un hueco de una sola corrida será invisible**, que es exactamente lo contrario
de su propósito declarado.

→ Rediseñarla para densidad alta antes de que el poller lleve un día corriendo.

#### 4. "La campana" no existe

La §4 de la spec declara el instrumento 3 (*el snap de convergencia al abrir el mercado*) como
**"el momento estrella del producto y el que genera contenido"**. La página no lo tiene.

#### 5. El layout desperdicia el ancho en desktop

`max-width: 62rem` dentro de 1280, y nada usa nunca más de una columna: entre x≈600 y x≈1280 el
hero está vacío. **A 1280 se lee como un layout mobile estirado.**

→ A ≥1100 px, hero en dos columnas, con las tres filas destacadas (que el código ya calcula) como
bloque "right now" a la derecha.

#### 6. En mobile se perdía la clave de orden

Ocultar LIQUIDITY borraba el criterio mientras la nota seguía diciendo *"ordered by liquidity"*.
→ Compactar a 3 caracteres (`5.3M`, `57K`) en vez de ocultar.

### La frase que resume el veredicto

> **"La dirección de arte está más terminada que el instrumento que envuelve."**

---

## Lo que el juez marcó como genuinamente bien (conservarlo en cualquier piel)

- **La honestidad es estructural, no cosmética**: el estado `calibrando` explicado una vez en vez
  de repetido 34 veces, el orden declarado con su motivo (`board.orderedBy`), *"el hueco es el
  poller que no había arrancado, no un agujero en el registro"*, y `LAST READ` real.
- **Tres filas en tinta plena contra 31 apagadas**: la anomalía se identifica en un thumbnail de
  175 px sin leer un número. Era el pedido explícito y no es fácil.
- **La página no se contradice a sí misma**: una sola familia cargada, un solo color condicional,
  cero gradiente, cero glow, cero movimiento.

## Falsos positivos verificados (no "corregir")

- **El círculo con una "N"** es el indicador de desarrollo de Next.js. No existe en producción.
- **El numerado por hora y el countdown a la campana** disparan checks del gate mecánico, pero
  **codifican secuencias reales**, así que son legítimos. Ya está declarado en la §7 de la spec.

## Gotcha de QA que cuesta tiempo real

**Chrome headless con `--window-size` no re-maqueta antes del screenshot.** Devuelve una página
cortada que no existe. Perseguí un desborde horizontal inexistente durante tres iteraciones y
estuve por encoger tipografías que estaban bien. **Medí con Playwright y viewport explícito.**
Destilado en `Aprendizajes/una-captura-no-es-una-medicion-del-dom.md` del vault.
