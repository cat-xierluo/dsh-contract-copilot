/**
 * Python CLI bridge：异步 spawn apply_review_plan.py，并按退码分类结果。
 *
 * 设计约束（设计稿 §4.4 / §6.2）：
 * - 一律显式传参，不依赖 Python 非交互默认值（review_intensity 缺失会静默"强势"）。
 * - 异步 spawn（apply 可能运行数分钟，spawnSync 会冻结整个 harness）。
 * - 退码四分类：success / rejected(integrity) / partial(存在失败项) / error。
 * - 取消/超时的进程所有权：abort 先 SIGTERM，经过可注入的短 grace 仍存活则
 *   SIGKILL；Promise 仅在 child close（或明确 spawn 失败）后 settle——不使用
 *   spawn 内建 signal 选项（其 AbortError 会立即 settle 且子进程可能成为孤儿）。
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

/**
 * 异步执行 CLI 并分类。
 *
 * settle 时机只有两种：
 * 1. child close（正常退出或被本函数 TERM/KILL 终止）→ resolve；
 * 2. spawn 本身明确失败（如找不到 python 的 ENOENT error 事件）→ reject。
 * abort 不走 error 事件：先 SIGTERM，宽限期内仍存活则升级 SIGKILL，
 * 但 Promise 一定等到 close 才 settle，保证调用方拿到结果时子进程已消亡、
 * 输出监听与计时器已清理，不会留下静默孤儿进程。
 */
export function runApplyCli(args: ApplyCliArgs): Promise<BridgeResult> {
  return new Promise((resolve, reject) => {
    // 注意：不把 signal 交给 spawn——内建实现收到 abort 会立即发 AbortError
    // 并 destroy 流，子进程若忽略 SIGTERM 就成为孤儿；这里手工实现升级链。
    const child = spawn(args.pythonExecutable, buildArgv(args), {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: args.environment === undefined ? process.env : { ...process.env, ...args.environment },
    })
    const graceMs = args.terminateGraceMs ?? DEFAULT_TERMINATE_GRACE_MS
    let stdout = ''
    let stderr = ''
    let settled = false
    let graceTimer: NodeJS.Timeout | undefined
    let abortListener: (() => void) | undefined

    const cleanup = () => {
      if (graceTimer !== undefined) clearTimeout(graceTimer)
      if (abortListener !== undefined) args.signal?.removeEventListener('abort', abortListener)
      child.removeAllListeners()
      child.stdout?.removeAllListeners()
      child.stderr?.removeAllListeners()
    }

    /** 已退出（含被信号终止）则不再发信号；close 即将自然到达。 */
    const isAlive = () => child.exitCode === null && child.signalCode === null

    const escalate = () => {
      if (settled || !isAlive()) return
      child.kill('SIGTERM')
      graceTimer = setTimeout(() => {
        if (!settled && isAlive()) child.kill('SIGKILL')
      }, graceMs)
      // graceTimer 在 close/error 的 cleanup 统一清除，不泄漏。
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

    child.on('close', (code) => {
      if (settled) return
      settled = true
      cleanup()
      resolve({
        kind: classify(code, stderr),
        exitCode: code,
        stdout,
        stderr,
        parsed: parseStdout(stdout),
      })
    })
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
