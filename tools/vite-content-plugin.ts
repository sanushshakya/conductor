import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Plugin } from 'vite'
import { parse as parseYaml } from 'yaml'
import {
  TrackSchema,
  BossSchema,
  DuelSchema,
  AtlasSchema,
  camelizeKeys,
} from '../packages/shared/src/content-schema'

const VIRTUAL_ID = 'virtual:conductor-content'
const RESOLVED_ID = '\0' + VIRTUAL_ID

function readAll(dir: string): unknown[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .sort()
    .map((f) => camelizeKeys(parseYaml(readFileSync(join(dir, f), 'utf8'))))
}

/**
 * Compiles the curriculum into the bundle as validated data.
 *
 * Content is authored as YAML and must reach the renderer somehow. Loading it
 * over fetch at runtime would mean the app can start with content that does
 * not parse — which is the exact failure the harness exists to prevent. This
 * plugin validates at build time instead, so broken content fails the build
 * and can never reach a learner, and the dev server reloads on every edit.
 */
export function conductorContent(contentRoot: string): Plugin {
  const root = resolve(contentRoot)

  function build(): string {
    const tracks = readAll(join(root, 'tracks')).map((raw, i) => {
      const parsed = TrackSchema.safeParse(raw)
      if (!parsed.success) {
        throw new Error(
          `content: track #${i} failed validation — ${parsed.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join('; ')}`,
        )
      }
      return parsed.data
    })

    const bosses = readAll(join(root, 'bosses')).map((raw) => {
      const parsed = BossSchema.safeParse(raw)
      if (!parsed.success) throw new Error(`content: boss failed validation — ${parsed.error.message}`)
      return parsed.data
    })

    const duels = readAll(join(root, 'duels')).flatMap((raw) => {
      const list = Array.isArray((raw as { duels?: unknown[] }).duels)
        ? (raw as { duels: unknown[] }).duels
        : [raw]
      return list.map((entry) => {
        const parsed = DuelSchema.safeParse(entry)
        if (!parsed.success) throw new Error(`content: duel failed validation — ${parsed.error.message}`)
        return parsed.data
      })
    })

    const atlasFiles = readAll(join(root, 'atlas'))
    const atlas = atlasFiles.length
      ? atlasFiles.flatMap((raw) => {
          const parsed = AtlasSchema.safeParse(raw)
          if (!parsed.success) throw new Error(`content: atlas failed validation — ${parsed.error.message}`)
          return parsed.data.tools
        })
      : []

    const fixtures: Record<string, string> = {}
    const fixtureDir = join(root, 'fixtures')
    if (existsSync(fixtureDir)) {
      for (const file of readdirSync(fixtureDir).filter((f) => f.endsWith('.sql'))) {
        fixtures[file.replace(/\.sql$/, '')] = readFileSync(join(fixtureDir, file), 'utf8')
      }
    }

    return `export const tracks = ${JSON.stringify(tracks)};
export const bosses = ${JSON.stringify(bosses)};
export const duels = ${JSON.stringify(duels)};
export const atlas = ${JSON.stringify(atlas)};
export const fixtures = ${JSON.stringify(fixtures)};`
  }

  return {
    name: 'conductor-content',
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null
    },
    load(id) {
      return id === RESOLVED_ID ? build() : null
    },
    configureServer(server) {
      server.watcher.add(root)
      server.watcher.on('all', (_event, file) => {
        if (!file.startsWith(root)) return
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID)
        if (mod) server.moduleGraph.invalidateModule(mod)
        server.ws.send({ type: 'full-reload' })
      })
    },
  }
}
