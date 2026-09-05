/**
 * verify-dsh-theme-tokens.mjs — DSH 主题 token 漂移门禁（fail-closed）。
 *
 * 从当前安装且由锁文件固定的 `@deepseek-ai/dsh-client-ui-*` 已发布工件
 * （bundle 内联 CSS 与 .css 工件）中机械提取真实 CSS variable 名称，并核对
 * `src/client/Workbench.tsx` 导出的 `DSH_THEME_TOKENS`：
 *
 *   - 工件不可达（包目录缺失、package.json 不可读、ui-* require 解析失败）→ 失败；
 *   - 工件读取或 token 解析失败、提取结果为空 → 失败；
 *   - `DSH_THEME_TOKENS` 解析失败、为空、含非法项或重复项 → 失败；
 *   - 任一 theme token 在已发布工件中无出处 → 失败并列出缺失清单。
 *
 * token 事实源只有两处：锁定的已发布工件（宇宙）与 Workbench 源码（在用集合），
 * 本脚本与测试均不维护第二份 allowlist。CLI 另支持 `--extra-root <ui-* 包根>`
 * 追加额外已安装工件（如宿主主题包），默认只核对本仓 node_modules 的锁定工件。
 */

import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SCOPE_ORG = '@deepseek-ai'
export const UI_PACKAGE_PATTERN = /^dsh-client-ui-/
export const WORKBENCH_SOURCE = 'src/client/Workbench.tsx'
export const THEME_TOKENS_EXPORT_NAME = 'DSH_THEME_TOKENS'

/** 已发布工件（运行时会被浏览器/host 加载的文本产物）；sourcemap 不加载，不计入证据。 */
const ARTIFACT_EXTENSIONS = new Set(['.css', '.js', '.mjs', '.cjs'])
const SKIPPED_DIRECTORIES = new Set(['node_modules'])
/** 传递闭包上限：ui-* 家族是有限集合，超限视为解析失控。 */
const MAX_FOLLOWED_PACKAGES = 64

/** CSS variable 名称：`--` 前缀 + 非空字母数字段（单连字符相连），不允许空段或结尾连字符。 */
const TOKEN_NAME = /^--[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/
function isTokenName(name) {
  return TOKEN_NAME.test(name)
}

/** var() 引用：var( --x …；自定义属性声明：--x: …。其余 `--` 文本一律不算。 */
const VAR_USAGE = /var\(\s*(--[a-zA-Z0-9-]+)/g
const VAR_DECLARATION = /(?<![\w-])(--[a-zA-Z0-9-]+)\s*:/g

export function extractTokenNames(text) {
  const names = new Set()
  for (const match of text.matchAll(VAR_USAGE)) {
    if (isTokenName(match[1])) names.add(match[1])
  }
  for (const match of text.matchAll(VAR_DECLARATION)) {
    if (isTokenName(match[1])) names.add(match[1])
  }
  return names
}

/** bundle 中对 ui-* 家族的 require 声明——运行时真实解析链，据此跟随已发布家族。 */
const UI_REQUIRE_SPECIFIER = /(?:^|[^\w.])require\(\s*["'](@deepseek-ai\/dsh-client-ui-[^"']+)["']\s*\)/g

export function uiRequireSpecifiers(text) {
  const specifiers = new Set()
  for (const match of text.matchAll(UI_REQUIRE_SPECIFIER)) specifiers.add(match[1])
  return specifiers
}

/** 包内已发布工件清单：跳过 node_modules 与 sourcemap，读取失败逐文件上报。 */
export function listPackageArtifacts(packageRoot) {
  const artifacts = []
  const visit = (dir) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch (error) {
      throw new Error(`无法读取包目录 ${dir}: ${error.message}`)
    }
    for (const entry of entries) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) visit(path)
        continue
      }
      if (!ARTIFACT_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase())) continue
      if (entry.name.endsWith('.map')) continue
      artifacts.push(path)
    }
  }
  visit(packageRoot)
  return artifacts.sort()
}

function readPackageIdentity(packageRoot) {
  const manifestPath = join(packageRoot, 'package.json')
  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    throw new Error(`包工件不可达（package.json 不可读 ${manifestPath}）: ${error.message}`)
  }
  if (typeof manifest.name !== 'string' || typeof manifest.version !== 'string') {
    throw new Error(`包工件不可达（package.json 缺少 name/version: ${manifestPath}）`)
  }
  return { name: manifest.name, version: manifest.version }
}

/**
 * 收集当前安装的 dsh-client-ui-* 已发布工件证据：直接依赖（node_modules/@deepseek-ai/dsh-client-ui-*）
 * 起步，按 bundle 内真实 `require("@deepseek-ai/dsh-client-ui-*")` 解析链跟随家族成员
 * （pnpm 隔离布局下解析到的就是锁文件固定版本）。`extraRoots` 允许传入额外的
 * ui-* 包根目录（如宿主 web 主题包的安装位置），同样走工件遍历与出处记录。
 * 已安装成员不可达或不可解析一律失败；bundle 引用但未安装的家族成员记入
 * `unresolved`（证据基座缺口），其后果由缺失 token 的 fail-closed 语义承担。
 */
