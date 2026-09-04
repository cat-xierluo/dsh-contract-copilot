/** Embedded contract-review queue, document view, decisions, and delivery history. */

import { renderAsync } from 'docx-preview'
import React, { useEffect, useRef, useState } from 'react'
import type { SidebarFooterActionOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { AutomationStatus, FindingDisposition, SessionState } from '../session-types.ts'
import type {
  DocComment,
  DocumentView,
  SessionBrief,
  SessionDetail,
} from '../workbench-protocol.ts'
import { ContractCopilotClient } from './api.ts'
import {
  automationNoticeSettled,
  decisionRequests,
  findingId,
  findingText,
  phaseIndex,
  type FindingDecisionDraft,
} from './decision-model.ts'
import { browserLocale, createTranslator, type MessageKey } from './locale.ts'

const label = createTranslator(browserLocale())

const STATE_KEYS: Record<SessionState, MessageKey> = {
  created: 'state.created',
  intake_done: 'state.intake_done',
  plan_ready: 'state.plan_ready',
  applying: 'state.applying',
  applied: 'state.applied',
  partial: 'state.partial',
  rejected: 'state.rejected',
  failed: 'state.failed',
  delivered: 'state.delivered',
}

const TOOL_KEYS: Record<string, MessageKey> = {
  contract_copilot_intake: 'tool.contract_copilot_intake',
  contract_copilot_analyze: 'tool.contract_copilot_analyze',
  contract_copilot_apply: 'tool.contract_copilot_apply',
  contract_copilot_finalize: 'tool.contract_copilot_finalize',
  contract_copilot_resume: 'tool.contract_copilot_resume',
  contract_copilot_recheck: 'tool.contract_copilot_recheck',
}

const AUTOMATION_KEYS: Record<AutomationStatus, MessageKey> = {
  idle: 'automation.idle',
  'running-analysis': 'automation.running-analysis',
  'waiting-decisions': 'automation.waiting-decisions',
  'running-delivery': 'automation.running-delivery',
  failed: 'automation.failed',
  delivered: 'automation.delivered',
}

const DISPOSITION_KEYS: Array<[FindingDisposition, MessageKey]> = [
  ['accept', 'disposition.accept'],
  ['comment-only', 'disposition.comment-only'],
  ['report-only', 'disposition.report-only'],
  ['omit', 'disposition.omit'],
]

/**
 * DSH UI theme tokens verified to exist in the shipped 0.1.2-rc.1 client
 * packages (`@deepseek-ai/dsh-client-ui-*` stylesheets and bundles). The host
 * re-maps every alias here per light/dark theme, so styling through this set
 * is what keeps the workbench readable in both modes. Style code below must
 * reference tokens from this list (tests enforce it).
 */
export const DSH_THEME_TOKENS = [
  '--dsw-alias-bg-base',
  '--dsw-alias-bg-layer-1',
  '--dsw-alias-bg-layer-2',
  '--dsw-alias-bg-mask-1',
  '--dsw-alias-border-l2',
  '--dsw-alias-border-l3',
  '--dsw-alias-border-inverted',
  '--dsw-alias-label-primary',
  '--dsw-alias-label-secondary',
  '--dsw-alias-label-tertiary',
  '--dsw-alias-label-primary-inverted',
  '--dsw-alias-interactive-bg-hover',
  '--dsw-alias-interactive-bg-active',
  '--dsw-alias-state-business-primary',
  '--dsw-alias-state-success-primary',
  '--dsw-alias-state-success-secondary',
  '--dsw-alias-state-warn-primary',
  '--dsw-alias-state-warn-secondary',
  '--dsw-alias-state-error-primary',
  '--dsw-alias-state-error-secondary',
  '--dsw-alias-button-primary-fill',
  '--dsw-alias-button-info-fill',
  '--dsw-shadow-lv3',
  '--dsw-mask-blur',
] as const

function token(name: (typeof DSH_THEME_TOKENS)[number], fallback: string): string {
  return `var(${name}, ${fallback})`
}

/**
 * Style keys allowed to carry raw (mode-independent) colors: the document
 * canvas mimics a paper page — the DOCX body renders with its own print-like
 * palette, so it stays light in both themes exactly like Word's page in dark
 * mode. Everything else must go through DSH_THEME_TOKENS.
 */
export const PAPER_COLOR_STYLE_KEYS = ['docFrame'] as const

/** Static workbench styles; every color resolves through a DSH theme token. */
export const S = {
  overlay: { position: 'fixed', inset: 0, background: token('--dsw-alias-bg-mask-1', 'rgba(19, 25, 34, 0.42)'), backdropFilter: token('--dsw-mask-blur', 'blur(2px)'), zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  panel: { background: token('--dsw-alias-bg-layer-2', '#fff'), color: token('--dsw-alias-label-primary', '#1d1d1b'), border: `1px solid ${token('--dsw-alias-border-inverted', '#e5e3dd')}`, borderRadius: 12, width: 'min(1400px, 97vw)', height: 'min(860px, 94vh)', display: 'flex', flexDirection: 'column', boxShadow: token('--dsw-shadow-lv3', '0 16px 56px rgba(0,0,0,0.28)'), overflow: 'hidden', outline: 'none' },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: `1px solid ${token('--dsw-alias-border-l2', '#e5e3dd')}` },
  title: { fontSize: 14, fontWeight: 650, color: token('--dsw-alias-label-primary', '#1d1d1b') },
  close: { border: 0, background: 'transparent', fontSize: 18, cursor: 'pointer', color: token('--dsw-alias-label-secondary', '#777') },
  body: { display: 'grid', gridTemplateColumns: '250px minmax(360px, 1fr) 400px', flex: 1, minHeight: 0 },
  bodyNarrow: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 },
  tabList: { display: 'flex', gap: 4, padding: 8, borderBottom: `1px solid ${token('--dsw-alias-border-l2', '#e5e3dd')}` },
  list: { borderRight: `1px solid ${token('--dsw-alias-border-l2', '#e5e3dd')}`, overflow: 'auto', padding: 10 },
  doc: { overflow: 'auto', padding: '20px 26px', background: token('--dsw-alias-bg-layer-1', '#faf9f6') },
  // Paper canvas exception (see PAPER_COLOR_STYLE_KEYS): print-like page stays light in both themes.
  docFrame: { background: '#fff', color: '#1d1d1b', border: `1px solid ${token('--dsw-alias-border-l2', '#e5e3dd')}`, borderRadius: 6, padding: '28px 36px', lineHeight: 1.8, fontSize: 14 },
  side: { borderLeft: `1px solid ${token('--dsw-alias-border-l2', '#e5e3dd')}`, overflow: 'auto', padding: 14 },
  narrowPanel: { flex: 1, minHeight: 0, overflow: 'auto', padding: 14 },
  row: { padding: '9px 10px', borderRadius: 7, cursor: 'pointer', marginBottom: 2 },
  pill: { display: 'inline-block', padding: '2px 10px', borderRadius: 10, fontSize: 12, background: token('--dsw-alias-interactive-bg-hover', '#eef2fb'), color: token('--dsw-alias-state-business-primary', '#2f5aae') },
  card: { border: `1px solid ${token('--dsw-alias-border-l2', '#e5e3dd')}`, borderRadius: 7, padding: '10px 12px', marginBottom: 12, fontSize: 13 },
  intakeCard: { border: `1px solid ${token('--dsw-alias-state-warn-primary', '#f0e0a0')}`, borderRadius: 7, padding: '10px 12px', marginBottom: 12, fontSize: 13, background: token('--dsw-alias-state-warn-secondary', '#fffbf0') },
  errorStrip: { padding: '7px 18px', background: token('--dsw-alias-state-error-secondary', '#fff0ee'), color: token('--dsw-alias-state-error-primary', '#a53a2d'), fontSize: 12 },
  noticeStrip: { padding: '8px 18px', borderTop: `1px solid ${token('--dsw-alias-border-l2', '#e5e3dd')}`, background: token('--dsw-alias-bg-layer-1', '#faf9f6'), color: token('--dsw-alias-label-primary', '#1d1d1b'), fontSize: 12 },
  field: { marginBottom: 10 },
  input: { boxSizing: 'border-box', width: '100%', padding: '7px 8px', border: `1px solid ${token('--dsw-alias-border-l2', '#d9d6cf')}`, borderRadius: 5, background: token('--dsw-alias-bg-layer-1', '#fff'), color: token('--dsw-alias-label-primary', '#1d1d1b'), fontSize: 13 },
  opt: { display: 'inline-block', margin: '0 6px 6px 0', padding: '3px 10px', border: `1px solid ${token('--dsw-alias-border-l3', '#d9d6cf')}`, borderRadius: 12, fontSize: 12, cursor: 'pointer' },
  btn: { background: token('--dsw-alias-button-primary-fill', '#2f5aae'), color: token('--dsw-alias-label-primary-inverted', '#fff'), border: 0, borderRadius: 5, padding: '7px 14px', fontSize: 13, cursor: 'pointer' },
  secondaryBtn: { background: 'transparent', color: token('--dsw-alias-state-business-primary', '#2f5aae'), border: `1px solid ${token('--dsw-alias-border-l3', '#c9d4ec')}`, borderRadius: 5, padding: '7px 12px', fontSize: 12, cursor: 'pointer' },
  muted: { color: token('--dsw-alias-label-secondary', '#7b7975'), fontSize: 12 },
  successNote: { color: token('--dsw-alias-state-success-primary', '#2f7449'), fontSize: 12 },
  commentBlock: { fontSize: 12, marginBottom: 8, paddingLeft: 6, borderLeft: `2px solid ${token('--dsw-alias-border-l3', '#c9d4ec')}` },
} satisfies Record<string, React.CSSProperties>

