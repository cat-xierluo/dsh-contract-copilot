/**
 * 跨案件数据隔离回归（CC-V5-006）：案件切换清屏、迟到响应防覆盖、
 * detail/document 独立失败、新建案件防双击。
 *
 * 环境说明：依赖树中不存在 jsdom / react-dom / testing-library（pnpm store
 * 已核实），且本波次禁止新增依赖或改锁文件。因此这里用最小的 React 挂载器
 * 直接执行真实的 `Workbench` 组件：hook 挂到 React 18 官方 dispatcher 契约
 * 上（ReactCurrentDispatcher），渲染产物是真实的 React element 树，断言在
 * 树文本与 props 层进行；RPC 用可手动放行的 deferred fake 编排交错时序。
 * 若后续引入 jsdom/react-dom，可原样把挂载器替换为 RTL，用例编排不变。
 */

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ContractCopilotClient } from '../src/client/api.ts'
import type { SessionBrief, SessionDetail, DocumentView, StartReviewResult } from '../src/workbench-protocol.ts'
import type { WorkbenchConnection } from '../src/client/api.ts'

// node 的 navigator.language 跟随宿主（本机为 en）；文案断言按产品主语言 zh
// 固定，必须在 Workbench 模块初始化 translator 之前生效，因此动态导入。
vi.stubGlobal('navigator', { language: 'zh-CN' })
const { Workbench, RailEntryButton } = await import('../src/client/Workbench.tsx')

// ---------------------------------------------------------------------------
// Deferred fake RPC：每个 (endpoint, sessionId) 一个 FIFO 队列，测试手动放行。
// ---------------------------------------------------------------------------

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
  reject(error: unknown): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

class FakeWorkbenchBackend {
  readonly startCalls: string[] = []
  private readonly queues = new Map<string, Array<Deferred<unknown>>>()

  /** 为下一次 (endpoint, sessionId) 调用排队一个可手动放行的响应。 */
  queue(endpoint: string, sessionId?: string): Deferred<unknown> {
    const entry = deferred<unknown>()
    // 排队即预挂 no-op catch：测试先 reject、组件后才消费时，避免过渡窗口的
    // unhandledRejection；真实消费者的 try/catch 仍照常收到失败。
    entry.promise.catch(() => {})
    const key = `${endpoint}::${sessionId ?? ''}`
    const list = this.queues.get(key) ?? []
    list.push(entry)
    this.queues.set(key, list)
    return entry
  }

  /** 排队并立即放行（已加载完成的通道）。 */
  queueResolved(endpoint: string, sessionId: string | undefined, value: unknown): void {
    this.queue(endpoint, sessionId).resolve(value)
  }

  readonly connection = {
    rpc: {
      call: (_channel: string, endpoint: string, payload: unknown): Promise<{ ok: true; value: unknown }> => {
        const sessionId = (payload as { sessionId?: string }).sessionId
        if (endpoint === 'start') this.startCalls.push((payload as { contractPath: string }).contractPath)
        const list = this.queues.get(`${endpoint}::${sessionId ?? ''}`)
        const next = list?.shift()
        if (next === undefined) return Promise.reject(new Error(`fake backend: unexpected ${endpoint}(${String(sessionId)})`))
        return next.promise.then(value => ({ ok: true, value }))
      },
    },
  }
}

// ---------------------------------------------------------------------------
// Fixtures：两个案件，正文 / finding / intake 文案互不相同，可做「同帧消失」断言。
// ---------------------------------------------------------------------------

function brief(id: string, name: string): SessionBrief {
  return { id, contractName: name, state: 'created', updatedAt: `2026-09-05T0${id === 'A' ? '1' : '2'}:00:00.000Z` }
}

function detailFor(id: string): SessionDetail {
  return {
    session: {
      id,
      contractName: `合同${id}名`,
      contractPath: `/tmp/${id}.docx`,
      state: id === 'A' ? 'plan_ready' : 'intake_done',
      ...(id === 'A' ? {
        planReview: {
          sourcePlanHash: `hash-${id}`,
          sourceFindings: [],
          status: 'awaiting-decisions' as const,
          decisions: {},
          history: [],
        },
      } : {
        intakeMissing: [{ field: 'partyRole', question: `乙方主体资格-${id}`, options: ['甲方', '乙方'] }],
      }),
      outputs: {},
      updatedAt: `2026-09-05T0${id === 'A' ? '1' : '2'}:00:00.000Z`,
      historyTail: [],
    },
    findings: id === 'A' ? [{ id: 'R-A', risk: `风险-${id}`, target_text: `原文-${id}` }] : [],
  }
}

