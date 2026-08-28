import { rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Everything in public/ is copied into the build verbatim, which is right for
 * the artwork the game loads and wrong for the two things listed here. Neither
 * is ever fetched by a browser, and between them they are about a megabyte of
 * every image we ship and every deploy we push.
 *
 * They are pruned from the output rather than deleted from the repo, because
 * both are worth keeping:
 *
 * - the .tmx files are the Tiled sources the .json maps are drawn from, and
 *   they reference their tilesets by relative path (`../tileset/Basement.png`),
 *   so they have to stay exactly where they are to remain editable.
 * - assets/archive is the previous office and its tilesets. Nothing in the
 *   client, the server or the shared types names any of it - checked by
 *   matching every `assets/...` string in the source against the tree - but
 *   "archive" reads as deliberate, and keeping something nobody downloads
 *   costs nothing.
 */
const PRUNED_FROM_BUILD = ['assets/archive', 'assets/map/map.tmx']

function pruneEditorSources(): Plugin {
  let outDir = ''

  return {
    name: 'skyoffice:prune-editor-sources',
    apply: 'build',
    configResolved(config) {
      // asked of vite rather than assumed, so a custom outDir still prunes
      outDir = path.resolve(config.root, config.build.outDir)
    },
    async closeBundle() {
      for (const target of PRUNED_FROM_BUILD) {
        const full = path.resolve(outDir, target)
        try {
          await stat(full)
        } catch {
          continue // never built, nothing to prune
        }
        await rm(full, { recursive: true, force: true })
        this.info(`pruned ${target} from the build`)
      }
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), pruneEditorSources()],
  css: {
    preprocessorOptions: {
      // Vite still reaches for Dart Sass's legacy JS API by default, which is
      // gone in Sass 2. Asking for the modern compiler now keeps the build off
      // a deprecation that turns into a breakage.
      scss: { api: 'modern-compiler' },
    },
  },
})
