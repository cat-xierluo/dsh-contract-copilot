/**
 * runApplyCli 集成测试：真实 python3 spawn 跑 apply_review_plan.py 的 success 路径。
 * 依赖本机 defusedxml（skill 的 requirements.txt 已装则通过；未装则跳过——CI 无 Python 环境时用 describe.skipIf）。
 * 另含取消所有权确定性测试（CC-V5-003-R3）：整组 TERM→grace→KILL→最终 settle
 * 上界，含"父忽略 SIGTERM + 永久后代继承 stdout/stderr"的进程树负控——
 * 取消在硬上界内返回且父/后代均消亡（grace/上界可注入，不依赖长 sleep）。
 */

import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

describe.skipIf(!hasPython3 || process.platform === 'win32')('runApplyCli 取消所有权（整组 TERM→grace→KILL→最终上界）', () => {
  /**
   * 确定性验证（CC-V5-003-R2/R3）：abort 先整组 TERM，grace 期满仍存活升级整组
   * KILL，并在 grace+killSettle 的硬上界内 settle；R3 负控证明继承 stdout/stderr
   * 的永久后代与父一起消亡——只杀直接子进程的实现会让后代存活、close 永不到达。
   * 不靠时长猜测，也不依赖长 sleep（grace/上界注入 300ms）。
   */
  const GRACE_MS = 300
  const KILL_SETTLE_MS = 300
  let root: string

  /** 常驻后代：自带忽略 SIGTERM 的 handler，继承父的 stdout/stderr（R3/R4 负控核心）。 */
  const DESCENDANT_CODE = [
    'import signal, time',
    'def on_term(signum, frame):',
    '    pass',
    'signal.signal(signal.SIGTERM, on_term)',
    'while True:',
    "    time.sleep(0.05)  # cc-r4-red-cleanup-marker",
  ].join('\n')

  /**
   * R4 负控：父写完双 pid 后立即 exit 0，永久后代继承 stdout/stderr 存活——
   * close 因后代持 pipe 永不到达，父是否已 exit 不得决定树是否仍被清理。
   */
  const exitedParentScript = (pidsFile: string): string => [
    'import os, subprocess, sys',
    'descendant = subprocess.Popen([sys.executable, "-c", ' + JSON.stringify(DESCENDANT_CODE) + '], stdout=sys.stdout, stderr=sys.stderr)',
    'open(' + JSON.stringify(pidsFile) + ', "w").write("%d %d" % (os.getpid(), descendant.pid))',
    "sys.stdout.write('PARENT-EXITING\\n')",
    'sys.stdout.flush()',
    'sys.exit(0)',
  ].join('\n')

  /** 父：忽略 SIGTERM，派生永久后代（继承 pipe），写双 pid 文件，常驻循环。 */
  const treeScript = (pidsFile: string): string => [
    'import os, signal, subprocess, sys, time',
    'def on_term(signum, frame):',
    '    pass',
    'signal.signal(signal.SIGTERM, on_term)',
    'descendant = subprocess.Popen([sys.executable, "-c", ' + JSON.stringify(DESCENDANT_CODE) + '], stdout=sys.stdout, stderr=sys.stderr)',
    'open(' + JSON.stringify(pidsFile) + ', "w").write("%d %d" % (os.getpid(), descendant.pid))',
    "sys.stdout.write('READY\\n')",
    'sys.stdout.flush()',
    'while True:',
    '    time.sleep(0.05)',
  ].join('\n')

  /** R2 场景：仅父进程忽略 SIGTERM（无后代），ready marker 同步。 */
  const ignoreTermScript = (marker: string): string => [
    'import signal, sys, time',
    'terminated = False',
    'def on_term(signum, frame):',
    '    global terminated',
    '    terminated = True',
    'signal.signal(signal.SIGTERM, on_term)',
    'open(' + JSON.stringify(marker) + ', "w").close()  # ready marker：handler 已装好，TERM 可发',
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

  function writeEntry(script: string): void {
    // buildArgv 以 ${skillRoot}/scripts/review/apply_review_plan.py 为脚本路径，
    // 用假 skill root 注入被测脚本，无需生产 API 增设测试钩子。
    writeFileSync(path.join(root, 'scripts', 'review', 'apply_review_plan.py'), script, 'utf8')
  }

  function baseArgs() {
    return {
      skillRoot: root,
      pythonExecutable: 'python3',
      inputDocx: 'unused', planPath: 'unused', outputDocx: 'unused', reportDocx: 'unused',
      clientName: 'x', partyRole: '甲方', reviewIntensity: '常规',
      editPolicy: 'revise-first', author: 'x', organization: 'x',
    }
  }

  /** 轮询等同步文件出现（handler 装好/后代派生前不能发 TERM，不能赛跑）。 */
  async function waitForFile(file: string, deadlineMs: number): Promise<void> {
    const deadline = Date.now() + deadlineMs
    while (!existsSync(file)) {
      if (Date.now() > deadline) throw new Error(`同步文件未出现：${file}`)
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }

  /** 断言 pid 已消亡（process.kill(pid, 0) 抛错）；有界重试吸收进程收割延迟。 */
  async function expectPidGone(pid: number, label: string): Promise<void> {
    const deadline = Date.now() + 5_000
    for (;;) {
      try {
        process.kill(pid, 0)
      } catch {
        return // ESRCH：不存在（本用例中唯一的预期结局）
      }
      if (Date.now() > deadline) throw new Error(`${label} pid=${pid} 取消后仍存活`)
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
  }

  /**
   * 负控独立 backstop（4s）：取消类负控必须在秒级出结论，不允许旧缺陷回归时
   * 悬挂到 it 超时（green 路径 ~0.3–0.4s settle，backstop 有 10 倍余量）。
   */
  async function withBackstop<T>(pending: Promise<T>, label: string): Promise<T> {
    const BACKSTOP_MS = 4_000
    let timer: NodeJS.Timeout | undefined
    try {
      return await Promise.race([
        pending,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${label}（独立 backstop ${BACKSTOP_MS}ms 内未 settle）`)), BACKSTOP_MS)
        }),
      ])
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'cc-bridge-term-'))
    mkdirSync(path.join(root, 'scripts', 'review'), { recursive: true })
  })

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
    // 负控后代卫生兜底：修复生效时后代已在测试内被整组 KILL，此兜底只服务
    // "旧缺陷回归"的红路径（后代逃逸存活），精确匹配本负控注入的 marker。
    if (process.platform !== 'win32') {
      try { execSync('pkill -f cc-r4-red-cleanup-marker', { stdio: 'pipe' }) } catch { /* 无匹配进程 */ }
    }
  })

  it('TERM 被忽略 → 升级 KILL，Promise 在 close 后才 settle', { timeout: 30_000 }, async () => {
    const marker = path.join(root, 'ready.marker')
    writeEntry(ignoreTermScript(marker))
    const controller = new AbortController()
    const pending = runApplyCli({
      ...baseArgs(),
      signal: controller.signal,
      terminateGraceMs: GRACE_MS,
      killSettleMs: KILL_SETTLE_MS,
    })
    await waitForFile(marker, 20_000)
    controller.abort()
    const abortedAt = Date.now()
    const result = await withBackstop(pending, 'TERM 忽略负控取消未按上界返回')

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

  it('永久后代（继承 stdout/stderr、忽略 TERM）随父在硬上界内被整组消灭', { timeout: 30_000 }, async () => {
    const pidsFile = path.join(root, 'tree.pids')
    writeEntry(treeScript(pidsFile))
    const controller = new AbortController()
    const pending = runApplyCli({
      ...baseArgs(),
      signal: controller.signal,
      terminateGraceMs: GRACE_MS,
      killSettleMs: KILL_SETTLE_MS,
    })
    await waitForFile(pidsFile, 20_000)
    const [parentPid, descendantPid] = readFileSync(pidsFile, 'utf8').trim().split(/\s+/).map(Number)
    expect(Number.isInteger(parentPid)).toBe(true)
    expect(Number.isInteger(descendantPid)).toBe(true)
    controller.abort()
    const abortedAt = Date.now()
    const result = await withBackstop(pending, '进程树负控取消未按上界返回')
    const elapsed = Date.now() - abortedAt

    // 硬上界：TERM(grace) → 整组 KILL → 最终 settle 上界，Promise 必须在内返回
    expect(elapsed).toBeGreaterThanOrEqual(GRACE_MS - 5) // 父必忽略 TERM，KILL 只能在 grace 后
    expect(elapsed).toBeLessThanOrEqual(GRACE_MS + KILL_SETTLE_MS + 500)
    // exitCode=null：整棵树死于信号
    expect(result.exitCode).toBeNull()
    expect(result.kind).toBe('error')
    // 父与永久后代都不复存在：整组 KILL 的直接证据（非时长推断）
    await expectPidGone(parentPid, '父 Python')
    await expectPidGone(descendantPid, '永久后代')
  })

  it('父先退出的永久后代（继承 pipe）→ 取消仍整组清理且在硬上界内返回', { timeout: 30_000 }, async () => {
    const pidsFile = path.join(root, 'orphan.pids')
    writeEntry(exitedParentScript(pidsFile))
    const controller = new AbortController()
    const pending = runApplyCli({
      ...baseArgs(),
      signal: controller.signal,
      terminateGraceMs: GRACE_MS,
      killSettleMs: KILL_SETTLE_MS,
    })
    await waitForFile(pidsFile, 20_000)
    const [parentPid, descendantPid] = readFileSync(pidsFile, 'utf8').trim().split(/\s+/).map(Number)
    expect(Number.isInteger(parentPid)).toBe(true)
    expect(Number.isInteger(descendantPid)).toBe(true)
    // 合同要求：确认父已消亡再触发取消（exit-before-close 场景的前提）
    await expectPidGone(parentPid, '父 Python（已自行退出）')
    controller.abort()
    const abortedAt = Date.now()
    const result = await withBackstop(pending, '父先退出负控取消未按上界返回')
    const elapsed = Date.now() - abortedAt

    // 硬上界：父已 exit 也要整组 TERM→KILL 并启动最终 settle，Promise 必须在内返回
    expect(elapsed).toBeLessThanOrEqual(GRACE_MS + KILL_SETTLE_MS + 500)
    // 永久后代（继承 pipe、忽略 TERM）必须消亡：isAlive 早退的旧实现会让本用例悬挂
    await expectPidGone(descendantPid, '永久后代')
    // 结果仍来自父：退出码/分类原样透出，父的输出被完整捕获
    expect(result.exitCode).toBe(0)
    expect(result.kind).toBe('success')
    expect(result.stdout).toContain('PARENT-EXITING')
  })

  it('未 abort 的正常 close 不受升级链影响：一次 settle，exitCode 原样透出', { timeout: 30_000 }, async () => {
    // 对照组：不 abort 时升级链完全不介入，正常退出码经由 close 一次 settle。
    writeEntry([
      'import sys',
      "sys.stderr.write('EXITING')",
      'sys.stderr.flush()',
      'sys.exit(3)',
    ].join('\n'))
    const result = await runApplyCli(baseArgs())
    expect(result.exitCode).toBe(3)
    expect(result.kind).toBe('error')
    expect(result.stderr).toContain('EXITING')
  })
})