/** Sidebar launcher button styles (active state highlights the open queue). */
export function railButtonStyle(active: boolean, wide: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: wide ? 'flex-start' : 'center', gap: 8,
    width: '100%', minWidth: 0, padding: wide ? '7px 10px' : '8px 0', borderRadius: 8,
    border: '1px solid',
    borderColor: active ? token('--dsw-alias-state-business-primary', '#2f5aae') : token('--dsw-alias-border-l2', '#d9d6cf'),
    background: active ? token('--dsw-alias-interactive-bg-active', '#eef2fb') : 'transparent',
    color: token('--dsw-alias-label-primary', '#1d1d1b'), fontSize: 13,
    cursor: 'pointer', textAlign: 'left', position: 'relative',
  }
}

/** Launcher status dot: business accent while a case is in flight, success otherwise. */
export function statusDotStyle(active: boolean, wide: boolean): React.CSSProperties {
  return {
    width: 8, height: 8, borderRadius: 4, flexShrink: 0,
    background: active ? token('--dsw-alias-state-business-primary', '#2f5aae') : token('--dsw-alias-state-success-primary', '#3fae6a'),
    ...(wide ? {} : { position: 'absolute', right: 5, top: 5 }),
  }
}

/** Session list row; the selected row uses the themed active surface. */
export function sessionRowStyle(selected: boolean): React.CSSProperties {
  return {
    ...S.row, width: '100%', border: 0, textAlign: 'left', color: 'inherit',
    background: selected ? token('--dsw-alias-interactive-bg-active', '#eef2fb') : 'transparent',
  }
}

/** Decision card: success surface once approved, warn surface while awaiting decisions. */
export function decisionCardStyle(approved: boolean): React.CSSProperties {
  return {
    ...S.card,
    borderColor: approved ? token('--dsw-alias-state-success-primary', '#9bc6aa') : token('--dsw-alias-state-warn-primary', '#d7b766'),
    background: approved ? token('--dsw-alias-state-success-secondary', '#f2faf5') : token('--dsw-alias-state-warn-secondary', '#fffaf0'),
  }
}

