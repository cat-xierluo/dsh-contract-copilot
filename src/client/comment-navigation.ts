/**
 * 批注双向导航控制器（CC-V4-005）：在渲染好的 DOCX DOM 里按批注 id 定位、
 * 滚动、聚焦并做短暂高亮，未命中返回可解释原因，供 CC-V4-003 接入工作台。
 *
 * 零依赖、零全局 DOM 访问：所有 DOM 能力都通过 NavigationEnvironment 端口
 * 注入，测试用内存假 DOM 即可确定性验证（无需 jsdom/真实浏览器）；生产环境
 * 用 createDomNavigationEnvironment 适配真实 document。
 *
 * docx-preview@0.4.0 的 DOM 事实（源码 dist/docx-preview.mjs 核实，非记忆）：
 *   - renderComments 开启时，批注范围/引用以 XML 注释节点落 DOM：
 *       `start of comment #<id>`、`end of comment #<id>`、
 *       `comment #<id> by <author> on <date>`（date 经 toLocaleString，不可依赖）。
 *   - 引用气泡 span.<className>-comment-ref 与气泡 div.<className>-comment-popover
 *     是引用注释节点的相邻后续兄弟（h("#fragment") 展开进段落）。
 *   - 范围高亮走 CSS Custom Highlight API（Range 存于 renderer 私有 commentMap，
 *     不对外暴露），Highlight 不可用时仅失去范围底色，导航不受影响。
 *   - ref/popover/wrapper class 全部是 `${options.className}-…` 插值；0.4.0 的
 *     defaultOptions 自带 className: "docx" 且 renderDocument 会合并用户选项，
 *     所以省略该键时类名仍是 docx-*。工作台仍显式传 'docx'（见 Workbench 的
 *     wordRenderOptions）把这条契约钉死，不随上游默认值漂移。
 * 因此 id 精确策略以注释节点文本为锚，而不是 CSS 选择器；属性/序数/文本策略
 * 作为其他渲染器（含 docx-view.ts 旧渲染）的降级路径。
 */

import type { DocComment } from '../workbench-protocol.ts'

/** 导航端口里的最小节点结构（真实 Element/Node 结构上天然满足）。 */
export interface NavNode {
  readonly nodeType: number
  readonly textContent: string | null
  readonly parentElement: NavElement | null
  readonly nextElementSibling: NavElement | null
  readonly previousSibling: NavNode | null
}

/** 导航端口里的最小元素结构。 */
export interface NavElement extends NavNode {
  readonly tagName: string
  /** 读取数据属性（生产实现：Element.getAttribute；缺失返回 null）。 */
  getAttribute(name: string): string | null
}

// ---------------------------------------------------------------------------
// docx-preview 注释节点文本的纯解析
// ---------------------------------------------------------------------------

export type CommentMarkerKind = 'range-start' | 'range-end' | 'reference'

export interface CommentMarker {
  readonly kind: CommentMarkerKind
  readonly commentId: string
}

const RANGE_START_PREFIX = 'start of comment #'
const RANGE_END_PREFIX = 'end of comment #'
const REFERENCE_PREFIX = 'comment #'
const REFERENCE_SEPARATOR = ' by '

/**
 * 解析 docx-preview 写入 DOM 的 XML 注释节点文本。
 * 仅认这三种前缀格式，其他文本（含普通注释）返回 null。
 */
export function parseCommentMarkerText(text: string | null): CommentMarker | null {
  if (text === null) return null
  if (text.startsWith(RANGE_START_PREFIX)) {
    return { kind: 'range-start', commentId: text.slice(RANGE_START_PREFIX.length) }
  }
  if (text.startsWith(RANGE_END_PREFIX)) {
    return { kind: 'range-end', commentId: text.slice(RANGE_END_PREFIX.length) }
  }
  if (text.startsWith(REFERENCE_PREFIX)) {
    const separatorIdx = text.indexOf(REFERENCE_SEPARATOR, REFERENCE_PREFIX.length)
    if (separatorIdx < 0) return null
    return { kind: 'reference', commentId: text.slice(REFERENCE_PREFIX.length, separatorIdx) }
  }
  return null
}

