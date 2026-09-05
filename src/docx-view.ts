/**
 * 把 OOXML 渲染成可视化 HTML：合同段落 + 修订批注高亮 + 批注气泡。
 *
 * 设计取舍：plugin 已硬依赖 python3（apply_review_plan.py），所以用 python3
 * 的 zipfile 模块抽取 word/document.xml 和 word/comments.xml——避免再拉
 * JS 的 unzip/zip 依赖。抽取本身是有界异步子进程（DECISIONS.md Q44）：
 * 同步 spawn 会冻结 DSH Host 事件循环，且大 DOCX 或慢 Python 无法中断；
 * 异步实现带超时上限、可选 AbortSignal 取消和 32 MiB 输出上限。
 *
 * 渲染器是纯函数（输入 XML 字符串 → 输出 HTML），便于单测；实际 DOCX
 * 抽取在 extractDocxParts 里，纯渲染逻辑分离。
 *
 * 范围限定：支持段落、w:pPr 标题样式、w:r/w:t 文本、w:ins 修订插入、
 * w:del 修订删除（用 delText）、w:commentRangeStart/End/Reference 批注、
 * comments.xml 批注正文。表格、嵌入对象、图片、域代码、复杂样式按
 * 不支持处理（线性化为段落）。
 *
 * 批注锚点模型：每条批注获得内容派生的稳定 anchorId（OOXML w:id 在 Word
 * 重存时会被重新编号，不可依赖）。范围标记（commentRangeStart..End）能在
 * 同一段落内重建时，正文输出 <span data-cc-anchor> 精确包裹；否则走确定性
 * 降级（原因 + 可见的引用点段落），绝不发明错误目标。HTML 标记与 anchor
 * 元数据由同一趟渲染产出：真实计划终点被消费并闭合时，锚点为 exact 且正文
 * 存在对应 <span data-cc-anchor>；终点未被消费时（异常 OOXML 提前停止）
 * 元数据降级为 fallback，且正文不物化该锚点的任何 data-cc-anchor 元素，
 * 避免 Client 把空壳/截断范围当成功导航目标。
 */

import { spawn } from 'node:child_process'
import { unlinkSync, writeFileSync } from 'node:fs'
import type { CommentAnchor, CommentAnchorFallbackReason, DocComment } from './workbench-protocol.ts'

export type DocxComment = {
  author: string
  date: string
  text: string
}

export type DocxParts = {
  documentXml: string
  commentsXml: string
}

/** 单次抽取 stdout/stderr 各自的输出上限（字节）；超过即终止子进程。 */
export const DOCX_EXTRACT_MAX_OUTPUT_BYTES = 32 * 1024 * 1024

/** 抽取失败的可区分语义；调用方按 kind 决定持久化失败还是静默取消。 */
export type DocxExtractFailureKind =
  | 'aborted'
  | 'timeout'
  | 'spawn-failed'
  | 'nonzero-exit'
  | 'output-too-large'
  | 'malformed-output'

/** 抽取失败的领域错误；kind 保证机器可判，message 面向人与工作台提示。 */
export class DocxExtractionError extends Error {
  constructor(
    readonly kind: DocxExtractFailureKind,
    message: string,
    readonly exitCode?: number | null,
    readonly exitSignal?: NodeJS.Signals,
  ) {
    super(message)
    this.name = 'DocxExtractionError'
  }
}

/**
 * 用 python3 zipfile 抽取 document.xml + comments.xml（Promise API）。
 * pythonExecutable 可通过 Config.workbench.pythonExecutable 覆盖（默认 python3）；
 * timeoutMs 来自 Config.workbench.docxExtractionTimeoutMs；可选 signal 传播上游取消。
 *
 * 失败语义：aborted（上游取消，非合同损坏）、timeout、spawn-failed、
 * nonzero-exit（含 python 对坏 DOCX 的非零退码）、output-too-large、
 * malformed-output（缺 ===DOC===/===COM=== 标记）。以 DocxExtractionError 抛出。
 *
 * 实现：把脚本写进临时文件后用 `<python> <tmpfile> <docx>` 调用——避免
 * -c 在多行结构里 `;` 分隔造成的语法坑。临时脚本在 finally 清理；超时或
 * 取消时 SIGKILL 子进程并等待其 close 后才 settle，绝不遗留僵尸进程。
 */
