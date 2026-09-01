/**
 * La regla de "este número acaba de cambiar", separada del componente para que
 * se pueda probar sin montar React.
 *
 * DOS DECISIONES, las dos medidas y ninguna obvia:
 *
 * 1. En el primer montaje NO hay marca. Una página que se abre con el tablero
 *    entero parpadeando estaría anunciando un cambio que nadie vio ocurrir; la
 *    marca sólo puede significar algo si aparece cuando el valor se movió
 *    mientras la página ya estaba abierta.
 *
 * 2. Se compara lo que se MUESTRA, no el float. Medido sobre el payload real:
 *    el gap viaja como `0.04106401423552649` y en pantalla dice `0.04 %`. Casi
 *    toda lectura mueve algún decimal lejano, así que comparando el float la
 *    celda se marcaría cada 15 minutos con el número idéntico en pantalla: un
 *    destello que afirma un cambio que el lector no puede leer. El valor crudo
 *    se usa sólo para la DIRECCIÓN, que sí necesita orden.
 */
export type Marca = 'up' | 'down' | null

export type Lectura = {
  /** Exactamente lo que se dibuja en la celda. */
  texto: string
  /** El valor sin redondear, sólo para saber hacia dónde se movió. */
  valor: number
}

export function marcaDeCambio(antes: Lectura | undefined, ahora: Lectura): Marca {
  if (antes === undefined) return null
  if (antes.texto === ahora.texto) return null
  return ahora.valor > antes.valor ? 'up' : 'down'
}
