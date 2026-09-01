# AFTERHOURS — brief-contrato

**Fecha:** 2026-09-01 · **Vertical:** DeFi/tool · **Skill:** `disenar-pagina` Fase 0
**Spec:** `docs/superpowers/specs/2026-09-01-afterhours-design.md` (§7 es el ADN de marca)

> **Esto es un contrato.** Si el build se desvía, gana el brief. Lo que está LOCKEADO no se re-deriva
> ni se re-pregunta: es dato, no opción.

---

## Fase -1 · ADN de marca (LOCKEADO, viene de la §7)

| Eje | Valor | Origen |
|---|---|---|
| Registro visual | Doodle a marcador, trazo tembloroso, monocromo | Referencia que trajo Jose |
| Personaje | **TOLL**, el del turno noche. Sin token, sin ticker | §7 |
| Wow Tier-1 | **El papel es el reloj** | §7 |
| Acento | Lime de RH Chain, **sólo con mercado abierto** | §7 |
| Mono | **Courier Prime** | §7 |
| Nombres | El reloj se llama **EL RELOJ**. Prohibido nombrar instrumentos como archivos | §7 |

Ejes lockeados quedan **fuera** del cómputo anti-convergencia.

---

## Design-read (una línea)

> Para alguien que a las 3 de la mañana mira el precio de una acción tokenizada en Robinhood Chain,
> esta página tiene **un solo trabajo**: decirle si ese precio está raro **para ese ticker**, y
> probárselo con archivo en vez de con opinión.

## Concept spine

**El mercado no cierra, pero el mundo sí.** La página es una noche en un parqué vacío. El paso de las
horas no es decoración: es el dato. TOLL es el que se quedó.

**Regla mecánica de transformación (el equivalente al "prohibido resetear con crossfade"):**

> **Nada en esta página cambia de color por scroll, hover, gusto o preferencia del usuario.**
> El papel cambia **sólo** porque cambió el estado real del mercado. Si algo cambió, es porque
> Wall Street cambió.

Esa regla es la que convierte la estética en argumento. Un tema conmutable por el usuario la rompería
entera, y por eso está prohibido (además de que el gate falla el toggle sol/luna).

## Signature artifact

**El papel-reloj.** Es el artefacto que no se puede pegar en ningún otro sitio: está atado a
`currentTradingPeriod` de un mercado real, vía `paperPhase()`. Nadie puede tener este artefacto sin
tener este dato. Todo lo demás lo sirve.

---

## Paleta bloqueada

Cuatro fases, que son **exactamente** las que expone `src/core/session.ts`
(`PaperPhase = 'day' | 'dusk' | 'night' | 'dawn'`). El código manda sobre la tabla descriptiva de la
spec, que hablaba de cinco.

| Fase | Cuándo | Papel | Tinta | Contraste |
|---|---|---|---|---|
| `day` | mercado **abierto** | `#FAF7F0` | `#17140F` | **17,17:1** AAA |
| `dusk` | cerró hace ≤3 h | `#E9E3D6` | `#17140F` | **14,36:1** AAA |
| `night` | madrugada profunda | `#17140F` **(invertido)** | `#F2EDE1` | **15,72:1** AAA |
| `dawn` | abre en ≤2 h | `#D8D1C0` | `#17140F` | **12,07:1** AAA |

Acento: **lime `#CCFF00`**, y sólo en `day`.

### La regla del lime, que sale de la fórmula y no del gusto

Medido con WCAG 2.1:

- **Lime como TEXTO sobre papel de día: `1,10:1`. Falla catastróficamente.**
- Tinta oscura **sobre un bloque lime**: `15,63:1`. AAA.

Por lo tanto: **el lime es una SUPERFICIE, nunca un color de texto.** La tinta se sienta encima del
bloque lime. El uso ingenuo (pintar el número en lime) es el que hay que evitar, y es justo el que
saldría solo.

### Bans de paleta (verificados, 0 presentes)

`#000000` · `#FFFFFF` · slop-gray de UI-kit (`#f3f4f6` / `#eceef2` / `#e7ecf3`) · cualquier gris
**frío** (los cuatro papeles son cálidos, y mezclar temperaturas rompe el sistema) · AI-purple ·
neón saturado · gradientes · glow · blur · sombras suaves · biseles.

---

## Tipografía bloqueada

**Una sola familia web cargada.** El gate falla con más de 4; acá hay 1.

| Rol | Qué | Por qué |
|---|---|---|
| Display, títulos, carteles | **Lettering dibujado a mano**, assets SVG | Es lo que **TOLL escribe** |
| Datos, cuerpo, tablas | **Courier Prime**, texto real seleccionable | Es lo que **la máquina imprime** |

Esa división no es estética: es la lógica del producto. Lo escrito a mano es la voz; lo tipeado es la
medición. Y mantiene los datos accesibles e indexables, que un lettering en SVG no sería.

