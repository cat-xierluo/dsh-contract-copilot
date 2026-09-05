/** Browser adapter tests for authenticated Contract Copilot workbench calls. */

import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { ContractCopilotClient, type WorkbenchConnection } from '../src/client/api.ts'
import {
  adjacentPaneId,
  DIALOG_FOCUS_POLICY,
  DSH_THEME_TOKENS,
  downloadLinkStyle,
  escapeClosesDialog,
  FOCUSABLE_SELECTOR,
  historyDotStyle,
  insDelCss,
  isNarrowWidth,
  NARROW_BREAKPOINT_PX,
  NARROW_TABS,
  narrowMediaQuery,
  narrowTabStyle,
  OPERATIONS_SECTIONS,
  PAPER_COLOR_STYLE_KEYS,
  progressBarStyle,
  railButtonStyle,
  S,
  sessionRowStyle,
  statusDotStyle,
  viewButton,
  WIDE_COLUMN_SECTIONS,
  WORKBENCH_SECTIONS,
  wrapIndex,
  WORD_VIEW_HOLDER_CLASS,
  NAVIGATOR_RESET_INPUTS,
  navigatorResetKey,
  SIMPLE_VIEW_HOLDER_CLASS,
  commentMissStatusText,
  commentNavigationInputFor,
  wordRenderOptions,
  navigationGateFor,
  navigationRequestKey,
  navigationWatermarkTransition,
  paneForKey,
  type HandledNavigationWatermark,
  type NavigationGateDecision,
  findDocCommentByRefId,
  commentRowStyle,
  COMMENT_ENTRY_DATA_ATTRIBUTE,
  commentEntryAttributes,
  upsertCommentButtonRef,
  sessionNavigationReset,
  SESSION_NAVIGATION_RESET_KEYS,
  shouldActivateSession,
  sidebarCommentEntries,
  authorShortName,
  commentBodyExcerpt,
  commentAriaLabel,
  commentOpenUpdate,
  activateCommentFromTarget,
  enhanceWordCommentMarkers,
  executeNavigationRequest,
  isCommentActivationKey,
  WORD_COMMENT_MARKER_GLYPH,
} from '../src/client/Workbench.tsx'
import {
  WORD_VIEW_PLACEHOLDER_SELECTOR,
  type CommentNavigator,
  type NavElement,
  type NavigationEnvironment,
  type NavNode,
} from '../src/client/comment-navigation.ts'
import { WORKBENCH_RPC_CHANNEL, type DocComment } from '../src/workbench-protocol.ts'

describe('ContractCopilotClient', () => {
  it('通过插件自有 RPC channel 调用 state', async () => {
    const call = vi.fn().mockResolvedValue({ ok: true, value: { sessions: [] } })
    const client = new ContractCopilotClient({ rpc: { call } } as WorkbenchConnection)

    await expect(client.state()).resolves.toEqual({ sessions: [] })
    expect(call).toHaveBeenCalledWith(WORKBENCH_RPC_CHANNEL, 'state', {}, undefined)
  })

  it('保留 Host 失败码与消息', async () => {
    const connection = {
      rpc: {
        call: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: 'contract-copilot/not-found', message: 'session 不存在', details: {} },
        }),
      },
    }
    const client = new ContractCopilotClient(connection)

    await expect(client.detail('missing')).rejects.toThrow('contract-copilot/not-found: session 不存在')
  })

  it('下载 URL 编码 session 与产物类型', () => {
    const client = new ContractCopilotClient({ rpc: { call: vi.fn() } } as WorkbenchConnection)
    const url = new URL(client.downloadUrl('合同-20260904', 'reviewed'))

    expect(url.pathname).toBe('/api/contract-copilot.download')
    expect(url.searchParams.get('sessionId')).toBe('合同-20260904')
    expect(url.searchParams.get('kind')).toBe('reviewed')
  })

  it('提交与 plan hash 绑定的律师决定', async () => {
    const call = vi.fn().mockResolvedValue({ ok: true, value: { ok: true, approvedPlanHash: 'approved', approvedFindings: 1, omittedFindings: 0 } })
    const client = new ContractCopilotClient({ rpc: { call } } as WorkbenchConnection)

    await client.approvePlan('case-1', 'source', [{ findingId: 'R001', disposition: 'accept' }])

    expect(call).toHaveBeenCalledWith(WORKBENCH_RPC_CHANNEL, 'approve', {
      sessionId: 'case-1',
      sourcePlanHash: 'source',
      decisions: [{ findingId: 'R001', disposition: 'accept' }],
    }, undefined)
  })

  it('从工作台派发分析、交付和取消命令', async () => {
    const call = vi.fn().mockResolvedValue({ ok: true, value: { accepted: true, dshSessionId: 'agent-1', phase: 'analysis' } })
    const client = new ContractCopilotClient({ rpc: { call } } as WorkbenchConnection)

    await client.runAnalysis('case-1')
    await client.runDelivery('case-1')
    await client.cancel('case-1')

    expect(call.mock.calls.map(([, endpoint]) => endpoint)).toEqual(['run-analysis', 'run-delivery', 'cancel'])
  })
})