export async function extractDocxParts(
  docxPath: string,
  pythonExecutable: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<DocxParts> {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error(`contract-copilot workbench: 抽取参数 timeoutMs 必须是正整数毫秒，收到 ${String(timeoutMs)}`)
  }
  const script = [
    'import sys, zipfile',
    'z = zipfile.ZipFile(sys.argv[1])',
    'def safe(name):',
    '    try:',
    '        return z.read(name).decode("utf-8")',
    '    except KeyError:',
    '        return ""',
    'sys.stdout.write("===DOC===\\n" + safe("word/document.xml"))',
    'sys.stdout.write("\\n===COM===\\n" + safe("word/comments.xml"))',
  ].join('\n')
  const tmpScript = `${process.env.TMPDIR ?? '/tmp'}/cc-docx-${process.pid}-${Date.now()}.py`
  writeFileSync(tmpScript, script, 'utf8')
  try {
    return await runDocxExtractor(pythonExecutable, [tmpScript, docxPath], timeoutMs, signal)
  } finally {
    try { unlinkSync(tmpScript) } catch { /* 清理失败不影响 */ }
  }
}

/**
 * 有界异步抽取子进程：单次 settle，输出超限即杀；超时/取消先 SIGKILL 并等
 * close 再 reject，因此 rejection 时子进程必然已经退出。失败优先级：
 * aborted > timeout > output-too-large > spawn-failed > nonzero-exit > malformed。
 */
function runDocxExtractor(
  pythonExecutable: string,
  args: string[],
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<DocxParts> {
  return new Promise<DocxParts>((resolve, reject) => {
    let settled = false
    let timedOut = false
    let aborted = false
    let tooLarge = false
    let killPending = false
    let spawnError: Error | undefined
    let stdoutBytes = 0
    let stderrBytes = 0
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []

    const kill = (): void => {
      // spawn 尚未完成（pid 未分配）时 kill() 是 no-op：挂起并在 'spawn' 事件补杀
      if (child.pid === undefined) {
        killPending = true
        return
      }
      try { child.kill('SIGKILL') } catch { /* 进程已退出时不抛错 */ }
    }
    const onAbort = (): void => {
      aborted = true
      kill()
    }

    const child = spawn(pythonExecutable, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const timer = setTimeout(() => {
      timedOut = true
      kill()
    }, timeoutMs)
    child.on('spawn', () => {
      if (killPending) kill()
    })
    if (signal === undefined) {
      // 无上游取消面
    } else if (signal.aborted) {
      onAbort()
    } else {
      signal.addEventListener('abort', onAbort, { once: true })
    }

    const finish = (settle: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      settle()
    }
    /** 单次收束：优先级 aborted > timeout > output-too-large > spawn-failed > 退码 > 标记。 */
    const decide = (closeSignal: NodeJS.Signals | null, exitCode: number | null): void => {
      if (aborted) {
        reject(new DocxExtractionError(
          'aborted',
          'contract-copilot workbench: DOCX 抽取已取消（上游中止）',
          undefined,
          closeSignal ?? undefined,
        ))
        return
      }
      if (timedOut) {
        reject(new DocxExtractionError(
          'timeout',
          `contract-copilot workbench: DOCX 抽取超时（上限 ${timeoutMs}ms），已终止子进程`,
          undefined,
          closeSignal ?? undefined,
        ))
        return
      }
      if (tooLarge) {
        reject(new DocxExtractionError(
          'output-too-large',
          `contract-copilot workbench: DOCX 抽取输出超过 ${DOCX_EXTRACT_MAX_OUTPUT_BYTES} 字节上限，已终止子进程`,
        ))
        return
      }
      if (spawnError !== undefined) {
        reject(new DocxExtractionError(
          'spawn-failed',
          `contract-copilot workbench: 无法启动 ${pythonExecutable}: ${spawnError.message}`,
        ))
        return
      }
      if (exitCode !== 0) {
        reject(new DocxExtractionError(
          'nonzero-exit',
          `contract-copilot workbench: python 抽取 DOCX 失败（exit ${exitCode ?? 'null'}）: `
            + Buffer.concat(stderrChunks).toString('utf-8').slice(0, 200),
          exitCode,
        ))
        return
      }
      const out = Buffer.concat(stdoutChunks).toString('utf-8')
      const docIdx = out.indexOf('===DOC===')
      const comIdx = out.indexOf('===COM===')
      if (docIdx < 0 || comIdx < 0) {
        reject(new DocxExtractionError('malformed-output', 'contract-copilot workbench: DOCX 抽取输出格式异常'))
        return
      }
      resolve({
        documentXml: out.slice(docIdx + '===DOC==='.length, comIdx).replace(/^\n/, ''),
        commentsXml: out.slice(comIdx + '===COM==='.length).replace(/^\n/, ''),
      })
    }

    const collect = (stream: NodeJS.ReadableStream, chunks: Buffer[], isStdout: boolean): void => {
      stream.on('data', (chunk: Buffer) => {
        const total = (isStdout ? stdoutBytes : stderrBytes) + chunk.length
        if (isStdout) stdoutBytes = total
        else stderrBytes = total
        if (total <= DOCX_EXTRACT_MAX_OUTPUT_BYTES) chunks.push(chunk)
        if (total > DOCX_EXTRACT_MAX_OUTPUT_BYTES && !tooLarge) {
          tooLarge = true
          kill()
        }
      })
    }
    collect(child.stdout, stdoutChunks, true)
    collect(child.stderr, stderrChunks, false)

    // spawn 失败（ENOENT 等）只发 error：终止并立即收束，单次 settle 保证与 close 竞态安全
    child.on('error', (error: Error) => {
      spawnError = error
      kill()
      finish(() => decide(null, null))
    })
    child.on('close', (code, closeSignal) => {
      finish(() => decide(closeSignal, code))
    })
  })
}

/** XML 实体解码：数值（&#NNN; /&#xNNNN;）+ 5 个命名实体。 */
export function decodeEntities(xml: string): string {
  return xml
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/**
 * 解析 word/comments.xml → id → {author, date, text}。
 * 批注正文是多段（多个 <w:p>），合并所有 <w:t> 文本。
 */
export function parseCommentsXml(xml: string): Map<string, DocxComment> {
  const map = new Map<string, DocxComment>()
  if (xml === '') return map
  const blockRe = /<w:comment\s+([^>]*?)>([\s\S]*?)<\/w:comment>/g
  const idAttr = /\bw:id="([^"]+)"/
  const authorAttr = /\bw:author="([^"]+)"/
  const dateAttr = /\bw:date="([^"]+)"/
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(xml)) !== null) {
    const attrs = m[1] ?? ''
    const body = m[2] ?? ''
    const id = idAttr.exec(attrs)?.[1]
    if (id === undefined) continue
    const author = authorAttr.exec(attrs)?.[1] ?? '?'
    const date = dateAttr.exec(attrs)?.[1] ?? ''
    const text = decodeEntities((body.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? []).join('')).replace(/<w:t[^>]*>|<\/w:t>/g, '')
    // 上面的 replace 是冗余保险（match 已剥），但保留对 XML 嵌套鲁棒
    map.set(id, { author, date, text })
  }
  return map
}

