import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * GATE: la cuenta de GitHub de Jose no vuelve a la página.
 *
 * Había dos enlaces en el panel `SOURCES` —al repo y a los archivos diarios— y
 * salieron a pedido suyo el 2026-09-03. Esto existe porque volver a ponerlos es
 * lo más fácil del mundo: cualquier pasada futura que quiera "arreglar la
 * procedencia" va a alcanzar el link al repo por reflejo, y es exactamente lo
 * que no puede pasar.
 *
 * La procedencia NO se perdió y por eso el gate es defendible: `/archive` sirve
 * los 14 días de lecturas crudas desde el propio dominio, una línea por lectura,
 * así que cualquiera recomputa todo número de la página sin creerle a nadie. Lo
 * que se cedió es la auditoría del código, y fue una decisión, no un olvido.
 *
 * El alcance es lo que el NAVEGADOR ve: `src/app/`. `src/store/remote.ts` sigue
 * teniendo el slug del repo porque lo necesita para leer el archivo publicado, y
 * eso corre en el servidor — verificado sobre el build: 0 archivos del bundle
 * del cliente y 0 ocurrencias en el HTML prerenderizado.
 */
describe('gate: nada de GitHub en lo que se renderiza', () => {
  const dir = 'src/app'
  const fuentes = readdirSync(dir)
    .filter((f) => (f.endsWith('.tsx') || f.endsWith('.ts')) && !f.endsWith('.test.ts'))
    .map((f) => ({ f, txt: readFileSync(`${dir}/${f}`, 'utf8') }))

  it('encuentra los archivos que renderizan, o el gate no prueba nada', () => {
    // Sin esto el gate pasaría en vacío si alguien mueve o renombra la carpeta.
    expect(fuentes.length).toBeGreaterThan(5)
    expect(fuentes.map((x) => x.f)).toContain('page.tsx')
  })

  it('ningún archivo de src/app menciona github.com', () => {
    for (const { f, txt } of fuentes) {
      expect(txt.toLowerCase(), `${f} volvió a linkear github`).not.toContain('github.com')
    }
  })

  it('ningún archivo de src/app menciona el usuario', () => {
    for (const { f, txt } of fuentes) {
      expect(txt.toLowerCase(), `${f} volvió a nombrar la cuenta`).not.toContain('0x-keezy')
    }
  })

  it('y el archivo crudo sigue enlazado, que es lo que sostiene la tesis', () => {
    // El canje fue explícito: se cede auditar el código, no se cede verificar el
    // dato. Si algún día desaparece este link, la página vuelve a ser un póster.
    const page = fuentes.find((x) => x.f === 'page.tsx')!.txt
    expect(page).toContain('href="/archive"')
  })
})
