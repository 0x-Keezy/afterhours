/**
 * La lámpara del escritorio: el ÚNICO override manual del papel.
 *
 * La §7 de la spec prohíbe explícitamente un toggle sol/luna —"el papel lo
 * dicta el mercado, no el usuario"— y deja UNA puerta abierta, con condiciones:
 * *"si en algún momento se agrega un override manual, no puede usar la metáfora
 * sol/luna ni llamarse `ThemeToggle`"*. Jose lo pidió el 2026-09-03. Estas son
 * las condiciones con las que se cumple, y por qué cada una importa:
 *
 * 1. **NO toca `data-phase`.** Ése es el punto entero. La fase gobierna cosas
 *    que son afirmaciones sobre el mercado y no sobre la luz de la habitación:
 *    la hoja de sprites de la analista (`[data-phase="day"] .sprite` trae la
 *    hoja CON lima), su pose y su frase, el halo de noche, y el lima de la
 *    fachada. Medido en el tercer juicio: forzar la fase de día a las 2 de la
 *    mañana devolvía **4.731 px de lima de marca** a la pantalla, que fue un
 *    bloqueante. La lámpara enciende la pieza; no abre Wall Street.
 * 2. **`--accent` queda neutralizado a tinta.** Con la lámpara prendida el
 *    papel es claro, y el lima como texto sobre papel claro mide 1,10:1. La
 *    regla dura del cluster es que el lima es superficie y sólo con mercado
 *    abierto: la lámpara no puede ser una puerta trasera para eso.
 * 3. **Se declara.** Mientras está encendida, la ventana del reloj dice que el
 *    papel dejó de seguir al mercado. Sin eso, un visitante que la prendió hace
 *    una semana leería el papel como un dato y estaría leyendo su propia
 *    decisión. El estado del mercado sigue impreso en texto tres líneas arriba,
 *    así que nunca queda oculto: lo que se pierde es la señal PRE-verbal, y la
 *    página lo dice en vez de disimularlo.
 */

/** Dónde se recuerda. Mismo prefijo que el plegado de las ventanas. */
export const CLAVE_LUZ = 'afterhours.luz'

/**
 * Sólo el valor exacto `'on'` enciende.
 *
 * Un almacenamiento que devuelve basura —o `null`, o el valor de otra versión—
 * tiene que caer del lado del DEFECTO, que es el papel siguiendo al mercado.
 * El override es la excepción y tiene que pedirse explícitamente.
 */
export function luzGuardada(bruto: string | null): boolean {
  return bruto === 'on'
}

/** Qué guardar. `null` significa borrar la clave en vez de escribir 'off'. */
export function paraGuardar(encendida: boolean): string | null {
  return encendida ? 'on' : null
}

/**
 * Lo que la página admite mientras el override está puesto.
 *
 * Devuelve `null` cuando está apagada: con la lámpara apagada el papel ES el
 * reloj y no hay nada que aclarar. Una nota permanente diluiría la que importa.
 */
export function notaDeOverride(encendida: boolean): string | null {
  return encendida ? 'LAMP ON. THE PAPER IS HELD, SO IT IS NOT THE CLOCK RIGHT NOW.' : null
}

/**
 * El mismo estado, aplicado ANTES del primer pintado.
 *
 * El componente arranca apagado y lee el almacenamiento en un efecto —tiene que
 * hacerlo, o el servidor y el cliente escriben árboles distintos y se rompe la
 * hidratación (React #418, que ya pasó en esta página)—. El precio de eso es que
 * con la lámpara guardada la página pinta el papel del MERCADO y salta al claro
 * cuando hidrata. Medido: `data-luz` no aparece en el HTML servido, así que el
 * salto dura lo que tarde la hidratación.
 *
 * Y ese salto es peor acá que en cualquier otro sitio: la página entera enseña
 * que **el papel cambia por corte y sólo cuando cambia Wall Street**. Un
 * destello del papel en la carga es exactamente la afirmación que el producto no
 * quiere hacer, disparada por nada.
 *
 * Un script bloqueante en el `<head>` lo pone antes de que se pinte un píxel.
 * Toca un ATRIBUTO de `<html>` y no contenido, así que no hay árbol que
 * reconciliar: React no lo diffea contra nada.
 *
 * Se genera desde `CLAVE_LUZ` a propósito, en vez de escribir la cadena a mano
 * en el layout: son dos lugares que tienen que decir lo mismo y `luz.test.ts`
 * verifica que sigan de acuerdo.
 */
export function scriptPrePintado(): string {
  return (
    `try{if(localStorage.getItem('${CLAVE_LUZ}')==='on')` +
    `document.documentElement.setAttribute('data-luz','on')}catch(e){}`
  )
}