/** 段落级 HTML 转义（保留文本，但禁用 HTML）。 */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const textEncoder = new TextEncoder()

/** FNV-1a 32 位；两个不同 basis 各跑一遍拼成 16 位 hex，降低碰撞面。 */
function fnv1a32(bytes: Uint8Array, basis: number): string {
  let hash = basis >>> 0
  for (const byte of bytes) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/**
 * 批注稳定锚点 id：由 author/date/text 内容派生（跨 Word 重存稳定），
 * 格式 `ccm-<16 hex>`；内容完全相同的重复批注按出现顺序追加 -2/-3 后缀。
 */
export function assignCommentAnchorIds(comments: Map<string, DocxComment>): Map<string, string> {
  const anchorIds = new Map<string, string>()
  const seen = new Map<string, number>()
  for (const [id, comment] of comments) {
    const bytes = textEncoder.encode(`${comment.author}\u0000${comment.date}\u0000${comment.text}`)
    const base = `ccm-${fnv1a32(bytes, 0x811c9dc5)}${fnv1a32(bytes, 0x811c9dc5 ^ 0x9e3779b9)}`
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    anchorIds.set(id, count === 1 ? base : `${base}-${count}`)
  }
  return anchorIds
}

/** 与渲染器完全一致的切段：返回参与渲染的段落 inner，数组下标即 paragraphIndex。 */
function splitParagraphInners(documentXml: string): string[] {
  const paraBlocks = documentXml
    .split(/(?=<w:p(?:\s|>|\/>))/)
    .filter((block) => block.includes('<w:p') && block.includes('</w:p>') || block.includes('<w:p/>'))
  const inners: string[] = []
  for (const block of paraBlocks) {
    if (block.trim() === '' || block === '<w:p/>') continue
    const closingIdx = block.indexOf('</w:p>')
    if (closingIdx < 0) continue
    inners.push(block.slice(0, closingIdx))
  }
  return inners
}

/** 可见批注标记出现位置（inner 坐标；start/end 为标签起止）。 */
type RangeMarker = { id: string; paragraphIndex: number; start: number; end: number }

type ParagraphScan = {
  starts: RangeMarker[]
  ends: RangeMarker[]
  refs: Array<{ id: string; paragraphIndex: number }>
  /** 落在 ins/del 块内的范围标记 id（渲染器不会为其产出任何标记）。 */
  hiddenStartIds: Set<string>
  hiddenEndIds: Set<string>
}

/**
 * 单段扫描批注标记，并按渲染器的可见性规则分类：渲染器把 <w:ins>/<w:del>
 * 整块消费（只抽取文本），块内的批注标记不会产出任何输出 → 视为隐藏。
 */
function scanParagraphMarkers(inner: string, paragraphIndex: number): ParagraphScan {
  const scan: ParagraphScan = {
    starts: [], ends: [], refs: [], hiddenStartIds: new Set(), hiddenEndIds: new Set(),
  }
  const hidden: Array<[number, number]> = []
  const trackedRe = /<\/?w:(ins|del)\b[^>]*>/g
  let t: RegExpExecArray | null
  while ((t = trackedRe.exec(inner)) !== null) {
    if (t[0].startsWith('</')) continue
    const closeTag = `</w:${t[1]}>`
    const closeIdx = inner.indexOf(closeTag, t.index + t[0].length)
    // 渲染器遇到未闭合 ins/del 会放弃本段剩余部分 → 一律按隐藏处理
    const spanEnd = closeIdx < 0 ? inner.length : closeIdx + closeTag.length
    hidden.push([t.index, spanEnd])
    trackedRe.lastIndex = spanEnd
  }
  const inHidden = (offset: number): boolean => hidden.some(([from, to]) => offset >= from && offset < to)
  const markerRe = /<w:(commentRangeStart|commentRangeEnd|commentReference)\b[^>]*>/g
  let m: RegExpExecArray | null
  while ((m = markerRe.exec(inner)) !== null) {
    const id = /\bw:id="([^"]+)"/.exec(m[0])?.[1]
    if (id === undefined) continue
    if (m[1] === 'commentRangeStart') {
      if (inHidden(m.index)) scan.hiddenStartIds.add(id)
      else scan.starts.push({ id, paragraphIndex, start: m.index, end: m.index + m[0].length })
    } else if (m[1] === 'commentRangeEnd') {
      if (inHidden(m.index)) scan.hiddenEndIds.add(id)
      else scan.ends.push({ id, paragraphIndex, start: m.index, end: m.index + m[0].length })
    } else if (!inHidden(m.index)) {
      scan.refs.push({ id, paragraphIndex })
    }
  }
  return scan
}

