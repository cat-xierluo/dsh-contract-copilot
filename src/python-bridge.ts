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
 * 子进程输出收集上限（UTF-8 字节，每流独立）。CLI 正常输出为 KB 级；失控
 * 子进程（如死循环打印）无上限累加会把 host 拖入 GB 级 old-space 累积
 * （2026-09-10 定界：同款无上限收集模式在 vitest worker 内 2.1GB 堆打满后
 * V8 OOM）。8MiB 覆盖最大合法输出并在病态时保证收集端有界。截断方向保尾
 * （Q46 F2）：判类标记（apply_review_plan.py 在 SystemExit(1) 前写入
 * stderr 的完整性失败块与「存在失败项」）和 parseStdout 解析的收尾
 * summary 行（产物路径/执行统计）都在输出末端，下游 apply.ts 也按
 * stderr 尾部（slice(-1500)）向用户展示失败明细。
 */
const OUTPUT_CAP_BYTES = 8 * 1024 * 1024

/**
 * 保尾有界收集器（每流一个实例）：UTF-8 字节计量，保留最新
 * OUTPUT_CAP_BYTES 字节、淘汰最旧字节；达上限后继续消费 data 事件排空
 * 管道——否则失控子进程写满管道缓冲后会永久阻塞，close 事件不会到来。
 * 无界累计防线：单个 chunk 已达上限时直接只留其尾部，不与既有内容合并；
 * 其余情况仅在超限或碎片过多时合并一次并立即裁剪回上限，内存瞬态
 * ≤ 上限 + 单个 chunk，无逐次重扫或成比例放大（Q46 F1 行为测试锁定）。
 */
class OutputTailBuffer {
  private parts: Buffer[] = []
  private bytes = 0

  push(chunk: Buffer): void {
    if (chunk.length >= OUTPUT_CAP_BYTES) {
      this.parts = [chunk.subarray(chunk.length - OUTPUT_CAP_BYTES)]
      this.bytes = OUTPUT_CAP_BYTES
      return
    }
    this.parts.push(chunk)
    this.bytes += chunk.length
    if (this.bytes <= OUTPUT_CAP_BYTES && this.parts.length <= 16) return
    const merged = this.parts.length === 1 ? this.parts[0] : Buffer.concat(this.parts, this.bytes)
    this.parts = [merged.subarray(Math.max(0, merged.length - OUTPUT_CAP_BYTES))]
    this.bytes = this.parts[0].length
  }

  /** 收尾解码。裁剪缝可能切开多字节 UTF-8 序列：跳过开头的 continuation 字节。 */
  decode(): string {
    const merged = Buffer.concat(this.parts, this.bytes)
    let start = 0
    while (start < merged.length && (merged[start] & 0xc0) === 0x80) start += 1
    return merged.toString('utf8', start)
  }
}

/** 异步执行 CLI 并分类。仅 spawn 本身失败（如找不到 python）才 reject。 */
export function runApplyCli(args: ApplyCliArgs): Promise<BridgeResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(args.pythonExecutable, buildArgv(args), {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: args.environment === undefined ? process.env : { ...process.env, ...args.environment },
      signal: args.signal,
    })
    const stdoutTail = new OutputTailBuffer()
    const stderrTail = new OutputTailBuffer()
    child.stdout.on('data', (chunk: Buffer) => { stdoutTail.push(chunk) })
    child.stderr.on('data', (chunk: Buffer) => { stderrTail.push(chunk) })
    child.on('error', reject)
    child.on('close', (code) => {
      const stdout = stdoutTail.decode()
      const stderr = stderrTail.decode()
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
