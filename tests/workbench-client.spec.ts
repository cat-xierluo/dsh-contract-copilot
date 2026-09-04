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
} from '../src/client/Workbench.tsx'
import { WORKBENCH_RPC_CHANNEL } from '../src/workbench-protocol.ts'

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