function * styleStrings(value: unknown): Generator<string> {
  if (typeof value === 'string') { yield value; return }
  if (Array.isArray(value)) { for (const item of value) yield * styleStrings(item); return }
  if (value !== null && typeof value === 'object') { for (const item of Object.values(value)) yield * styleStrings(item) }
}

/** Every style object exported by the workbench, across all boolean variants. */
const ALL_STYLES: Array<Record<string, unknown>> = [
  S,
  viewButton(true), viewButton(false),
  railButtonStyle(true, true), railButtonStyle(true, false), railButtonStyle(false, true), railButtonStyle(false, false),
  statusDotStyle(true, true), statusDotStyle(true, false), statusDotStyle(false, true), statusDotStyle(false, false),
  sessionRowStyle(true), sessionRowStyle(false),
  narrowTabStyle(true), narrowTabStyle(false),
  progressBarStyle(true, false, false), progressBarStyle(false, true, true), progressBarStyle(false, false, false),
  historyDotStyle(true), historyDotStyle(false),
  downloadLinkStyle('reviewed'), downloadLinkStyle('report'),
  commentRowStyle(true), commentRowStyle(false),
]

function referencedTokens(): Set<string> {
  const tokens = new Set<string>()
  for (const style of ALL_STYLES) {
    for (const value of styleStrings(style)) {
      for (const match of value.matchAll(/var\((--[a-z0-9-]+)/g)) tokens.add(match[1])
    }
  }
  return tokens
}

/** Raw colors that survive stripping complete `var(--token, fallback)` groups. */
function rawColorEntries(style: Record<string, unknown>): string[] {
  const found: string[] = []
  for (const value of Object.values(style)) {
    if (typeof value !== 'string') continue
    const stripped = value.replace(/var\(--[a-z0-9-]+(\s*,[^)]*)?\)/g, '')
    found.push(...(stripped.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g) ?? []))
  }
  return found
}

describe('workbench theme tokens', () => {
  it('references only DSH theme tokens that exist in the shipped UI packages', () => {
    const used = referencedTokens()
    expect(used.size).toBeGreaterThan(10)
    const allowlist = new Set<string>(DSH_THEME_TOKENS)
    expect([...used].filter(token => !allowlist.has(token))).toEqual([])
  })

  it('drops the invented tokens that never existed in the DSH theme', () => {
    const used = referencedTokens()
    expect(used.has('--dsw-alias-fg-base')).toBe(false)
    expect(used.has('--dsw-alias-bg-subtle')).toBe(false)
    expect(used.has('--dsw-alias-fg-muted')).toBe(false)
  })

  it('keeps raw colors only on the intentional paper document canvas', () => {
    for (const [key, style] of Object.entries(S)) {
      const colors = rawColorEntries(style)
      if (PAPER_COLOR_STYLE_KEYS.includes(key as (typeof PAPER_COLOR_STYLE_KEYS)[number])) continue
      expect(colors, `style ${key} carries raw colors ${String(colors)}`).toEqual([])
    }
    expect(rawColorEntries(S.docFrame)).toEqual(['#fff', '#1d1d1b'])
  })

  it('routes the core roles through tokens the host re-maps per theme', () => {
    expect(S.panel.background).toContain('var(--dsw-alias-bg-layer-2')
    expect(S.panel.color).toContain('var(--dsw-alias-label-primary')
    expect(S.title.color).toContain('var(--dsw-alias-label-primary')
    expect(S.muted.color).toContain('var(--dsw-alias-label-secondary')
    expect(S.overlay.background).toContain('var(--dsw-alias-bg-mask-1')
    expect(S.overlay.backdropFilter).toContain('var(--dsw-mask-blur')
    expect(S.btn.background).toContain('var(--dsw-alias-button-primary-fill')
    expect(S.btn.color).toContain('var(--dsw-alias-label-primary-inverted')
    expect(S.input.background).toContain('var(--dsw-alias-bg-layer-1')
    expect(S.doc.background).toContain('var(--dsw-alias-bg-layer-1')
    expect(S.errorStrip.color).toContain('var(--dsw-alias-state-error-primary')
    expect(S.intakeCard.background).toContain('var(--dsw-alias-state-warn-secondary')
    expect(viewButton(true).background).toContain('var(--dsw-alias-button-primary-fill')
    expect(progressBarStyle(false, true, false).bar).toContain('var(--dsw-alias-state-business-primary')
    expect(progressBarStyle(false, true, true).bar).toContain('var(--dsw-alias-state-error-primary')
    expect(progressBarStyle(true, false, false).bar).toContain('var(--dsw-alias-state-success-primary')
  })

  it('removes the narrow-viewport media query and keeps paper-scoped marks only', () => {
    expect(insDelCss.includes('@media')).toBe(false)
    expect(insDelCss.includes('display: none')).toBe(false)
    for (const match of insDelCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = match[1].trim()
      if (selector.startsWith('.ccp-doc')) continue
      const body = match[2].replace(/var\(--[a-z0-9-]+(\s*,[^)]*)?\)/g, '')
      expect(body.includes('#'), `rule "${selector}" embeds a raw color`).toBe(false)
    }
    expect(insDelCss).toContain('var(--dsw-alias-label-tertiary')
  })
})