function docFor(id: string): DocumentView {
  return { label: `审查版文档-${id}`, html: `<p>正文-${id}</p>`, comments: [] }
}

const A_DOC_LABEL = '审查版文档-A'
const A_FINDING = '风险-A'
const B_QUESTION = '乙方主体资格-B'
const SELECT_PROMPT = '选择左侧审查任务查看文档。'

// ---------------------------------------------------------------------------
// 最小 React 挂载器：真实组件 + 官方 dispatcher 契约 + element 树断言。
// ---------------------------------------------------------------------------

interface HookState {
  readonly kind: 'state' | 'ref' | 'callback' | 'effect'
  memoizedState: unknown
  deps?: readonly unknown[]
  pendingEffect?: () => void | (() => void)
}

interface InstanceRecord {
  hookIndex: number
  readonly hooks: HookState[]
  visited: number
}

interface MiniElement {
  readonly kind: 'element'
  readonly type: string
  readonly props: Record<string, unknown>
  readonly children: MiniNode[]
  readonly dom: Record<string, unknown>
}

interface MiniFragment {
  readonly kind: 'fragment'
  readonly children: MiniNode[]
}

interface MiniText {
  readonly kind: 'text'
  readonly text: string
}

type MiniNode = MiniElement | MiniFragment | MiniText | null

const internals = (React as unknown as {
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: {
    ReactCurrentDispatcher: { current: unknown }
  }
}).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED

let currentRecord: InstanceRecord | null = null
let renderRequested = false
let renderPass = 0
let focusLog: Array<object> | null = null
const records = new Map<string, InstanceRecord>()
const pendingCleanups: Array<() => void> = []
const pendingCreates: Array<{ record: InstanceRecord; index: number }> = []

function depsEqual(left: readonly unknown[] | undefined, right: readonly unknown[] | undefined): boolean {
  if (left === undefined || right === undefined || left.length !== right.length) return false
  return left.every((value, index) => Object.is(value, right[index]))
}

function miniUseState<S>(initial: S | (() => S)): [S, (next: S | ((previous: S) => S)) => void] {
  const record = currentRecord as InstanceRecord
  const index = record.hookIndex
  record.hookIndex += 1
  let hook = record.hooks[index]
  if (hook === undefined) {
    hook = { kind: 'state', memoizedState: typeof initial === 'function' ? (initial as () => S)() : initial }
    record.hooks[index] = hook
  }
  const setState = (next: S | ((previous: S) => S)): void => {
    const value = typeof next === 'function' ? (next as (previous: S) => S)(hook!.memoizedState as S) : next
    if (!Object.is(value, hook!.memoizedState)) {
      hook!.memoizedState = value
      renderRequested = true
    }
  }
  return [hook.memoizedState as S, setState]
}

function miniUseRef<T>(initial: T): { current: T } {
  const record = currentRecord as InstanceRecord
  const index = record.hookIndex
  record.hookIndex += 1
  let hook = record.hooks[index]
  if (hook === undefined) {
    hook = { kind: 'ref', memoizedState: { current: initial } }
    record.hooks[index] = hook
  }
  return hook.memoizedState as { current: T }
}

function miniUseCallback<T>(fn: T, deps: readonly unknown[]): T {
  const record = currentRecord as InstanceRecord
  const index = record.hookIndex
  record.hookIndex += 1
  const existing = record.hooks[index]
  if (existing === undefined || !depsEqual(existing.deps, deps)) {
    record.hooks[index] = { kind: 'callback', memoizedState: fn, deps }
  }
  return record.hooks[index]!.memoizedState as T
}