/** 单条批注的渲染计划：要么精确包裹，要么确定性降级。 */
type CommentRangePlan =
  | { kind: 'exact'; anchorId: string; paragraphIndex: number; startOffset: number; endOffset: number; quote: string }
  | { kind: 'fallback'; anchorId: string; anchor: CommentAnchor }

/**
 * 全文扫描 + 逐批注决策。精确条件：某一段落内存在 start 之后最近的可见 end。
 * 降级原因判定只依赖可见/隐藏标记的存在性，与渲染器能力一致，因此对同一
 * 输入永远给出同一结果。
 */
function planCommentAnchors(
  inners: string[],
  comments: Map<string, DocxComment>,
  anchorIds: Map<string, string>,
): Map<string, CommentRangePlan> {
  const plans = new Map<string, CommentRangePlan>()
  const acc = new Map<string, {
    starts: RangeMarker[]
    ends: RangeMarker[]
    refs: Array<{ id: string; paragraphIndex: number }>
  }>()
  const entryFor = (id: string) => {
    let entry = acc.get(id)
    if (entry === undefined) {
      entry = { starts: [], ends: [], refs: [] }
      acc.set(id, entry)
    }
    return entry
  }
  const hiddenStartIds = new Set<string>()
  const hiddenEndIds = new Set<string>()
  inners.forEach((inner, paragraphIndex) => {
    const scan = scanParagraphMarkers(inner, paragraphIndex)
    for (const marker of scan.starts) entryFor(marker.id).starts.push(marker)
    for (const marker of scan.ends) entryFor(marker.id).ends.push(marker)
    for (const ref of scan.refs) entryFor(ref.id).refs.push(ref)
    for (const id of scan.hiddenStartIds) hiddenStartIds.add(id)
    for (const id of scan.hiddenEndIds) hiddenEndIds.add(id)
  })

  function withParagraph(reason: CommentAnchorFallbackReason, paragraphIndex: number | undefined): CommentAnchor {
    return paragraphIndex === undefined
      ? { status: 'fallback', reason }
      : { status: 'fallback', reason, paragraphIndex }
  }

  for (const [id] of comments) {
    const anchorId = anchorIds.get(id)
    if (anchorId === undefined) continue
    const entry = acc.get(id)
    const refs = entry?.refs ?? []
    const starts = entry?.starts ?? []
    const ends = entry?.ends ?? []
    const hiddenStart = hiddenStartIds.has(id)
    const hiddenEnd = hiddenEndIds.has(id)
    const refParagraph = refs[0]?.paragraphIndex
    const firstStartParagraph = starts[0]?.paragraphIndex

    // 精确锚定：按段落顺序找第一对“start 之后最近的 end”
    let exact: { paragraphIndex: number; startOffset: number; endOffset: number; quote: string } | undefined
    outer:
    for (let paragraphIndex = 0; paragraphIndex < inners.length; paragraphIndex++) {
      const startsInPara = starts.filter((marker) => marker.paragraphIndex === paragraphIndex)
      const endsInPara = ends.filter((marker) => marker.paragraphIndex === paragraphIndex)
      for (const startMarker of startsInPara) {
        const endMarker = endsInPara.find((marker) => marker.start >= startMarker.end)
        if (endMarker === undefined) continue
        const quote = decodeEntities(extractAllText(inners[paragraphIndex].slice(startMarker.end, endMarker.start)))
        exact = { paragraphIndex, startOffset: startMarker.start, endOffset: endMarker.start, quote }
        break outer
      }
    }
    if (exact !== undefined) {
      plans.set(id, { kind: 'exact', anchorId, ...exact })
      continue
    }

    if (starts.length === 0 && !hiddenStart) {
      const nothingInBody = starts.length === 0 && ends.length === 0 && !hiddenEnd && refs.length === 0
      if (nothingInBody) {
        plans.set(id, {
          kind: 'fallback',
          anchorId,
          anchor: { status: 'fallback', reason: 'orphan-comment' },
        })
      } else {
        plans.set(id, {
          kind: 'fallback',
          anchorId,
          anchor: withParagraph('range-missing', refParagraph),
        })
      }
      continue
    }
    if (starts.length > 0 && ends.length > 0) {
      plans.set(id, {
        kind: 'fallback',
        anchorId,
        anchor: withParagraph('range-crosses-paragraph', refParagraph ?? firstStartParagraph),
      })
      continue
    }
    if (hiddenStart || hiddenEnd) {
      plans.set(id, {
        kind: 'fallback',
        anchorId,
        anchor: withParagraph('range-in-tracked-change', refParagraph ?? firstStartParagraph),
      })
      continue
    }
    plans.set(id, {
      kind: 'fallback',
      anchorId,
      anchor: withParagraph('range-unclosed', refParagraph ?? firstStartParagraph),
    })
  }
  return plans
}

