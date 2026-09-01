# AFTERHOURS — diseño

**Fecha:** 2026-09-01 · **Estado:** aprobado por Jose (chat); **§7 enmendada** el mismo día tras
cambio de referencia visual · **Cluster visual:** producto/tooling

---

## 1. Qué es

Un instrumento web que mide, **archiva** y delata la deriva de precio de las acciones
tokenizadas de **Robinhood Chain** durante las horas en que Wall Street está cerrado.

La chain cotiza 24/7. El Nasdaq abre 6,5 h por día hábil. El resto del tiempo —17,5 h
diarias más el fin de semana entero— el precio on-chain se mueve **sin ancla de referencia**.
Nadie mide esa deriva y nadie la guarda.

Nombre del producto: **AFTERHOURS** (lockeado). El personaje del turno noche se llama **TOLL**
y no es un token (§7). Alternativas descartadas: NIGHTDESK, CLOSING BELL.

## 2. Por qué existe (la medición que lo justifica)

Medido el 2026-09-01 ~05:12 UTC, con Nasdaq cerrado hacía 9,2 h y 8,3 h para la apertura:

| Ticker | on-chain (USDG) | Nasdaq último | gap | liquidez |
|---|---:|---:|---:|---:|
| NVDA | 220.31 | 220.78 | −0.21 % | $5,27 M |
| MSTR | 132.05 | 132.94 | −0.67 % | $365 k |
| COIN | 186.49 | 188.12 | −0.87 % | $57 k |
| SPY | 767.54 | 767.05 | +0.06 % | $2,89 M |
| AMD | 470.56 | 470.72 | −0.03 % | $68 k |
| TSLA | 366.49 | 367.95 | −0.40 % | $225 k |
| AAPL | 317.40 | 316.85 | +0.17 % | $464 k |
| GOOGL | 340.33 | 339.35 | +0.29 % | $211 k |
| META | 572.81 | 572.34 | +0.08 % | $128 k |

Gap absoluto: **mín 0,03 % · máx 0,87 % · medio 0,31 %**.
`HOOD` **no tiene par USDG en Robinhood Chain** (la chain no listó su propia acción).

**La lectura que define el producto:** el gap es chico y está **inversamente correlacionado con
la liquidez** (COIN, $57 k → 0,87 %; NVDA, $5,27 M → 0,21 %). Un número suelto no distingue
"COIN está raro" de "COIN siempre está así". Como señal de arbitraje pelada, 0,31 % se lo comen
las fees.

Por lo tanto **el valor no está en medir el gap: está en archivarlo.** Con historia, "gap raro"
deja de ser opinión y pasa a ser z-score contra la banda normal de *ese* ticker. Esa serie no
existe en ningún lado para Robinhood Chain, y se aprecia sola mientras el poller corre.

## 3. Fuentes de datos (verificadas el 2026-09-01, no asumidas)

| Fuente | Endpoint | Verificado | Notas |
|---|---|---|---|
| **DexScreener** | `api.dexscreener.com/latest/dex/{tokens,search}` | ✅ responde | `chainId: "robinhood"` existe. Da `priceUsd`, `priceNative`, `volume.h24`, `liquidity.usd`, `pairCreatedAt`. **Exige header `User-Agent`**: sin él, `search` devuelve **403** (el de `tokens` no). |
| **Yahoo Finance (no oficial)** | `query1.finance.yahoo.com/v8/finance/chart/{T}` | ✅ responde | Con `User-Agent` de navegador. Da `regularMarketPrice`, `chartPreviousClose`, `exchangeTimezoneName` y **`currentTradingPeriod`** con pre/regular/post → permite afirmar "cerrado hace N h / abre en N h" sin inventar. |
| **Stooq** | `stooq.com/q/l/?s=…` | ❌ 404 | Descartado. |

**Riesgo asumido:** Yahoo es API no oficial y puede cortar o limitar sin aviso. Mitigación de
diseño: queda detrás de la interfaz `sources/equity`, con **Finnhub (free tier)** como suplente
implementable sin tocar el resto del sistema.

## 4. Los tres instrumentos

