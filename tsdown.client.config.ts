/**
 * 浏览器 client bundle 构建配置——复刻 harness 的工件契约
 * （packages/client/tsdown.client.ts，见 docs/DSH-PLUGIN-REFERENCE.md §4）：
 *
 * - cjs + platform:browser，产物 lib/client.js（与 node half 同目录，clean 必须关）
 * - banner/footer 把模块体包进 window.__ModuleLoader__.load({id, factory})
 * - 平台模块表内的包 external（浏览器由注入的 require 解析），其余全部 inline
 * - NODE_ENV / import.meta.env 静态替换（CJS 产物不能携带 import.meta 探测）
 */

import { defineConfig } from 'tsdown'

const PKG_ID = '@yangweixin/dsh-contract-copilot'

/** 冻结模块表（platform.ts PLATFORM_MODULES + runtime store 豁免）。 */
const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
  '@deepseek-ai/dsh-client-runtime/client',
] as const

export default defineConfig({
  name: `${PKG_ID}/client`,
  entry: { client: 'src/client/index.tsx' },
  outDir: 'lib',
  entryFileNames: '[name].js',
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  target: 'es2024',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  external: [...CLIENT_EXTERNALS],
  noExternal: (id: string) => !CLIENT_EXTERNALS.includes(id as never),
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PKG_ID)}, factory: (require) => {\nvar module = { exports: {} };\nvar exports = module.exports;`,
  },
  footer: { js: 'return module.exports; } });' },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
})