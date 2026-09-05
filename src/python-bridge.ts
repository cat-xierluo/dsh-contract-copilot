/**
 * Python CLI bridge：异步 spawn apply_review_plan.py，并按退码分类结果。
 *
 * 设计约束（设计稿 §4.4 / §6.2）：
 * - 一律显式传参，不依赖 Python 非交互默认值（review_intensity 缺失会静默"强势"）。
 * - 异步 spawn（apply 可能运行数分钟，spawnSync 会冻结整个 harness）。
 * - 退码四分类：success / rejected(integrity) / partial(存在失败项) / error。
 * - 取消/超时的进程所有权（CC-V5-003-R3/R4）：拥有完整进程组/进程树——POSIX 上
 *   detached 让 Python 成为独立组长（pgid=pid），取消/超时只要尚未 settle 就对
 *   整树 SIGTERM，可注入 grace 后无条件整组 SIGKILL，并在 KILL 后的最终上界内
 *   无条件 settle（继承 stdout/stderr 的残留后代可能让 close 永不到达，上界保证
 *   Promise 一定返回；父进程是否已 exit 不决定树是否仍存在）。settle 时销毁本地
 *   stdio handle，事件循环不被残留管道拖住。不使用 spawn 内建 signal 选项
 *   （其 AbortError 会立即 settle 且子进程可能成为孤儿）。
 */

import { spawn } from 'node:child_process'

export interface ApplyCliArgs {
  readonly skillRoot: string
  readonly pythonExecutable: string
  readonly inputDocx: string
  readonly planPath: string
  readonly outputDocx: string
  readonly reportDocx: string
  readonly clientName: string
  readonly partyRole: string
  readonly reviewIntensity: string
  readonly editPolicy: string
  readonly author: string
  readonly organization: string
  readonly department?: string
  /** Optional isolated archive root; production callers use the skill default. */
  readonly archiveDir?: string
  /** Per-process environment overrides for isolated integration fixtures. */
  readonly environment?: NodeJS.ProcessEnv
  readonly signal?: AbortSignal
  /**
   * abort 后 SIGTERM → SIGKILL 升级的宽限期（ms）。默认 5s；集成测试注入更短值，
   * 确定性验证"TERM 被忽略 → 升级 KILL"路径，不依赖长 sleep。
   */
  readonly terminateGraceMs?: number
  /**
   * SIGKILL 之后等待 close 的最终上界（ms）。默认 2s。整组 KILL 后 close 理应
   * 立即到达；若仍有残留（如逃出进程组的后代继承 stdout/stderr），Promise 在
   * 该上界内无条件 settle，取消永远不会悬挂。
   */
  readonly killSettleMs?: number
}

/** 退码分类（§6.2）。partial/rejected 是域结果不是异常，进 canonical value。 */
export type BridgeKind = 'success' | 'rejected' | 'partial' | 'error'

export interface ParsedStats {
  applied: number
  failed: number
  skipped: number
  reportOnly: number
}

export interface BridgeResult {
  kind: BridgeKind
  exitCode: number | null
  stdout: string
  stderr: string
  parsed: {
    reviewedDocx?: string
    reportDocx?: string
    archiveDir?: string
    stats?: ParsedStats
  }
}

/** 拼装 CLI argv；独立导出便于单测。 */
export function buildArgv(args: ApplyCliArgs): string[] {
  const argv = [
    `${args.skillRoot}/scripts/review/apply_review_plan.py`,
    '--input', args.inputDocx,
    '--plan', args.planPath,
    '--output', args.outputDocx,
    '--report-docx', args.reportDocx,
    '--client-name', args.clientName,
    '--party-role', args.partyRole,
    '--review-intensity', args.reviewIntensity,
    '--edit-policy', args.editPolicy,
    '--author', args.author,
    '--organization', args.organization,
  ]
  if (args.department !== undefined && args.department !== '') argv.push('--department', args.department)
  if (args.archiveDir !== undefined && args.archiveDir !== '') argv.push('--archive-dir', args.archiveDir)
  return argv
}

/** abort 后 SIGTERM 宽限期默认值：真实 apply 有报告归档等收尾，不轻易 KILL。 */
const DEFAULT_TERMINATE_GRACE_MS = 5_000
/** SIGKILL 后等待 close 的最终上界默认值：整组 KILL 后 close 理应立即到达。 */
const DEFAULT_KILL_SETTLE_MS = 2_000

type TreeSignal = 'SIGTERM' | 'SIGKILL'

/**
 * 异步执行 CLI 并分类。
 *
 * settle 时机（互斥，settled 标志保证只有一次）：
 * 1. child close（stdio 全部关闭；正常退出或被本函数整组 TERM/KILL 终止）→ resolve；
 * 2. spawn 本身明确失败（如找不到 python 的 ENOENT error 事件）→ reject；
 * 3. 取消升级链的最终上界：TERM 后 grace 升级整组 KILL，再等 killSettleMs 仍无
 *    close 则用已捕获的输出与 exit 信息无条件 settle——继承 stdout/stderr 的
 *    残留后代不再能拖住 Promise。
 */