function miniUseEffect(effect: () => void | (() => void), deps: readonly unknown[]): void {
  const record = currentRecord as InstanceRecord
  const index = record.hookIndex
  record.hookIndex += 1
  const existing = record.hooks[index]
  if (existing === undefined) {
    record.hooks[index] = { kind: 'effect', memoizedState: undefined, deps, pendingEffect: effect }
    pendingCreates.push({ record, index })
    return
  }
  if (!depsEqual(existing.deps, deps)) {
    if (typeof existing.memoizedState === 'function') pendingCleanups.push(existing.memoizedState as () => void)
    existing.deps = deps
    existing.pendingEffect = effect
    pendingCreates.push({ record, index })
  }
}

const dispatcher = { useState: miniUseState, useRef: miniUseRef, useCallback: miniUseCallback, useEffect: miniUseEffect }

function createFakeDom(tag: string): Record<string, unknown> {
  // CC-V5-010：focus 事件按 dom 身份记录（focusLog 非空时），供焦点迁移断言
  // 使用——每轮 flush 都会重建 fake dom，事后包装单个 dom 的 focus 会拿到
  // 过期引用，只有挂载器内置日志能同时覆盖「flush 前的同步迁移」与
  // 「flush 期间 effect 里的恢复焦点」两种时序。
  const dom: Record<string, unknown> = {
    tagName: tag.toUpperCase(),
    nodeType: 1,
    innerHTML: '',
    textContent: '',
    style: {},
    addEventListener() {},
    removeEventListener() {},
    focus() { focusLog?.push(dom) },
    scrollIntoView() {},
    querySelectorAll() { return [] },
    getAttribute() { return null },
    setAttribute() {},
  }
  return dom
}

function attachRef(ref: unknown, dom: Record<string, unknown>): void {
  if (typeof ref === 'function') ref(dom as never)
  else if (ref !== null && typeof ref === 'object') (ref as { current: unknown }).current = dom
}

function flatten(children: unknown): unknown[] {
  if (children === null || children === undefined || typeof children === 'boolean') return []
  if (Array.isArray(children)) return children.flatMap(flatten)
  return [children]
}

function renderNode(input: unknown, path: string): MiniNode {
  if (input === null || input === undefined || typeof input === 'boolean') return null
  if (typeof input === 'string') return { kind: 'text', text: input }
  if (typeof input === 'number') return { kind: 'text', text: String(input) }
  const element = input as React.ReactElement
  const type = element.type
  const props = (element.props ?? {}) as Record<string, unknown>
  if (type === React.Fragment) {
    return { kind: 'fragment', children: flatten(props.children).map((child, slot) => renderNode(child, `${path}/${slot}`)) }
  }
  if (typeof type === 'function') {
    const key = `${path}~${(type as { name?: string }).name ?? 'anon'}`
    let record = records.get(key)
    if (record === undefined) {
      record = { hookIndex: 0, hooks: [], visited: 0 }
      records.set(key, record)
    }
    record.visited = renderPass
    record.hookIndex = 0
    const previousRecord = currentRecord
    const previousDispatcher = internals.ReactCurrentDispatcher.current
    currentRecord = record
    internals.ReactCurrentDispatcher.current = dispatcher
    let output: unknown
    try {
      output = (type as (props: never) => unknown)(props as never)
    } finally {
      currentRecord = previousRecord
      internals.ReactCurrentDispatcher.current = previousDispatcher
    }
    return renderNode(output, `${path}~`)
  }
  const dom = createFakeDom(String(type))
  // jsx-runtime 会把 ref 从 props 挪到 element.ref，两处都兜住。
  attachRef((element as { ref?: unknown }).ref ?? props.ref, dom)
  return {
    kind: 'element',
    type: String(type),
    props,
    dom,
    children: flatten(props.children).map((child, slot) => renderNode(child, `${path}/${slot}`)),
  }
}

function commitEffects(): void {
  for (const cleanup of pendingCleanups.splice(0, pendingCleanups.length)) cleanup()
  for (const { record, index } of pendingCreates.splice(0, pendingCreates.length)) {
    const hook = record.hooks[index]
    if (hook?.pendingEffect === undefined) continue
    const cleanup = hook.pendingEffect()
    hook.memoizedState = typeof cleanup === 'function' ? cleanup : undefined
    hook.pendingEffect = undefined
  }
}