**Prohibidas por uso previo en el ledger:** Silkscreen, Press Start 2P, JetBrains Mono, Space Mono,
Geist Mono. **Prohibida** Inter suelta como primaria.

---

## Plan de secciones

Cuatro. No es una landing con scroll narrativo: es un instrumento. El meta-esqueleto SaaS
(hero 2-col → 3 feature cards → tabs → pricing → FAQ → CTA slab) está **prohibido**.

1. **EL RELOJ** — el marco, siempre visible. Hora de Nueva York, `OPEN`/`CLOSED`, horas desde el
   último trade real, cuenta regresiva a la campana. TOLL vive acá, sosteniendo el cartel.
2. **EL TABLERO** — la grilla de gaps **ordenada por anomalía** (`buildBoard` ya la ordena así), con
   el estado `calibrando` honesto donde no hay banda todavía.
3. **QUÉ MIDE ESTO** — para el visitante frío, en menos de diez segundos. Un cartel que TOLL sostiene.
4. **EL ARCHIVO** — cuántas muestras hay, desde cuándo, y **el hueco visible si lo hubo**. Nunca se
   interpola para tapar un hueco: el hueco es información sobre la honestidad del archivo.

---

## Copy exacto (decidido acá, no durante el build)

**Idioma: inglés.** La audiencia de un instrumento sobre Robinhood Chain es global y cripto, igual que
IN PROFIT, Marvin y Capito. (La comunicación con Jose sigue en español; esto es la interfaz.)

**Prohibido el em-dash en todo copy visible.** La voz deadpan tiende a la pausa larga: usar punto,
coma o paréntesis. El gate lo grepea y es el tell número uno.

| Situación | Texto |
|---|---|
| Voz ancla | `THE MARKET NEVER CLOSES.` / `He took that personally.` |
| Mercado abierto | `WALL STREET IS OPEN` |
| Cerrado | `CLOSED FOR 9.2 H` · `OPENS IN 8.3 H` |
| Estado no verificable | `MARKET STATE UNKNOWN` |
| Ticker sin banda | `CALIBRATING 34%` |
| Sin archivo todavía | `NOTHING ARCHIVED YET.` |
| **Mercado abierto (riesgo 5 de §8)** | `MARKET OPEN. GAP IS INDICATIVE.` |

Esa última fila cierra el hueco que el propio plan declaró sin implementar: con el mercado abierto los
dos precios se mueven a la vez y la latencia entre fuentes contamina el gap. Si no se declara, **el
producto miente en su ventana más visible**.

Registro: preciso y seco. Cero hype, cero buzzwords, cero exclamaciones. Un número que no es real no
se muestra.

---

## Wow Tier-1

**El papel-reloj, y nada más.** No sale del `wow-catalog`: es propio.

**Cero 3D, cero shaders, cero parallax, cero scroll-jacking.** El playbook de DeFi pide restraint, y
acá el movimiento sería mentira: el producto trata de las horas en que **no pasa nada**. Una página
que se agita contradice su propia tesis.

Lo único que se mueve: el segundero de EL RELOJ y la cuenta regresiva. Ambos porque el tiempo pasa de
verdad. `prefers-reduced-motion` los congela y muestra el valor estático.

---

## Anti-convergencia

Cluster producto/tooling (Overwrite, Recurve, Aegis-Control, Plinth) y también memecoin, porque de ahí
viene el estilo. **Difiere en los 6 ejes:**

| Eje | AFTERHOURS | Lo que hay en el ledger |
|---|---|---|
| Display | Lettering a mano (SVG) | Ninguna fila lo tiene |
| Paleta | Monocromo cálido + 1 lime condicional | Todas tienen paleta de color |
| Hero/layout | Instrumento de 4 bloques, sin hero de venta | Heros de venta y dashboards |
| Wow | El papel invirtiéndose, **cero técnica** | Live2D, R3F, parallax, kinetic type |
| Copy | Deadpan seco | Story-first, editorial, punchy, juguetón |
| Assets | Doodle monocromo dibujado | Fotos, Live2D, 3D, DOM puro, voxel |

Escribir la fila al cerrar el build.

---

## Lo que este brief PROHÍBE explícitamente

- Toggle de tema, sol/luna, o cualquier control que deje al usuario elegir el papel.
- Countdown a algo que no termine de verdad. (El de la campana **sí** termina: es legítimo.)
- Números fake-precisos. Dato real o `CALIBRATING`.
- Lime como color de texto. (Mide `1,10:1`.)
- Cualquier cosa en `opacity: 0` esperando el viewport: rompe la captura del QA.
- Fake-UI: paneles que imitan una app y no son el producto real.
- `h-screen` / `100vh`: usar `min-h-dvh`.
- Em-dash en copy visible.