/** Phase bar colors: error while failing, success for finished, business for the active phase. */
export function progressBarStyle(done: boolean, active: boolean, failed: boolean): { bar: string; label: string } {
  const color = failed && active
    ? token('--dsw-alias-state-error-primary', '#b03a2e')
    : done
      ? token('--dsw-alias-state-success-primary', '#3f8d62')
      : active
        ? token('--dsw-alias-state-business-primary', '#2f5aae')
        : token('--dsw-alias-border-l3', '#c9c6bf')
  return { bar: color, label: color }
}

/** History timeline dot: business accent for the newest entry. */
export function historyDotStyle(latest: boolean): React.CSSProperties {
  return {
    width: 7, height: 7, borderRadius: 4, marginTop: 5,
    background: latest ? token('--dsw-alias-state-business-primary', '#2f5aae') : token('--dsw-alias-border-l3', '#aeb9cf'),
  }
}

/** Word/simple view switch; the selected view uses the primary fill. */
export function viewButton(selected: boolean): React.CSSProperties {
  return {
    ...S.btn,
    padding: '2px 10px',
    fontSize: 12,
    background: selected ? token('--dsw-alias-button-primary-fill', '#2f5aae') : token('--dsw-alias-bg-base', '#fff'),
    color: selected ? token('--dsw-alias-label-primary-inverted', '#fff') : token('--dsw-alias-state-business-primary', '#2f5aae'),
    border: selected ? '1px solid transparent' : `1px solid ${token('--dsw-alias-border-l3', '#c9d4ec')}`,
  }
}

/** Narrow-layout pane tab; the active tab uses the themed active surface. */
export function narrowTabStyle(selected: boolean): React.CSSProperties {
  return {
    flex: 1, padding: '7px 0', borderRadius: 8, border: '1px solid transparent', fontSize: 13, cursor: 'pointer',
    background: selected ? token('--dsw-alias-interactive-bg-active', '#eef2fb') : 'transparent',
    color: selected ? token('--dsw-alias-label-primary', '#1d1d1b') : token('--dsw-alias-label-secondary', '#777'),
  }
}

/** Opinion-letter link keeps a secondary fill under the reviewed-docx link. */
export function downloadLinkStyle(kind: 'reviewed' | 'report'): React.CSSProperties {
  return {
    ...S.btn, textAlign: 'center', textDecoration: 'none', display: 'block',
    ...(kind === 'report' ? { background: token('--dsw-alias-button-info-fill', '#47639c') } : {}),
  }
}

/**
 * Document-scoped styles. All colors here sit on the paper canvas
 * (S.docFrame), which is intentionally mode-independent, so these stay static
 * like the tracked-change marks in Word. The narrow-viewport media query is
 * gone: narrow layouts are driven by the explicit pane control instead.
 */
export const insDelCss = `
  .ccp-doc ins.cc-ins { color:#1d8348; background:#e6f3ec; text-decoration:underline; }
  .ccp-doc del.cc-del { color:#b03a2e; background:#f9e6e3; text-decoration:line-through; }
  .ccp-doc sup.cc-comment { color:#2f5aae; cursor:help; margin:0 1px; }
  .ccp-btn:disabled { opacity: 0.45; cursor: default; }
  .ccp-field::placeholder { color: ${token('--dsw-alias-label-tertiary', '#a8a6a1')}; }
`

// ---------------------------------------------------------------------------
// Narrow layout model: an explicit three-pane control replaces the old
// `<=900px` media query that permanently hid the operation pane.
// ---------------------------------------------------------------------------

/** Workbench sections, in wide-layout render order. */
export const WORKBENCH_SECTIONS = ['tasks', 'document', 'status', 'deliverables', 'recheck', 'intake', 'comments', 'decisions', 'history'] as const

export type WorkbenchSectionId = typeof WORKBENCH_SECTIONS[number]

/** Operation-pane sections shared by the wide third column and the narrow Operations tab. */
export const OPERATIONS_SECTIONS = ['status', 'deliverables', 'recheck', 'intake', 'comments', 'decisions', 'history'] as const

/** Wide layout columns (left to right); every section appears exactly once. */
export const WIDE_COLUMN_SECTIONS: readonly (readonly WorkbenchSectionId[])[] = [['tasks'], ['document'], OPERATIONS_SECTIONS]

export const NARROW_TABS = [
  { id: 'tasks', labelKey: 'pane.tasks', sections: ['tasks'] as const },
  { id: 'document', labelKey: 'pane.document', sections: ['document'] as const },
  { id: 'operations', labelKey: 'pane.operations', sections: OPERATIONS_SECTIONS },
] as const

export type WorkbenchPane = typeof NARROW_TABS[number]['id']

/** Viewport width (px) at or below which the narrow pane control engages. */
export const NARROW_BREAKPOINT_PX = 900

/** The media query backing `isNarrowWidth` (kept in sync with the breakpoint). */
export function narrowMediaQuery(): string {
  return `(max-width: ${String(NARROW_BREAKPOINT_PX)}px)`
}

/** Deterministic narrow-viewport predicate (900px is narrow). */
export function isNarrowWidth(width: number): boolean {
  return width <= NARROW_BREAKPOINT_PX
}

/** Neighbor pane for arrow-key tab movement, wrapping around both ends. */
export function adjacentPaneId(current: WorkbenchPane, offset: number): WorkbenchPane {
  const ids = NARROW_TABS.map(tab => tab.id)
  const index = ids.indexOf(current)
  return ids[(index + offset % ids.length + ids.length) % ids.length]
}

// ---------------------------------------------------------------------------
// Dialog focus model: deterministic initial focus, Tab containment, Escape
// gating, and focus return to the launcher.
// ---------------------------------------------------------------------------

/** Focusable selector used for Tab containment (`[disabled]` nodes are skipped). */
export const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/**
 * Deterministic dialog focus policy: focus lands on the dialog panel itself
 * (its accessible label announces the dialog without pre-triggering any
 * control), the launcher regains focus on close, and Escape is ignored while
 * a command is in flight so a mid-flight notice cannot be dismissed blindly.
 */
