import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * GATE del deploy: por qué este repo NO se deploya solo, y qué hacer.
 *
 * ⚠️ SI PUSHEASTE CÓDIGO Y NO SE VE EN PRODUCCIÓN, ES ESTO. No está roto:
 * los deploys automáticos desde `main` están APAGADOS a propósito. Para
 * publicar, desde la raíz del repo:
 *
 *     npx vercel --prod
 *
 * POR QUÉ, medido el 2026-09-05: el poller commitea al repo cada 15 minutos, y
 * el Git integration de Vercel **crea un deployment por cada push**. El Ignored
 * Build Step lo cancela a los 2-3 segundos, pero el deployment ya se creó y
 * **cuenta contra la cuota**. Con `vercel ls`: un `Canceled` de 2-3 s cada 15
 * min, o sea **~96 al día** contra un tope de **100 por CUENTA** (no por
 * proyecto). Este proyecto solo dejaba sin deploys a todos los demás — es lo que
 * tuvo a TELLER sin poder publicar.
 *
 * Y ojo con el arreglo que NO funciona, porque ya se probó y se midió: poner
 * `[skip ci]` en el commit del bot **no frena a Vercel**. No es un token que
 * Vercel honre; el deployment se sigue creando. Lo único que impide que se cree
 * es `git.deploymentEnabled` en `vercel.json`, que es lo que hay acá.
 * https://vercel.com/docs/project-configuration/git-configuration
 *
 * El costo aceptado: los deploys pasan a ser manuales. Para este producto es lo
 * correcto — el sitio lee el archivo publicado en cada request
 * (`readRecentRemote`), así que un dato nuevo NUNCA necesitó un build; sólo lo
 * necesita un cambio de código, que es un acto deliberado.
 */
describe('gate: el repo no se deploya solo, y esto explica por que', () => {
  const cfg = JSON.parse(readFileSync('vercel.json', 'utf8'))

  it('los deploys automaticos desde main estan apagados', () => {
    expect(cfg.git?.deploymentEnabled?.main).toBe(false)
  })

  it('el poller sigue commiteando a main, que es la razon de todo esto', () => {
    const wf = readFileSync('.github/workflows/poll.yml', 'utf8')
    expect(wf).toMatch(/git commit -m "data: muestra/)
  })

  it('el sitio lee el archivo en runtime, asi que un dato no necesita build', () => {
    // Es la condicion que hace aceptable apagar el deploy automatico. Si algun
    // dia el dato viajara DENTRO del bundle, esta decision se vuelve un bug.
    const ruta = readFileSync('src/app/archive/route.ts', 'utf8')
    const estado = readFileSync('src/app/state.ts', 'utf8')
    expect(ruta).toContain('readRecentRemoteDetallado')
    expect(estado).toContain('readRecentRemote')
  })
})
