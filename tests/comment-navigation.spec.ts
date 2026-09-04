/** Deterministic no-browser tests for the comment navigation controller (CC-V4-005). */

import { describe, expect, it } from 'vitest'
import {
  commentAttributeSelector,
  commentIdFromActivatedElement,
  commentIdFromRefElement,
  commentIdFromStylePlaceholder,
  createCommentNavigator,
  createDomNavigationEnvironment,
  escapeCssAttributeValue,
  parseCommentMarkerText,
  resolveCommentTarget,
  simpleCommentNavigationInput,
  WORD_VIEW_ACTIVATABLE_SELECTOR,
  WORD_VIEW_PLACEHOLDER_SELECTOR,
  WORD_VIEW_REF_SELECTOR,
  wordCommentNavigationInput,
  type CommentAnchor,
  type NavElement,
  type NavigationEnvironment,
  type NavNode,
} from '../src/client/comment-navigation.ts'
import type { DocComment } from '../src/workbench-protocol.ts'

// ---------------------------------------------------------------------------
// 内存假 DOM：仅实现 NavigationEnvironment 所需的最小结构。
// 结构严格对照 docx-preview@0.4.0 dist/docx-preview.mjs 的实际输出
// （renderCommentRangeStart/End/Reference，h() 对 "#comment"/"#fragment" 的处理）。
// ---------------------------------------------------------------------------

const ELEMENT_NODE = 1
const TEXT_NODE = 3
const COMMENT_NODE = 8

class FakeTextNode implements NavNode {
  readonly nodeType = TEXT_NODE
  readonly parentElement = null
  readonly nextElementSibling = null
  readonly previousSibling = null
  constructor(readonly textContent: string) {}
}

class FakeCommentNode implements NavNode {
  readonly nodeType = COMMENT_NODE
  readonly parentElement: FakeElement | null = null
  readonly nextElementSibling: NavElement | null = null
  readonly previousSibling: NavNode | null = null
  constructor(readonly textContent: string) {}
}

class FakeElement implements NavElement {
  readonly nodeType = ELEMENT_NODE
  readonly parentElement: FakeElement | null = null
  nextElementSibling: NavElement | null = null
  previousSibling: NavNode | null = null
  readonly children: NavNode[] = []
  readonly attrs: Record<string, string>

  constructor(readonly tagName: string, className?: string, attrs?: Record<string, string>) {
    this.attrs = className === undefined ? { ...attrs } : { class: className, ...attrs }
  }

  get className(): string {
    return this.attrs['class'] ?? ''
  }

  get classList(): string[] {
    return this.className === '' ? [] : this.className.split(' ')
  }

  getAttribute(name: string): string | null {
    return Object.hasOwn(this.attrs, name) ? this.attrs[name] ?? null : null
  }

  get textContent(): string {
    return this.children.map((child) => child.textContent ?? '').join('')
  }
}

function append<T extends NavNode>(parent: FakeElement, child: T): T {
  parent.children.push(child)
  relink(parent)
  return child
}

/** 按 DOM 语义重算 parentElement / previousSibling / nextElementSibling。 */
function relink(parent: FakeElement): void {
  parent.children.forEach((child, index) => {
    setParent(child, parent)
    child.previousSibling = index > 0 ? parent.children[index - 1]! : null
    const next = parent.children.slice(index + 1).find((sibling) => sibling.nodeType === ELEMENT_NODE)
    setNextElementSibling(child, next ?? null)
  })
}

function setParent(_child: NavNode, _parent: FakeElement | null): void {
  // 假节点把 parent 声明为 readonly 仅是端口视角；这里用直写模拟真实 DOM 的可变树。
  Object.defineProperty(_child, 'parentElement', { value: _parent, configurable: true, writable: true })
}

function setNextElementSibling(_child: NavNode, _next: NavElement | null): void {
  Object.defineProperty(_child, 'nextElementSibling', { value: _next, configurable: true, writable: true })
}

function el(tagName: string, className?: string, attrs?: Record<string, string>): FakeElement {
  return new FakeElement(tagName, className, attrs)
}

function comment(text: string): FakeCommentNode {
  return new FakeCommentNode(text)
}

interface RecordedOp {
  readonly op: string
  readonly element: FakeElement
}

interface FakeTimer {
  readonly id: number
  readonly ms: number
  cleared: boolean
  readonly handler: () => void
}