/**
 * 把 word/document.xml 渲染成 HTML（连同每条批注的锚点元数据）。
 *
 * 状态机走一遍：按 <w:p> 切段，每段内：
 *   - 提取 pStyle（标题级别 1-2 单独呈现）
 *   - 收集 run 文本：w:r 内的 w:t 是普通文本、w:delText 是已删除文本
 *     （保留可视化，但用 <del> 包裹）；w:ins 内嵌 run 同理（<ins> 包裹）
 *   - commentRangeStart/End 按计划包裹 <span data-cc-anchor> 范围标记，
 *     commentReference 输出带 data-cc-anchor 的气泡
 *
 * 异常段落（缺少闭合）→ 落回纯文本提取，不抛错；计划中起点已渲染但真实
 * 终点未被消费的精确包裹在元数据中降级为 fallback，且正文不物化对应的
 * data-cc-anchor 元素，保证 exact ⟺ 正文存在真实闭合的范围标记。
 */
export function renderDocumentWithAnchors(documentXml: string, comments: Map<string, DocxComment>): { html: string; comments: DocComment[] } {
  const anchorIds = assignCommentAnchorIds(comments)
  const inners = splitParagraphInners(documentXml)
  const plans = planCommentAnchors(inners, comments, anchorIds)
  // 只记录“计划终点标记被渲染消费且包裹成功闭合”的锚点 id；exact 只承认这些
  const closedPlannedEnds = new Set<string>()
  const html = inners
    .map((inner, paragraphIndex) => renderParagraph(inner, paragraphIndex, comments, anchorIds, plans, closedPlannedEnds))
    .join('')
  const projected: DocComment[] = []
  for (const [id, comment] of comments) {
    const anchorId = anchorIds.get(id)
      ?? `ccm-${fnv1a32(textEncoder.encode(id), 0x811c9dc5)}`
    const plan = plans.get(id)
    let anchor: CommentAnchor
    if (plan === undefined) {
      anchor = { status: 'fallback', reason: 'orphan-comment' }
    } else if (plan.kind === 'exact' && closedPlannedEnds.has(plan.anchorId)) {
      anchor = { status: 'exact', paragraphIndex: plan.paragraphIndex, quote: plan.quote }
    } else if (plan.kind === 'exact') {
      // 计划可行但真实终点未被渲染消费（异常 XML 提前放弃区间；段尾补闭合
      // 只保证 HTML 合法，不等于范围完整）→ 不谎报 exact
      anchor = { status: 'fallback', reason: 'range-unclosed', paragraphIndex: plan.paragraphIndex }
    } else {
      anchor = plan.anchor
    }
    projected.push({ id, author: comment.author, date: comment.date, text: comment.text, anchorId, anchor })
  }
  return { html, comments: projected }
}