/**
 * 反向定位：从引用气泡元素解析所属批注 id（气泡的 previousSibling 是引用注释节点）。
 * 供工作台把“正文中的批注标记”映射回侧栏条目；无标记或解析失败返回 null。
 */
export function commentIdFromRefElement(element: NavElement): string | null {
  const marker = parseCommentMarkerText(element.previousSibling?.textContent ?? null)
  return marker?.kind === 'reference' ? marker.commentId : null
}

// ---------------------------------------------------------------------------
// 选择器转义（纯函数，不依赖浏览器 CSS.escape）
// ---------------------------------------------------------------------------

/**
 * 把任意字符串转成 CSS 属性选择器引号内的安全字面量：
 * 反斜杠与双引号逐字转义，控制字符用十六进制转义（带空格终结符）。
 * 其余字符（含 CJK、emoji、空格）在引号内合法，原样保留。
 */
export function escapeCssAttributeValue(value: string): string {
  let out = ''
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0
    if (ch === '\\' || ch === '"') {
      out += `\\${ch}`
    } else if (code < 0x20 || code === 0x7f) {
      out += `\\${code.toString(16).padStart(2, '0')} `
    } else {
      out += ch
    }
  }
  return out
}

/** 构造按批注 id 匹配数据属性的属性选择器（供给渲染器打点的约定属性）。 */
export function commentAttributeSelector(commentId: string, attributeName = 'data-cc-comment-id'): string {
  return `[${attributeName}="${escapeCssAttributeValue(commentId)}"]`
}

// ---------------------------------------------------------------------------
// DOM 端口与解析策略
// ---------------------------------------------------------------------------

