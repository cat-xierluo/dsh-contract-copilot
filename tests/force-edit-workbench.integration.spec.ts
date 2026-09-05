/**
 * CC-V5-003 force_edit 修订产物可重复验收：真实 Python CLI + 工作台 document RPC。
 *
 * 验收链路（TASKS.md CC-V5-003）：
 *   脱敏合成 DOCX + force_edit:true plan
 *   → runApplyCli 调真实 apply_review_plan.py（当前配置，AbortSignal 超时早于 hook）
 *   → 修订 DOCX 的 word/document.xml 同时含 w:ins 与 w:del
 *   → handleWorkbenchRpc('document')（生产入口，走 session.outputs.reviewedDocx
 *     → extractDocxParts → renderDocumentWithAnchors）的 HTML 同时含 cc-ins 与 cc-del。
 *
 * 依赖缺失时整组具名 skip（缺什么打印什么，含 CLI 入口可读性），核心断言绝不假绿：
 * CLI 能跑但断言不满足 = 测试失败，与 skip 不同。
 *
 * 脚本负控（CC-V5-003-R2）：每次子脚本运行注入测试独占 TMPDIR，只断言该私有根
 * 最终为空（不扫描共享 /tmp 全局计数）；BLOCKED 负控走真实生产路径——依赖探测
 * 放行、工作目录已建之后在生成步骤故障挂起，脚本内部超时先于外层 backstop 触发，
 * 验证 exit 2 且 finally 真实清理了已建目录。
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { decodeEntities, extractDocxParts } from '../src/docx-view.ts'
import { handleWorkbenchRpc } from '../src/host-api.ts'
import { runApplyCli } from '../src/python-bridge.ts'
import type { BridgeResult } from '../src/python-bridge.ts'
import type { PluginConfig } from '../src/config.ts'
import { SessionStore } from '../src/session.ts'
import type { ContractSession } from '../src/session-types.ts'
import type { DocumentView } from '../src/workbench-protocol.ts'
import {
  CONTRACT_NAME,
  FORCE_EDIT_SKILL_ROOT,
  INSERTED_DIFF_SNIPPET,
  TARGET_TEXT,
  buildForceEditPlan,
  probeForceEditDeps,
  writeSyntheticContractDocx,
} from './force-edit-fixture.ts'

const deps = probeForceEditDeps()
if (deps.missing.length > 0) {
  // 具名 skip 原因：vitest 报告显示 skipped，原因在 stdout 可检索。
  console.warn(`[force-edit-acceptance] SKIP：真实 CLI 链路依赖缺失 → ${deps.missing.join('；')}`)
}

/** 独立验收脚本路径。 */
const ACCEPTANCE_SCRIPT = path.resolve(import.meta.dirname, '../scripts/acceptance/force-edit-acceptance.mjs')

/**
 * 为一次子脚本运行建立测试独占的临时根：脚本的 mkdtemp 与 Python tempfile 都
 * 落在里面（os.tmpdir/tempfile 均尊重 TMPDIR；TMP/TEMP 兼容 Windows）。
 * 断言"该根最终为空"即零残留，与其他并行测试/机器上其他进程完全隔离。
 */
function makePrivateTmpRoot(label: string): string {
  return mkdtempSync(path.join(tmpdir(), `cc-force-edit-root-${label}-`))
}