function collectUnmounted(): void {
  for (const [key, record] of records) {
    if (record.visited === renderPass) continue
    for (const hook of record.hooks) {
      if (hook.kind === 'effect' && typeof hook.memoizedState === 'function') (hook.memoizedState as () => void)()
    }
    records.delete(key)
  }
}

const macrotask = (): Promise<void> => new Promise(resolve => { setImmediate(resolve) })

/** 放行已 resolve 的 deferred → 等 microtask 链 → 重渲染 → 跑 effects，直到稳定。 */
async function flush(): Promise<void> {
  for (let round = 0; round < 50; round += 1) {
    await macrotask()
    if (!renderRequested) return
    renderRequested = false
    renderPass += 1
    const output = renderNode(rootElementRef, 'R')
    renderedRootRef = { kind: 'element', type: 'ccp-test-root', props: {}, dom: createFakeDom('div'), children: [output] }
    commitEffects()
    collectUnmounted()
  }
}

let rootElementRef: React.ReactElement | null = null
let renderedRootRef: MiniElement | null = null

function nodeText(node: MiniNode): string {
  if (node === null || node.kind === 'text') return node?.text ?? ''
  return node.children.map(nodeText).join('')
}

function walk(node: MiniNode, visit: (element: MiniElement) => void): void {
  if (node === null || node.kind === 'text') return
  // fragment 也要下钻：RailEntryButton 返回 <>…</>，跳过 fragment 会让
  // launcher 按钮对 findByAria / findButtonWithText 不可见。
  if (node.kind === 'fragment') {
    for (const child of node.children) walk(child, visit)
    return
  }
  visit(node)
  for (const child of node.children) walk(child, visit)
}

function treeText(): string {
  return nodeText(renderedRootRef)
}

function findButtonWithText(text: string): MiniElement {
  let found: MiniElement | undefined
  walk(renderedRootRef, element => {
    if (element.type === 'button' && nodeText(element).includes(text)) found ??= element
  })
  if (found === undefined) throw new Error(`button with text not found: ${text}`)
  return found
}

function findByAria(ariaLabel: string): MiniElement {
  let found: MiniElement | undefined
  walk(renderedRootRef, element => {
    if (element.props['aria-label'] === ariaLabel) found ??= element
  })
  if (found === undefined) throw new Error(`element with aria-label not found: ${ariaLabel}`)
  return found
}

interface FakeEvent {
  stopPropagation(): void
  preventDefault(): void
  key: string
  target: unknown
}

function click(element: MiniElement): void {
  ;(element.props.onClick as ((event: FakeEvent) => void) | undefined)?.({ stopPropagation() {}, preventDefault() {}, key: '', target: element.dom })
}

function changeValue(element: MiniElement, value: string): void {
  ;(element.props.onChange as ((event: { target: { value: string } }) => void) | undefined)?.({ target: { value } })
}

/** 挂载真实 Workbench：全局 EventSource/fetch 用 stub（node 环境没有）。 */
async function mountWorkbench(backend: FakeWorkbenchBackend, onClose: () => void = () => {}): Promise<void> {
  vi.stubGlobal('EventSource', class { addEventListener(): void {} close(): void {} })
  vi.stubGlobal('fetch', () => new Promise<never>(() => {}))
  const client = new ContractCopilotClient(backend.connection as unknown as WorkbenchConnection)
  rootElementRef = <Workbench client={client} onClose={onClose} />
  renderRequested = true
  await flush()
}

function dispose(): void {
  for (const record of records.values()) {
    for (const hook of record.hooks) {
      if (hook.kind === 'effect' && typeof hook.memoizedState === 'function') (hook.memoizedState as () => void)()
    }
  }
  records.clear()
  pendingCleanups.length = 0
  pendingCreates.length = 0
  currentRecord = null
  renderRequested = false
  renderedRootRef = null
  rootElementRef = null
  focusLog = null
  vi.unstubAllGlobals()
}

afterEach(dispose)

// ---------------------------------------------------------------------------
// 用例
// ---------------------------------------------------------------------------