/** 注入式 DOM 能力端口：模块只经由它触碰 DOM。 */
export interface NavigationEnvironment {
  /** root 子树内按文档序收集所有注释节点（生产实现：TreeWalker + SHOW_COMMENT）。 */
  commentNodes(root: NavNode): readonly NavNode[]
  /** 在 root 内按选择器查询（生产实现：root.querySelectorAll）。 */
  querySelectorAll(root: NavElement, selector: string): readonly NavElement[]
  scrollIntoView(element: NavElement, options: { readonly block: 'start' | 'center' | 'end' | 'nearest' }): void
  focus(element: NavElement): void
  addClass(element: NavElement, className: string): void
  removeClass(element: NavElement, className: string): void
  setTimeout(handler: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

/** 批注锚点描述：与 CC-V4-002 锚点模型按字段对接，全部可选字段提供降级线索。 */
export interface CommentAnchor {
  /** 批注 id（OOXML w:id 原样字符串，可含任意字符）。 */
  readonly commentId: string
  /** 引用气泡的文档序（0 起），仅作为 id 精确策略失败后的降级。 */
  readonly ordinal?: number
  /** 批注所圈正文片段，最后一级文本匹配降级用。 */
  readonly textHint?: string
  /** 引用气泡选择器（如 `.docx-comment-ref` / `.cc-comment`），序数策略必填。 */
  readonly refSelector?: string
}

export interface CommentNavigatorOptions {
  /** 数据属性名（属性策略）。默认 `data-cc-comment-id`。 */
  readonly attributeName?: string
  /** 锚点未给 refSelector 时的兜底引用气泡选择器。 */
  readonly defaultRefSelector?: string
  /** 短暂高亮 class。默认 `cc-comment-flash`。 */
  readonly flashClass?: string
  /** 高亮持续时间（毫秒，正数）。默认 1600。 */
  readonly flashDurationMs?: number
  /** scrollIntoView 的 block 对齐。默认 `center`。 */
  readonly scrollBlock?: 'start' | 'center' | 'end' | 'nearest'
  /** 命中后是否调用 focus（气泡非可聚焦元素时浏览器为 no-op）。默认 false。 */
  readonly focus?: boolean
}

/** 命中所用的策略（置信度从高到低），供工作台记录降级路径。 */
export type CommentTargetKind = 'reference-marker' | 'range-marker' | 'attribute' | 'ordinal' | 'text'

export interface CommentTarget {
  readonly kind: CommentTargetKind
  /** 滚动/聚焦/高亮的目标元素。 */
  readonly element: NavElement
  /** 范围起点所在段落（仅 range-marker 策略保证存在）。 */
  readonly rangeParagraph: NavElement | null
  /** 引用气泡旁的气泡内容容器（仅 reference-marker 策略保证存在）。 */
  readonly popover: NavElement | null
}

export type CommentMissReason =
  | 'invalid-anchor'
  | 'root-empty'
  | 'comments-not-rendered'
  | 'id-not-found'
  | 'ordinal-out-of-range'
  | 'text-not-found'

export type CommentResolveResult =
  | { readonly ok: true; readonly target: CommentTarget }
  | { readonly ok: false; readonly reason: CommentMissReason; readonly message: string }

const DEFAULTS = {
  attributeName: 'data-cc-comment-id',
  flashClass: 'cc-comment-flash',
  flashDurationMs: 1600,
  scrollBlock: 'center',
} as const

function normalizeOptions(options?: CommentNavigatorOptions): Required<Pick<CommentNavigatorOptions,
  'attributeName' | 'flashClass' | 'flashDurationMs' | 'scrollBlock' | 'focus'>> {
  return {
    attributeName: options?.attributeName ?? DEFAULTS.attributeName,
    flashClass: options?.flashClass ?? DEFAULTS.flashClass,
    flashDurationMs: options?.flashDurationMs !== undefined && options.flashDurationMs > 0
      ? options.flashDurationMs
      : DEFAULTS.flashDurationMs,
    scrollBlock: options?.scrollBlock ?? DEFAULTS.scrollBlock,
    focus: options?.focus ?? false,
  }
}

interface ElementWithMarker {
  readonly marker: CommentMarker
  readonly node: NavNode
}

/** 按批注 id 在注释节点里找引用/范围标记（引用与范围分别收口）。 */
function findMarkers(
  env: NavigationEnvironment,
  root: NavNode,
  commentId: string,
): { references: ElementWithMarker[]; ranges: ElementWithMarker[]; total: number } {
  const references: ElementWithMarker[] = []
  const ranges: ElementWithMarker[] = []
  let total = 0
  for (const node of env.commentNodes(root)) {
    const marker = parseCommentMarkerText(node.textContent)
    if (marker === null) continue
    total += 1
    if (marker.commentId !== commentId) continue
    if (marker.kind === 'reference') references.push({ marker, node })
    else ranges.push({ marker, node })
  }
  return { references, ranges, total }
}

/** 对 docx-preview 形态的 DOM 做 id 精确解析；气泡形态异常时逐级回退。 */
function targetFromMarker(marker: CommentMarker, node: NavNode): CommentTarget | null {
  if (marker.kind === 'reference') {
    const refSpan = node.nextElementSibling
    const popover = refSpan?.nextElementSibling ?? null
    const element = refSpan ?? popover ?? node.parentElement
    // rangeParagraph 只在 range-marker 策略下有意义，引用策略不冒充范围段落。
    return element === null ? null : { kind: 'reference-marker', element, rangeParagraph: null, popover }
  }
  const paragraph = node.parentElement
  if (paragraph === null) return null
  return { kind: 'range-marker', element: paragraph, rangeParagraph: paragraph, popover: null }
}

function resolveByMarkers(
  env: NavigationEnvironment,
  root: NavNode,
  commentId: string,
): { hit: CommentTarget; byReference: boolean } | null {
  const { references, ranges, total } = findMarkers(env, root, commentId)
  if (total === 0) return null
  // 有注释节点但没有本 id 的标记：交给后续策略前先记录，最终走 id-not-found。
  for (const { marker, node } of [...references, ...ranges]) {
    const target = targetFromMarker(marker, node)
    if (target !== null) return { hit: target, byReference: marker.kind === 'reference' }
  }
  return null
}

function resolveByAttribute(
  env: NavigationEnvironment,
  root: NavElement,
  commentId: string,
  attributeName: string,
): CommentTarget | null {
  const matches = env.querySelectorAll(root, commentAttributeSelector(commentId, attributeName))
  const element = matches[0]
  return element === undefined ? null : { kind: 'attribute', element, rangeParagraph: null, popover: null }
}

function resolveByOrdinal(
  env: NavigationEnvironment,
  root: NavElement,
  anchor: CommentAnchor,
  defaultRefSelector: string | undefined,
): CommentTarget | null {
  const selector = anchor.refSelector ?? defaultRefSelector
  if (selector === undefined || selector === '' || anchor.ordinal === undefined) return null
  const spans = env.querySelectorAll(root, selector)
  const element = spans[anchor.ordinal]
  return element === undefined ? null : { kind: 'ordinal', element, rangeParagraph: null, popover: null }
}

function resolveByText(
  env: NavigationEnvironment,
  root: NavElement,
  anchor: CommentAnchor,
): CommentTarget | null {
  const hint = anchor.textHint?.trim()
  if (hint === undefined || hint === '') return null
  for (const paragraph of env.querySelectorAll(root, 'p')) {
    if (paragraph.textContent?.includes(hint) === true) {
      return { kind: 'text', element: paragraph, rangeParagraph: paragraph, popover: null }
    }
  }
  return null
}

/**
 * 解析批注锚点为可操作目标：按引用标记 → 范围标记 → 数据属性 → 序数 →
 * 文本提示的顺序尝试，全部失败返回结构化未命中原因（不抛错、不误跳）。
 */
export function resolveCommentTarget(
  env: NavigationEnvironment,
  root: NavElement,
  anchor: CommentAnchor,
  options?: CommentNavigatorOptions,
): CommentResolveResult {
  const normalized = normalizeOptions(options)
  if (anchor.commentId === '') {
    return { ok: false, reason: 'invalid-anchor', message: '批注锚点缺少 commentId' }
  }

  const markers = resolveByMarkers(env, root, anchor.commentId)
  if (markers !== null) return { ok: true, target: markers.hit }

  const byAttribute = resolveByAttribute(env, root, anchor.commentId, normalized.attributeName)
  if (byAttribute !== null) return { ok: true, target: byAttribute }

  const byOrdinal = resolveByOrdinal(env, root, anchor, options?.defaultRefSelector)
  if (byOrdinal !== null) return { ok: true, target: byOrdinal }

  const byText = resolveByText(env, root, anchor)
  if (byText !== null) return { ok: true, target: byText }

  // 全部未命中：区分“没渲染批注”“id 对不上”“线索越界/失配”。
  const commentNodeCount = env.commentNodes(root).length
  const refSelector = anchor.refSelector ?? options?.defaultRefSelector
  // 未提供选择器时按两个已知渲染器的气泡 class 探测，避免把“有气泡但没给
  // 选择器”误报成 comments-not-rendered。
  const refCount = refSelector !== undefined
    ? env.querySelectorAll(root, refSelector).length
    : env.querySelectorAll(root, '.cc-comment').length + env.querySelectorAll(root, '.docx-comment-ref').length
  if (commentNodeCount === 0 && refCount === 0) {
    const hasContent = root.textContent !== null && root.textContent !== '' ||
      env.querySelectorAll(root, '*').length > 0
    return hasContent
      ? { ok: false, reason: 'comments-not-rendered', message: '渲染结果中没有任何批注标记（renderComments 未开启或渲染器省略了批注）' }
      : { ok: false, reason: 'root-empty', message: '渲染根节点为空，尚未完成渲染或容器选择错误' }
  }
  if (refSelector !== undefined && anchor.ordinal !== undefined) {
    const spans = env.querySelectorAll(root, refSelector)
    if (anchor.ordinal >= spans.length) {
      return { ok: false, reason: 'ordinal-out-of-range', message: `序数 ${anchor.ordinal} 超出引用气泡数量 ${spans.length}` }
    }
  }
  if (anchor.textHint !== undefined && anchor.textHint.trim() !== '') {
    return { ok: false, reason: 'text-not-found', message: `正文中找不到文本提示「${anchor.textHint.trim()}」` }
  }
  return { ok: false, reason: 'id-not-found', message: `DOM 中存在批注标记，但没有匹配 id「${anchor.commentId}」的标记` }
}

// ---------------------------------------------------------------------------
// 协议 DocComment → 导航输入适配（CC-V4-003）：每种渲染器绑定一个 id 空间
// ---------------------------------------------------------------------------

/** docx-preview（Word 视图）引用气泡 class。 */
export const WORD_VIEW_REF_SELECTOR = '.docx-comment-ref'
/** 简版视图（docx-view.ts）引用气泡 class 与正文/气泡打点属性。 */
export const SIMPLE_VIEW_REF_SELECTOR = '.cc-comment'
export const SIMPLE_VIEW_ATTRIBUTE_NAME = 'data-cc-anchor'

/** 一次批注导航的完整输入：anchor 传 navigate，options 传 createCommentNavigator。 */
export interface CommentNavigationInput {
  readonly anchor: CommentAnchor
  readonly options: CommentNavigatorOptions
}

/**
 * Word 批注 → docx-preview 渲染结果：id 空间是 OOXML w:id（注释节点精确命中）；
 * exact 锚点的 quote 降级为正文文本提示；气泡选择器指向 docx-preview 引用 span。
 */
export function wordCommentNavigationInput(comment: DocComment): CommentNavigationInput {
  const anchor: CommentAnchor = comment.anchor.status === 'exact'
    ? { commentId: comment.id, textHint: comment.anchor.quote, refSelector: WORD_VIEW_REF_SELECTOR }
    : { commentId: comment.id, refSelector: WORD_VIEW_REF_SELECTOR }
  return { anchor, options: { defaultRefSelector: WORD_VIEW_REF_SELECTOR } }
}

/**
 * 简版批注 → docx-view.ts 打点渲染结果：id 空间是内容派生 anchorId；
 * 属性策略用渲染器约定的打点属性（正文范围包裹与引用气泡都携带它）。
 */
export function simpleCommentNavigationInput(comment: DocComment): CommentNavigationInput {
  return {
    anchor: { commentId: comment.anchorId, refSelector: SIMPLE_VIEW_REF_SELECTOR },
    options: { attributeName: SIMPLE_VIEW_ATTRIBUTE_NAME, defaultRefSelector: SIMPLE_VIEW_REF_SELECTOR },
  }
}

// ---------------------------------------------------------------------------
// 反向导航（CC-V4-003）：正文点击目标 → 所属批注 id
// ---------------------------------------------------------------------------

/** 文档视图种类；每种视图绑定一个 id 空间与一套气泡选择器。 */
export type CommentViewKind = 'word' | 'simple'

/** 在 root 子树内沿祖先链找最近的选择器命中；越过 root 或无命中返回 null。 */
function closestWithinRoot(
  env: NavigationEnvironment,
  root: NavElement,
  target: NavNode | null,
  selector: string,
): NavElement | null {
  const chain: NavElement[] = []
  for (let current = target; current !== null && current !== root; current = current.parentElement) {
    if (current.nodeType === 1) chain.push(current as NavElement)
  }
  if (chain.length === 0) return null
  const matches = env.querySelectorAll(root, selector)
  return chain.find((candidate) => matches.includes(candidate)) ?? null
}

/**
 * 从正文点击目标解析所属批注 id，供工作台选中对应侧栏条目：
 * - word：root 内最近的 `.docx-comment-ref`，经相邻引用注释节点解析
 *   OOXML w:id（匹配 DocComment.id）。
 * - simple：root 内最近的 `.cc-comment`，读取打点属性 data-cc-anchor
 *   （匹配 DocComment.anchorId）。
 * 两套 id 空间互不相通——视图决定选择器与解析方式；目标在 root 外、无匹配
 * 祖先或属性缺失时返回 null，调用方据此忽略本次点击。
 */
export function commentIdFromActivatedElement(
  env: NavigationEnvironment,
  root: NavElement,
  target: NavNode | null,
  view: CommentViewKind,
): string | null {
  const selector = view === 'word' ? WORD_VIEW_REF_SELECTOR : SIMPLE_VIEW_REF_SELECTOR
  const ref = closestWithinRoot(env, root, target, selector)
  if (ref === null) return null
  if (view === 'word') return commentIdFromRefElement(ref)
  const anchorId = ref.getAttribute(SIMPLE_VIEW_ATTRIBUTE_NAME)
  return anchorId === null || anchorId === '' ? null : anchorId
}

// ---------------------------------------------------------------------------
// 导航会话：滚动 + 聚焦 + 短暂高亮（单一在途高亮，可清理、无泄漏）
// ---------------------------------------------------------------------------

interface ActiveFlash {
  readonly element: NavElement
  readonly className: string
  readonly handle: unknown
}

export interface CommentNavigator {
  /** 解析并跳转：命中则滚动（可选聚焦）+ 短暂高亮；未命中不做任何副作用。 */
  navigate(root: NavElement, anchor: CommentAnchor): CommentResolveResult
  /** 清理在途高亮（取消定时器并摘除 class），供重渲染/卸载时调用。 */
  cleanup(): void
  /** 当前在途高亮的目标元素；无在途高亮时为 null。 */
  readonly activeFlashElement: NavElement | null
}

export function createCommentNavigator(
  env: NavigationEnvironment,
  options?: CommentNavigatorOptions,
): CommentNavigator {
  const normalized = normalizeOptions(options)
  let active: ActiveFlash | null = null

  function clearActiveFlash(): void {
    if (active === null) return
    env.clearTimeout(active.handle)
    env.removeClass(active.element, active.className)
    active = null
  }

  return {
    navigate(root, anchor) {
      const result = resolveCommentTarget(env, root, anchor, options)
      if (!result.ok) return result
      clearActiveFlash()
      env.scrollIntoView(result.target.element, { block: normalized.scrollBlock })
      if (normalized.focus) env.focus(result.target.element)
      env.addClass(result.target.element, normalized.flashClass)
      const element = result.target.element
      const handle = env.setTimeout(() => {
        env.removeClass(element, normalized.flashClass)
        active = null
      }, normalized.flashDurationMs)
      active = { element, className: normalized.flashClass, handle }
      return result
    },
    cleanup: clearActiveFlash,
    get activeFlashElement() {
      return active?.element ?? null
    },
  }
}

// ---------------------------------------------------------------------------
// 生产环境适配器：把端口落到真实 DOM API
// ---------------------------------------------------------------------------

/**
 * 真实浏览器环境适配。Element/Node 结构上满足 NavElement/NavNode；
 * 滚动用 smooth 行为，注释节点用 TreeWalker(SHOW_COMMENT) 收集。
 */
export function createDomNavigationEnvironment(doc: Document): NavigationEnvironment {
  return {
    commentNodes(root) {
      const walker = doc.createTreeWalker(root as unknown as Node, NodeFilter.SHOW_COMMENT)
      const nodes: NavNode[] = []
      for (let current = walker.nextNode(); current !== null; current = walker.nextNode()) {
        nodes.push(current as unknown as NavNode)
      }
      return nodes
    },
    querySelectorAll(root, selector) {
      return Array.from((root as unknown as Element).querySelectorAll(selector)) as unknown as readonly NavElement[]
    },
    scrollIntoView(element, options) {
      ;(element as unknown as HTMLElement).scrollIntoView({ behavior: 'smooth', block: options.block })
    },
    focus(element) {
      ;(element as unknown as HTMLElement).focus()
    },
    addClass(element, className) {
      ;(element as unknown as Element).classList.add(className)
    },
    removeClass(element, className) {
      ;(element as unknown as Element).classList.remove(className)
    },
    setTimeout: (handler, ms) => globalThis.setTimeout(handler, ms),
    clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
  }
}