1. **EL RELOJ — el marco.** Reloj de Nueva York, estado `OPEN`/`CLOSED`, horas desde el
   último trade real y cuenta regresiva a la campana. Siempre es verdad y siempre es visible:
   es lo que convierte la estética en argumento en vez de decoración.
2. **El gap vivo.** Un panel por ticker: precio on-chain vs último precio real, gap %, y —cuando
   haya archivo— su banda normal. **Ordenados por anomalía (z-score), no por magnitud bruta**;
   si no, los ilíquidos quedan arriba para siempre y el tablero no informa nada.
3. **La campana.** Al abrir el Nasdaq el gap converge de golpe. Ese *snap* se mide: cuánto valía,
   cuánto tardó en cerrarse. Es el momento estrella del producto y el que genera contenido.

## 5. Arquitectura

Unidades chicas con una responsabilidad y frontera clara. La lógica que decide se mantiene
**pura y sin red**, para que sea testeable sin internet.

| Pieza | Responsabilidad | Depende de | Testeo |
|---|---|---|---|
| `sources/dexscreener` | ticker → precio/liq/vol on-chain | red | fixtures grabados + 1 smoke contra la API real |
| `sources/equity` | ticker → precio real + estado de sesión | red | ídem; interfaz estable para cambiar de proveedor |
| `core/gap` | `(onchain, real) → gap%` · `(serie) → mediana, banda, z-score` | **nada** | tests puros, offline |
| `core/universe` | descubre qué acciones tokenizadas existen con par USDG | dexscreener | fixtures |
| `store` | serie temporal del gap (append + lectura) | disco/repo | tests con directorio temporal |
| `poller` | cada 15 min escribe una fila por ticker | todo lo anterior | test de integración con fuentes falsas |
| `web` | la página monocroma (ver §7); lee del store + ruta live | store | visual + smoke |

**Stack:** Next.js sobre Vercel (lo que ya usa Jose). La ruta de servidor es **obligatoria**, no
opcional: Yahoo no manda cabeceras CORS, así que el navegador no puede pedirle el precio real
directamente.

### Descubrimiento del universo

`search?q={TICKER}/USDG` filtrando `chainId === "robinhood"`. **Riesgo:** un memecoin llamado
"TSLA" contamina el censo. **Filtro duro:** el `baseToken.name` debe contener `Robinhood Token`
(las acciones se llaman, p.ej., `NVIDIA • Robinhood Token`). Si un ticker tiene varios pares
USDG, gana el de **mayor liquidez**.

### Dónde vive el archivo — decisión

**Elegido: GitHub Actions (cron cada 15 min) → JSONL en el propio repo → compactación diaria.**

Razones:
- El producto trata **precisamente** de las horas en que nadie está mirando. Un poller local en
  la PC de Jose falla justo en su caso de uso (máquina apagada a las 3 a.m.), que es cuando el
  dato importa.
- Cero servicios nuevos: usa GitHub y Vercel, que ya existen. Cero costo.
- El dataset queda **versionado y auditable en git** — propiedad valiosa para algo cuyo
  diferencial *es* el archivo.

Rechazadas:
- **Vercel Cron** — descartado con evidencia: la doc oficial (leída el 2026-09-01) dice que Hobby
  está limitado a **una ejecución diaria** y que una expresión más frecuente **falla en el
  deploy** (`Hobby accounts are limited to daily cron jobs`). No degrada: rompe. Volvería a estar
  sobre la mesa sólo con plan Pro (cron por minuto).
- **Poller local con tarea programada** — falla de noche, que es justo el caso de uso.
- **Upstash / Turso** — un servicio y una cuenta más para un volumen que git aguanta.

**Volumen y compactación** (calculado, no medido): ~90 tickers × 96 muestras/día × ~100 B ≈
**0,9 MB/día** en crudo. Insostenible en git a un año. Por eso: crudo **rodante de 14 días** +
**compactación diaria** a una fila por ticker (apertura, cierre, mín, máx, mediana del gap,
liquidez media) ≈ 10 KB/día ≈ **3,6 MB/año**, que sí aguanta.