describe('workbench narrow layout control', () => {
  it('reaches every section in the narrow tabs exactly as the wide columns do', () => {
    const flat = (sections: readonly string[]): string[] => sections.flatMap(section => [...section])
    expect(flat(WIDE_COLUMN_SECTIONS)).toEqual([...WORKBENCH_SECTIONS])
    expect(flat(NARROW_TABS.map(tab => tab.sections))).toEqual([...WORKBENCH_SECTIONS])
    const operationsTab = NARROW_TABS[NARROW_TABS.length - 1]
    expect(operationsTab.sections).toEqual([...OPERATIONS_SECTIONS])
    expect(WIDE_COLUMN_SECTIONS[WIDE_COLUMN_SECTIONS.length - 1]).toEqual([...OPERATIONS_SECTIONS])
    for (const tab of NARROW_TABS) expect(tab.sections.length).toBeGreaterThan(0)
  })

  it('engages at or below the 900px breakpoint and stays wide above it', () => {
    expect(NARROW_BREAKPOINT_PX).toBe(900)
    expect(isNarrowWidth(899)).toBe(true)
    expect(isNarrowWidth(900)).toBe(true)
    expect(isNarrowWidth(901)).toBe(false)
    expect(narrowMediaQuery()).toBe('(max-width: 900px)')
  })

  it('moves between panes with wrapping arrow-key navigation', () => {
    expect(adjacentPaneId('tasks', 1)).toBe('document')
    expect(adjacentPaneId('document', 1)).toBe('operations')
    expect(adjacentPaneId('operations', 1)).toBe('tasks')
    expect(adjacentPaneId('tasks', -1)).toBe('operations')
    expect(adjacentPaneId('operations', -1)).toBe('document')
  })

  it('resolves the full tablist keyboard model: arrows wrap, Home/End bound, other keys untouched (CC-V5-010)', () => {
    expect(paneForKey('ArrowRight', 'tasks')).toBe('document')
    expect(paneForKey('ArrowRight', 'operations')).toBe('tasks')
    expect(paneForKey('ArrowLeft', 'tasks')).toBe('operations')
    expect(paneForKey('ArrowLeft', 'document')).toBe('tasks')
    expect(paneForKey('Home', 'operations')).toBe('tasks')
    expect(paneForKey('End', 'tasks')).toBe('operations')
    expect(paneForKey('ArrowDown', 'tasks')).toBeUndefined()
    expect(paneForKey('ArrowUp', 'tasks')).toBeUndefined()
    expect(paneForKey('Escape', 'tasks')).toBeUndefined()
    expect(paneForKey(' ', 'tasks')).toBeUndefined()
  })
})

describe('workbench dialog focus policy', () => {
  it('wraps Tab focus around both edges and enters from outside at an edge', () => {
    expect(wrapIndex(0, 0, false)).toBe(-1)
    expect(wrapIndex(3, -1, false)).toBe(0)
    expect(wrapIndex(3, -1, true)).toBe(2)
    expect(wrapIndex(3, 0, false)).toBe(1)
    expect(wrapIndex(3, 2, false)).toBe(0)
    expect(wrapIndex(3, 0, true)).toBe(2)
    expect(wrapIndex(3, 1, true)).toBe(0)
  })

  it('gates Escape close on in-flight commands and restores the launcher', () => {
    expect(escapeClosesDialog(false)).toBe(true)
    expect(escapeClosesDialog(true)).toBe(false)
    expect(DIALOG_FOCUS_POLICY).toEqual({ initial: 'panel', restore: 'launcher', escapeGatedByBusy: true })
  })

  it('tab-containment selector skips disabled controls and covers interactive kinds', () => {
    expect(FOCUSABLE_SELECTOR).toContain('button:not([disabled])')
    expect(FOCUSABLE_SELECTOR).toContain('input:not([disabled])')
    expect(FOCUSABLE_SELECTOR).toContain('select:not([disabled])')
    expect(FOCUSABLE_SELECTOR).toContain('a[href]')
    expect(FOCUSABLE_SELECTOR).toContain('[tabindex]:not([tabindex="-1"])')
    expect(FOCUSABLE_SELECTOR).not.toContain('button,')
  })
})

const exactComment: DocComment = {
  id: '7',
  author: '张三｜法务',
  text: '违约金上限建议不超过合同总额的 20%。',
  anchorId: 'ccm-ab12cd34',
  anchor: { status: 'exact', paragraphIndex: 4, quote: '违约金上限' },
}