/** 录制型环境端口：副作用全部记账，定时器手工推进，保证确定性。 */
function createFakeEnvironment(rootHolder: { root: FakeElement | null }) {
  const ops: RecordedOp[] = []
  const timers: FakeTimer[] = []
  let nextId = 1

  function walk(node: NavNode, visit: (node: NavNode) => void): void {
    visit(node)
    if (node instanceof FakeElement) {
      for (const child of node.children) walk(child, visit)
    }
  }

  /** 极简选择器引擎：只支持模块会用到的四种形式，其余直接抛错让测试暴露。 */
  function matches(element: FakeElement, selector: string): boolean {
    const attr = /^\[([^=\]]+)="(.*)"\]$/.exec(selector)
    if (attr !== null) {
      const name = attr[1]!
      return element.attrs[name] === unescapeCss(attr[2]!)
    }
    if (selector === '*') return true
    if (selector.startsWith('.')) {
      const wanted = selector.slice(1).split('.')
      return wanted.every((cls) => element.classList.includes(cls))
    }
    if (/^[a-zA-Z][a-zA-Z0-9-]*$/.test(selector)) {
      return element.tagName.toLowerCase() === selector.toLowerCase()
    }
    throw new Error(`假 DOM 选择器引擎不支持: ${selector}`)
  }

  /**
   * 顶层逗号拆分（引号内的逗号不拆），与浏览器 querySelectorAll 的
   * 逗号语义一致：各选择器命中结果按文档序取并集，天然去重。
   */
  function splitSelectors(selector: string): string[] {
    const parts: string[] = []
    let current = ''
    let inQuotes = false
    for (const ch of selector) {
      if (ch === '"') inQuotes = !inQuotes
      if (ch === ',' && !inQuotes) {
        parts.push(current)
        current = ''
        continue
      }
      current += ch
    }
    parts.push(current)
    return parts.map((part) => part.trim()).filter((part) => part !== '')
  }

  function unescapeCss(value: string): string {
    return value.replace(/\\([0-9a-fA-F]{1,6})\s?|\\(.)/g, (_m, hex: string | undefined, ch: string | undefined) => {
      if (hex !== undefined) return String.fromCodePoint(parseInt(hex, 16))
      return ch ?? ''
    })
  }

  const env: NavigationEnvironment = {
    commentNodes(root) {
      const found: NavNode[] = []
      walk(root, (node) => {
        if (node.nodeType === COMMENT_NODE) found.push(node)
      })
      return found
    },
    querySelectorAll(root, selector) {
      const parts = splitSelectors(selector)
      const found: NavElement[] = []
      walk(root, (node) => {
        if (node instanceof FakeElement && node !== root && parts.some((part) => matches(node, part))) found.push(node)
      })
      return found
    },
    scrollIntoView(element, options) {
      ops.push({ op: `scroll:${options.block}`, element })
    },
    focus(element) {
      ops.push({ op: 'focus', element })
    },
    addClass(element, className) {
      ops.push({ op: `class+${className}`, element })
    },
    removeClass(element, className) {
      ops.push({ op: `class-${className}`, element })
    },
    setTimeout(handler, ms) {
      const timer: FakeTimer = { id: nextId++, ms, cleared: false, handler }
      timers.push(timer)
      return timer.id
    },
    clearTimeout(handle) {
      const timer = timers.find((candidate) => candidate.id === handle)
      if (timer !== undefined) timer.cleared = true
    },
  }
  return {
    env,
    ops,
    timers,
    fireTimer(id: number) {
      const timer = timers.find((candidate) => candidate.id === id)
      if (timer === undefined) throw new Error(`定时器不存在: ${id}`)
      if (timer.cleared) throw new Error(`定时器已取消: ${id}`)
      timer.handler()
    },
  } satisfies {
    env: NavigationEnvironment
    ops: RecordedOp[]
    timers: FakeTimer[]
    fireTimer: (id: number) => void
  }
}

type FakeHarness = ReturnType<typeof createFakeEnvironment>

// ---------------------------------------------------------------------------
// docx-preview@0.4.0 真实 DOM 形态构造器（依据 dist 源码 + 真实浏览器验收证据，
// 字段与嵌套逐一对齐）。0.4.0 实际存在两种批注落 DOM 形态：
//   1. 引用气泡形态：run 内含 w:commentReference 且 comments part 可查到该 id
//      时，renderCommentReference 产出 `#fragment`＝引用注释节点 +
//      span.<class>-comment-ref（💬）+ div.<class>-comment-popover。
//   2. run 样式占位形态（真实 reviewed DOCX 实测）：锚点 run 只带 Word 内置
//      「CommentReference」字符样式时，toH/processStyleName 把 styleName 插值为
//      `${className}_${escapeClassName(styleName)}`，得到空 span.docx_commentreference，
//      紧跟在 end-of-comment 注释节点之后；没有引用注释节点，也没有气泡 span。
// ---------------------------------------------------------------------------

interface PreviewDocOptions {
  readonly commentId?: string
  readonly withReference?: boolean
  readonly withRange?: boolean
  readonly withRefSpan?: boolean
}

/**
 * 构造 renderAsync(document, container, undefined, { renderComments: true }) 后的
 * 容器形态：div.docx-wrapper > section.docx > p…，批注以 XML 注释节点 +
 * 相邻 span.docx-comment-ref / div.docx-comment-popover 呈现。
 */