## 6. Alcance v1

**Entra:**
- Universo descubierto automáticamente (no una lista escrita a mano).
- La página con EL RELOJ + la grilla de gaps ordenada por anomalía.
- Archivo grabando desde el primer día.
- **Estado "calibrando" honesto** mientras no haya banda suficiente. No se muestra un z-score
  inventado sobre tres muestras.

**No entra (fase 2):** wallet, swap, alertas push, la descomposición beta/alpha de los memecoins
pareados (`LOCKER.EXE`, que fue el enfoque B y queda como segunda ventana futura).

## 7. Dirección visual — restricciones, no diseño final

> **Enmienda 2026-09-01 (segunda sesión).** La dirección pixel-art (crema + naranja quemado +
> azul, ventanas con barra de título) queda **descartada** y reemplazada por la que sigue.
> El motivo estaba escrito en la versión anterior de esta misma sección: habría sido el **cuarto
> build del carril "interfaz retro / pixel chrome"** después de $DOTCOM, Yuan6900 v2 y capitodance
> fase 1. Jose trajo una referencia nueva —un doodle a marcador, blanco y negro puro— y se eligió
> **vestir AFTERHOURS con ella** en vez de abrir un proyecto paralelo con la misma premisa.

El diseño final se resuelve al construir, con la skill `disenar-pagina` (vertical: **DeFi/tool**)
y su gate anti-genérico. Lo que esta spec fija como restricción:

### ADN

- **Trazo a mano, monocromo.** Marcador negro sobre papel: línea temblorosa, grosor irregular,
  esquinas que no cierran perfecto. **La imperfección es deliberada y hay que defenderla** — una
  versión "prolija" en vectorial mata el concepto.
- **Prohibido:** gradientes, sombras suaves, glow, blur, biseles, fotos, 3D, y todo color fuera de
  la excepción de abajo. Relleno plano; el único sombreado permitido es **hatching** (rayado a mano).