export const DIALOG_FOCUS_POLICY = {
  initial: 'panel',
  restore: 'launcher',
  escapeGatedByBusy: true,
} as const

/**
 * Wrap-around Tab target over `count` focusables. `index === -1` means focus
 * currently sits outside the list (enter at the leading edge for Tab, the
 * trailing edge for Shift+Tab). Returns -1 only when the list is empty.
 */
export function wrapIndex(count: number, index: number, shift: boolean): number {
  if (count <= 0) return -1
  if (index < 0 || index >= count) return shift ? count - 1 : 0
  return (index + (shift ? -1 : 1) + count) % count
}

/** Escape closes the workbench only when no command is in flight. */
export function escapeClosesDialog(commandBusy: boolean): boolean {
  return !commandBusy
}

/** Private face supplied by this plugin's sidebar slot registration. */
export interface WorkbenchFace {
  readonly client: ContractCopilotClient
}

export type RailEntryButtonProps = SidebarFooterActionOwnerProps & WorkbenchFace

/** Official sidebar footer action opening the Contract Copilot workbench. */
export function RailEntryButton({ client, wide }: RailEntryButtonProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [latest, setLatest] = useState<SessionBrief | undefined>(undefined)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const wasOpen = useRef(false)
  useEffect(() => {
    let alive = true
    const load = async (): Promise<void> => {
      try {
        const data = await client.state()
        if (alive) setLatest(data.sessions[0])
      } catch {
        if (alive) setLatest(undefined)
      }
    }
    void load()
    const timer = setInterval(() => { void load() }, 8_000)
    return () => { alive = false; clearInterval(timer) }
  }, [client])
  useEffect(() => {
    if (open) { wasOpen.current = true; return }
    if (!wasOpen.current) return
    wasOpen.current = false
    buttonRef.current?.focus()
  }, [open])
  const active = latest !== undefined && latest.state !== 'delivered'
  const title = latest === undefined
    ? label('workbench.railTitle')
    : label('workbench.railTitleWithState', {
        contractName: latest.contractName,
        state: label(STATE_KEYS[latest.state]),
      })
  return (
    <>
      <button
        ref={buttonRef}
        aria-label={label('workbench.openAria')}
        aria-haspopup="dialog"
        aria-expanded={open}
        type="button"
        title={title}
        onClick={() => setOpen(true)}
        style={railButtonStyle(active, wide)}
      >
        <span aria-hidden="true" style={{ fontSize: 16 }}>📋</span>
        {wide ? <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label('workbench.railLabel')}</span> : null}
        {latest !== undefined ? <span aria-hidden="true" style={statusDotStyle(active, wide)} /> : null}
      </button>
      {open ? <Workbench client={client} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

/** Render the authentic DOCX package, with a safe Host-rendered fallback. */
function WordPane(props: {
  client: ContractCopilotClient
  sessionId: string
  reviewedDocx?: string
  fallbackHtml: string
  label: string
}): React.JSX.Element {
  const holder = useRef<HTMLDivElement | null>(null)
  const [mode, setMode] = useState<'word' | 'simple'>('word')
  const [error, setError] = useState<string | undefined>(undefined)
  const [renderVersion, setRenderVersion] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let alive = true
    const run = async (): Promise<void> => {
      try {
        setError(undefined)
        const kind = props.reviewedDocx !== undefined ? 'reviewed' : 'source'
        const response = await fetch(props.client.downloadUrl(props.sessionId, kind), { signal: controller.signal })
        if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
        const blob = await response.blob()
        const container = holder.current
        if (!alive || container === null) return
        container.innerHTML = ''
        await renderAsync(blob, container, undefined, {
          renderChanges: true,
          ignoreLastRenderedPageBreak: false,
          experimental: true,
          useBase64URL: true,
        })
      } catch (caught) {
        if (!alive || controller.signal.aborted) return
        setError(caught instanceof Error ? caught.message : String(caught))
        setMode('simple')
      }
    }
    void run()
    return () => { alive = false; controller.abort() }
  }, [props.client, props.sessionId, props.reviewedDocx, renderVersion])
  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={S.muted}>{props.label}</span>
        <button type="button" className="ccp-btn" style={viewButton(mode === 'word')} onClick={() => { setMode('word'); setRenderVersion(value => value + 1) }}>{label('doc.wordView')}</button>
        <button type="button" className="ccp-btn" style={viewButton(mode === 'simple')} onClick={() => setMode('simple')}>{label('doc.simpleView')}</button>
        {error !== undefined ? <span title={error} style={{ ...S.muted, color: token('--dsw-alias-state-error-primary', '#b03a2e') }}>{label('doc.renderFailed')}</span> : null}
      </div>
      <div ref={holder} style={{ ...S.docFrame, padding: 0, border: 0, minHeight: 400, display: mode === 'word' ? 'block' : 'none' }} />
      {mode === 'simple' ? <div className="ccp-doc" style={S.docFrame} dangerouslySetInnerHTML={{ __html: props.fallbackHtml }} /> : null}
    </>
  )
}