/**
 * 兼容入口：只要 HTML 字符串的旧调用方。
 */
export function renderDocumentHtml(documentXml: string, comments: Map<string, DocxComment>): string {
  return renderDocumentWithAnchors(documentXml, comments).html
}

type RenderContext = {
  commentsMap: Map<string, DocxComment>
  anchorIds: Map<string, string>
  plans: Map<string, CommentRangePlan>
  chunks: string[]
  openWrap: (anchorId: string) => void
  closeWrap: (anchorId: string) => boolean
  /** 全文共享：计划终点被真实消费并成功闭合的锚点 id。 */
  closedPlannedEnds: Set<string>
}

function renderParagraph(
  inner: string,
  paragraphIndex: number,
  commentsMap: Map<string, DocxComment>,
  anchorIds: Map<string, string>,
  plans: Map<string, CommentRangePlan>,
  closedPlannedEnds: Set<string>,
): string {
  const pStyleMatch = /<w:pStyle\s+w:val="(Heading\d|Title)"\s*\/>/.exec(inner)
  const isHeading2 = pStyleMatch?.[1] === 'Heading2'
  const isHeading1 = pStyleMatch?.[1] === 'Heading1'
  const isTitle = pStyleMatch?.[1] === 'Title'

  const chunks: string[] = []
  const wrapStack: Array<{ anchorId: string; mark: number }> = []
  const openWrap = (anchorId: string): void => {
    wrapStack.push({ anchorId, mark: chunks.length })
  }
  /**
   * 在计划终点闭合指定锚点：只物化该锚点自己的开标签（含 data-cc-anchor）
   * 与一个配对 </span>；栈中位于其上的条目（嵌套在内、真实终点未到）一并
   * 弹出但保持惰性——不物化它们的锚点元素。锚点不在栈上（已被提前弹出或
   * 从未打开）时不输出任何东西并返回 false。
   */
  const closeWrap = (anchorId: string): boolean => {
    let idx = -1
    for (let i = wrapStack.length - 1; i >= 0; i--) {
      if (wrapStack[i].anchorId === anchorId) { idx = i; break }
    }
    if (idx < 0) return false
    chunks.push('</span>')
    const entry = wrapStack[idx]
    wrapStack.splice(idx)
    chunks.splice(entry.mark, 0, `<span class="cc-comment-anchor" data-cc-anchor="${entry.anchorId}">`)
    return true
  }
  const ctx: RenderContext = { commentsMap, anchorIds, plans, chunks, openWrap, closeWrap, closedPlannedEnds }

  let pos = 0
  while (pos < inner.length) {
    // 找下一个重要标签（含属性，便于解析 w:id）
    const rest = inner.slice(pos)
    const next = /<\/?w:(ins|del|commentRangeStart|commentRangeEnd|commentReference|r)\b[^>]*>/.exec(rest)
    if (next === null) {
      // 文本尾部（含 w:t 等）
      const trailingText = extractAllText(rest)
      if (trailingText !== '') chunks.push(escapeHtml(decodeEntities(trailingText)))
      break
    }
    const beforeText = rest.slice(0, next.index)
    if (beforeText !== '') {
      chunks.push(escapeHtml(decodeEntities(extractAllText(beforeText))))
    }
    const tagName = next[1] // ins/del/commentRangeStart/.../r
    const isClose = next[0].startsWith('</')
    const absOffset = pos + next.index
    if (tagName === 'commentRangeStart') {
      openPlannedWrap(ctx, /\bw:id="([^"]+)"/.exec(next[0])?.[1], absOffset)
      pos += next.index + next[0].length
      continue
    }
    if (tagName === 'commentRangeEnd') {
      closePlannedWrap(ctx, /\bw:id="([^"]+)"/.exec(next[0])?.[1], absOffset)
      pos += next.index + next[0].length
      continue
    }
    if (tagName === 'commentReference') {
      emitCommentBubble(chunks, /\bw:id="([^"]+)"/.exec(next[0])?.[1], commentsMap, anchorIds)
      pos += next.index + next[0].length
      continue
    }
    if (tagName === 'ins' || tagName === 'del') {
      // 包裹一段 run 块：找匹配的闭合标签
      const closeTag = `</w:${tagName}>`
      const closeIdx = inner.indexOf(closeTag, absOffset + next[0].length)
      if (closeIdx < 0) break
      const runText = extractAllText(inner.slice(absOffset + next[0].length, closeIdx))
      const cls = tagName === 'ins' ? 'cc-ins' : 'cc-del'
      const tag = tagName === 'ins' ? 'ins' : 'del'
      chunks.push(`<${tag} class="${cls}">${escapeHtml(decodeEntities(runText))}</${tag}>`)
      pos = closeIdx + closeTag.length
      continue
    }
    if (tagName === 'r' && !isClose) {
      // 单个 <w:r> ... </w:r>：里面可能有 <w:t>（输出文本）、
      // <w:commentReference>（输出气泡）、批注范围标记等子标签
      const closeTag = '</w:r>'
      const closeIdx = inner.indexOf(closeTag, absOffset + next[0].length)
      if (closeIdx < 0) break
      const runBody = inner.slice(absOffset + next[0].length, closeIdx)
      renderRunBody(runBody, absOffset + next[0].length, ctx)
      pos = closeIdx + closeTag.length
      continue
    }
    // 跳过其他开始/结束标签
    pos += next.index + next[0].length
  }
  // 段落收尾：真实终点未被消费的包裹直接丢弃——开标签从未进入 chunks，
  // 不物化即无残留，HTML 保持平衡；绝不为此输出 data-cc-anchor 空壳。
  wrapStack.length = 0
  const html = chunks.join('')
  if (html === '') return ''
  if (isHeading1 || isTitle) return `<h1>${html}</h1>`
  if (isHeading2) return `<h2>${html}</h2>`
  return `<p>${html}</p>`
}

