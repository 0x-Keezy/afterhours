import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { UniverseEntry } from '../core/universe.js'

export type UniverseFile = {
  updatedAt: number
  complete: boolean
  pages: number
  entries: UniverseEntry[]
}

const path = (dir: string) => join(dir, 'universe.json')

export async function readUniverse(dir: string): Promise<UniverseFile | null> {
  try {
    return JSON.parse(await readFile(path(dir), 'utf8')) as UniverseFile
  } catch {
    return null
  }
}

export async function writeUniverse(dir: string, file: UniverseFile): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(path(dir), JSON.stringify(file, null, 1) + '\n', 'utf8')
}