export function collectArtifactEvidence({ root, extraRoots = [] }) {
  const scopeDir = join(root, 'node_modules', SCOPE_ORG)
  let scopeEntries
  try {
    scopeEntries = readdirSync(scopeDir, { withFileTypes: true })
  } catch (error) {
    throw new Error(`包工件不可达（无法列出 ${scopeDir}）: ${error.message}`)
  }
  const directNames = scopeEntries
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => entry.name)
    .filter((name) => UI_PACKAGE_PATTERN.test(name))
    .sort()
  if (directNames.length === 0) {
    throw new Error(`包工件不可达（${scopeDir} 下没有 dsh-client-ui-* 包）`)
  }

  const visited = new Map()
  const errors = []
  const unresolved = []
  const queue = directNames.map((dirName) => ({
    packageRoot: join(scopeDir, dirName),
    origin: 'direct',
  }))
  for (const extraRoot of extraRoots) {
    queue.push({ packageRoot: resolve(String(extraRoot)), origin: 'extra' })
  }

  while (queue.length > 0) {
    const { packageRoot, origin } = queue.shift()

    let identity
    try {
      identity = readPackageIdentity(packageRoot)
    } catch (error) {
      errors.push(error.message)
      continue
    }
    const name = identity.name
    if (!identity.name.startsWith(`${SCOPE_ORG}/`) || !UI_PACKAGE_PATTERN.test(identity.name.slice(SCOPE_ORG.length + 1))) {
      errors.push(`包工件不可达（${packageRoot} 不是 ${SCOPE_ORG}/dsh-client-ui-* 包，实际 ${identity.name}）`)
      continue
    }
    if (visited.has(name)) continue
    if (visited.size >= MAX_FOLLOWED_PACKAGES) {
      throw new Error(`解析失控：跟随的 ui-* 包超过 ${MAX_FOLLOWED_PACKAGES} 个`)
    }

    let artifacts
    try {
      artifacts = listPackageArtifacts(packageRoot)
    } catch (error) {
      errors.push(error.message)
      continue
    }
    if (artifacts.length === 0) {
      errors.push(`包工件不可达（${name} 下没有任何 .css/.js/.mjs/.cjs 工件）`)
      continue
    }

    const files = []
    const specifiers = new Set()
    for (const artifact of artifacts) {
      let text
      try {
        text = readFileSync(artifact, 'utf8')
      } catch (error) {
        errors.push(`工件读取失败 ${artifact}: ${error.message}`)
        continue
      }
      const tokens = extractTokenNames(text)
      files.push({ path: relative(root, artifact), tokens: [...tokens] })
      for (const specifier of uiRequireSpecifiers(text)) specifiers.add(specifier)
    }

    visited.set(name, { ...identity, root: packageRoot, origin, files })
    for (const specifier of specifiers) {
      if (visited.has(specifier)) continue
      const resolved = resolveUiPackageRoot(packageRoot, specifier)
      if (resolved.error !== undefined) {
        unresolved.push(`${name} require "${specifier}": ${resolved.error}`)
        continue
      }
      queue.push({ packageRoot: resolved.packageRoot, origin: 'followed' })
    }
  }

  const packages = [...visited.values()].sort((a, b) => a.name.localeCompare(b.name))
  const universe = new Map()
  for (const pkg of packages) {
    for (const file of pkg.files) {
      for (const token of file.tokens) {
        if (!universe.has(token)) universe.set(token, new Set())
        universe.get(token).add(`${pkg.name}@${pkg.version} ${file.path}`)
      }
    }
  }
  return { packages, universe, errors, unresolved }
}

/** 经 pnpm 隔离布局解析 ui-* 成员并定位其包根；解析失败返回具名错误。 */
function resolveUiPackageRoot(fromPackageRoot, specifier) {
  let entry
  try {
    entry = createRequire(join(fromPackageRoot, 'package.json')).resolve(specifier)
  } catch (error) {
    return { error: `模块解析失败: ${error.message.split('\n')[0]}` }
  }
  let dir = dirname(entry)
  while (true) {
    try {
      const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
      if (manifest.name === specifier) return { packageRoot: dir }
    } catch {
      // 继续向上找包含该包的 package.json
    }
    const parent = dirname(dir)
    if (parent === dir) return { error: `无法从 ${entry} 定位包根` }
    dir = parent
  }
}