describe('工作台跨案件数据隔离（CC-V5-006）', () => {
  it('A 已加载后切 B：同一帧清空 A 的正文与 finding，B 加载完成前不残留旧内容', async () => {
    const backend = new FakeWorkbenchBackend()
    backend.queueResolved('state', undefined, { sessions: [brief('A', '合同A名'), brief('B', '合同B名')] })
    backend.queueResolved('detail', 'A', detailFor('A'))
    backend.queueResolved('document', 'A', docFor('A'))
    const pendingDetailB = backend.queue('detail', 'B')
    const pendingDocB = backend.queue('document', 'B')

    await mountWorkbench(backend)
    expect(treeText()).toContain(A_DOC_LABEL)
    expect(treeText()).toContain(A_FINDING)

    click(findButtonWithText('合同B名'))
    await flush()

    // 同帧：A 的正文与 finding 消失，文档区只剩占位提示；B 尚未返回。
    expect(treeText()).not.toContain(A_DOC_LABEL)
    expect(treeText()).not.toContain(A_FINDING)
    expect(treeText()).toContain(SELECT_PROMPT)
    expect(treeText()).not.toContain(B_QUESTION)

    pendingDetailB.resolve(detailFor('B'))
    await flush()
    expect(treeText()).toContain(B_QUESTION)
    expect(treeText()).not.toContain(A_FINDING)

    pendingDocB.resolve(docFor('B'))
    await flush()
    expect(treeText()).toContain('审查版文档-B')
    expect(treeText()).not.toContain(A_DOC_LABEL)
  })

  it('迟到的 A detail/document 响应不能写回已选中的 B；过期的 B 旧轮次同样被丢弃', async () => {
    const backend = new FakeWorkbenchBackend()
    backend.queueResolved('state', undefined, { sessions: [brief('A', '合同A名'), brief('B', '合同B名')] })
    backend.queueResolved('detail', 'A', detailFor('A'))
    backend.queueResolved('document', 'A', docFor('A'))
    const lateDetailA = backend.queue('detail', 'A')      // A 第二次进入的请求，将迟到
    const lateDocA = backend.queue('document', 'A')
    const staleDetailB = backend.queue('detail', 'B')     // B 第一次进入后被放弃的旧轮次
    const currentDetailB = backend.queue('detail', 'B')
    backend.queue('document', 'B')                        // B 第一次进入的 document 请求（随切换放弃）
    const currentDocB = backend.queue('document', 'B')

    await mountWorkbench(backend)
    expect(treeText()).toContain(A_FINDING)

    // A → B → A → B：制造一条切走后才返回的 A 请求。
    click(findButtonWithText('合同B名'))
    await flush()
    click(findButtonWithText('合同A名'))
    await flush()
    click(findButtonWithText('合同B名'))
    await flush()
    expect(treeText()).not.toContain(A_FINDING)

    lateDetailA.resolve(detailFor('A'))
    lateDocA.resolve(docFor('A'))
    await flush()
    expect(treeText()).not.toContain(A_FINDING)
    expect(treeText()).not.toContain(A_DOC_LABEL)
    expect(treeText()).not.toContain(B_QUESTION)

    currentDetailB.resolve(detailFor('B'))
    currentDocB.resolve(docFor('B'))
    await flush()
    expect(treeText()).toContain(B_QUESTION)
    expect(treeText()).toContain('审查版文档-B')

    staleDetailB.resolve(detailFor('A'))
    await flush()
    expect(treeText()).toContain(B_QUESTION)
    expect(treeText()).not.toContain(A_FINDING)
    expect(treeText()).not.toContain(A_DOC_LABEL)
  })

  it('detail/document 独立失败：A 文档失败仍展示 A detail；B detail 失败仍展示 B 文档；错误随切换清空', async () => {
    const backend = new FakeWorkbenchBackend()
    backend.queueResolved('state', undefined, { sessions: [brief('A', '合同A名'), brief('B', '合同B名')] })
    backend.queueResolved('detail', 'A', detailFor('A'))
    backend.queue('document', 'A').reject(new Error('docx 文件读取失败-A'))
    backend.queue('detail', 'B').reject(new Error('detail-B-失败'))
    backend.queueResolved('document', 'B', docFor('B'))

    await mountWorkbench(backend)
    // A：文档失败但 detail 独立在场，文档区只有错误 + 占位。
    expect(treeText()).toContain(A_FINDING)
    expect(treeText()).toContain('docx 文件读取失败-A')
    expect(treeText()).toContain(SELECT_PROMPT)
    expect(treeText()).not.toContain(A_DOC_LABEL)

    click(findButtonWithText('合同B名'))
    await flush()
    // 切换同帧清掉 A 的错误；B 文档独立在场、detail 失败独立报错。
    expect(treeText()).not.toContain('docx 文件读取失败-A')
    expect(treeText()).not.toContain(A_FINDING)
    expect(treeText()).toContain('审查版文档-B')
    expect(treeText()).toContain('detail-B-失败')
  })

  it('新建案件快速双击只派发一次 start；成功与失败后 busy 都在 finally 复位', async () => {
    const backend = new FakeWorkbenchBackend()
    backend.queueResolved('state', undefined, { sessions: [] })
    const firstStart = backend.queue('start')

    await mountWorkbench(backend)
    const pathInput = findByAria('合同 DOCX 本地绝对路径')
    changeValue(pathInput, '/tmp/新合同.docx')
    await flush()

    const submit = findButtonWithText('建立审查案件')
    expect(submit.props.disabled).toBe(false)
    click(submit)
    click(submit) // 双击：第二次被 busy ref 挡下
    await flush()
    expect(backend.startCalls).toEqual(['/tmp/新合同.docx'])
    expect(findButtonWithText('建立审查案件').props.disabled).toBe(true)

    firstStart.resolve({ sessionId: 'case-new', contractName: '新案件', missing: [], nextStep: '已创建' } satisfies StartReviewResult)
    await flush()
    expect(treeText()).toContain('已创建')
    // 成功后 busy 已复位：可以再次提交。
    const firstRetry = backend.queue('start')
    changeValue(findByAria('合同 DOCX 本地绝对路径'), '/tmp/再次提交.docx')
    await flush()
    click(findButtonWithText('建立审查案件'))
    expect(backend.startCalls).toEqual(['/tmp/新合同.docx', '/tmp/再次提交.docx'])

    firstRetry.reject(new Error('磁盘不可写'))
    await flush()
    expect(treeText()).toContain('创建失败')
    // 失败后 busy 同样复位。
    backend.queueResolved('start', undefined, { sessionId: 'case-new-2', contractName: '再建', missing: [], nextStep: '再次创建' })
    changeValue(findByAria('合同 DOCX 本地绝对路径'), '/tmp/第三次.docx')
    await flush()
    click(findButtonWithText('建立审查案件'))
    expect(backend.startCalls).toEqual(['/tmp/新合同.docx', '/tmp/再次提交.docx', '/tmp/第三次.docx'])
  })
})