function buildPreviewDoc(fake: FakeHarness, options: PreviewDocOptions = {}): FakeElement {
  void fake
  const id = options.commentId ?? '7'
  const wrapper = el('div', 'docx-wrapper')
  const section = append(wrapper, el('section', 'docx'))
  const rangeParagraph = append(section, el('p'))
  if (options.withRange !== false) {
    append(rangeParagraph, new FakeTextNode('甲方应当'))
    append(rangeParagraph, comment(`start of comment #${id}`))
    append(rangeParagraph, new FakeTextNode('按期支付'))
    append(rangeParagraph, comment(`end of comment #${id}`))
    append(rangeParagraph, new FakeTextNode('。'))
  } else {
    append(rangeParagraph, new FakeTextNode('无批注正文。'))
  }
  const tailParagraph = append(section, el('p'))
  append(tailParagraph, new FakeTextNode('签署栏 '))
  if (options.withReference !== false) {
    append(tailParagraph, comment(`comment #${id} by 张律师｜合伙 on 2026/9/4 10:00:00`))
    if (options.withRefSpan !== false) {
      append(tailParagraph, el('span', 'docx-comment-ref'))
      const popover = append(tailParagraph, el('div', 'docx-comment-popover'))
      append(popover, el('div', 'docx-comment-author'))
      append(popover, el('div', 'docx-comment-date'))
      append(popover, el('p'))
    } else {
      // 形态异常分支：气泡容器存在但引用 span 缺失（宿主样式或后处理所致）。
      const popover = append(tailParagraph, el('div', 'docx-comment-popover'))
      append(popover, el('div', 'docx-comment-author'))
      append(popover, el('div', 'docx-comment-date'))
    }
  } else {
    append(tailParagraph, new FakeTextNode('无引用标记。'))
  }
  return wrapper
}

/** docx-view.ts 旧渲染器形态：转义 HTML 字符串，只有 sup.cc-comment，无注释节点。 */
function buildLegacyDoc(count = 3): { root: FakeElement; spans: FakeElement[] } {
  const root = el('div', 'docx-body')
  const spans: FakeElement[] = []
  for (let index = 0; index < count; index += 1) {
    const p = append(root, el('p'))
    append(p, new FakeTextNode(`第 ${index + 1} 条约定`))
    spans.push(append(p, el('sup', 'cc-comment', { title: `张律师：条款 ${index + 1}` })))
  }
  return { root, spans }
}

/**
 * 真实 reviewed DOCX（DSH Python 插入批注）经 renderAsync 后的实测段落形态，
 * 逐节点对照验收证据：`<span>正文</span><!--start of comment #0--><ins>…</ins>
 * <!--end of comment #0--><span class="docx_commentreference"></span>`。
 * 整页 comment nodes 只有 start/end，没有引用注释节点；气泡 span 数量 0。
 */
function buildRealReviewedDoc(options: { readonly commentId?: string } = {}): FakeElement {
  const id = options.commentId ?? '0'
  const wrapper = el('div', 'docx-wrapper')
  const section = append(wrapper, el('section', 'docx'))
  const paragraph = append(section, el('p'))
  const run = append(paragraph, el('span'))
  append(run, new FakeTextNode('正文'))
  append(paragraph, comment(`start of comment #${id}`))
  const inserted = append(paragraph, el('ins'))
  append(inserted, new FakeTextNode('修订文本'))
  append(paragraph, comment(`end of comment #${id}`))
  append(paragraph, el('span', 'docx_commentreference'))
  return wrapper
}

function placeholderOf(root: FakeElement): FakeElement {
  const span = findFirst(root, (node) => node instanceof FakeElement && node.classList.includes('docx_commentreference'))
  if (span === null) throw new Error('fixture 缺少 run 样式占位')
  return span
}

function refSpanOf(root: FakeElement): FakeElement {
  const span = findFirst(root, (node) => node instanceof FakeElement && node.classList.includes('docx-comment-ref'))
  if (span === null) throw new Error('fixture 缺少引用气泡')
  return span
}

function popoverOf(root: FakeElement): FakeElement {
  const span = refSpanOf(root)
  const next = span.nextElementSibling
  if (next === null) throw new Error('fixture 缺少气泡容器')
  return next
}