function ReviewProgress({ session }: { readonly session: SessionDetail['session'] }): React.JSX.Element {
  const current = phaseIndex(session)
  const failed = session.state === 'failed' || session.state === 'rejected' || session.automation?.status === 'failed'
  const phases: readonly string[] = [
    label('phase.intake'), label('phase.analysis'), label('phase.decisions'), label('phase.delivery'), label('phase.done'),
  ]
  return (
    <div aria-label={label('progress.aria')} style={{ display: 'grid', gridTemplateColumns: `repeat(${String(phases.length)}, 1fr)`, gap: 5, marginTop: 10 }}>
      {phases.map((phase, index) => {
        const done = current > index
        const active = current === index
        const color = progressBarStyle(done, active, failed)
        return (
          <div key={phase} style={{ minWidth: 0 }}>
            <div style={{ height: 4, borderRadius: 2, background: color.bar }} />
            <div style={{ marginTop: 4, fontSize: 10, color: color.label, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{phase}</div>
          </div>
        )
      })}
    </div>
  )
}

function DecisionPanel(props: {
  readonly detail: SessionDetail
  readonly drafts: Record<string, FindingDecisionDraft>
  readonly setDrafts: React.Dispatch<React.SetStateAction<Record<string, FindingDecisionDraft>>>
  readonly onApprove: () => void
  readonly busy: boolean
}): React.JSX.Element {
  const approved = props.detail.session.planReview?.status === 'approved'
  const requests = decisionRequests(props.detail.findings, props.drafts)
  const decided = Object.values(props.drafts).filter(draft => draft.disposition !== undefined).length
  const setAll = (): void => {
    props.setDrafts(Object.fromEntries(props.detail.findings.map((finding, index) => {
      const id = findingId(finding, index)
      return [id, { disposition: 'accept' as const, severity: findingText(finding, 'severity') }]
    })))
  }
  return (
    <div style={decisionCardStyle(approved)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 650 }}>{label('decision.panelTitle')}</div>
          <div style={S.muted}>{approved ? label('decision.planApproved') : label('decision.progress', { decided, total: props.detail.findings.length })}</div>
        </div>
        {!approved ? <button type="button" className="ccp-btn" style={S.secondaryBtn} onClick={setAll}>{label('decision.acceptAll')}</button> : null}
      </div>
      {props.detail.findings.map((finding, index) => {
        const id = findingId(finding, index)
        const existing = props.detail.session.planReview?.decisions[id]
        const draft = props.drafts[id] ?? existing ?? {}
        const targetText = findingText(finding, 'target_text')
        const suggestionText = findingText(finding, 'replacement_text') ?? findingText(finding, 'recommended_text')
        const legalBasis = findingText(finding, 'legal_basis')
        return (
          <div key={id} style={{ borderTop: `1px solid ${token('--dsw-alias-border-l2', '#e5dcc3')}`, padding: '10px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <b>{id} · {findingText(finding, 'risk') ?? label('decision.unnamedRisk')}</b>
              <span style={S.pill}>{findingText(finding, 'severity') ?? '?'}</span>
            </div>
            {targetText !== undefined ? <div style={{ ...S.muted, marginTop: 5 }}>{label('decision.originalText', { text: targetText })}</div> : null}
            {suggestionText !== undefined ? (
              <div style={{ ...S.muted, marginTop: 4 }}>{label('decision.suggestion', { text: suggestionText })}</div>
            ) : null}
            {legalBasis !== undefined ? <div style={{ ...S.muted, marginTop: 4 }}>{label('decision.legalBasis', { text: legalBasis })}</div> : null}
            <label style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
              {label('decision.dispositionLabel')}
              <select
                aria-label={label('decision.dispositionAria', { findingId: id })}
                style={{ ...S.input, marginTop: 3 }}
                value={draft.disposition ?? ''}
                disabled={approved}
                onChange={(event) => {
                  const disposition = event.target.value as FindingDisposition
                  props.setDrafts(previous => ({ ...previous, [id]: { ...previous[id], disposition } }))
                }}
              >
                <option value="">{label('decision.dispositionPlaceholder')}</option>
                {DISPOSITION_KEYS.map(([value, key]) => <option key={value} value={value}>{label(key)}</option>)}
              </select>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 6, marginTop: 6 }}>
              <select
                aria-label={label('decision.severityAria', { findingId: id })}
                style={S.input}
                value={draft.severity ?? findingText(finding, 'severity') ?? ''}
                disabled={approved}
                onChange={event => props.setDrafts(previous => ({ ...previous, [id]: { ...previous[id], severity: event.target.value } }))}
              >
                <option value="">{label('decision.keepSeverity')}</option>
                <option value="P0">P0</option><option value="P1">P1</option><option value="P2">P2</option>
              </select>
              <input
                aria-label={label('decision.noteAria', { findingId: id })}
                className="ccp-field"
                style={S.input}
                placeholder={label('decision.notePlaceholder')}
                value={draft.note ?? ''}
                disabled={approved}
                onChange={event => props.setDrafts(previous => ({ ...previous, [id]: { ...previous[id], note: event.target.value } }))}
              />
            </div>
          </div>
        )
      })}
      {!approved ? (
        <button type="button" className="ccp-btn" style={{ ...S.btn, width: '100%', marginTop: 8 }} disabled={requests === undefined || props.busy} onClick={props.onApprove}>
          {requests === undefined ? label('decision.approveLockedHint') : label('decision.approveAndGenerate')}
        </button>
      ) : <div style={S.successNote}>{label('decision.approvedBadge')}</div>}
    </div>
  )
}

function upsertSession(previous: SessionBrief[], next: SessionBrief): SessionBrief[] {
  return [next, ...previous.filter(candidate => candidate.id !== next.id)]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

function Workbench({ client, onClose }: { readonly client: ContractCopilotClient; readonly onClose: () => void }): React.JSX.Element {
  const [sessions, setSessions] = useState<SessionBrief[]>([])
  const [selected, setSelected] = useState<string | undefined>(undefined)
  const [detail, setDetail] = useState<SessionDetail | undefined>(undefined)
  const [doc, setDoc] = useState<DocumentView | undefined>(undefined)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const [loadError, setLoadError] = useState<string | undefined>(undefined)
  const [recheckPath, setRecheckPath] = useState('')
  const [newContractPath, setNewContractPath] = useState('')
  const [decisionDrafts, setDecisionDrafts] = useState<Record<string, FindingDecisionDraft>>({})
  const [commandBusy, setCommandBusy] = useState(false)
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(narrowMediaQuery()).matches)
  const [narrowPane, setNarrowPane] = useState<WorkbenchPane>('tasks')
  const panelRef = useRef<HTMLDivElement | null>(null)
  const decisionPlanHash = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const list = window.matchMedia(narrowMediaQuery())
    const update = (): void => setNarrow(list.matches)
    update()
    list.addEventListener('change', update)
    return () => { list.removeEventListener('change', update) }
  }, [])

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  const onOverlayKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      if (escapeClosesDialog(commandBusy)) {
        event.stopPropagation()
        onClose()
      }
      return
    }
    if (event.key !== 'Tab') return
    const root = panelRef.current
    if (root === null) return
    const focusables = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      .filter(element => element.getAttribute('aria-disabled') !== 'true')
    const active = document.activeElement
    const current = active === null ? -1 : focusables.indexOf(active as HTMLElement)
    const target = focusables[wrapIndex(focusables.length, current, event.shiftKey)]
    if (target !== undefined) {
      event.preventDefault()
      target.focus()
    }
  }

  useEffect(() => {
    let alive = true
    const loadList = async (): Promise<void> => {
      try {
        const data = await client.state()
        if (!alive) return
        setSessions(data.sessions)
        setSelected(current => current ?? data.sessions[0]?.id)
        setLoadError(undefined)
      } catch (caught) {
        if (alive) setLoadError(label('notice.connectionFailed',{ message: errorMessage(caught) }))
      }
    }
    void loadList()
    const events = new EventSource(client.eventsUrl())
    events.addEventListener('snapshot', (event) => {
      const data = JSON.parse((event as MessageEvent<string>).data) as { sessions: SessionBrief[] }
      if (!alive) return
      setSessions(data.sessions)
      setSelected(current => current ?? data.sessions[0]?.id)
    })
    events.addEventListener('session', (event) => {
      const session = JSON.parse((event as MessageEvent<string>).data) as SessionBrief
      if (alive) setSessions(previous => upsertSession(previous, session))
    })
    const timer = setInterval(() => { void loadList() }, 10_000)
    return () => { alive = false; clearInterval(timer); events.close() }
  }, [client])

  useEffect(() => {
    if (selected === undefined) { setDetail(undefined); setDoc(undefined); return }
    let alive = true
    const controller = new AbortController()
    const load = async (): Promise<void> => {
      try {
        const [nextDetail, nextDoc] = await Promise.all([
          client.detail(selected, controller.signal),
          client.document(selected, controller.signal),
        ])
        if (!alive) return
        setDetail(nextDetail)
        setDoc(nextDoc)
        setDecisionDrafts(current => {
          const nextHash = nextDetail.session.planReview?.sourcePlanHash
          const persisted = nextDetail.session.planReview?.decisions ?? {}
          if (decisionPlanHash.current === nextHash) return current
          decisionPlanHash.current = nextHash
          return persisted
        })
        setLoadError(undefined)
      } catch (caught) {
        if (alive && !controller.signal.aborted) setLoadError(label('notice.detailFailed',{ message: errorMessage(caught) }))
      }
    }
    void load()
    const timer = setInterval(() => { void load() }, 5_000)
    return () => { alive = false; clearInterval(timer); controller.abort() }
  }, [client, selected])

  useEffect(() => {
    if (automationNoticeSettled(detail?.session.automation?.status)) setNotice(undefined)
  }, [detail?.session.automation?.status])

  const runAnalysis = async (): Promise<void> => {
    if (selected === undefined) return
    if (missing.some(item => (answers[item.field] ?? '').trim() === '')) {
      setNotice(label('notice.intakeMissing'))
      return
    }
    setCommandBusy(true)
    try {
      if (missing.length > 0) await client.submitAnswers(selected, answers)
      await client.runAnalysis(selected)
      setNotice(label('notice.analysisStarted'))
    } catch (caught) {
      setNotice(label('notice.analysisStartFailed', { message: errorMessage(caught) }))
    } finally {
      setCommandBusy(false)
    }
  }

  const approveAndDeliver = async (): Promise<void> => {
    if (selected === undefined || detail?.session.planReview === undefined) return
    const requests = decisionRequests(detail.findings, decisionDrafts)
    if (requests === undefined) { setNotice(label('notice.decisionsMissing')); return }
    setCommandBusy(true)
    try {
      const result = await client.approvePlan(selected, detail.session.planReview.sourcePlanHash, requests)
      await client.runDelivery(selected)
      setNotice(label('notice.planLocked', { approved: result.approvedFindings, omitted: result.omittedFindings }))
    } catch (caught) {
      setNotice(label('notice.approveFailed', { message: errorMessage(caught) }))
    } finally {
      setCommandBusy(false)
    }
  }

  const cancelAgent = async (): Promise<void> => {
    if (selected === undefined) return
    setCommandBusy(true)
    try {
      await client.cancel(selected)
      setNotice(label('notice.agentStopped'))
    } catch (caught) {
      setNotice(label('notice.stopFailed', { message: errorMessage(caught) }))
    } finally {
      setCommandBusy(false)
    }
  }

  const retryDelivery = async (): Promise<void> => {
    if (selected === undefined) return
    setCommandBusy(true)
    try {
      await client.runDelivery(selected)
      setNotice(label('notice.retryStarted'))
    } catch (caught) {
      setNotice(label('notice.retryFailed', { message: errorMessage(caught) }))
    } finally {
      setCommandBusy(false)
    }
  }

  const startReview = async (): Promise<void> => {
    if (newContractPath.trim() === '') return
    try {
      const result = await client.startReview(newContractPath.trim())
      setSelected(result.sessionId)
      setAnswers({})
      setDecisionDrafts({})
      decisionPlanHash.current = undefined
      setNewContractPath('')
      setNotice(result.nextStep)
    } catch (caught) {
      setNotice(label('notice.createFailed', { message: errorMessage(caught) }))
    }
  }

  const submitRecheck = async (): Promise<void> => {
    if (selected === undefined || recheckPath.trim() === '') return
    try {
      const result = await client.recheck(selected, recheckPath.trim())
      setRecheckPath('')
      setNotice(result.hint)
    } catch (caught) {
      setNotice(label('notice.recheckFailed', { message: errorMessage(caught) }))
    }
  }

  const missing = detail?.session.intakeMissing ?? []
  const stats = detail?.session.outputs.stats
  const comments: DocComment[] = doc?.comments ?? []

  const selectSession = (id: string): void => {
    setSelected(id)
    setAnswers({})
    setDecisionDrafts({})
    decisionPlanHash.current = undefined
  }

  /** Render one workbench section by manifest id; shared by wide columns and narrow tabs. */
  const renderSection = (id: WorkbenchSectionId): React.JSX.Element | null => {
    switch (id) {
      case 'tasks':
        return (
          <div key={id}>
            <div style={{ ...S.card, marginBottom: 10 }}>
              <div style={{ ...S.muted, marginBottom: 6 }}>{label('newReview.title')}</div>
              <input aria-label={label('newReview.pathAria')} className="ccp-field" style={S.input} placeholder={label('newReview.placeholder')} value={newContractPath} onChange={event => setNewContractPath(event.target.value)} />
              <button type="button" className="ccp-btn" style={{ ...S.btn, marginTop: 6, width: '100%' }} onClick={() => { void startReview() }} disabled={newContractPath.trim() === ''}>{label('newReview.submit')}</button>
            </div>
            {sessions.length === 0 ? (
              <div style={S.muted}>{label('list.empty')}</div>
            ) : sessions.map(session => (
              <button
                type="button"
                key={session.id}
                style={sessionRowStyle(session.id === selected)}
                onClick={() => selectSession(session.id)}
              >
                <div style={{ fontSize: 13, fontWeight: 550, overflow: 'hidden', textOverflow: 'ellipsis' }}>{session.contractName}</div>
                <div style={S.muted}>{label(STATE_KEYS[session.state])} · {new Date(session.updatedAt).toLocaleTimeString()}</div>
              </button>
            ))}
          </div>
        )
      case 'document':
        return (
          <div key={id}>
            {doc !== undefined && selected !== undefined ? (
              <WordPane client={client} sessionId={selected} reviewedDocx={doc.reviewedDocx} fallbackHtml={doc.html} label={doc.label} />
            ) : <div style={S.muted}>{label('doc.selectPrompt')}</div>}
          </div>
        )
      case 'status':
        return (
          <div key={id} style={S.card}>
            <div style={S.muted}>{label('status.currentLabel')}</div>
            <div style={{ marginTop: 6 }}><span style={S.pill}>{detail === undefined ? '—' : label(STATE_KEYS[detail.session.state])}</span></div>
            {detail?.session.automation !== undefined ? <div style={{ marginTop: 7, fontSize: 12 }}>{label(AUTOMATION_KEYS[detail.session.automation.status])}</div> : null}
            {detail?.session.automation?.error !== undefined ? <div role="alert" style={{ ...S.muted, color: token('--dsw-alias-state-error-primary', '#b03a2e'), marginTop: 5 }}>{detail.session.automation.error}</div> : null}
            {detail !== undefined ? <ReviewProgress session={detail.session} /> : null}
            {stats !== undefined ? <div style={{ marginTop: 8, ...S.muted }}>{label('status.stats', { applied: stats.applied, failed: stats.failed, reportOnly: stats.reportOnly })}</div> : null}
            {detail !== undefined && (detail.session.state === 'created' || detail.session.state === 'intake_done' || detail.session.state === 'failed' || detail.session.state === 'rejected')
              && detail.session.automation?.status !== 'running-analysis' ? (
                <button type="button" className="ccp-btn" style={{ ...S.btn, marginTop: 9, width: '100%' }} disabled={commandBusy || missing.length > 0} onClick={() => { void runAnalysis() }}>{label('status.startAnalysis')}</button>
              ) : null}
            {detail?.session.automation?.status === 'running-analysis' || detail?.session.automation?.status === 'running-delivery' ? (
              <button type="button" className="ccp-btn" style={{ ...S.secondaryBtn, marginTop: 9, width: '100%', color: token('--dsw-alias-state-error-primary', '#a53a2d'), borderColor: token('--dsw-alias-state-error-primary', '#d9aaa3') }} disabled={commandBusy} onClick={() => { void cancelAgent() }}>{label('status.stopAgent')}</button>
            ) : null}
            {detail?.session.state === 'plan_ready' && detail.session.planReview?.status === 'approved'
              && detail.session.automation?.status !== 'running-delivery' ? (
                <button type="button" className="ccp-btn" style={{ ...S.btn, marginTop: 9, width: '100%' }} disabled={commandBusy} onClick={() => { void retryDelivery() }}>{label('status.regenerate')}</button>
              ) : null}
          </div>
        )
      case 'deliverables':
        if (detail?.session.outputs.reviewedDocx === undefined) return null
        return (
          <div key={id} style={S.card}>
            <div style={S.muted}>{label('output.deliverables')}</div>
            <div style={{ marginTop: 7, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <a style={downloadLinkStyle('reviewed')} href={client.downloadUrl(detail.session.id, 'reviewed')}>{label('output.reviewedDocx')}</a>
              {detail.session.outputs.reportDocx !== undefined ? (
                <a style={downloadLinkStyle('report')} href={client.downloadUrl(detail.session.id, 'report')}>{label('output.reportDocx')}</a>
              ) : null}
            </div>
          </div>
        )
      case 'recheck':
        if (detail?.session.state !== 'delivered') return null
        return (
          <div key={id} style={S.card}>
            <div style={{ ...S.muted, marginBottom: 6 }}>{label('recheck.title')}</div>
            <input aria-label={label('recheck.pathAria')} className="ccp-field" style={S.input} placeholder={label('recheck.placeholder')} value={recheckPath} onChange={event => setRecheckPath(event.target.value)} />
            <button type="button" className="ccp-btn" style={{ ...S.btn, marginTop: 6 }} onClick={() => { void submitRecheck() }} disabled={recheckPath.trim() === ''}>{label('recheck.submit')}</button>
          </div>
        )
      case 'intake':
        if (missing.length === 0) return null
        return (
          <div key={id} style={S.intakeCard}>
            <div style={{ fontSize: 12, fontWeight: 650, marginBottom: 8, color: token('--dsw-alias-label-primary', '#1d1d1b') }}>{label('intake.requiredTitle', { count: missing.length })}</div>
            {missing.map(item => (
              <div key={item.field} style={S.field}>
                <div style={{ ...S.muted, marginBottom: 4 }}>{item.question}</div>
                {item.options !== undefined && item.options.length > 0 ? item.options.map(option => (
                  <label key={option} style={{ ...S.opt, background: answers[item.field] === option ? token('--dsw-alias-interactive-bg-active', '#eef2fb') : 'transparent' }}>
                    <input type="radio" name={item.field} checked={answers[item.field] === option} onChange={() => setAnswers({ ...answers, [item.field]: option })} /> {option}
                  </label>
                )) : <input aria-label={item.question} className="ccp-field" style={S.input} value={answers[item.field] ?? ''} onChange={event => setAnswers({ ...answers, [item.field]: event.target.value })} />}
              </div>
            ))}
            <button type="button" className="ccp-btn" style={{ ...S.btn, width: '100%' }} disabled={commandBusy || missing.some(item => (answers[item.field] ?? '').trim() === '')} onClick={() => { void runAnalysis() }}>{label('intake.submitAndAnalyze')}</button>
          </div>
        )
      case 'comments':
        if (comments.length === 0) return null
        return (
          <div key={id} style={S.card}>
            <div style={{ ...S.muted, marginBottom: 6 }}>{label('comments.title', { count: comments.length })}</div>
            {comments.slice(0, 12).map(comment => (
              <div key={comment.id} style={S.commentBlock}>
                <div style={{ color: token('--dsw-alias-state-business-primary', '#2f5aae'), fontWeight: 550 }}>{comment.author.split('｜')[0] ?? comment.author}</div>
                <div style={{ color: token('--dsw-alias-label-secondary', '#5c5b59') }}>{comment.text.slice(0, 120)}{comment.text.length > 120 ? '…' : ''}</div>
              </div>
            ))}
          </div>
        )
      case 'decisions':
        if (detail?.session.planReview === undefined) return null
        return (
          <div key={id}>
            <DecisionPanel detail={detail} drafts={decisionDrafts} setDrafts={setDecisionDrafts} onApprove={() => { void approveAndDeliver() }} busy={commandBusy} />
          </div>
        )
      case 'history':
        if (detail === undefined || detail.session.historyTail.length === 0) return null
        return (
          <div key={id} style={S.card}>
            <div style={{ ...S.muted, marginBottom: 7 }}>{label('history.recentTitle')}</div>
            {[...detail.session.historyTail].reverse().map((entry, index) => (
              <div key={`${entry.at}-${String(index)}`} style={{ display: 'grid', gridTemplateColumns: '8px 1fr', columnGap: 7, marginBottom: 7 }}>
                <span aria-hidden="true" style={historyDotStyle(index === 0)} />
                <div style={{ fontSize: 12 }}>
                  <div>{TOOL_KEYS[entry.tool] !== undefined ? label(TOOL_KEYS[entry.tool]) : entry.tool}</div>
                  <div style={S.muted}>{label(STATE_KEYS[entry.from])} → {label(STATE_KEYS[entry.to])} · {new Date(entry.at).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        )
    }
  }

  const activeTab = NARROW_TABS.find(tab => tab.id === narrowPane) ?? NARROW_TABS[0]

  return (
    <div style={S.overlay} onClick={onClose} onKeyDown={onOverlayKeyDown}>
      <style>{insDelCss}</style>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label('workbench.dialogAria')}
        tabIndex={-1}
        style={S.panel}
        onClick={event => event.stopPropagation()}
      >
        <div style={S.head}>
          <span style={S.title}>{label('workbench.title')}</span>
          <button aria-label={label('workbench.closeAria')} type="button" style={S.close} onClick={onClose}>✕</button>
        </div>
        {loadError !== undefined ? <div role="alert" style={S.errorStrip}>{loadError}</div> : null}
        {narrow ? (
          <div style={S.bodyNarrow}>
            <div role="tablist" aria-label={label('pane.group')} style={S.tabList}
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft') { event.preventDefault(); setNarrowPane(pane => adjacentPaneId(pane, -1)) }
                if (event.key === 'ArrowRight') { event.preventDefault(); setNarrowPane(pane => adjacentPaneId(pane, 1)) }
              }}
            >
              {NARROW_TABS.map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`ccp-tab-${tab.id}`}
                  aria-selected={tab.id === activeTab.id}
                  aria-controls={`ccp-panel-${tab.id}`}
                  style={narrowTabStyle(tab.id === activeTab.id)}
                  onClick={() => setNarrowPane(tab.id)}
                >
                  {label(tab.labelKey)}
                </button>
              ))}
            </div>
            <div role="tabpanel" id={`ccp-panel-${activeTab.id}`} aria-labelledby={`ccp-tab-${activeTab.id}`} style={S.narrowPanel}>
              {activeTab.sections.map(sectionId => renderSection(sectionId))}
            </div>
          </div>
        ) : (
          <div className="ccp-workbench-body" style={S.body}>
            <div style={S.list}>{WIDE_COLUMN_SECTIONS[0].map(sectionId => renderSection(sectionId))}</div>
            <div style={S.doc}>{WIDE_COLUMN_SECTIONS[1].map(sectionId => renderSection(sectionId))}</div>
            <div style={S.side}>{WIDE_COLUMN_SECTIONS[2].map(sectionId => renderSection(sectionId))}</div>
          </div>
        )}
        {notice !== undefined ? <div role="status" style={S.noticeStrip}>{notice}</div> : null}
      </div>
    </div>
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