// ---------------------------------------------------------------------------
// CC-V5-010：窄屏 tab 完整键盘语义（roving tabindex + 焦点迁移）与
// commandBusy 统一关闭门。以下全部在真实 Workbench / RailEntryButton 上驱动。
// ---------------------------------------------------------------------------

/** 窄屏视口 stub：matchMedia 恒命中 900px 断点，须在挂载前调用。 */
function stubNarrowViewport(): void {
  vi.stubGlobal('window', {
    matchMedia: (query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener(): void {},
      removeEventListener(): void {},
      addListener(): void {},
      removeListener(): void {},
      dispatchEvent: () => false,
    }),
  })
}

const TAB_IDS = ['tasks', 'document', 'operations'] as const

function findTab(id: string): MiniElement {
  let found: MiniElement | undefined
  walk(renderedRootRef, element => {
    if (element.type === 'button' && element.props.id === `ccp-tab-${id}`) found ??= element
  })
  if (found === undefined) throw new Error(`tab not found: ${id}`)
  return found
}

function findOverlay(): MiniElement {
  let found: MiniElement | undefined
  walk(renderedRootRef, element => {
    if (element.type === 'div' && (element.props.style as { position?: string } | undefined)?.position === 'fixed') found ??= element
  })
  if (found === undefined) throw new Error('overlay not found')
  return found
}

function tablist(): MiniElement {
  return findByAria('工作台区域')
}

