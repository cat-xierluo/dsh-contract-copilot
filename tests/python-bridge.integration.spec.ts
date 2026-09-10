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

/**
 * 输出上限行为测试（Q46 F1/F2）：真实子进程经真实管道向 stdout 与 stderr
 * 各写出约 9.5MiB（超过 8MiB 上限），证明——
 * ①两流独立封顶且各自 ≤ 8MiB（UTF-8 字节）；②保尾截断淘汰前部 filler；
 * ③达上限后收集端仍持续排空管道（否则子进程写满管道缓冲会阻塞到超时，
 * 且退出前最后写入的尾部数据不可能被收集）；④尾部判类标记与 summary 行
 * 存活，截断后 classify / parseStdout 语义不退化。
 * fixture 只依赖 POSIX sh（yes/head/printf），无 Python 依赖，CI 可跑。
 */
describe('runApplyCli 输出上限（真实超限 spawn）', () => {
  const CAP_BYTES = 8 * 1024 * 1024
  const FRONT_FILLER_BYTES = 512 * 1024
  const LATE_FILLER_BYTES = 9 * 1024 * 1024

  let dir: string
  let skillRoot: string

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'cc-bridge-cap-'))
    // fixture skillRoot：apply_review_plan.py 以 sh 执行（pythonExecutable: 'sh'）。
    // 前部 filler（512KiB）整体落在被淘汰的前缀（总量 − 8MiB ≈ 1.5MiB）内；
    // 后部 filler 跨过截断缝；两流各自的退出前尾部标记必须存活。
    skillRoot = path.join(dir, 'skill')
    const scriptDir = path.join(skillRoot, 'scripts', 'review')
    mkdirSync(scriptDir, { recursive: true })
    writeFileSync(path.join(scriptDir, 'apply_review_plan.py'), [
      '#!/bin/sh',
      `yes 'AAA-FRONT-FILLER-' | head -c ${FRONT_FILLER_BYTES}`,
      `yes 'BBB-LATE-FILLER-' | head -c ${LATE_FILLER_BYTES}`,
      "printf '\\n输出 DOCX: /tmp/q46-cap-fixture/out_reviewed.docx\\n'",
      "printf '\\n输出报告 DOCX: /tmp/q46-cap-fixture/out_report.docx\\n'",
      "printf '\\n归档目录: /tmp/q46-cap-fixture/archive/run-1\\n'",
      "printf '\\n执行统计: 成功=3，失败=1，跳过=2，仅意见书=0\\n'",
      `yes 'STDERR-A-FRONT-' | head -c ${FRONT_FILLER_BYTES} >&2`,
      `yes 'STDERR-B-LATE-' | head -c ${LATE_FILLER_BYTES} >&2`,
      "printf '\\n存在失败项，请检查归档目录中的执行日志与审查报告。\\n' >&2",
      'exit 1',
    ].join('\n'), 'utf8')
  })

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('两流各自保尾封顶 ≤ 8MiB，前部 filler 被淘汰，尾部标记仍驱动 classify/parseStdout', { timeout: 120_000 }, async () => {
    const result = await runApplyCli({
      skillRoot,
      pythonExecutable: 'sh',
      inputDocx: '/tmp/q46-cap-fixture/in.docx',
      planPath: '/tmp/q46-cap-fixture/plan.json',
      outputDocx: '/tmp/q46-cap-fixture/out.docx',
      reportDocx: '/tmp/q46-cap-fixture/report.docx',
      clientName: '测试客户', partyRole: '甲方', reviewIntensity: '常规',
      editPolicy: 'revise-first', author: '测试', organization: '测试所',
    })

    expect(result.exitCode).toBe(1)
    // ①每流独立有界：各自 ≤ 上限且都接近上限（真实触发了截断；共享预算
    // 或单流收集会让其中一流远低于上限）。
    expect(Buffer.byteLength(result.stdout, 'utf8')).toBeLessThanOrEqual(CAP_BYTES)
    expect(Buffer.byteLength(result.stderr, 'utf8')).toBeLessThanOrEqual(CAP_BYTES)
    expect(Buffer.byteLength(result.stdout, 'utf8')).toBeGreaterThan(7 * 1024 * 1024)
    expect(Buffer.byteLength(result.stderr, 'utf8')).toBeGreaterThan(7 * 1024 * 1024)
    // ②保尾：前部 filler 必须被淘汰；后部 filler（跨缝内容）必须存活。
    // 保头截断会保留 AAA-FRONT 并丢掉全部尾部标记，在此断言失败。
    expect(result.stdout).not.toContain('AAA-FRONT-FILLER-')
    expect(result.stderr).not.toContain('STDERR-A-FRONT-')
    expect(result.stdout).toContain('BBB-LATE-FILLER-')
    expect(result.stderr).toContain('STDERR-B-LATE-')
    // ③④尾部存活：SystemExit 前最后的判类标记让 classify 判 partial
    // （而非降级 error），stdout 收尾 summary 行仍被 parseStdout 解析。
    expect(result.kind).toBe('partial')
    expect(result.stderr).toContain('存在失败项，请检查归档目录中的执行日志与审查报告。')
    expect(result.parsed).toEqual({
      reviewedDocx: '/tmp/q46-cap-fixture/out_reviewed.docx',
      reportDocx: '/tmp/q46-cap-fixture/out_report.docx',
      archiveDir: '/tmp/q46-cap-fixture/archive/run-1',
      stats: { applied: 3, failed: 1, skipped: 2, reportOnly: 0 },
    })
  })
})