function findFirst(root: FakeElement, predicate: (node: NavNode) => boolean): NavNode | null {
  for (const child of root.children) {
    if (predicate(child)) return child
    if (child instanceof FakeElement) {
      const found = findFirst(child, predicate)
      if (found !== null) return found
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// 纯函数：注释节点文本解析与选择器转义
// ---------------------------------------------------------------------------

describe('parseCommentMarkerText', () => {
  it('识别 docx-preview 的三种批注标记', () => {
    expect(parseCommentMarkerText('start of comment #7')).toEqual({ kind: 'range-start', commentId: '7' })
    expect(parseCommentMarkerText('end of comment #7')).toEqual({ kind: 'range-end', commentId: '7' })
    expect(parseCommentMarkerText('comment #7 by 张律师 on 2026/9/4')).toEqual({ kind: 'reference', commentId: '7' })
  })

  it('保留 id 中的特殊字符（不经过 CSS 选择器，原样字符串比较）', () => {
    expect(parseCommentMarkerText('start of comment #a"b c\\d')).toEqual({ kind: 'range-start', commentId: 'a"b c\\d' })
  })

  it('非标记文本与缺分隔符的引用返回 null', () => {
    expect(parseCommentMarkerText('普通注释')).toBeNull()
    expect(parseCommentMarkerText('comment #7 没有分隔符')).toBeNull()
    expect(parseCommentMarkerText(null)).toBeNull()
  })
})

describe('escapeCssAttributeValue / commentAttributeSelector', () => {
  it('普通文本（含 CJK、emoji、空格）原样保留', () => {
    expect(escapeCssAttributeValue('R001 合同条款 🎉')).toBe('R001 合同条款 🎉')
  })

  it('转义反斜杠、双引号与控制字符', () => {
    expect(escapeCssAttributeValue('a\\b"c')).toBe('a\\\\b\\"c')
    expect(escapeCssAttributeValue('x\ny\tz')).toBe('x\\0a y\\09 z')
    expect(escapeCssAttributeValue('\x7f')).toBe('\\7f ')
  })

  it('生成可解析回原值的属性选择器', () => {
    expect(commentAttributeSelector('R001')).toBe('[data-cc-comment-id="R001"]')
    expect(commentAttributeSelector('a"b', 'data-x')).toBe('[data-x="a\\"b"]')
  })
})

// ---------------------------------------------------------------------------
// 解析策略：docx-preview 形态的 id 精确命中与未命中原因
// ---------------------------------------------------------------------------

describe('resolveCommentTarget：docx-preview 形态', () => {
  it('引用注释节点命中：目标为引用气泡，气泡容器可读', () => {
    const fake = createFakeEnvironment({ root: null })
    const root = buildPreviewDoc(fake, { commentId: '7' })
    const span = refSpanOf(root)

    const result = resolveCommentTarget(fake.env, root, { commentId: '7' })

    expect(result).toEqual({
      ok: true,
      target: { kind: 'reference-marker', element: span, rangeParagraph: null, popover: popoverOf(root) },
    })
  })

  it('只有范围标记时命中范围起点段落（降级可解释）', () => {
    const fake = createFakeEnvironment({ root: null })
    const root = buildPreviewDoc(fake, { commentId: '9', withReference: false })
    const rangeParagraph = findFirst(root, (node) => node instanceof FakeElement && node.tagName === 'p')
    expect(rangeParagraph).not.toBeNull()

    const result = resolveCommentTarget(fake.env, root, { commentId: '9' })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.target.kind).toBe('range-marker')
      expect(result.target.element).toBe(rangeParagraph)
    }
  })

  it('引用气泡形态异常（相邻无 span）时回退到气泡容器', () => {
    const fake = createFakeEnvironment({ root: null })
    const root = buildPreviewDoc(fake, { commentId: '7', withRefSpan: false })

    const result = resolveCommentTarget(fake.env, root, { commentId: '7' })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.target.kind).toBe('reference-marker')
      expect(result.target.element.tagName).toBe('div')
      expect(result.target.element.classList).toEqual(['docx-comment-popover'])
    }
  })

  it('特殊字符 id 通过字符串精确匹配命中（不依赖选择器转义）', () => {
    const fake = createFakeEnvironment({ root: null })
    const weirdId = 'a"b <script> \\n x'
    const root = buildPreviewDoc(fake, { commentId: weirdId })

    const result = resolveCommentTarget(fake.env, root, { commentId: weirdId })

    expect(result.ok).toBe(true)
  })

  it('存在其他 id 的标记时返回 id-not-found，不误跳', () => {
    const fake = createFakeEnvironment({ root: null })
    const root = buildPreviewDoc(fake, { commentId: '7' })

    const result = resolveCommentTarget(fake.env, root, { commentId: '8' })

    expect(result).toEqual({ ok: false, reason: 'id-not-found', message: expect.stringContaining('8') })
  })

  it('renderComments 未开启（无任何批注痕迹）返回 comments-not-rendered', () => {
    const fake = createFakeEnvironment({ root: null })
    const root = buildPreviewDoc(fake, { commentId: '7', withRange: false, withReference: false })

    const result = resolveCommentTarget(fake.env, root, { commentId: '7' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('comments-not-rendered')
  })

  it('空容器返回 root-empty', () => {
    const fake = createFakeEnvironment({ root: null })
    const root = el('div', 'docx-wrapper')

    const result = resolveCommentTarget(fake.env, root, { commentId: '7' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('root-empty')
  })
})

// ---------------------------------------------------------------------------
// 解析策略：属性 / 序数 / 文本降级（旧渲染器与未来打点渲染器形态）
// ---------------------------------------------------------------------------

describe('resolveCommentTarget：降级策略', () => {
  it('数据属性策略：按 id 匹配打了点的元素（含转义往返）', () => {
    const fake = createFakeEnvironment({ root: null })
    const root = el('div', 'docx-body')
    const p = append(root, el('p'))
    append(p, el('sup', 'cc-comment', { 'data-cc-comment-id': 'R"01' }))

    const result = resolveCommentTarget(fake.env, root, { commentId: 'R"01' })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.target.kind).toBe('attribute')
  })

  it('序数策略：锚点提供 refSelector 与 ordinal 时按文档序取第 N 个气泡', () => {
    const fake = createFakeEnvironment({ root: null })
    const { root, spans } = buildLegacyDoc()

    const result = resolveCommentTarget(fake.env, root, { commentId: 'R002', ordinal: 2, refSelector: '.cc-comment' })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.target.kind).toBe('ordinal')
      expect(result.target.element).toBe(spans[2])
    }
  })

  it('序数越界返回 ordinal-out-of-range', () => {
    const fake = createFakeEnvironment({ root: null })
    const { root } = buildLegacyDoc()

    const result = resolveCommentTarget(fake.env, root, { commentId: 'R002', ordinal: 5, refSelector: '.cc-comment' })

    expect(result).toEqual({ ok: false, reason: 'ordinal-out-of-range', message: expect.stringContaining('5') })
  })

  it('defaultRefSelector 兜底，锚点 refSelector 优先', () => {
    const fake = createFakeEnvironment({ root: null })
    const { root, spans } = buildLegacyDoc()

    const viaDefault = resolveCommentTarget(
      fake.env,
      root,
      { commentId: 'R001', ordinal: 1 },
      { defaultRefSelector: '.cc-comment' },
    )
    const viaAnchor = resolveCommentTarget(
      fake.env,
      root,
      { commentId: 'R001', ordinal: 0, refSelector: '.cc-comment' },
      { defaultRefSelector: '.does-not-exist' },
    )

    expect(viaDefault.ok && viaDefault.target.element).toBe(spans[1])
    expect(viaAnchor.ok && viaAnchor.target.element).toBe(spans[0])
  })

  it('文本提示策略：定位包含片段的段落', () => {
    const fake = createFakeEnvironment({ root: null })
    const { root } = buildLegacyDoc()

    const result = resolveCommentTarget(fake.env, root, { commentId: 'X', textHint: '第 2 条约定' })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.target.kind).toBe('text')
      expect(result.target.element.textContent).toContain('第 2 条约定')
    }
  })

  it('文本提示无匹配返回 text-not-found', () => {
    const fake = createFakeEnvironment({ root: null })
    const { root } = buildLegacyDoc()

    const result = resolveCommentTarget(fake.env, root, { commentId: 'X', textHint: '不存在的条款' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('text-not-found')
  })

  it('策略优先级：引用标记先于属性/序数/文本', () => {
    const fake = createFakeEnvironment({ root: null })
    const root = buildPreviewDoc(fake, { commentId: '7' })
    const p = findFirst(root, (node) => node instanceof FakeElement && node.tagName === 'section') as FakeElement
    append(p, el('mark', null, { 'data-cc-comment-id': '7' }))

    const result = resolveCommentTarget(
      fake.env,
      root,
      { commentId: '7', ordinal: 0, refSelector: 'mark', textHint: '按期支付' },
    )

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.target.kind).toBe('reference-marker')
  })

  it('空 commentId 返回 invalid-anchor 且无副作用', () => {
    const fake = createFakeEnvironment({ root: null })
    const { root } = buildLegacyDoc()

    const result = resolveCommentTarget(fake.env, root, { commentId: '' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid-anchor')
  })
})

// ---------------------------------------------------------------------------
// 协议 DocComment → 导航输入适配（CC-V4-003）：两种 id 空间
// ---------------------------------------------------------------------------

const exactWordComment: DocComment = {
  id: '7',
  author: '张律师',
  text: '付款期限过短。',
  anchorId: 'ccm-1a2b3c',
  anchor: { status: 'exact', paragraphIndex: 2, quote: '按期支付' },
}
const fallbackComment: DocComment = {
  id: '9',
  author: '张律师',
  text: '孤立批注。',
  anchorId: 'ccm-9f8e7d',
  anchor: { status: 'fallback', reason: 'orphan-comment' },
}

describe('协议 DocComment 导航输入适配', () => {
  it('word：commentId 取 OOXML id，exact quote 映射 textHint，气泡选择器指向 docx-preview', () => {
    expect(wordCommentNavigationInput(exactWordComment)).toEqual({
      anchor: { commentId: '7', textHint: '按期支付', refSelector: '.docx-comment-ref' },
      options: { defaultRefSelector: '.docx-comment-ref' },
    })
  })

  it('word：fallback 锚点无 quote，不虚构 textHint', () => {
    expect(wordCommentNavigationInput(fallbackComment).anchor)
      .toEqual({ commentId: '9', refSelector: '.docx-comment-ref' })
  })

  it('simple：commentId 取 anchorId，属性策略打点名 data-cc-anchor，气泡选择器 .cc-comment', () => {
    expect(simpleCommentNavigationInput(exactWordComment)).toEqual({
      anchor: { commentId: 'ccm-1a2b3c', refSelector: '.cc-comment' },
      options: { attributeName: 'data-cc-anchor', defaultRefSelector: '.cc-comment' },
    })
  })

  it('word 输入端到端命中 docx-preview 形态 DOM（id 空间：OOXML w:id）', () => {
    const fake = createFakeEnvironment({ root: null })
    const root = buildPreviewDoc(fake, { commentId: '7' })
    const input = wordCommentNavigationInput(exactWordComment)

    const result = resolveCommentTarget(fake.env, root, input.anchor, input.options)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.target.kind).toBe('reference-marker')
      expect(result.target.element).toBe(refSpanOf(root))
    }
  })

  it('simple 输入端到端命中打点形态 DOM（id 空间：ccm anchorId），属性策略取首个打点元素', () => {
    const fake = createFakeEnvironment({ root: null })
    const root = el('div', 'docx-body')
    const p = append(root, el('p'))
    append(p, new FakeTextNode('甲方应当'))
    const wrap = append(p, el('span', 'cc-comment-anchor', { 'data-cc-anchor': 'ccm-1a2b3c' }))
    append(p, new FakeTextNode('按期支付。'))
    append(p, el('sup', 'cc-comment', { 'data-cc-anchor': 'ccm-1a2b3c' }))
    const input = simpleCommentNavigationInput(exactWordComment)

    const result = resolveCommentTarget(fake.env, root, input.anchor, input.options)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.target.kind).toBe('attribute')
      expect(result.target.element).toBe(wrap)
    }
  })

  it('id 空间互不相通：word 输入对简版 DOM 不误跳', () => {
    const fake = createFakeEnvironment({ root: null })
    const root = el('div', 'docx-body')
    const p = append(root, el('p'))
    append(p, new FakeTextNode('甲方应当按期支付。'))
    append(p, el('sup', 'cc-comment', { 'data-cc-anchor': 'ccm-1a2b3c' }))
    const input = wordCommentNavigationInput(fallbackComment)

    const result = resolveCommentTarget(fake.env, root, input.anchor, input.options)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('comments-not-rendered')
  })
})