const fallbackComment: DocComment = {
  id: '9',
  author: '李四｜外部律师',
  text: '本条为孤立批注，正文无引用位置。',
  anchorId: 'ccm-ef56ab78',
  anchor: { status: 'fallback', reason: 'orphan-comment', paragraphIndex: 2 },
}

describe('workbench comment navigation', () => {
  it('开启批注渲染并显式固定 docx class（引用气泡 .docx-comment-ref 依赖该插值）', () => {
    const options = wordRenderOptions()
    expect(options.renderComments).toBe(true)
    expect(options.className).toBe('docx')
  })

  it('两种视图的挂载点带可导航的 holder class', () => {
    expect(WORD_VIEW_HOLDER_CLASS).toBe('ccp-docx-word')
    expect(SIMPLE_VIEW_HOLDER_CLASS).toBe('ccp-doc ccp-docx-simple')
  })

  /**
   * JSX 接线无法用纯 helper 覆盖，按断言读 Workbench 源码：声明 holder class
   * 的挂载点 div 必须把 ref 接到对应 holder ref 上。simple 挂载点缺
   * `ref={simpleHolder}` 曾让导航 effect 里的 `simpleHolder.current` 恒为
   * null，侧栏在简版视图的每次跳转都静默返回。
   */
  const workbenchSourceLine = (marker: string): string => {
    const source = readFileSync(new URL('../src/client/Workbench.tsx', import.meta.url), 'utf8')
    const line = source.split('\n').find(candidate => candidate.includes(marker))
    if (line === undefined) throw new Error(`Workbench 源码应渲染 ${marker}`)
    return line
  }

  it('word 与 simple 两个挂载点 div 都接到 holder ref（接线丢失即导航静默失效）', () => {
    expect(workbenchSourceLine('className={WORD_VIEW_HOLDER_CLASS}')).toContain('ref={wordHolder}')
    expect(workbenchSourceLine('className={SIMPLE_VIEW_HOLDER_CLASS}')).toContain('ref={simpleHolder}')
  })

  it('word 视图用 OOXML id 空间，simple 视图用 anchorId 空间', () => {
    const word = commentNavigationInputFor(exactComment, 'word')
    expect(word.anchor.commentId).toBe('7')
    expect(word.anchor.refSelector).toBe('.docx-comment-ref')
    expect(word.options.defaultRefSelector).toBe('.docx-comment-ref')
    const simple = commentNavigationInputFor(fallbackComment, 'simple')
    expect(simple.anchor.commentId).toBe('ccm-ef56ab78')
    expect(simple.options.attributeName).toBe('data-cc-anchor')
    expect(simple.options.defaultRefSelector).toBe('.cc-comment')
  })

  it('word 视图把 exact 锚点的引文降级为文本提示，fallback 锚点不带提示', () => {
    expect(commentNavigationInputFor(exactComment, 'word').anchor.textHint).toBe('违约金上限')
    expect(commentNavigationInputFor(fallbackComment, 'word').anchor.textHint).toBeUndefined()
  })

  it('每种未命中原因都有非空且互不相同的本地化 status 文案', () => {
    const reasons: CommentMissReason[] = [
      'invalid-anchor', 'root-empty', 'comments-not-rendered', 'id-not-found', 'ordinal-out-of-range', 'text-not-found',
    ]
    const texts = reasons.map(commentMissStatusText)
    for (const text of texts) expect(text.length).toBeGreaterThan(0)
    expect(new Set(texts).size).toBe(reasons.length)
  })

  it('session、视图或重渲染任一变化都会改变 navigator 重置键', () => {
    expect(NAVIGATOR_RESET_INPUTS).toEqual(['session', 'view', 'render'])
    const base = navigatorResetKey('s1', 'word', 0)
    expect(navigatorResetKey('s1', 'word', 0)).toBe(base)
    expect(navigatorResetKey('s2', 'word', 0)).not.toBe(base)
    expect(navigatorResetKey('s1', 'simple', 0)).not.toBe(base)
    expect(navigatorResetKey('s1', 'word', 1)).not.toBe(base)
  })
})

