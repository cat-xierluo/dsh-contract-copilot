/**
 * DSH 主题 token 漂移门禁测试：校验器只认两个事实源——锁定已发布工件与 Workbench 源码。
 * 正例用真实安装的 @deepseek-ai/dsh-client-ui-* 发布工件（含宿主主题包 ui-theme），
 * 不读取 DSH 源仓源码；负例覆盖未知 token 注入与包/工件不可达。
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { DSH_THEME_TOKENS } from '../src/client/Workbench.tsx'
import {
  collectArtifactEvidence,
  parseWorkbenchThemeTokens,
  readWorkbenchSource,
  verifyThemeTokens,
} from '../scripts/verify-dsh-theme-tokens.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 显然虚构的探针 token：只用于负例，绝不进入任何事实源。 */
const FABRICATED_TOKEN = '--dsw-alias-no-such-token-anywhere'

function makeTempRoot(): string {
  return mkdtempSync(join(tmpdir(), 'ccp-dsh-theme-tokens-'))
}

describe('主题 token 门禁：单一事实源接线', () => {
  it('校验器从 Workbench 源码解析出的 DSH_THEME_TOKENS 与插件导入的是同一份', () => {
    const parsed = parseWorkbenchThemeTokens(readWorkbenchSource(repoRoot))
    expect(parsed.length).toBeGreaterThan(10)
    expect(parsed).toEqual([...DSH_THEME_TOKENS])
    expect(verifyThemeTokens({ root: repoRoot }).themeTokens).toEqual([...DSH_THEME_TOKENS])
  })

  it('每个解析项都是合法 CSS variable 名称（防止解析器把噪声当 token）', () => {
    for (const token of parseWorkbenchThemeTokens(readWorkbenchSource(repoRoot))) {
      expect(token.startsWith('--'), token).toBe(true)
      expect(token.endsWith('-'), token).toBe(false)
      expect(token.includes(' '), token).toBe(false)
    }
  })
})