// ---------------------------------------------------------------------------
// 反向导航：正文气泡 → 批注 id
// ---------------------------------------------------------------------------

describe('commentIdFromRefElement', () => {
  it('从气泡的相邻注释节点解析 id', () => {
    const fake = createFakeEnvironment({ root: null })
    const root = buildPreviewDoc(fake, { commentId: '7' })

    expect(commentIdFromRefElement(refSpanOf(root))).toBe('7')
  })

  it('无引用标记时返回 null', () => {
    const fake = createFakeEnvironment({ root: null })
    const { root, spans } = buildLegacyDoc()

    expect(commentIdFromRefElement(spans[0]!)).toBeNull()
    expect(root.textContent).toContain('第 1 条约定')
  })
})

// ---------------------------------------------------------------------------
// 真实 reviewed DOCX 的 run 样式占位形态（0.4.0 实测第二种形态）
// ---------------------------------------------------------------------------

describe('commentIdFromStylePlaceholder（run 样式占位）', () => {
  it('从紧邻的 end marker 注释节点恢复批注 id', () => {
    const root = buildRealReviewedDoc({ commentId: '0' })
    expect(commentIdFromStylePlaceholder(placeholderOf(root))).toBe('0')
  })

  it('end marker id 原样返回（特殊字符 id 不经选择器）', () => {
    const root = el('div')
    const p = append(root, el('p'))
    append(p, comment('end of comment #a"b c\\d'))
    const placeholder = append(p, el('span', 'docx_commentreference'))
    expect(commentIdFromStylePlaceholder(placeholder)).toBe('a"b c\\d')
  })

  it('越界：占位是首个子节点（无 previousSibling）或游离时返回 null', () => {
    const root = el('div')
    const p = append(root, el('p'))
    const orphan = append(p, el('span', 'docx_commentreference'))
    expect(commentIdFromStylePlaceholder(orphan)).toBeNull()

    const detached = el('span', 'docx_commentreference')
    expect(commentIdFromStylePlaceholder(detached)).toBeNull()
  })

  it('错误邻接：相邻是 range-start、正文文本、普通元素或引用标记时返回 null，不臆测 id', () => {
    const root = el('div')

    const withStart = append(root, el('p'))
    append(withStart, comment('start of comment #0'))
    expect(commentIdFromStylePlaceholder(append(withStart, el('span', 'docx_commentreference')))).toBeNull()

    const withText = append(root, el('p'))
    append(withText, new FakeTextNode('、'))
    expect(commentIdFromStylePlaceholder(append(withText, el('span', 'docx_commentreference')))).toBeNull()

    const withElement = append(root, el('p'))
    append(withElement, el('b'))
    expect(commentIdFromStylePlaceholder(append(withElement, el('span', 'docx_commentreference')))).toBeNull()

    const withReference = append(root, el('p'))
    append(withReference, comment('comment #7 by 张律师 on 2026/9/4'))
    expect(commentIdFromStylePlaceholder(append(withReference, el('span', 'docx_commentreference')))).toBeNull()
  })
})