/** 从 inner 提取所有 <w:t>/<w:delText> 文本（拼接；处理自闭合）。 */
function extractAllText(inner: string): string {
  let text = ''
  const re = /<(w:t|w:delText)(?:\s[^>]*)?>([^<]*)<\/\1>|<(w:t|w:delText)\s*\/>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(inner)) !== null) {
    text += m[2] ?? ''
  }
  return text
}

/**
 * 把 document.xml 投影成合同可见文本（纯函数，供分析回合提示注入）。
 *
 * 复用与渲染器完全一致的切段与文本抽取（splitParagraphInners + extractAllText），
 * 段落/表格单元格按文档顺序一段一行——避免"渲染 HTML 再剥标签"的语义漂移，
 * 也保证 Agent 看到的正文与工作台预览同源。空行丢弃、行首尾空白裁剪。
 */
export function extractContractText(documentXml: string): string {
  const lines: string[] = []
  for (const inner of splitParagraphInners(documentXml)) {
    const text = decodeEntities(extractAllText(inner)).trim()
    if (text !== '') lines.push(text)
  }
  return lines.join('\n')
}

/** 输出批注引用气泡；anchorId 已知时附带 data-cc-anchor 供正文寻址。 */
function emitCommentBubble(
  chunks: string[],
  id: string | undefined,
  commentsMap: Map<string, DocxComment>,
  anchorIds: Map<string, string>,
): void {
  if (id === undefined) return
  const c = commentsMap.get(id)
  if (c === undefined) return
  const anchorId = anchorIds.get(id)
  const attr = anchorId === undefined ? '' : ` data-cc-anchor="${anchorId}"`
  const label = escapeHtml(`${c.author.split('｜')[0] ?? c.author}：${c.text}`)
  chunks.push(`<sup class="cc-comment"${attr} title="${label}">💬</sup>`)
}