export function runApplyCli(args: ApplyCliArgs): Promise<BridgeResult> {
  return new Promise((resolve, reject) => {
    // 注意：不把 signal 交给 spawn——内建实现收到 abort 会立即发 AbortError
    // 并 destroy 流，子进程若忽略 SIGTERM 就成为孤儿；这里手工实现升级链。
    // POSIX detached：子进程 setsid 成独立会话/组长（pgid=pid），整组信号覆盖
    // 全部后代；Windows 无等价进程组，取消走 taskkill 树杀 fail-safe。
    const child = spawn(args.pythonExecutable, buildArgv(args), {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: args.environment === undefined ? process.env : { ...process.env, ...args.environment },
      detached: process.platform !== 'win32',
    })
    const graceMs = args.terminateGraceMs ?? DEFAULT_TERMINATE_GRACE_MS
    const killSettleMs = args.killSettleMs ?? DEFAULT_KILL_SETTLE_MS
    let stdout = ''
    let stderr = ''
    let settled = false
    let exitInfo: { code: number | null; signal: NodeJS.Signals | null } | undefined
    let graceTimer: NodeJS.Timeout | undefined
    let settleTimer: NodeJS.Timeout | undefined
    let abortListener: (() => void) | undefined

    const cleanup = () => {
      if (graceTimer !== undefined) clearTimeout(graceTimer)
      if (settleTimer !== undefined) clearTimeout(settleTimer)
      if (abortListener !== undefined) args.signal?.removeEventListener('abort', abortListener)
      child.removeAllListeners()
      child.stdout?.removeAllListeners()
      child.stderr?.removeAllListeners()
      // settle 后销毁本地管道端：forced settle 时 OS 管道可能仍被残留后代持有，
      // 不销毁会让 CLI 事件循环被残留管道拖住（正常 close 后为无害 no-op）。
      child.stdout?.destroy()
      child.stderr?.destroy()
    }

    /**
     * 终止整棵进程树：POSIX 对 -pid（进程组）发信号，后代随组长一起收信号；
     * 组已空（ESRCH）等异常回退为直接杀。Windows 没有 POSIX 进程组，用
     * taskkill /T /F 按树强杀（NOT_VERIFIED：开发与验证均在 darwin，本路径
     * 无法本机验证，仅作 fail-safe，不假装已验证）。
     */
    const signalTree = (sig: TreeSignal): void => {
      const pid = child.pid
      if (pid === undefined) return
      if (process.platform === 'win32') {
        try {
          spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' }).unref()
        } catch {
          // fail-safe 尽力而为；最终 settle 上界仍保证返回
        }
        return
      }
      try {
        process.kill(-pid, sig)
      } catch {
        try { child.kill(sig) } catch { /* 已消亡 */ }
      }
    }

    const finish = () => {
      if (settled) return
      settled = true
      cleanup()
      const code = exitInfo?.code ?? null
      resolve({
        kind: classify(code, stderr),
        exitCode: code,
        stdout,
        stderr,
        parsed: parseStdout(stdout),
      })
    }

    /**
     * 取消升级链：只要尚未 settle 就对拥有的整棵树发 TERM，grace 后无条件整组
     * KILL，并启动最终 settle 上界。不以"直接子进程已 exit"早退——后代持有的
     * stdout/stderr 仍能让 close 永不到达（R4 exit-before-close P1）。
     */
    const escalate = () => {
      if (settled) return
      signalTree('SIGTERM')
      graceTimer = setTimeout(() => {
        if (!settled) signalTree('SIGKILL')
      }, graceMs)
      // 最终 settle 上界：close 因残留后代持 pipe 永不到达时在此兜底，
      // 计时器在 finish 的 cleanup 统一清除，不泄漏。
      settleTimer = setTimeout(finish, graceMs + killSettleMs)
    }

    if (args.signal !== undefined) {
      if (args.signal.aborted) escalate()
      else {
        abortListener = escalate
        args.signal.addEventListener('abort', abortListener, { once: true })
      }
    }

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => { stdout += chunk })
    child.stderr.on('data', (chunk: string) => { stderr += chunk })

    // 仅 spawn 本身失败才 reject（abort 杀进程不产生 error 事件）；
    // 之后即便个别平台再补发 close，settled 已挡住双重 settle。
    child.on('error', (error) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    })

    // exit 先于 close：先记录退码/信号，等 stdio 全部关闭（close）或上界兜底再 settle。
    child.on('exit', (code, signal) => { exitInfo = { code, signal } })
    child.on('close', () => { finish() })
  })
}

/** 退码 + stderr 文本特征 → 四分类。判据来自 apply_review_plan.py 实测输出。 */
export function classify(exitCode: number | null, stderr: string): BridgeKind {
  if (exitCode === 0) return 'success'
  if (exitCode === null) return 'error'
  if (stderr.includes('报告未通过完整性复核')) return 'rejected'
  if (stderr.includes('存在失败项')) return 'partial'
  return 'error'
}

/** 解析 stdout 尾部固定行（输出路径与统计）。CLI 执行期间无流式输出（§3.3 限制 1）。 */
export function parseStdout(stdout: string): BridgeResult['parsed'] {
  const line = (prefix: string): string | undefined => {
    const match = stdout.match(new RegExp(`^${prefix}: (.+)$`, 'mu'))
    return match?.[1]?.trim()
  }
  const stats = stdout.match(/^执行统计: 成功=(\d+)，失败=(\d+)，跳过=(\d+)，仅意见书=(\d+)$/mu)
  return {
    reviewedDocx: line('输出 DOCX'),
    reportDocx: line('输出报告 DOCX'),
    archiveDir: line('归档目录'),
    stats: stats === null
      ? undefined
      : { applied: Number(stats[1]), failed: Number(stats[2]), skipped: Number(stats[3]), reportOnly: Number(stats[4]) },
  }
}