describe('主题 token 门禁：当前锁定的已发布工件（正例）', () => {
  const result = verifyThemeTokens({ root: repoRoot })

  it('已安装 ui-* 包全部可达且带锁定版本，工件宇宙非空', () => {
    expect(result.errors).toEqual([])
    expect(result.universeSize).toBeGreaterThan(100)
    const direct = result.packages.filter(pkg => pkg.origin === 'direct')
    expect(direct.length).toBeGreaterThanOrEqual(3)
    for (const pkg of result.packages) {
      expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/)
      expect(pkg.artifacts).toBeGreaterThan(0)
    }
  })

  it('宿主主题包 dsh-client-ui-theme 已作为锁定 devDependency 进入证据基座', () => {
    const theme = result.packages.find(pkg => pkg.name === '@deepseek-ai/dsh-client-ui-theme')
    expect(theme, 'ui-theme 未安装：pnpm add -D @deepseek-ai/dsh-client-ui-theme@0.1.2-rc.1 --save-exact').toBeDefined()
    expect(theme!.version).toBe('0.1.2-rc.1')
    expect(theme!.origin).toBe('direct')
  })

  it('默认核对端到端 PASS：24 项全部有真实工件出处，缺失为空', () => {
    expect(result.ok).toBe(true)
    expect(result.missing).toEqual([])
    expect(result.covered).toEqual([...DSH_THEME_TOKENS])
    expect(result.themeTokens.length).toBe(24)
  })

  it('每项 DSH_THEME_TOKENS 的出处都包含宿主主题包 ui-theme 的已发布工件', () => {
    for (const token of result.covered) {
      const sources = result.provenance[token]
      expect(sources.length, token).toBeGreaterThan(0)
      expect(
        sources.some(source => source.includes('@deepseek-ai/dsh-client-ui-theme')),
        token,
      ).toBe(true)
    }
  })

  it('covered token 的出处都指向已发布的 dsh-client-ui-* 工件文件（CSS 或 JS）', () => {
    for (const token of result.covered) {
      const sources = result.provenance[token]
      expect(sources.length, token).toBeGreaterThan(0)
      for (const source of sources) {
        expect(source, token).toContain('@deepseek-ai/dsh-client-ui-')
        expect(source, token).toMatch(/node_modules\/.+\.(m?js|css)$/)
      }
    }
  })

  it('补全证据基座（extra root）后同一校验器端到端 PASS，证明缺失语义可随工件修复而转绿', () => {
    const root = makeTempRoot()
    try {
      const packageRoot = join(root, 'node_modules', '@deepseek-ai', 'dsh-client-ui-ghost-proof')
      mkdirSync(join(packageRoot, 'lib'), { recursive: true })
      writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({
        name: '@deepseek-ai/dsh-client-ui-ghost-proof',
        version: '0.0.0-proof',
      }))
      writeFileSync(join(packageRoot, 'lib', 'index.js'), ':root{--ccp-extra-root-proof-token:#fff}')

      const evidence = collectArtifactEvidence({ root: repoRoot, extraRoots: [packageRoot] })
      expect(evidence.errors).toEqual([])
      expect(evidence.universe.has('--ccp-extra-root-proof-token')).toBe(true)

      const patched = verifyThemeTokens({
        root: repoRoot,
        extraRoots: [packageRoot],
        tokens: ['--ccp-extra-root-proof-token', ...result.covered],
      })
      expect(patched.errors).toEqual([])
      expect(patched.missing).toEqual([])
      expect(patched.ok).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('主题 token 门禁：负例一律 fail closed', () => {
  it('注入不存在 token：ok=false，缺失清单在真实缺口语义外恰好多出虚构项', () => {
    const base = verifyThemeTokens({ root: repoRoot })
    expect(base.ok).toBe(true)
    expect(base.missing).toEqual([])
    const withFabricated = verifyThemeTokens({ root: repoRoot, tokens: [...DSH_THEME_TOKENS, FABRICATED_TOKEN] })
    expect(withFabricated.ok).toBe(false)
    expect(withFabricated.covered).toEqual(base.covered)
    expect(withFabricated.missing).toEqual([...base.missing, FABRICATED_TOKEN])
    expect(withFabricated.errors).toEqual(base.errors)

    const onlyFabricated = verifyThemeTokens({ root: repoRoot, tokens: [FABRICATED_TOKEN] })
    expect(onlyFabricated.ok).toBe(false)
    expect(onlyFabricated.missing).toEqual([FABRICATED_TOKEN])
    expect(onlyFabricated.covered).toEqual([])
  })

  it('宿主主题包缺席时（CC-V5-002 原始缺口）alias token 无出处，fail closed', () => {
    const root = makeTempRoot()
    try {
      const packageRoot = join(root, 'node_modules', '@deepseek-ai', 'dsh-client-ui-slots')
      mkdirSync(join(packageRoot, 'lib'), { recursive: true })
      writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({
        name: '@deepseek-ai/dsh-client-ui-slots',
        version: '0.1.2-rc.1',
      }))
      writeFileSync(join(packageRoot, 'lib', 'index.js'), ':root{--dsw-slot-local-token:#fff}')

      const withoutTheme = verifyThemeTokens({ root, tokens: [...DSH_THEME_TOKENS] })
      expect(withoutTheme.ok).toBe(false)
      expect(withoutTheme.errors).toEqual([])
      expect(withoutTheme.missing).toContain('--dsw-alias-bg-base')
      expect(withoutTheme.missing).toContain('--dsw-mask-blur')
      expect(withoutTheme.covered).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('工件不可达（无 node_modules）与包清单缺失都拒绝通过', () => {
    const emptyRoot = makeTempRoot()
    const ghostRoot = makeTempRoot()
    try {
      expect(() => verifyThemeTokens({ root: emptyRoot })).toThrow(/包工件不可达/)

      mkdirSync(join(ghostRoot, 'node_modules', '@deepseek-ai', 'dsh-client-ui-ghost'), { recursive: true })
      const ghost = verifyThemeTokens({ root: ghostRoot, tokens: ['--whatever'] })
      expect(ghost.ok).toBe(false)
      expect(ghost.errors.join('\n')).toMatch(/package\.json 不可读/)
      expect(ghost.packages).toEqual([])
    } finally {
      rmSync(emptyRoot, { recursive: true, force: true })
      rmSync(ghostRoot, { recursive: true, force: true })
    }
  })

  it('Workbench 导出缺失、为空、非法或重复时解析失败，不产出假 allowlist', () => {
    expect(() => parseWorkbenchThemeTokens('export const OTHER = ["--x"] as const')).toThrow(/解析失败/)
    expect(() => parseWorkbenchThemeTokens(`export const ${'DSH_THEME_TOKENS'} = [] as const`)).toThrow(/解析失败/)
    expect(() => parseWorkbenchThemeTokens('export const DSH_THEME_TOKENS = [\'--dsw alias\'] as const')).toThrow(/非法/)
    expect(() => parseWorkbenchThemeTokens('export const DSH_THEME_TOKENS = [\'--dsw-x\', \'--dsw-x\'] as const')).toThrow(/重复/)
  })
})