describe('navigationGateFor 渲染就绪门控', () => {
  it('word 视图未就绪时 hold，就绪后 execute；simple 视图无需等待渲染', () => {
    expect(navigationGateFor(undefined, 'word', false, null, 's1')).toBe('skip')
    expect(navigationGateFor({ seq: 1 }, 'word', false, null, 's1')).toBe('hold')
    expect(navigationGateFor({ seq: 1 }, 'word', true, null, 's1')).toBe('execute')
    expect(navigationGateFor({ seq: 1 }, 'simple', false, null, 's1')).toBe('execute')
  })

  it('同 session 同 seq 至多执行一次；重复点击产生新 seq 仍然执行', () => {
    expect(navigationGateFor({ seq: 3 }, 'word', true, navigationRequestKey('s1', 3), 's1')).toBe('skip')
    expect(navigationGateFor({ seq: 4 }, 'word', true, navigationRequestKey('s1', 3), 's1')).toBe('execute')
  })

  it('session 切换后 seq 从 1 重新计数，旧 session 的水位不得吞掉新 session 的首击', () => {
    // WordPane 在 session 切换时复用实例（无 remount），水位必须以 session 为键
    expect(navigationRequestKey('s1', 1)).not.toBe(navigationRequestKey('s2', 1))
    expect(navigationGateFor({ seq: 1 }, 'word', true, navigationRequestKey('s1', 1), 's2')).toBe('execute')
    expect(navigationGateFor({ seq: 1 }, 'simple', true, navigationRequestKey('s1', 1), 's2')).toBe('execute')
  })
})

describe('导航水位生命周期：A→B→A 返回后的首击不被吞', () => {
  /**
   * 按 WordPane 导航 effect 的真实步骤驱动一次 effect run：先同步水位生命周期
   * （navigationWatermarkTransition），再用同步后的水位过门，执行成功才落水位。
   */
  function runNavigationEffect(
    watermarkRef: { current: HandledNavigationWatermark | undefined },
    sessionId: string,
    request: { seq: number } | undefined,
    view: 'word' | 'simple',
    wordReady: boolean,
  ): NavigationGateDecision {
    const synced = navigationWatermarkTransition(sessionId, watermarkRef.current)
    watermarkRef.current = synced
    if (request === undefined) return 'skip'
    const decision = navigationGateFor(request, view, wordReady, synced.handledKey, sessionId)
    if (decision === 'execute') {
      watermarkRef.current = { session: sessionId, handledKey: navigationRequestKey(sessionId, request.seq) }
    }
    return decision
  }

  it('A:1 已处理 → B → A → 重启的 A:1 必须 execute；未离场的连续 A:1 仍 skip', () => {
    const watermarkRef: { current: HandledNavigationWatermark | undefined } = { current: undefined }

    // 案件 A 首击：执行并落水位 A::1
    expect(runNavigationEffect(watermarkRef, 'A', { seq: 1 }, 'word', true)).toBe('execute')
    expect(watermarkRef.current).toEqual({ session: 'A', handledKey: navigationRequestKey('A', 1) })

    // 未离开 A 的 effect 重放（mode/wordReady 变化等）：同一连续请求不得重复执行
    expect(runNavigationEffect(watermarkRef, 'A', { seq: 1 }, 'word', true)).toBe('skip')

    // A→B：父级激活清空请求；水位随 session 变化归零
    expect(runNavigationEffect(watermarkRef, 'B', undefined, 'word', true)).toBe('skip')
    expect(watermarkRef.current).toEqual({ session: 'B', handledKey: null })

    // B→A：请求仍为空，不执行
    expect(runNavigationEffect(watermarkRef, 'A', undefined, 'simple', true)).toBe('skip')

    // 回到 A 后同一批注的首击（父级 seq 已重启为 1）：必须执行——
    // 旧实现在此用残留的 A::1 水位判 skip，正是验收浏览器复现的吞首击缺陷
    expect(runNavigationEffect(watermarkRef, 'A', { seq: 1 }, 'simple', true)).toBe('execute')
    expect(watermarkRef.current).toEqual({ session: 'A', handledKey: navigationRequestKey('A', 1) })
  })

  it('word 渲染未就绪时 hold 不落水位，就绪后的重放执行（render-ready 语义保持）', () => {
    const watermarkRef: { current: HandledNavigationWatermark | undefined } = { current: undefined }

    expect(runNavigationEffect(watermarkRef, 'A', { seq: 1 }, 'word', false)).toBe('hold')
    expect(watermarkRef.current).toEqual({ session: 'A', handledKey: null })

    expect(runNavigationEffect(watermarkRef, 'A', { seq: 1 }, 'word', true)).toBe('execute')
  })
})

describe('session 激活的导航状态清理', () => {
  it('统一激活路径的重置补丁覆盖请求、选中与聚焦序号；按钮 registry 一并清空', () => {
    expect(SESSION_NAVIGATION_RESET_KEYS).toEqual([
      'navigationRequest', 'selectedCommentId', 'commentFocusSeq', 'commentButtonRegistry',
    ])
    expect(sessionNavigationReset()).toEqual({ navigationRequest: undefined, selectedCommentId: undefined, commentFocusSeq: 0 })
  })

  it('重复激活同一会话是幂等 no-op：首次选择与跨会话切换仍完整 reset', () => {
    // 首次选择：无当前会话 → 激活
    expect(shouldActivateSession(undefined, 'A')).toBe(true)
    // 同 id 重复激活（重复点击已选中行）：no-op —— 激活 reset 会把 seq 清回 1，
    // 而复用的 WordPane 保留 A::1 水位，下一次同一批注的首击会被误判为已处理
    expect(shouldActivateSession('A', 'A')).toBe(false)
    // A→B / B→A 跨会话切换：仍激活并完整 reset
    expect(shouldActivateSession('A', 'B')).toBe(true)
  })
})

