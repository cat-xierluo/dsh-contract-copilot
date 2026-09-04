/** Browser adapter tests for authenticated Contract Copilot workbench calls. */

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
  findDocCommentByRefId,
  commentRowStyle,
  COMMENT_ENTRY_DATA_ATTRIBUTE,
  commentEntryAttributes,
  upsertCommentButtonRef,
} from '../src/client/Workbench.tsx'
import type { CommentMissReason } from '../src/client/comment-navigation.ts'
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
    expect(navigationGateFor(undefined, 'word', false, 0)).toBe('skip')
    expect(navigationGateFor({ seq: 1 }, 'word', false, 0)).toBe('hold')
    expect(navigationGateFor({ seq: 1 }, 'word', true, 0)).toBe('execute')
    expect(navigationGateFor({ seq: 1 }, 'simple', false, 0)).toBe('execute')
  })

  it('同一 seq 至多执行一次；重复点击产生新 seq 仍然执行', () => {
    expect(navigationGateFor({ seq: 3 }, 'word', true, 3)).toBe('skip')
    expect(navigationGateFor({ seq: 4 }, 'word', true, 3)).toBe('execute')
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