- **Una sola excepción de color en todo el producto:** el **lime de Robinhood Chain** aparece
  **únicamente cuando el mercado está abierto**. Es el único color de la interfaz y por eso
  significa algo. (Corrección del juez a Overwrite B, aplicada por adelantado: *"sobre-aplica el
  verde como decoración, lo pinta en todos los números, incluso el riesgo"*.)

### El papel es el reloj — y es un instrumento, no un adorno

El fondo (`--paper`) y la tinta (`--ink`) **se derivan del `currentTradingPeriod` real** que ya
provee `sources/equity` (§3). No es una animación decorativa: es una lectura más del dato.

| Estado del mercado | Papel | Tinta |
|---|---|---|
| `regular` (abierto) | blanco | negro + **acento lime** |
| `pre` / `post` | papel hueso → gris según cuánto falta | negro |
| cerrado, primeras horas | gris | negro |
| madrugada profunda | **negro — inversión total** | blanco |
| amanecer hacia la apertura | gris → blanco | negro |

Un visitante sabe si Wall Street está abierto **antes de leer un solo número**.

**Restricción técnica (previene un defecto real):** el cruce a la inversión es un **corte duro**,
nunca una interpolación. Interpolar papel y tinta en direcciones opuestas los hace cruzarse, y en
el cruce el contraste llega a cero y el texto desaparece. El corte además narra mejor: es la luz
apagándose. Respetar `prefers-reduced-motion`.

### El personaje: TOLL

Reemplaza a la operadora pixel. **TOLL** es un blob dibujado a mano que se quedó en el parqué
cuando sonó la campana porque nadie le dijo que podía irse. Es la cara del turno noche.

- El nombre carga tres sentidos y los tres sirven: lo que hace una campana; el peaje que se paga
  por pasar; y el costo acumulado de *"took a toll"*.
- **No es un token y no tiene ticker.** Se descartó lanzar. TOLL **da alma sin obligar a lanzar
  nada** — el mismo criterio que la spec anterior aplicaba a la operadora pixel.
- **Su ánimo lo dicta el tablero, no un capricho:** cuanto más lejos la apertura y más raro el
  gap, peor la cara. Es otra lectura del dato.
- **Navegación:** hereda el device de la referencia — TOLL **sostiene carteles**, y los carteles
  son los instrumentos de §4, no un menú decorativo.
- Línea ancla de voz: *"The market never closes. He took that personally."* Registro deadpan
  melancólico: la chain vende el 24/7 como poder; acá se dibuja como un edificio vacío con las
  luces prendidas. **El producto contradice el marketing de la cadena en vez de repetirlo.**

**Los instrumentos de §4 no se nombran como archivos.** `MARKET.SYS` era un título de ventana
heredado del escritorio pixel; acá los instrumentos son **carteles rotulados a mano** que TOLL
sostiene. Un `.SYS` o un `.EXE` dentro de un doodle delata la dirección anterior sin borrar.
(Pendiente: `LOCKER.EXE`, la segunda ventana de fase 2 en §6, arrastra el mismo problema y hay
que renombrarla cuando se construya.)

### Tipografía

Dos sistemas, separados por una razón de producto y no de gusto:

- **Display y carteles: lettering dibujado a mano** (assets SVG). Es lo que **TOLL escribe**.
- **Datos y cuerpo: una mono, en texto real seleccionable** (accesible e indexable). Es lo que
  **la máquina imprime**.
- **Prohibidas por uso previo:** Silkscreen, Press Start 2P, JetBrains Mono, Space Mono, Geist
  Mono. Candidata recomendada y sin usar en el ledger: **Courier Prime** — calor de máquina de
  escribir, que es exactamente el registro de una cinta de cotizaciones nocturna.

### Registro anti-convergencia

Chequeo contra el cluster producto/tooling (Overwrite, Recurve, Aegis-Control, Plinth) **y**
contra el memecoin, porque de ahí viene el estilo: **difiere en los 6 ejes**. Ninguna fila del
ledger tiene lettering a mano; ninguna es monocroma; ninguna usa al personaje como navegación; y
todos los "wow" registrados son técnicos (Live2D, R3F, parallax, kinetic type) — acá el wow es
**el papel invirtiéndose, sin una línea de 3D**. Es la lección que el propio ledger ya tiene
escrita con FlapWorld: menos técnica + más actitud gana. Registrar la fila al terminar.

## 8. Riesgos, sin maquillar

1. **Yahoo puede cortar.** Aislado tras `sources/equity`; suplente Finnhub.
2. **El gap puede no dar noticia.** Si tras dos semanas de archivo nunca sale del ruido, el
   instrumento pierde fuerza. Se reporta tal cual; no se disfraza subiendo la escala del gráfico.
3. **Falsos positivos en el censo.** Mitigado por el filtro `Robinhood Token`, que hay que
   verificar contra el universo completo, no contra 10 tickers.
4. **Peso del repo.** Resuelto por diseño con el rodante de 14 días + compactación diaria.
5. **Latencia entre fuentes.** El precio on-chain es de ahora y el de Yahoo puede venir con
   demora; con el mercado cerrado no importa (el último precio real es fijo), pero **con el
   mercado abierto sí**. El gap durante sesión abierta debe marcarse como *indicativo*, o el
   producto miente en su ventana más visible.

## 9. Criterios de éxito

- El censo descubre el universo completo de acciones tokenizadas con par USDG, sin memecoins
  colados y sin faltantes verificables a mano.
- `core/gap` tiene tests puros que corren sin red.
- El poller acumula 7 días seguidos sin huecos, y el hueco —si lo hay— se ve en la interfaz en
  vez de taparse interpolando.
- La interfaz nunca afirma un estado de mercado que no salga de `currentTradingPeriod`.
- Un visitante frío entiende qué mide la página en menos de diez segundos.
- El estado del mercado se lee **antes que cualquier número**: el papel solo delata si Wall
  Street está abierto o cerrado. Si hay que leer texto para saberlo, la §7 no se cumplió.
- El trazo se sostiene: TOLL es reconociblemente el mismo personaje en todas sus poses. Un
  personaje que deriva entre paneles delata generación sin curaduría.