describe('侧栏批注条目：全量渲染与可访问名称', () => {
  const many: DocComment[] = Array.from({ length: 13 }, (_, index) => ({
    id: String(index + 1),
    author: index === 0 ? '张三｜法务' : '李四',
    text: `第 ${String(index + 1)} 条批注正文`,
    anchorId: `ccm-${String(index).padStart(8, '0')}`,
    anchor: { status: 'exact', paragraphIndex: index, quote: '引文' },
  }))

  it('每一条 DocComment 都有条目，第 13 条不再被截断（否则正文→侧栏命中无按钮可聚焦）', () => {
    const entries = sidebarCommentEntries(many, '13')
    expect(entries).toHaveLength(13)
    expect(entries[12]?.attributes).toEqual({ 'data-cc-comment-entry': '13' })
    expect(entries[12]?.selected).toBe(true)
    expect(entries[0]?.selected).toBe(false)
    expect(entries.map(entry => entry.comment)).toEqual(many)
  })

  it('作者短名去掉角色后缀，与侧栏可见行同一约定', () => {
    expect(authorShortName('张三｜法务')).toBe('张三')
    expect(authorShortName('李四')).toBe('李四')
    expect(authorShortName('')).toBe('')
  })

  it('正文摘录按 120 字截断并带省略号，短文原样', () => {
    expect(commentBodyExcerpt('短文本')).toBe('短文本')
    expect(commentBodyExcerpt('长'.repeat(121))).toBe(`${'长'.repeat(120)}…`)
  })

  it('aria-label 由作者短名 + 正文摘录组合，而非仅正文', () => {
    const comment: DocComment = { ...exactComment, author: '张三｜法务' }
    expect(commentAriaLabel(comment)).toBe(`张三｜${comment.text}`)
    expect(commentAriaLabel({ ...comment, author: '' })).toBe(comment.text)
    const long: DocComment = { ...comment, author: '王五', text: 'x'.repeat(121) }
    expect(commentAriaLabel(long)).toBe(`王五｜${'x'.repeat(120)}…`)
  })
})

describe('侧栏打开批注：选中与导航请求同帧更新', () => {
  it('打开即选中该条目，并生成 seq 递增的导航请求以支持重复点击', () => {
    const first = commentOpenUpdate({}, exactComment)
    expect(first.selectedCommentId).toBe('7')
    expect(first.navigationRequest).toEqual({ comment: exactComment, seq: 1 })
    const second = commentOpenUpdate({ navigationRequest: first.navigationRequest }, exactComment)
    expect(second.selectedCommentId).toBe('7')
    expect(second.navigationRequest.seq).toBe(2)
  })

  it('改点另一条批注时选中态跟随点击目标', () => {
    const next = commentOpenUpdate({ navigationRequest: { comment: exactComment, seq: 5 } }, fallbackComment)
    expect(next.selectedCommentId).toBe('9')
    expect(next.navigationRequest.comment).toBe(fallbackComment)
    expect(next.navigationRequest.seq).toBe(6)
  })
})

describe('正文反向命中后的侧栏批注匹配', () => {
  it('word 视图按 OOXML id 匹配 DocComment.id，不认 anchorId', () => {
    expect(findDocCommentByRefId([exactComment], 'word', '7')).toBe(exactComment)
    expect(findDocCommentByRefId([exactComment], 'word', 'ccm-ab12cd34')).toBeUndefined()
  })

  it('simple 视图按 anchorId 匹配 DocComment.anchorId，不认 OOXML id', () => {
    expect(findDocCommentByRefId([fallbackComment], 'simple', 'ccm-ef56ab78')).toBe(fallbackComment)
    expect(findDocCommentByRefId([fallbackComment], 'simple', '9')).toBeUndefined()
  })

  it('无命中返回 undefined', () => {
    expect(findDocCommentByRefId([exactComment, fallbackComment], 'word', '404')).toBeUndefined()
  })
})