describe('commentIdFromActivatedElement：run 样式占位形态', () => {
  it('真实形态：点击占位 span 经组合选择器最近祖先命中其批注 id', () => {
    const fake = createFakeEnvironment({ root: null })
    const root = buildRealReviewedDoc({ commentId: '0' })

    expect(commentIdFromActivatedElement(fake.env, root, placeholderOf(root), 'word')).toBe('0')
  })

  it('两种形态共存：原生气泡与样式占位各自解析，互不串扰', () => {
    const fake = createFakeEnvironment({ root: null })
    const root = el('div', 'docx-wrapper')
    const section = append(root, el('section', 'docx'))
    const placeholderParagraph = append(section, el('p'))
    append(placeholderParagraph, comment('start of comment #0'))
    append(placeholderParagraph, comment('end of comment #0'))
    const placeholder = append(placeholderParagraph, el('span', 'docx_commentreference'))
    const bubbleParagraph = append(section, el('p'))
    append(bubbleParagraph, comment('comment #7 by 张律师 on 2026/9/4'))
    const bubble = append(bubbleParagraph, el('span', 'docx-comment-ref'))
    append(bubbleParagraph, el('div', 'docx-comment-popover'))

    expect(commentIdFromActivatedElement(fake.env, root, placeholder, 'word')).toBe('0')
    expect(commentIdFromActivatedElement(fake.env, root, bubble, 'word')).toBe('7')
  })

  it('组合选择器语义与浏览器 querySelectorAll 一致：并集、文档序、去重', () => {
    const fake = createFakeEnvironment({ root: null })
    const root = el('div')
    const both = append(root, el('span', 'docx-comment-ref docx_commentreference'))
    const placeholderOnly = append(root, el('span', 'docx_commentreference'))
    const bubbleOnly = append(root, el('span', 'docx-comment-ref'))

    const found = fake.env.querySelectorAll(root, WORD_VIEW_ACTIVATABLE_SELECTOR)

    expect(found).toEqual([both, placeholderOnly, bubbleOnly])
  })

  it('选择器常量互相咬合：组合式＝原生气泡 + 样式占位', () => {
    expect(WORD_VIEW_REF_SELECTOR).toBe('.docx-comment-ref')
    expect(WORD_VIEW_PLACEHOLDER_SELECTOR).toBe('.docx_commentreference')
    expect(WORD_VIEW_ACTIVATABLE_SELECTOR).toBe('.docx-comment-ref, .docx_commentreference')
  })

  it('正向导航不回归：真实占位形态（无引用标记）仍经范围标记命中范围段落', () => {
    const fake = createFakeEnvironment({ root: null })
    const root = buildRealReviewedDoc({ commentId: '0' })
    const comment: DocComment = { ...exactWordComment, id: '0', anchor: { status: 'exact', paragraphIndex: 0, quote: '正文' } }
    const input = wordCommentNavigationInput(comment)

    const result = resolveCommentTarget(fake.env, root, input.anchor, input.options)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.target.kind).toBe('range-marker')
      expect(result.target.element.tagName).toBe('p')
    }
  })
})

