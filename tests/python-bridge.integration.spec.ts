/**
 * runApplyCli 集成测试：真实 python3 spawn 跑 apply_review_plan.py 的 success 路径。
 * 依赖本机 defusedxml（skill 的 requirements.txt 已装则通过；未装则跳过——CI 无 Python 环境时用 describe.skipIf）。
 */

import { execSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runApplyCli } from '../src/python-bridge.ts'

const SKILL_ROOT = '/Users/maoking/Library/Application Support/maoscripts/skills/legal-skills/skills/contract-copilot'

let dir: string
let docx: string
let plan: string

const hasPythonDeps = (() => {
  try {
    execSync('python3 -c "import defusedxml"', { stdio: 'pipe' })
    return true
  } catch { return false }
})()

describe.skipIf(!hasPythonDeps)('runApplyCli 集成（真实 spawn）', () => {
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'cc-bridge-'))
    mkdirSync(path.join(dir, 'config'))
    docx = path.join(dir, 'fixture.docx')
    const genScript = path.join(dir, 'gen.py')
    writeFileSync(genScript, [
      'from docx import Document',
      'd = Document()',
      "d.add_heading('测试合同', 0)",
      "d.add_paragraph('任何一方违约应赔偿对方全部损失。')",
      `d.save(${JSON.stringify(docx)})`,
    ].join('\n'), 'utf8')
    execSync(`python3 ${JSON.stringify(genScript)}`, { stdio: 'pipe' })
    plan = path.join(dir, 'plan.json')
    writeFileSync(plan, JSON.stringify({
      meta: { contract_name: 'fixture', client_name: '测试客户', party_role: '甲方', review_intensity: '常规', edit_policy: 'revise-first' },
      summary: {
        contract_type: '测试合同', parties: { party_a: '甲', party_b: '乙' },
        business_overview: '测试', contract_amount: '一元', payment_terms: '一次付清',
        rights_obligations: '测试', overall_risk: '低', core_conclusion: '可签',
        key_recommendations: ['测试'],
      },
      findings: [{
        id: 'R001', risk: '违约条款过宽', severity: 'P1',
        target_text: '任何一方违约应赔偿对方全部损失。',
        replacement_text: '违约赔偿以总价款百分之二十为限。',
        action: 'replace', force_edit: true,
        legal_basis: '《民法典》第五百八十五条',
      }],
    }), 'utf8')
  })

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('success 路径：exit 0，产物路径与统计齐备', { timeout: 120_000 }, async () => {
    const result = await runApplyCli({
      skillRoot: SKILL_ROOT,
      pythonExecutable: 'python3',
      inputDocx: docx,
      planPath: plan,
      outputDocx: path.join(dir, 'out.docx'),
      reportDocx: path.join(dir, 'report.docx'),
      clientName: '测试客户', partyRole: '甲方', reviewIntensity: '常规',
      editPolicy: 'revise-first', author: '测试', organization: '测试所',
      archiveDir: path.join(dir, 'archive'),
      environment: { CONTRACT_COPILOT_CONFIG_DIR: path.join(dir, 'config') },
    })
    expect(result.kind).toBe('success')
    expect(result.exitCode).toBe(0)
    expect(result.parsed.stats).toEqual({ applied: 1, failed: 0, skipped: 0, reportOnly: 0 })
    expect(result.parsed.reviewedDocx).toBeTruthy()
    expect(result.parsed.reportDocx).toBeTruthy()
  })
})