/** 从 Workbench 源码解析导出的 DSH_THEME_TOKENS；任何异常形态都视为解析失败。 */
export function parseWorkbenchThemeTokens(source) {
  const exportMatch = source.match(
    new RegExp(`export\\s+const\\s+${THEME_TOKENS_EXPORT_NAME}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as\\s+const`),
  )
  if (exportMatch === null) {
    throw new Error(`解析失败：${WORKBENCH_SOURCE} 未找到 export const ${THEME_TOKENS_EXPORT_NAME} [...] as const`)
  }
  const tokens = []
  for (const match of exportMatch[1].matchAll(/'([^']*)'/g)) tokens.push(match[1])
  if (tokens.length === 0) {
    throw new Error(`解析失败：${THEME_TOKENS_EXPORT_NAME} 为空`)
  }
  const invalid = tokens.filter((token) => !isTokenName(token))
  if (invalid.length > 0) {
    throw new Error(`解析失败：${THEME_TOKENS_EXPORT_NAME} 含非法 token 名 ${invalid.join(', ')}`)
  }
  const duplicated = tokens.filter((token, index) => tokens.indexOf(token) !== index)
  if (duplicated.length > 0) {
    throw new Error(`解析失败：${THEME_TOKENS_EXPORT_NAME} 含重复项 ${[...new Set(duplicated)].join(', ')}`)
  }
  return tokens
}

export function readWorkbenchSource(root) {
  const path = join(root, WORKBENCH_SOURCE)
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    throw new Error(`解析失败（无法读取 ${path}）: ${error.message}`)
  }
}

/**
 * 全量核对。tokens 允许注入（负例探针）；默认取 Workbench 源码解析结果。
 * 返回结构化结果，ok=false 时 errors/missing 必然具名。
 * covered ∪ missing === themeTokens：covered 是有工件出处的在用 token，
 * missing 是当前已发布工件证明不了的全部 token（任一缺失即 CLI 失败）。
 */
export function verifyThemeTokens({ root, source, tokens, extraRoots } = {}) {
  const evidence = collectArtifactEvidence({ root, extraRoots })
  const themeTokens = tokens ?? parseWorkbenchThemeTokens(source ?? readWorkbenchSource(root))
  const missing = themeTokens.filter((token) => !evidence.universe.has(token))
  const covered = themeTokens.filter((token) => evidence.universe.has(token))
  const provenance = Object.fromEntries(
    themeTokens.map((token) => [token, [...(evidence.universe.get(token) ?? [])].sort()]),
  )
  return {
    ok: evidence.errors.length === 0 && missing.length === 0 && evidence.universe.size > 0,
    themeTokens,
    covered,
    missing,
    provenance,
    universeSize: evidence.universe.size,
    packages: evidence.packages.map((pkg) => ({
      name: pkg.name,
      version: pkg.version,
      origin: pkg.origin,
      artifacts: pkg.files.length,
      tokens: new Set(pkg.files.flatMap((file) => file.tokens)).size,
    })),
    errors: evidence.errors,
    unresolved: evidence.unresolved,
  }
}

function formatPackageReport(result) {
  const lines = []
  for (const pkg of result.packages) {
    lines.push(`  ${pkg.name}@${pkg.version} origin=${pkg.origin} artifacts=${pkg.artifacts} tokens=${pkg.tokens}`)
  }
  return lines
}

export async function main(argv = process.argv.slice(2)) {
  const root = dirname(dirname(fileURLToPath(import.meta.url)))
  const extraRoots = []
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--extra-root') {
      const value = argv[index + 1]
      if (value === undefined) {
        console.error('VERIFY_DSH_THEME_TOKENS FAIL\n  用法错误: --extra-root 需要一个包根目录参数')
        return 1
      }
      extraRoots.push(value)
      index += 1
      continue
    }
    console.error(`VERIFY_DSH_THEME_TOKENS FAIL\n  用法错误: 未知参数 ${argv[index]}`)
    return 1
  }

  let result
  try {
    result = verifyThemeTokens({ root, extraRoots })
  } catch (error) {
    console.error('VERIFY_DSH_THEME_TOKENS FAIL')
    console.error(`  ${error.message}`)
    return 1
  }

  console.log(`VERIFY_DSH_THEME_TOKENS ${result.ok ? 'PASS' : 'FAIL'}`)
  console.log(`  工件证据：${result.packages.length} 个已安装 ui-* 包，提取 ${result.universeSize} 个真实 CSS variable`)
  for (const line of formatPackageReport(result)) console.log(line)
  console.log(`  DSH_THEME_TOKENS：${result.themeTokens.length} 项，工件出处覆盖 ${result.covered.length}，缺失 ${result.missing.length}`)
  for (const message of result.errors) console.error(`  包工件不可达/读取失败: ${message}`)
  for (const message of result.unresolved) {
    console.error(`  已引用但未安装的 ui-* 成员（证据基座缺口）: ${message}`)
  }
  for (const token of result.missing) {
    console.error(`  缺失出处: ${token} 未出现在任何已发布工件中`)
  }
  for (const token of result.covered) {
    console.log(`  出处 ${token} ← ${result.provenance[token].join(' | ')}`)
  }
  return result.ok ? 0 : 1
}

/* 直接执行时运行 CLI；被测试 import 时只暴露可复用函数。 */
const invokedDirectly = process.argv[1] !== undefined
  && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (invokedDirectly) {
  main().then((code) => {
    process.exitCode = code
  })
}
