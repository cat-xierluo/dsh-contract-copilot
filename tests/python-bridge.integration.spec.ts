/**
 * runApplyCli 集成测试：真实 python3 spawn 跑 apply_review_plan.py 的 success 路径。
 * 依赖本机 defusedxml（skill 的 requirements.txt 已装则通过；未装则跳过——CI 无 Python 环境时用 describe.skipIf）。
 * 另含取消所有权确定性测试：SIGTERM 被忽略的子进程经 TERM→grace→KILL 升级，
 * Promise 在 close 后才 settle（grace 可注入，不依赖长 sleep）。
 */

import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

const hasPython3 = (() => {
  try {
    execSync('python3 -c "pass"', { stdio: 'pipe' })
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

/** spawn 本身失败（如找不到可执行文件）与 Python 是否安装无关，任何环境都必须确定性 reject。 */
it('spawn 失败（pythonExecutable 不存在）→ 明确 reject，不悬挂', async () => {
  await expect(runApplyCli({
    skillRoot: SKILL_ROOT,
    pythonExecutable: 'cc-bridge-missing-python-negative-control',
    inputDocx: '/dev/null', planPath: '/dev/null',
    outputDocx: '/dev/null', reportDocx: '/dev/null',
    clientName: 'x', partyRole: '甲方', reviewIntensity: '常规',
    editPolicy: 'revise-first', author: 'x', organization: 'x',
  })).rejects.toThrow()
})

describe.skipIf(!hasPython3 || process.platform === 'win32')('runApplyCli 取消所有权（TERM→grace→KILL→close）', () => {
  /**
   * 确定性验证（CC-V5-003-R2 blocker 1）：子进程捕获并忽略 SIGTERM 后，
   * abort 必须先 TERM、grace 期满仍存活才升级 KILL，且 Promise 仅在 close 后
   * settle——exitCode=null + stderr 的"TERM 已被忽略"证据共同推出"死因只能是
   * SIGKILL"，不靠时长猜测，也不依赖长 sleep（grace 注入 300ms）。
   */
  let root: string
  const GRACE_MS = 300

  /** Python：装好忽略 SIGTERM 的 handler → 写 ready marker → 常驻循环。 */
  const IGNORE_TERM_SCRIPT = [
    'import signal, sys, time',
    'terminated = False',
    'def on_term(signum, frame):',
    '    global terminated',
    '    terminated = True',
    "signal.signal(signal.SIGTERM, on_term)",
    'open(__MARKER__, "w").close()  # ready marker：handler 已装好，TERM 可发',
    "sys.stdout.write('READY\\n')",
    'sys.stdout.flush()',
    'notified = False',
    'while True:',
    '    time.sleep(0.02)',
    '    if terminated and not notified:',
    '        notified = True',
    "        sys.stderr.write('SIGTERM-IGNORED')",
    '        sys.stderr.flush()',
  ].join('\n')

  /** 轮询等 ready marker（Python handler 装好前的 TERM 会直接杀死进程，不能赛跑）。 */
  async function waitForMarker(marker: string, deadlineMs: number): Promise<void> {
    const deadline = Date.now() + deadlineMs
    while (!existsSync(marker)) {
      if (Date.now() > deadline) throw new Error(`ready marker 未出现：${marker}`)
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'cc-bridge-term-'))
    // buildArgv 以 ${skillRoot}/scripts/review/apply_review_plan.py 为脚本路径，
    // 用假 skill root 注入"忽略 SIGTERM"的脚本，无需生产 API 增设测试钩子。
    mkdirSync(path.join(root, 'scripts', 'review'), { recursive: true })
    writeFileSync(
      path.join(root, 'scripts', 'review', 'apply_review_plan.py'),
      IGNORE_TERM_SCRIPT.replace('__MARKER__', JSON.stringify(path.join(root, 'ready.marker'))),
      'utf8',
    )
  })

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('TERM 被忽略 → 升级 KILL，Promise 在 close 后才 settle', { timeout: 30_000 }, async () => {
    const marker = path.join(root, 'ready.marker')
    const controller = new AbortController()
    const pending = runApplyCli({
      skillRoot: root,
      pythonExecutable: 'python3',
      inputDocx: 'unused', planPath: 'unused', outputDocx: 'unused', reportDocx: 'unused',
      clientName: 'x', partyRole: '甲方', reviewIntensity: '常规',
      editPolicy: 'revise-first', author: 'x', organization: 'x',
      signal: controller.signal,
      terminateGraceMs: GRACE_MS,
    })
    await waitForMarker(marker, 20_000)
    controller.abort()
    const abortedAt = Date.now()
    const result = await pending

    // TERM 确实送达且被 Python 捕获忽略（这是"仍存活"的证据，非时长推断）
    expect(result.stderr).toContain('SIGTERM-IGNORED')
    // 捕获阶段 stdout 完整（输出监听在升级链中持续工作）
    expect(result.stdout).toContain('READY')
    // exitCode=null：死于信号；TERM 已被忽略 → 升级 KILL 是唯一死因
    expect(result.exitCode).toBeNull()
    expect(result.kind).toBe('error')
    // close（即进程消亡）不早于 grace 期满：KILL 只能在 grace 后发出
    expect(Date.now() - abortedAt).toBeGreaterThanOrEqual(GRACE_MS - 5)
  })

  it('未 abort 的正常 close 不受升级链影响：一次 settle，exitCode 原样透出', { timeout: 30_000 }, async () => {
    // 对照组：不 abort 时升级链完全不介入，正常退出码经由 close 一次 settle。
    const entry = path.join(root, 'scripts', 'review', 'apply_review_plan.py')
    writeFileSync(entry, [
      'import sys',
      "sys.stderr.write('EXITING')",
      'sys.stderr.flush()',
      'sys.exit(3)',
    ].join('\n'), 'utf8')
    try {
      const result = await runApplyCli({
        skillRoot: root,
        pythonExecutable: 'python3',
        inputDocx: 'unused', planPath: 'unused', outputDocx: 'unused', reportDocx: 'unused',
        clientName: 'x', partyRole: '甲方', reviewIntensity: '常规',
        editPolicy: 'revise-first', author: 'x', organization: 'x',
      })
      expect(result.exitCode).toBe(3)
      expect(result.kind).toBe('error')
      expect(result.stderr).toContain('EXITING')
    } finally {
      // 还原忽略 TERM 入口，保持 beforeAll 建立的固定状态
      writeFileSync(entry, IGNORE_TERM_SCRIPT.replace('__MARKER__', JSON.stringify(path.join(root, 'ready.marker'))), 'utf8')
    }
  })
})