/** 全部窄屏 tab 的 roving 快照：tabIndex 与 aria-selected 必须一一对应。 */
function rovingSnapshot(): Record<string, { tabIndex: unknown; selected: unknown }> {
  const snapshot: Record<string, { tabIndex: unknown; selected: unknown }> = {}
  for (const id of TAB_IDS) {
    const tab = findTab(id)
    snapshot[id] = { tabIndex: tab.props.tabIndex, selected: tab.props['aria-selected'] }
  }
  return snapshot
}

/** 开启焦点日志：直到下一次断言前，所有 fake dom 的 focus() 都按 dom 身份记录。 */
function startFocusLog(): Array<object> {
  focusLog = []
  return focusLog
}

function keyDown(element: MiniElement, key: string): void {
  ;(element.props.onKeyDown as ((event: FakeEvent) => void) | undefined)?.({ stopPropagation() {}, preventDefault() {}, key, target: element.dom })
}

describe('窄屏 tab roving tabindex 与键盘焦点迁移（CC-V5-010）', () => {
  it('只有 active tab 是 tabIndex=0 的停靠点，其余 -1；点击激活后 roving 跟随', async () => {
    stubNarrowViewport()
    const backend = new FakeWorkbenchBackend()
    backend.queueResolved('state', undefined, { sessions: [] })
    await mountWorkbench(backend)

    expect(rovingSnapshot()).toEqual({
      tasks: { tabIndex: 0, selected: true },
      document: { tabIndex: -1, selected: false },
      operations: { tabIndex: -1, selected: false },
    })

    // 点击激活：语义切换 + roving 跟随，但不做程序化焦点迁移。
    click(findTab('operations'))
    await flush()
    expect(rovingSnapshot()).toEqual({
      tasks: { tabIndex: -1, selected: false },
      document: { tabIndex: -1, selected: false },
      operations: { tabIndex: 0, selected: true },
    })
  })

  it('ArrowRight/ArrowLeft 同时切换 pane 并把真实焦点迁到新 active tab', async () => {
    stubNarrowViewport()
    const backend = new FakeWorkbenchBackend()
    backend.queueResolved('state', undefined, { sessions: [] })
    await mountWorkbench(backend)

    const focusCalls = startFocusLog()
    keyDown(tablist(), 'ArrowRight')
    // 键盘即迁移：焦点必须落在刚成为 active 的 tab 上，而非停留在旧 tab。
    expect(focusCalls).toEqual([findTab('document').dom])
    await flush()
    expect(rovingSnapshot()).toEqual({
      tasks: { tabIndex: -1, selected: false },
      document: { tabIndex: 0, selected: true },
      operations: { tabIndex: -1, selected: false },
    })
    // pane 同帧切换：文档区占位提示出现，任务区内容退场。
    expect(treeText()).toContain(SELECT_PROMPT)
    expect(treeText()).not.toContain('新建审查')

    // 反向键：焦点迁回 tasks tab。
    const backCalls = startFocusLog()
    keyDown(tablist(), 'ArrowLeft')
    expect(backCalls).toEqual([findTab('tasks').dom])
    await flush()
    expect(rovingSnapshot().tasks).toEqual({ tabIndex: 0, selected: true })
  })

  it('Home/End 跳到首个/最后一个 pane 并迁移焦点；方向键之外的键不被接管', async () => {
    stubNarrowViewport()
    const backend = new FakeWorkbenchBackend()
    backend.queueResolved('state', undefined, { sessions: [] })
    await mountWorkbench(backend)

    keyDown(tablist(), 'End')
    await flush()
    expect(rovingSnapshot().operations).toEqual({ tabIndex: 0, selected: true })

    const focusCalls = startFocusLog()
    keyDown(tablist(), 'Home')
    expect(focusCalls).toEqual([findTab('tasks').dom])
    await flush()
    expect(rovingSnapshot().tasks).toEqual({ tabIndex: 0, selected: true })

    // 未映射的键：不切换、不迁移焦点。
    const focusBefore = focusCalls.length
    keyDown(tablist(), 'ArrowDown')
    await flush()
    expect(rovingSnapshot().tasks).toEqual({ tabIndex: 0, selected: true })
    expect(focusCalls.length).toBe(focusBefore)
  })
})