/** 命中计划中的精确起点时打开范围包裹。 */
function openPlannedWrap(ctx: RenderContext, id: string | undefined, absOffset: number): void {
  if (id === undefined) return
  const plan = ctx.plans.get(id)
  if (plan === undefined || plan.kind !== 'exact' || plan.startOffset !== absOffset) return
  ctx.openWrap(plan.anchorId)
}

/**
 * 命中计划中的精确终点时闭合范围包裹。只有终点标记被真实消费且包裹仍处于
 * 打开状态（closeWrap 成功闭合）才记入 closedPlannedEnds；终点未被消费的
 * 包裹在段尾被静默丢弃（不物化 data-cc-anchor 元素），因此「起点已输出、
 * 终点未消费」既不会被判成 exact，也不会在正文留下可导航的锚点元素。
 */
function closePlannedWrap(ctx: RenderContext, id: string | undefined, absOffset: number): void {
  if (id === undefined) return
  const plan = ctx.plans.get(id)
  if (plan === undefined || plan.kind !== 'exact' || plan.endOffset !== absOffset) return
  if (ctx.closeWrap(plan.anchorId)) ctx.closedPlannedEnds.add(plan.anchorId)
}

/** 渲染 <w:r> 内的内容：w:t → 文本、w:commentReference → 气泡、批注范围标记、w:tab → 缩进。 */
function renderRunBody(body: string, bodyBase: number, ctx: RenderContext): void {
  const { chunks } = ctx
  let pos = 0
  while (pos < body.length) {
    const rest = body.slice(pos)
    const m = /<w:(t|tab|commentReference|commentRangeStart|commentRangeEnd|br)(?:\s[^>]*)?(\/?)>?/.exec(rest)
    if (m === null) {
      // 剩余里可能是 w:t 文本（未带属性）
      const tail = extractAllText(rest)
      if (tail !== '') chunks.push(escapeHtml(decodeEntities(tail)))
      break
    }
    const tag = m[1]
    const tagEnd = pos + m.index + m[0].length
    if (tag === 't') {
      const close = body.indexOf('</w:t>', tagEnd)
      if (close < 0) break
      chunks.push(escapeHtml(decodeEntities(body.slice(tagEnd, close))))
      pos = close + '</w:t>'.length
      continue
    }
    if (tag === 'commentReference') {
      emitCommentBubble(chunks, /\bw:id="([^"]+)"/.exec(m[0])?.[1], ctx.commentsMap, ctx.anchorIds)
      pos = tagEnd
      continue
    }
    if (tag === 'commentRangeStart') {
      openPlannedWrap(ctx, /\bw:id="([^"]+)"/.exec(m[0])?.[1], bodyBase + pos + m.index)
      pos = tagEnd
      continue
    }
    if (tag === 'commentRangeEnd') {
      closePlannedWrap(ctx, /\bw:id="([^"]+)"/.exec(m[0])?.[1], bodyBase + pos + m.index)
      pos = tagEnd
      continue
    }
    if (tag === 'tab') {
      chunks.push('&nbsp;&nbsp;&nbsp;&nbsp;')
      pos = tagEnd
      continue
    }
    if (tag === 'br') {
      chunks.push('<br/>')
      pos = tagEnd
      continue
    }
    pos = tagEnd
  }
}