describe('侧栏批注按钮：选中态与 ref/data 注册', () => {
  it('选中态使用 DSH active surface token，未选中保持透明', () => {
    expect(commentRowStyle(true).background).toContain('var(--dsw-alias-interactive-bg-active')
    expect(commentRowStyle(false).background).toBe('transparent')
  })

  it('按钮携带稳定的 data 映射；registry 按 ref 回调语义 upsert', () => {
    expect(COMMENT_ENTRY_DATA_ATTRIBUTE).toBe('data-cc-comment-entry')
    expect(commentEntryAttributes('7')).toEqual({ 'data-cc-comment-entry': '7' })

    const registry = new Map<string, HTMLButtonElement | null>()
    const node = { focus() {}, scrollIntoView() {} } as unknown as HTMLButtonElement
    upsertCommentButtonRef(registry, '7', node)
    expect(registry.get('7')).toBe(node)
    upsertCommentButtonRef(registry, '7', null)
    expect(registry.has('7')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// word 视图 run 样式占位（真实 reviewed DOCX 形态）：可见、可感知、键盘可操作
// ---------------------------------------------------------------------------

/** 结构化假占位：记录 setAttribute 与文本写入，previousSibling 只暴露 textContent。 */
function enhanceFakeMarker(prevText: string | null, initialText = ''): {
  attrs: Record<string, string>
  textContent: string
  previousSibling: { readonly textContent: string | null } | null
  getAttribute(name: string): string | null
  setAttribute(name: string, value: string): void
} {
  const attrs: Record<string, string> = {}
  return {
    attrs,
    textContent: initialText,
    previousSibling: prevText === null ? null : { textContent: prevText },
    getAttribute(name) {
      return Object.hasOwn(attrs, name) ? attrs[name]! : null
    },
    setAttribute(name, value) {
      attrs[name] = value
    },
  }
}

function enhanceFakeRoot(markers: readonly ReturnType<typeof enhanceFakeMarker>[], selectors: string[]): {
  querySelectorAll(selector: string): ArrayLike<(typeof markers)[number]>
} {
  return {
    querySelectorAll(selector: string) {
      selectors.push(selector)
      return markers
    },
  }
}

describe('enhanceWordCommentMarkers：run 样式占位升级为批注入口', () => {
  it('只按占位选择器查询，可解析的占位获得按钮语义、可达名称与入口字形', () => {
    const selectors: string[] = []
    const ariaLabel = '查看这条批注'
    const marker = enhanceFakeMarker('end of comment #0')
    const root = enhanceFakeRoot([marker], selectors)

    const enhanced = enhanceWordCommentMarkers(root, ariaLabel)

    expect(selectors).toEqual([WORD_VIEW_PLACEHOLDER_SELECTOR])
    expect(enhanced).toBe(1)
    expect(marker.attrs).toEqual({
      role: 'button',
      tabindex: '0',
      'aria-label': ariaLabel,
      title: ariaLabel,
    })
    expect(marker.textContent).toBe(WORD_COMMENT_MARKER_GLYPH)
  })

  it('不可解析的占位（无相邻节点/错误邻接）保持原样且不计数，不制造死按钮', () => {
    const selectors: string[] = []
    const orphan = enhanceFakeMarker(null)
    const wrongAdjacent = enhanceFakeMarker('start of comment #0')
    const root = enhanceFakeRoot([orphan, wrongAdjacent], selectors)

    const enhanced = enhanceWordCommentMarkers(root, '查看这条批注')

    expect(enhanced).toBe(0)
    expect(orphan.attrs).toEqual({})
    expect(wrongAdjacent.attrs).toEqual({})
    expect(orphan.textContent).toBe('')
    expect(wrongAdjacent.textContent).toBe('')
  })

  it('重复执行幂等：已有字形不重复写入', () => {
    const selectors: string[] = []
    const marker = enhanceFakeMarker('end of comment #0', WORD_COMMENT_MARKER_GLYPH)
    const root = enhanceFakeRoot([marker], selectors)

    enhanceWordCommentMarkers(root, '查看这条批注')

    expect(marker.textContent).toBe(WORD_COMMENT_MARKER_GLYPH)
  })
})

// ---------------------------------------------------------------------------
// 反向激活共用路径：click 与 Enter/Space 走同一个函数
// ---------------------------------------------------------------------------

/** 反向激活用的最小环境：命中集合静态给定，其余副作用为 no-op。 */
function staticHitEnv(hits: readonly NavElement[]): NavigationEnvironment {
  return {
    commentNodes: () => [],
    querySelectorAll: () => hits,
    scrollIntoView: () => {},
    focus: () => {},
    addClass: () => {},
    removeClass: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
  }
}

function fakeWordMarkerNode(className: string, prevText: string | null): NavElement {
  return {
    nodeType: 1,
    tagName: 'span',
    getAttribute: (name: string) => (name === 'class' ? className : null),
    textContent: '',
    parentElement: null,
    nextElementSibling: null,
    previousSibling: prevText === null ? null : ({ textContent: prevText } as unknown as NavNode),
  } as unknown as NavElement
}

describe('反向激活共用路径（click 与 Enter/Space 共用）', () => {
  it('激活键只有 Enter 与空格；其余键不拦截', () => {
    expect(isCommentActivationKey('Enter')).toBe(true)
    expect(isCommentActivationKey(' ')).toBe(true)
    expect(isCommentActivationKey('Enter ')).toBe(false)
    expect(isCommentActivationKey('Spacebar')).toBe(false)
    expect(isCommentActivationKey('a')).toBe(false)
    expect(isCommentActivationKey('Escape')).toBe(false)
  })

  it('click 与键盘共用 activateCommentFromTarget：命中即回调并报告 true', () => {
    const placeholder = fakeWordMarkerNode('docx_commentreference', 'end of comment #0')
    const root = { nodeType: 1, tagName: 'div' } as unknown as NavElement
    const activated: Array<readonly ['word' | 'simple', string]> = []

    const fromClick = activateCommentFromTarget(staticHitEnv([placeholder]), root, placeholder, 'word', (view, refId) => activated.push([view, refId]))
    const fromKeyboard = activateCommentFromTarget(staticHitEnv([placeholder]), root, placeholder, 'word', (view, refId) => activated.push([view, refId]))

    expect(fromClick).toBe(true)
    expect(fromKeyboard).toBe(true)
    expect(activated).toEqual([['word', '0'], ['word', '0']])
  })

  it('原生气泡与占位两条路径都可用；未命中返回 false 且不回调', () => {
    const bubble = fakeWordMarkerNode('docx-comment-ref', 'comment #7 by 张律师 on 2026/9/4')
    const root = { nodeType: 1, tagName: 'div' } as unknown as NavElement
    const activated: string[] = []

    expect(activateCommentFromTarget(staticHitEnv([bubble]), root, bubble, 'word', (_view, refId) => activated.push(refId))).toBe(true)
    expect(activated).toEqual(['7'])
    expect(activateCommentFromTarget(staticHitEnv([bubble]), root, { nodeType: 1, parentElement: null } as unknown as NavNode, 'word', () => activated.push('miss'))).toBe(false)
    expect(activateCommentFromTarget(staticHitEnv([bubble]), root, null, 'word', () => activated.push('miss'))).toBe(false)
    expect(activated).toEqual(['7'])
  })
})

describe('word 占位入口样式：限定在 Word 视图容器内', () => {
  it('占位相关规则全部以 .ccp-docx-word 开头，不污染全局', () => {
    const placeholderRules = [...insDelCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map((match) => match[1].trim())
      .filter((selector) => selector.includes(WORD_VIEW_PLACEHOLDER_SELECTOR))
    expect(placeholderRules.length).toBeGreaterThanOrEqual(2)
    for (const selector of placeholderRules) {
      expect(selector.startsWith(`.${WORD_VIEW_HOLDER_CLASS}`), `选择器未限定容器：${selector}`).toBe(true)
    }
  })

  it('提供键盘焦点环与指针反馈，颜色走 DSH 主题 token', () => {
    expect(insDelCss).toContain('.ccp-docx-word .docx_commentreference:focus-visible')
    expect(insDelCss).toContain('cursor: pointer')
    expect(insDelCss).toContain('var(--dsw-alias-state-business-primary')
  })
})

describe('前向导航接线：视图绑定 options 随 navigate 传递', () => {
  it('simple/word 请求各自把打点属性与气泡选择器传给 navigator（丢弃它曾让 simple 每次跳转都未命中）', () => {
    const calls: Array<{ anchorId: string; callOptions: unknown }> = []
    const navigator: CommentNavigator = {
      navigate(_root, anchor, callOptions) {
        calls.push({ anchorId: anchor.commentId, callOptions })
        return { ok: false, reason: 'root-empty', message: 'recording navigator' }
      },
      cleanup() {},
      get activeFlashElement() {
        return null
      },
    }
    const root = { nodeType: 1, tagName: 'div' } as unknown as NavElement

    executeNavigationRequest(navigator, root, fallbackComment, 'simple')
    executeNavigationRequest(navigator, root, exactComment, 'word')

    expect(calls).toEqual([
      { anchorId: 'ccm-ef56ab78', callOptions: { attributeName: 'data-cc-anchor', defaultRefSelector: '.cc-comment' } },
      { anchorId: '7', callOptions: { defaultRefSelector: '.docx-comment-ref' } },
    ])
  })
})

describe('批注导航短暂高亮：跳转目标在两个视图上都可见', () => {
  const flashRules = [...insDelCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((match) => match[1].includes('cc-comment-flash'))
    .map((match) => ({ selector: match[1].trim(), body: match[2] }))

  it('flash 规则同时覆盖 simple 与 word 两个文档容器', () => {
    const joined = flashRules.map((rule) => rule.selector).join('\n')
    expect(joined).toContain('.ccp-doc .cc-comment-flash')
    expect(joined).toContain(`.${WORD_VIEW_HOLDER_CLASS} .cc-comment-flash`)
  })

  it('flash 规则限定在文档画布内，并带可见的背景与描边（纸面静态色，两种主题都可读）', () => {
    expect(flashRules.length).toBeGreaterThanOrEqual(1)
    for (const rule of flashRules) {
      expect(rule.selector.startsWith('.ccp-doc'), `flash 规则未限定文档容器：${rule.selector}`).toBe(true)
      expect(rule.body).toContain('background:')
      expect(rule.body).toContain('outline:')
    }
  })
})