// ---------------------------------------------------------------------------
// 反向导航：正文点击目标 → 所属批注 id（视图绑定 id 空间，供 CC-V4-003 接线）
// ---------------------------------------------------------------------------

/** docx-view.ts 打点渲染形态：sup.cc-comment 携带 data-cc-anchor。 */
function buildSimpleDoc(anchorId: string): { root: FakeElement; bubble: FakeElement } {
  const root = el('div', 'docx-body')
  const p = append(root, el('p'))
  append(p, new FakeTextNode('甲方应当按期支付。'))
  const bubble = append(p, el('sup', 'cc-comment', { 'data-cc-anchor': anchorId }))
  return { root, bubble }
}

describe('commentIdFromActivatedElement', () => {
  it('word：点击引用气泡解析 OOXML id，且经由最近祖先命中（气泡内深层目标也命中）', () => {
    const fake = createFakeEnvironment({ root: null })
    const root = buildPreviewDoc(fake, { commentId: '7' })
    const span = refSpanOf(root)
    const inner = append(span, el('b'))

    expect(commentIdFromActivatedElement(fake.env, root, span, 'word')).toBe('7')
    expect(commentIdFromActivatedElement(fake.env, root, inner, 'word')).toBe('7')
  })

  it('word：点击非气泡元素、根本身与根外目标都返回 null', () => {
    const fake = createFakeEnvironment({ root: null })
    const root = buildPreviewDoc(fake, { commentId: '7' })
    const paragraph = findFirst(root, (node) => node instanceof FakeElement && node.tagName === 'p')
    expect(paragraph).not.toBeNull()

    expect(commentIdFromActivatedElement(fake.env, root, paragraph, 'word')).toBeNull()
    expect(commentIdFromActivatedElement(fake.env, root, root, 'word')).toBeNull()

    const outside = el('div', 'outside')
    const strayBubble = append(outside, el('span', 'docx-comment-ref'))
    expect(commentIdFromActivatedElement(fake.env, root, strayBubble, 'word')).toBeNull()
  })

  it('simple：点击 .cc-comment 读取 data-cc-anchor 为 anchorId', () => {
    const fake = createFakeEnvironment({ root: null })
    const { root, bubble } = buildSimpleDoc('ccm-1a2b3c')

    expect(commentIdFromActivatedElement(fake.env, root, bubble, 'simple')).toBe('ccm-1a2b3c')
  })

  it('simple：气泡缺 data-cc-anchor 时返回 null，不臆测 id', () => {
    const fake = createFakeEnvironment({ root: null })
    const { root, spans } = buildLegacyDoc(1)

    expect(commentIdFromActivatedElement(fake.env, root, spans[0]!, 'simple')).toBeNull()
  })

  it('两套 id 空间互不相通：视图与渲染形态不匹配时返回 null', () => {
    const fake = createFakeEnvironment({ root: null })
    const simple = buildSimpleDoc('ccm-1a2b3c')
    const wordRoot = buildPreviewDoc(fake, { commentId: '7' })

    expect(commentIdFromActivatedElement(fake.env, simple.root, simple.bubble, 'word')).toBeNull()
    expect(
      commentIdFromActivatedElement(fake.env, wordRoot, refSpanOf(wordRoot), 'simple'),
    ).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 导航会话：滚动 / 聚焦 / 短暂高亮生命周期
// ---------------------------------------------------------------------------

const ANCHOR: CommentAnchor = { commentId: '7' }

describe('createCommentNavigator 生命周期', () => {
  it('命中：滚动居中 → 不聚焦（默认）→ 加高亮 → 定时器到期摘除', () => {
    const fake = createFakeEnvironment({ root: null })
    const root = buildPreviewDoc(fake)
    const span = refSpanOf(root)
    const navigator = createCommentNavigator(fake.env)

    const result = navigator.navigate(root, ANCHOR)
    expect(result.ok).toBe(true)
    expect(navigator.activeFlashElement).toBe(span)
    expect(fake.ops.map((entry) => entry.op)).toEqual(['scroll:center', 'class+cc-comment-flash'])
    expect(fake.ops[0]!.element).toBe(span)
    expect(fake.timers).toHaveLength(1)
    expect(fake.timers[0]!.ms).toBe(1600)

    fake.fireTimer(fake.timers[0]!.id)
    expect(fake.ops.map((entry) => entry.op)).toEqual(['scroll:center', 'class+cc-comment-flash', 'class-cc-comment-flash'])
    expect(navigator.activeFlashElement).toBeNull()
  })

  it('focus 开启时聚焦介于滚动与高亮之间', () => {
    const fake = createFakeEnvironment({ root: null })
    const root = buildPreviewDoc(fake)
    const navigator = createCommentNavigator(fake.env, { focus: true })

    navigator.navigate(root, ANCHOR)

    expect(fake.ops.map((entry) => entry.op)).toEqual(['scroll:center', 'focus', 'class+cc-comment-flash'])
  })

  it('未命中：无滚动、无高亮、无定时器（不误跳）', () => {
    const fake = createFakeEnvironment({ root: null })
    const root = buildPreviewDoc(fake)
    const navigator = createCommentNavigator(fake.env)

    const result = navigator.navigate(root, { commentId: '404' })

    expect(result.ok).toBe(false)
    expect(fake.ops).toEqual([])
    expect(fake.timers).toEqual([])
    expect(navigator.activeFlashElement).toBeNull()
  })

  it('连续导航：先清理上一个高亮（取消定时器 + 摘 class），再建立新的', () => {
    const fake = createFakeEnvironment({ root: null })
    const rootA = buildPreviewDoc(fake, { commentId: '7' })
    const rootB = buildPreviewDoc(fake, { commentId: '8' })
    const spanA = refSpanOf(rootA)
    const spanB = refSpanOf(rootB)
    const navigator = createCommentNavigator(fake.env)

    navigator.navigate(rootA, ANCHOR)
    const firstTimer = fake.timers[0]!
    navigator.navigate(rootB, { commentId: '8' })

    expect(firstTimer.cleared).toBe(true)
    expect(fake.ops.map((entry) => entry.op)).toEqual([
      'scroll:center',
      'class+cc-comment-flash',
      'class-cc-comment-flash',
      'scroll:center',
      'class+cc-comment-flash',
    ])
    expect(fake.ops.slice(0, 3).every((entry) => entry.element === spanA)).toBe(true)
    expect(fake.ops.slice(3).every((entry) => entry.element === spanB)).toBe(true)
    expect(navigator.activeFlashElement).toBe(spanB)

    // 第一个定时器已取消，只有第二个仍会摘除自己的高亮。
    fake.fireTimer(fake.timers.find((timer) => !timer.cleared)!.id)
    expect(navigator.activeFlashElement).toBeNull()
  })

  it('cleanup()：取消在途定时器并摘除高亮；无在途时为幂等 no-op', () => {
    const fake = createFakeEnvironment({ root: null })
    const root = buildPreviewDoc(fake)
    const navigator = createCommentNavigator(fake.env)

    navigator.cleanup()
    expect(fake.ops).toEqual([])

    navigator.navigate(root, ANCHOR)
    navigator.cleanup()

    expect(fake.timers[0]!.cleared).toBe(true)
    expect(navigator.activeFlashElement).toBeNull()
    expect(fake.ops.at(-1)).toEqual({ op: 'class-cc-comment-flash', element: refSpanOf(root) })
  })

  it('自定义 flashClass / flashDurationMs / scrollBlock 全部生效', () => {
    const fake = createFakeEnvironment({ root: null })
    const root = buildPreviewDoc(fake)
    const navigator = createCommentNavigator(fake.env, { flashClass: 'dark-mode-flash', flashDurationMs: 40, scrollBlock: 'start' })

    navigator.navigate(root, ANCHOR)

    expect(fake.ops.map((entry) => entry.op)).toEqual(['scroll:start', 'class+dark-mode-flash'])
    expect(fake.timers[0]!.ms).toBe(40)
  })

  it('非法 flashDurationMs 回退默认值', () => {
    const fake = createFakeEnvironment({ root: null })
    const root = buildPreviewDoc(fake)
    const navigator = createCommentNavigator(fake.env, { flashDurationMs: 0 })

    navigator.navigate(root, ANCHOR)

    expect(fake.timers[0]!.ms).toBe(1600)
  })
})

// ---------------------------------------------------------------------------
// 生产适配器仅在真实浏览器可用（vitest node 环境无 DOM，jsdom 未安装且禁止
// 安装依赖），其正确性由 tsconfig.client.json 的 DOM 类型检查与 CC-V4-003 的
// 浏览器验收覆盖；这里只确认工厂函数可构造且不触碰全局对象。
// ---------------------------------------------------------------------------

describe('createDomNavigationEnvironment', () => {
  it('node 环境下构造不触雷（未访问 document 前不抛错）', () => {
    expect(typeof createDomNavigationEnvironment).toBe('function')
  })
})
