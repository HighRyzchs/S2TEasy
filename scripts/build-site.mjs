import { cpSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { build } from 'vite'

const output = resolve('.site')
rmSync(output, { recursive: true, force: true })
mkdirSync(output, { recursive: true })
cpSync(resolve('docs'), output, { recursive: true })
await build({ configFile: resolve('vite.showcase.config.ts') })
renameSync(
  resolve('.site/overlay-demo/overlay-showcase.html'),
  resolve('.site/overlay-demo/index.html')
)
