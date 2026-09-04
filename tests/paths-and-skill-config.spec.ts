/**
 * paths / skill-config 单测：
 * - normalizeContractKey 与 Python _normalize_lookup_key 行为一致
 *   （用 Python 一次性复刻确认期望值）
 * - resolveConfig 在 skillRoot 无效时立刻抛错（misconfiguration fails loud）
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ANALYSIS_CONTRACT_TEXT_DEFAULT_CHARS, ANALYSIS_CONTRACT_TEXT_HARD_MAX_CHARS, resolveConfig } from '../src/config.ts'
import { expandHome, normalizeContractKey } from '../src/paths.ts'

describe('normalizeContractKey', () => {
  // 这些期望值是从 Python re.sub(r'[\W_]+', '', s, flags=re.UNICODE).strip().lower() 一次性复刻得到的。
  const cases: Array<[string, string]> = [
    ['合同 V2.docx', '合同v2docx'],
    ['Sale_Contract 2024.docx', 'salecontract2024docx'],
    ['合同-A 终稿.docx', '合同a终稿docx'],
    ['（特殊）合同 ★.docx', '特殊合同docx'],
    ['Sale.docx', 'saledocx'],
    ['重复 重复 重 复.docx', '重复重复重复docx'],
    ['', ''],
    ['   ', ''],
  ]
  it.each(cases)('"%s" -> "%s"', (input, expected) => {
    expect(normalizeContractKey(input)).toBe(expected)
  })

  it('等价输入产生相同 key（命中 review_memory 时归一）', () => {
    expect(normalizeContractKey('Sale Contract.docx')).toBe(normalizeContractKey('Sale-Contract.docx'))
    expect(normalizeContractKey('sale.docx')).toBe(normalizeContractKey('SALE.DOCX'))
  })
})

describe('expandHome', () => {
  it('展开 "~" 与 "~/x"', () => {
    expect(expandHome('~')).toBe(process.env.HOME)
    expect(expandHome('~/sessions')).toBe(path.join(process.env.HOME ?? '', 'sessions'))
  })

  it('不修改绝对路径', () => {
    expect(expandHome('/tmp/foo')).toBe('/tmp/foo')
    expect(expandHome('relative/path')).toBe('relative/path')
  })
})

describe('resolveConfig', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'cc-config-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('skillRoot 指向无效目录时立刻抛错', () => {
    expect(() => resolveConfig({
      skillRoot: path.join(dir, 'no-such-skill'),
      pythonExecutable: 'python3',
      sessionsDir: dir,
      injectProgress: true,
    })).toThrow(/skillRoot 配置无效/)
  })

  it('skillRoot 指向真实 skill 目录时通过校验', () => {
    // skillRoot 必须存在 scripts/review/apply_review_plan.py；用临时假 skill 占位
    // 只要此文件存在就放行；resolveConfig 只校验这一个文件存在，不查内容。
    const skill = mkdtempSync(path.join(tmpdir(), 'cc-fake-skill-'))
    const scriptsReview = path.join(skill, 'scripts', 'review')
    require('node:fs').mkdirSync(scriptsReview, { recursive: true })
    require('node:fs').writeFileSync(path.join(scriptsReview, 'apply_review_plan.py'), '', 'utf8')

    try {
      const cfg = resolveConfig({
        skillRoot: skill,
        pythonExecutable: '',
        sessionsDir: '',
        injectProgress: false,
      })
      expect(cfg.skillRoot).toBe(skill)
      expect(cfg.pythonExecutable).toBe('python3')
      expect(cfg.sessionsDir).toBe(path.join(process.env.HOME ?? '', '.dsh/contract-copilot/sessions'))
      expect(cfg.injectProgress).toBe(false)
    } finally {
      rmSync(skill, { recursive: true, force: true })
    }
  })

  it('injectProgress 默认 true 行为（resolveConfig 用 !== false 收敛）', () => {
    const skill = mkdtempSync(path.join(tmpdir(), 'cc-fake-skill2-'))
    const scriptsReview = path.join(skill, 'scripts', 'review')
    require('node:fs').mkdirSync(scriptsReview, { recursive: true })
    require('node:fs').writeFileSync(path.join(scriptsReview, 'apply_review_plan.py'), '', 'utf8')
    try {
      // 显式 undefined 也走默认 true
      const cfg = resolveConfig({
        skillRoot: skill,
        pythonExecutable: 'python3',
        sessionsDir: '~/x',
        injectProgress: undefined as unknown as boolean,
      })
      expect(cfg.injectProgress).toBe(true)
    } finally {
      rmSync(skill, { recursive: true, force: true })
    }
  })

  // workbench.analysisContractTextMaxChars：分析回合合同正文注入上限，
  // 属于部署相关配置 → 在加载边界（resolveConfig）校验，非法即抛错。
  function fakeSkill(): string {
    const skill = mkdtempSync(path.join(tmpdir(), 'cc-fake-skill3-'))
    const scriptsReview = path.join(skill, 'scripts', 'review')
    mkdirSync(scriptsReview, { recursive: true })
    writeFileSync(path.join(scriptsReview, 'apply_review_plan.py'), '', 'utf8')
    return skill
  }

  function resolveWithLimit(rawLimit: unknown) {
    const skill = fakeSkill()
    try {
      return resolveConfig({
        skillRoot: skill,
        pythonExecutable: 'python3',
        sessionsDir: skill,
        injectProgress: true,
        workbench: { analysisContractTextMaxChars: rawLimit } as never,
      })
    } finally {
      rmSync(skill, { recursive: true, force: true })
    }
  }

  it('analysisContractTextMaxChars 缺省走协议默认值', () => {
    const cfg = resolveWithLimit(undefined)
    expect(cfg.workbench.analysisContractTextMaxChars).toBe(ANALYSIS_CONTRACT_TEXT_DEFAULT_CHARS)
  })

  it('analysisContractTextMaxChars 合法自定义值透传', () => {
    const cfg = resolveWithLimit(12_345)
    expect(cfg.workbench.analysisContractTextMaxChars).toBe(12_345)
  })

  it.each([0, -100, 1.5, Number.NaN, ANALYSIS_CONTRACT_TEXT_HARD_MAX_CHARS + 1])(
    'analysisContractTextMaxChars 非法值 %p 在加载边界抛错',
    (rawLimit) => {
      expect(() => resolveWithLimit(rawLimit)).toThrow(/analysisContractTextMaxChars/)
    },
  )
})