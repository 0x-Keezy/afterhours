# AFTERHOURS — diseño

**Fecha:** 2026-09-01 · **Estado:** aprobado por Jose (chat) · **Cluster visual:** producto/tooling

---

## 1. Qué es

Un instrumento web que mide, **archiva** y delata la deriva de precio de las acciones
tokenizadas de **Robinhood Chain** durante las horas en que Wall Street está cerrado.

La chain cotiza 24/7. El Nasdaq abre 6,5 h por día hábil. El resto del tiempo —17,5 h
diarias más el fin de semana entero— el precio on-chain se mueve **sin ancla de referencia**.
Nadie mide esa deriva y nadie la guarda.

Nombre provisional: **AFTERHOURS**. Alternativas sin decidir: NIGHTDESK, CLOSING BELL.

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

1. **`MARKET.SYS` — el marco.** Reloj de Nueva York, estado `OPEN`/`CLOSED`, horas desde el
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
| `web` | el escritorio pixel; lee del store + ruta live | store | visual + smoke |

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
- Escritorio con `MARKET.SYS` + grilla de gaps ordenada por anomalía.
- Archivo grabando desde el primer día.
- **Estado "calibrando" honesto** mientras no haya banda suficiente. No se muestra un z-score
  inventado sobre tres muestras.

**No entra (fase 2):** wallet, swap, alertas push, la descomposición beta/alpha de los memecoins
pareados (`LOCKER.EXE`, que fue el enfoque B y queda como segunda ventana futura).

## 7. Dirección visual — restricciones, no diseño final

El diseño visual se resuelve al construir, con la skill `disenar-pagina` (vertical: **DeFi/tool**)
y su gate anti-genérico. Lo que esta spec **fija como restricción**:

- **ADN de la referencia:** crema + naranja quemado + azul saturado + tinta, contorno negro
  grueso, sin gradientes, sin biseles grises. Esa paleta está **virgen** en el ledger.
- **Colisión declarada:** el carril "interfaz retro / pixel chrome" ya tiene tres builds —
  **$DOTCOM** (frameset Win98, plata/navy/teal), **Yuan6900 v2** (Silkscreen, portal Y2K) y
  **capitodance fase 1** (Press Start 2P, ventanas retro-OS). Los tres son del cluster
  memecoin/personaje y AFTERHOURS es del cluster producto/tooling —donde Overwrite, Recurve y
  Aegis no tienen nada pixel—, así que **pasa el gate por cluster**, pero la repetición en el
  portafolio queda anotada a propósito.
- **Prohibido:** Silkscreen y Press Start 2P (ambas ya usadas). Candidata sugerida por el propio
  ledger y todavía sin usar: **Departure Mono**.
- **Prohibido:** ser un cuarto escritorio de ventanas arrastrables. La referencia de Jose no es
  un sistema operativo: es una **hoja de personaje compuesta**, paneles de distinto tamaño
  embaldosados sobre crema. Esa distinción —hoja compuesta, no escritorio— es el eje que hay que
  defender en el build.
- **El personaje:** la chica pixel entra como **la operadora del turno noche** en un panel
  `MEET THE ANALYST`, con expresión según el estado del tablero. Da alma sin obligar a lanzar un
  token.
- Registrar el build en `Referencias/Ledger-Builds-Web.md` con el chequeo anti-convergencia
  contra el cluster producto/tooling (Overwrite, Recurve, Aegis-Control, Plinth).

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
