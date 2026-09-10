/**
 * Python CLI bridge：异步 spawn apply_review_plan.py，并按退码分类结果。
 *
 * 设计约束（设计稿 §4.4 / §6.2）：
 * - 一律显式传参，不依赖 Python 非交互默认值（review_intensity 缺失会静默"强势"）。
 * - 异步 spawn（apply 可能运行数分钟，spawnSync 会冻结整个 harness）。
 * - 退码四分类：success / rejected(integrity) / partial(存在失败项) / error。
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

/**
 * 子进程输出收集上限（字符）。CLI 正常输出为 KB 级；失控子进程（如死循环
 * 打印）无上限累加会把 host 拖入 GB 级 old-space 累积（2026-09-10 定界：
 * 同款无上限收集模式在 vitest worker 内 2.1GB 堆打满后 V8 OOM）。8MiB
 * 覆盖最大合法输出并在病态时保证收集端有界；分类特征（classify）位于
 * stderr 前部，保头部截断不影响判类。
 */
const OUTPUT_CAP_CHARS = 8 * 1024 * 1024

function appendCapped(current: string, chunk: string): string {
  if (current.length >= OUTPUT_CAP_CHARS) return current
  const room = OUTPUT_CAP_CHARS - current.length
  return current + (chunk.length <= room ? chunk : chunk.slice(0, room))
}

/** 异步执行 CLI 并分类。仅 spawn 本身失败（如找不到 python）才 reject。 */
export function runApplyCli(args: ApplyCliArgs): Promise<BridgeResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(args.pythonExecutable, buildArgv(args), {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: args.environment === undefined ? process.env : { ...process.env, ...args.environment },
      signal: args.signal,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => { stdout = appendCapped(stdout, chunk) })
    child.stderr.on('data', (chunk: string) => { stderr = appendCapped(stderr, chunk) })
    child.on('error', reject)
    child.on('close', (code) => {
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