function privateTmpEnv(root: string, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { ...process.env, ...extra, TMPDIR: root, TMP: root, TEMP: root }
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

function markerPids(marker: string): number[] {
  const listed = execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' })
  return listed.split('\n').flatMap((line) => {
    if (!line.includes(marker)) return []
    const match = line.match(/^\s*(\d+)\s+/)
    if (!match) return []
    const pid = Number(match[1])
    return pid !== process.pid ? [pid] : []
  })
}

async function expectNoMarker(marker: string, label: string): Promise<void> {
  const deadline = Date.now() + 5_000
  for (;;) {
    const pids = markerPids(marker)
    if (pids.length === 0) return
    if (Date.now() > deadline) throw new Error(`${label} marker 残留 pid=${pids.join(',')}`)
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

async function forceKillMarker(marker: string, label: string): Promise<void> {
  const deadline = Date.now() + 5_000
  for (;;) {
    const pids = markerPids(marker)
    if (pids.length === 0) return
    for (const pid of pids) {
      try { process.kill(pid, 'SIGKILL') } catch { /* 已退出 */ }
    }
    if (Date.now() > deadline) throw new Error(`${label} SIGKILL 后仍有 marker 残留 pid=${pids.join(',')}`)
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

describe.skipIf(deps.missing.length > 0)('force_edit 修订产物验收（真实 CLI + document RPC）', () => {
  let dir: string
  let sourceDocx: string
  let planPath: string
  let result: BridgeResult
  let revisedDocx: string
  let store: SessionStore
  let config: PluginConfig
  let session: ContractSession
  let view: DocumentView
  // 负控取样：每次子脚本运行各自的私有 TMPDIR 根与运行结果
  let scriptRun: { status: number | null; stdout: string; stderr: string }
  let scriptRoot: string
  let blockedRun: { status: number | null; stdout: string; stderr: string }
  let blockedRoot: string
  /** 负控自建目录（wrapper 所在根等），afterAll 统一清理。 */
  const negctlDirs: string[] = []

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'cc-force-edit-'))
    const configDir = path.join(dir, 'config')
    mkdirSync(configDir, { recursive: true })

    sourceDocx = writeSyntheticContractDocx(dir)
    planPath = path.join(dir, 'review-plan.json')
    writeFileSync(planPath, `${JSON.stringify(buildForceEditPlan(), null, 2)}\n`, 'utf8')

    const outputDocx = path.join(dir, 'output', `${CONTRACT_NAME}_reviewed.docx`)
    mkdirSync(path.dirname(outputDocx), { recursive: true })
    const reportDocx = path.join(dir, 'output', `${CONTRACT_NAME}_审查报告.docx`)

    return runApplyCli({
      skillRoot: FORCE_EDIT_SKILL_ROOT,
      pythonExecutable: 'python3',
      inputDocx: sourceDocx,
      planPath,
      outputDocx,
      reportDocx,
      clientName: '测试甲公司',
      partyRole: '甲方',
      reviewIntensity: '常规',
      editPolicy: 'revise-first',
      author: '验收测试律师',
      organization: '合成验收律所',
      archiveDir: path.join(dir, 'archive'),
      environment: { CONTRACT_COPILOT_CONFIG_DIR: configDir },
      // CLI 超时早于 hook 超时（150s < 180s）：挂起时 AbortSignal 杀子进程 →
      // close 触发 → kind=error → 断言失败 fail loud，测试绝不悬挂。
      signal: AbortSignal.timeout(150_000),
    }).then((cliResult) => {
      result = cliResult
      revisedDocx = cliResult.parsed.reviewedDocx ?? outputDocx

      // 工作台生产路径：apply 成功后 session.outputs.reviewedDocx 指向修订 DOCX
      //（与 src/tools/apply.ts 的 applied 迁移写法一致），document RPC 投影 HTML。
      store = new SessionStore(path.join(dir, 'sessions'))
      config = {
        skillRoot: FORCE_EDIT_SKILL_ROOT,
        pythonExecutable: 'python3',
        sessionsDir: path.join(dir, 'sessions'),
        injectProgress: true,
        workbench: { enabled: true },
      }
      session = store.create(sourceDocx, CONTRACT_NAME)
      store.transition(session.id, 'contract_copilot_apply', 'applied', (target) => {
        target.outputs = {
          reviewedDocx: cliResult.parsed.reviewedDocx ?? outputDocx,
          reportDocx: cliResult.parsed.reportDocx ?? reportDocx,
          archiveDir: cliResult.parsed.archiveDir,
          stats: cliResult.parsed.stats,
        }
      })
      return handleWorkbenchRpc(config, store, 'document', { sessionId: session.id }).then((rpc) => {
        if (!rpc.ok) throw new Error(`document RPC 失败: ${JSON.stringify(rpc.error)}`)
        view = rpc.value as unknown as DocumentView
      })
    })
  }, 180_000)

  afterAll(async () => {
    // 临时目录与子进程由本测试全权清理：runApplyCli 的子进程已 await close
    //（超时时经整组 TERM→grace→KILL 升级链确认消亡），extractDocxParts 的临时
    // 脚本自清理，这里负责工作目录与负控私有根。另含负控后代卫生兜底：只精确
    // 匹配 wrapper 负控注入的 marker（回归红路径的逃逸后代）。
    await forceKillMarker(processMarker, 'afterAll')
    rmSync(dir, { recursive: true, force: true })
    for (const extra of negctlDirs) rmSync(extra, { recursive: true, force: true })
  })

  let processMarker = ''
  afterEach(async () => {
    if (processMarker) await forceKillMarker(processMarker, '失败路径')
  })

  it('真实 CLI success：exit 0 且 force_edit finding 落为 applied', () => {
    expect(result.kind).toBe('success')
    expect(result.exitCode).toBe(0)
    expect(result.parsed.stats).toEqual({ applied: 1, failed: 0, skipped: 0, reportOnly: 0 })
    expect(result.parsed.reviewedDocx).toBeTruthy()
    expect(result.parsed.reportDocx).toBeTruthy()
  })

  it('修订 DOCX 的 word/document.xml 同时含 w:ins 与 w:del', () => {
    const { documentXml } = extractDocxParts(revisedDocx, 'python3')
    expect(documentXml).toContain('<w:ins ')
    expect(documentXml).toContain('<w:del ')
  })

  it('document RPC HTML 同时含 cc-ins 与 cc-del，且插入实质内容可见', () => {
    expect(view.label).toBe('审核修订版 DOCX')
    expect(view.html).toContain('class="cc-ins"')
    expect(view.html).toContain('class="cc-del"')
    // 两个标记都携带非空差异文本（空壳标签不算可见修订）
    expect(view.html).toMatch(/<ins class="cc-ins">[^<]+<\/ins>/)
    expect(view.html).toMatch(/<del class="cc-del">[^<]+<\/del>/)
    // CLI 落的是最小差异修订（只标删差异词），新增实质内容以片段形式在场
    //（对齐设计稿 §7 e2e 口径："合并 w:t 后验证替换文本完整在场"）。
    const visibleText = decodeEntities(view.html.replace(/<[^>]+>/g, ''))
    expect(visibleText).toContain(INSERTED_DIFF_SNIPPET)
    // 原句合并后不再整句在场（差异词被标删）
    expect(visibleText).not.toContain(TARGET_TEXT)
    // 原合同源文件本身无修订标记：防止把"渲染了源文件"误当通过
    const sourceParts = extractDocxParts(sourceDocx, 'python3')
    expect(sourceParts.documentXml).not.toContain('<w:ins')
  })

  it('document RPC 数据可无损过 JSON（浏览器传输路径）', () => {
    expect(JSON.parse(JSON.stringify(view.comments))).toEqual(view.comments)
  })

  it('sanity：合成 fixture 确实可被 python3 抽取（防 fixture 自身损坏）', () => {
    // target_text 必须真实存在于源 DOCX，否则 w:ins/w:del 断言无意义
    const { documentXml } = extractDocxParts(sourceDocx, 'python3')
    expect(documentXml).toContain(TARGET_TEXT)
  })

  it('独立验收脚本端到端 exit 0（scripts/acceptance/force-edit-acceptance.mjs）', { timeout: 150_000 }, () => {
    // 让 vitest 进程代跑脚本（相同 node），覆盖其独立异步 CLI spawn 与断言链路；
    // BLOCKED(2)/FAIL(1) 都不允许假绿。
    // 外层 backstop(140s) 必须晚于脚本内部 CLI 超时(60s)：内部超时先触发，
    // 脚本自己走 TERM→KILL→close 与 finally 清理，外层永不先杀 Node 绕过 finally。
    scriptRoot = makePrivateTmpRoot('success')
    scriptRun = spawnSync(process.execPath, [ACCEPTANCE_SCRIPT], {
      encoding: 'utf-8',
      timeout: 140_000,
      env: privateTmpEnv(scriptRoot),
    })
    expect(scriptRun.error?.code === 'ETIMEDOUT' ? 'script 超时' : null).toBeNull()
    expect(scriptRun.status, `stdout: ${scriptRun.stdout}\nstderr: ${scriptRun.stderr}`).toBe(0)
    expect(scriptRun.stdout).toContain('[force-edit-acceptance] PASS')
  })

  it('负控：脚本 PASS 后其私有 TMPDIR 根为空（真实零残留，不扫共享 /tmp）', () => {
    expect(readdirSync(scriptRoot)).toEqual([])
  })

  it('负控：工作目录已建后 BLOCKED（生成步骤挂起）→ exit 2 且私有 TMPDIR 根为空', { timeout: 60_000 }, () => {
    // 走真实生产清理路径，不用测试钩子：依赖探测正常放行 → 脚本已 mkdtemp 工作
    // 目录 → 生成步骤对"挂起 wrapper"超时（脚本内部 20s < 外层 50s），BLOCKED
    // 必须发生在目录已建之后，finally 真正执行 rmSync。
    const wrapperRoot = mkdtempSync(path.join(tmpdir(), 'cc-force-edit-wrapper-'))
    negctlDirs.push(wrapperRoot)
    const wrapper = path.join(wrapperRoot, 'python-wrapper.py')
    writeFileSync(wrapper, [
      '#!/usr/bin/env python3',
      '"""负控专用透传：依赖探测正常放行，合成 DOCX 生成步骤挂起（等待被 TERM/KILL）。"""',
      'import os',
      'import sys',
      'import time',
      'args = sys.argv[1:]',
      "if args and args[0].endswith('gen-force-edit-fixture.py'):",
      '    time.sleep(3600)',
      "os.execvp('python3', ['python3'] + args)",
    ].join('\n'), { encoding: 'utf8', mode: 0o755 })
    blockedRoot = makePrivateTmpRoot('blocked-after-mkdir')
    blockedRun = spawnSync(process.execPath, [ACCEPTANCE_SCRIPT], {
      encoding: 'utf-8',
      timeout: 50_000,
      env: privateTmpEnv(blockedRoot, { CONTRACT_COPILOT_PYTHON: wrapper }),
    })
    expect(blockedRun.status, `stdout: ${blockedRun.stdout}\nstderr: ${blockedRun.stderr}`).toBe(2)
    expect(blockedRun.stderr).toContain('[force-edit-acceptance] BLOCKED')
    // BLOCKED 原因证明挂在生成步骤（目录已建之后），不是依赖探测提前返回
    expect(blockedRun.stderr).toContain('合成 DOCX 生成')
    expect(readdirSync(blockedRoot)).toEqual([])
  })

  it('负控：gen 父进程先退出、永久后代持有管道时脚本仍有界退出（exit 0）', { timeout: 60_000 }, async () => {
    // R4 exit-before-close：gen wrapper 派生继承 stdout/stderr 的永久后代（忽略
    // SIGTERM）后照常 exec 真实生成并退出 0——gen 的 close 因后代持 pipe 永不
    // 到达；旧 ownedSpawn 以"直接子进程存活"为条件发起 TERM/KILL，会在此步永远
    // 挂起（外层 backstop 杀脚本 → 本负控红）。修复后脚本内部超时照常整组
    // TERM→KILL→settle（status 透出父的 exit 0），继续走完真实链路。
    const wrapperRoot = mkdtempSync(path.join(tmpdir(), 'cc-force-edit-wrapper-exit-'))
    negctlDirs.push(wrapperRoot)
    const wrapper = path.join(wrapperRoot, 'python-wrapper-exit.py')
    const pidFile = path.join(wrapperRoot, 'descendant.pid')
    const readyFile = path.join(wrapperRoot, 'descendant.ready')
    processMarker = path.basename(wrapperRoot)
    const descendantCode = [
      'import signal, time',
      'def on_term(signum, frame):',
      '    pass',
      'signal.signal(signal.SIGTERM, on_term)',
      `open(${JSON.stringify(readyFile)}, "w").close()`,
      'while True:',
      `    time.sleep(0.05)  # ${processMarker}`,
    ].join('\n')
    writeFileSync(wrapper, [
      '#!/usr/bin/env python3',
      '"""R4 负控透传：gen 步骤派生继承 pipe 的永久后代后照常 exec 真实生成；其余原样透传。"""',
      'import os',
      'import subprocess',
      'import sys',
      'args = sys.argv[1:]',
      "if args and args[0].endswith('gen-force-edit-fixture.py'):",
      '    descendant = subprocess.Popen(',
      '        [sys.executable, "-c", ' + JSON.stringify(descendantCode) + '],',
      '        stdout=sys.stdout, stderr=sys.stderr,',
      '    )',
      '    open(' + JSON.stringify(pidFile) + ', "w").write(str(descendant.pid))',
      '    import time as _time',
      '    for _ in range(500):',
      '        if os.path.exists(' + JSON.stringify(readyFile) + '): break',
      '        _time.sleep(0.01)',
      "os.execvp('python3', ['python3'] + args)",
    ].join('\n'), { encoding: 'utf8', mode: 0o755 })
    const privateRoot = makePrivateTmpRoot('exited-parent')
    negctlDirs.push(privateRoot)
    const startedAt = Date.now()
    const run = spawnSync(process.execPath, [ACCEPTANCE_SCRIPT], {
      encoding: 'utf-8',
      timeout: 50_000, // 早于本 it 的 60s：脚本悬挂（isAlive 早退）时先被杀并暴露
      env: privateTmpEnv(privateRoot, { CONTRACT_COPILOT_PYTHON: wrapper }),
    })
    const elapsed = Date.now() - startedAt
    expect(run.error?.code === 'ETIMEDOUT' ? 'script 悬挂超时（isAlive 早退缺陷未修复）' : null).toBeNull()
    expect(existsSync(readyFile)).toBe(true)
    // gen settle（透出父的 exit 0）后脚本继续真实 CLI/抽取 → PASS exit 0
    expect(run.status, `stdout: ${run.stdout}\nstderr: ${run.stderr}`).toBe(0)
    expect(run.stdout).toContain('[force-edit-acceptance] PASS')
    // 有界退出：gen 超时(20s)+grace(1s)+settle(1s)+真实 CLI/抽取，必须在上界内结束
    expect(elapsed).toBeLessThan(45_000)
    // 永久后代必须消亡（gen ownedSpawn 的整组 KILL），私有根零残留
    const descendantPid = Number.parseInt(readFileSync(pidFile, 'utf8').trim(), 10)
    expect(Number.isInteger(descendantPid)).toBe(true)
    await expectPidGone(descendantPid, 'gen 永久后代')
    await expectNoMarker(processMarker, '父先退出脚本负控')
    expect(readdirSync(privateRoot)).toEqual([])
  })

  it('负控：依赖缺失时脚本 BLOCKED exit 2（此时未建工作目录，语义保留）', { timeout: 30_000 }, () => {
    // 用不存在的 python 可执行文件触发依赖探测 BLOCKED；此路径发生在建目录前，
    // 私有根同样必须为空。
    const missingRoot = makePrivateTmpRoot('blocked-dep-missing')
    negctlDirs.push(missingRoot)
    const missingRun = spawnSync(process.execPath, [ACCEPTANCE_SCRIPT], {
      encoding: 'utf-8',
      timeout: 25_000,
      env: privateTmpEnv(missingRoot, {
        CONTRACT_COPILOT_PYTHON: 'cc-definitely-missing-python3-negative-control',
      }),
    })
    expect(missingRun.status, `stdout: ${missingRun.stdout}\nstderr: ${missingRun.stderr}`).toBe(2)
    expect(missingRun.stderr).toContain('[force-edit-acceptance] BLOCKED')
    expect(missingRun.stderr).toContain('python3')
    expect(readdirSync(missingRoot)).toEqual([])
  })
})