// ---------------------------------------------------------------------------
// CC-V5-010：commandBusy 统一关闭门 —— Escape 已有门，遮罩与关闭按钮补齐。
// ---------------------------------------------------------------------------

const BUSY_ID = 'case-busy'

function createdDetail(): SessionDetail {
  return {
    session: {
      id: BUSY_ID,
      contractName: 'busy案件',
      contractPath: '/tmp/busy.docx',
      state: 'created',
      outputs: {},
      updatedAt: '2026-09-05T03:00:00.000Z',
      historyTail: [],
    },
    findings: [],
  }
}

/** 挂载并把工作台推进 commandBusy=true（run-analysis 请求挂起不放行）。 */
async function mountWithCommandInFlight(onClose: () => void): Promise<{ backend: FakeWorkbenchBackend; releaseAnalysis(): void }> {
  const backend = new FakeWorkbenchBackend()
  backend.queueResolved('state', undefined, { sessions: [{ id: BUSY_ID, contractName: 'busy案件', state: 'created', updatedAt: '2026-09-05T03:00:00.000Z' }] })
  backend.queueResolved('detail', BUSY_ID, createdDetail())
  backend.queue('document', BUSY_ID)
  const pendingAnalysis = backend.queue('run-analysis', BUSY_ID)
  await mountWorkbench(backend, onClose)
  click(findButtonWithText('启动风险分析'))
  await flush()
  // busy 已置位（启动按钮 disabled 佐证），命令仍未放行。
  expect(findButtonWithText('启动风险分析').props.disabled).toBe(true)
  return { backend, releaseAnalysis: () => pendingAnalysis.resolve({ accepted: true, dshSessionId: 'agent-1', phase: 'analysis' }) }
}

describe('commandBusy 统一关闭门（CC-V5-010）', () => {
  it('命令执行中 Escape、遮罩点击、关闭按钮均不关闭，工作台保持挂载且关闭按钮状态可感知', async () => {
    const onCloseCalls: number[] = []
    const { releaseAnalysis } = await mountWithCommandInFlight(() => { onCloseCalls.push(1) })

    const closeButton = findByAria('关闭合同审查工作台')
    expect(closeButton.props['aria-disabled']).toBe(true)

    click(closeButton)
    keyDown(findOverlay(), 'Escape')
    click(findOverlay())
    await flush()

    expect(onCloseCalls).toEqual([])
    expect(findByAria('关闭合同审查工作台')).toBeDefined()

    // 命令放行 → 空闲 → 关闭门解除，关闭按钮状态恢复可访问语义。
    releaseAnalysis()
    await flush()
    expect(findByAria('关闭合同审查工作台').props['aria-disabled']).toBeUndefined()
  })

  it('空闲时 Escape、遮罩点击、关闭按钮三个入口全部关闭', async () => {
    const onClose = vi.fn()
    const backend = new FakeWorkbenchBackend()
    backend.queueResolved('state', undefined, { sessions: [] })
    await mountWorkbench(backend, onClose)

    keyDown(findOverlay(), 'Escape')
    expect(onClose).toHaveBeenCalledTimes(1)
    click(findOverlay())
    expect(onClose).toHaveBeenCalledTimes(2)
    click(findByAria('关闭合同审查工作台'))
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('空闲关闭经真实 RailEntryButton 接线卸载后，launcher 恢复焦点', async () => {
    const backend = new FakeWorkbenchBackend()
    backend.queueResolved('state', undefined, { sessions: [] })
    vi.stubGlobal('EventSource', class { addEventListener(): void {} close(): void {} })
    vi.stubGlobal('fetch', () => new Promise<never>(() => {}))
    const client = new ContractCopilotClient(backend.connection as unknown as WorkbenchConnection)
    const Rail = RailEntryButton as unknown as (props: { client: ContractCopilotClient; wide: boolean }) => React.JSX.Element
    rootElementRef = <Rail client={client} wide={true} />
    renderRequested = true
    await flush()

    click(findByAria('打开合同审查工作台'))
    await flush()
    expect(treeText()).toContain('审查工作台')

    const focusCalls = startFocusLog()
    click(findByAria('关闭合同审查工作台'))
    await flush()
    expect(focusCalls).toEqual([findByAria('打开合同审查工作台').dom])
  })
})
