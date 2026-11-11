// 将 libarchive.js 的 worker 与 wasm 复制到 public/vendor，
// 浏览器端懒加载 RAR/7Z/TAR/CBR 时按固定 URL 引用，避免打包器处理 worker。
import { cpSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const src = join(root, 'node_modules', 'libarchive.js', 'dist')
const dest = join(root, 'public', 'vendor', 'libarchive')

if (!existsSync(src)) {
  console.warn('[copy-vendor] libarchive.js not installed yet, skip.')
  process.exit(0)
}

mkdirSync(dest, { recursive: true })
for (const file of ['worker-bundle.js', 'libarchive.wasm']) {
  cpSync(join(src, file), join(dest, file))
  console.log(`[copy-vendor] ${file} -> public/vendor/libarchive/`)
}
