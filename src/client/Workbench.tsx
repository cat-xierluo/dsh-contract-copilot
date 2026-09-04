/** Embedded contract-review queue, document view, decisions, and delivery history. */

import { renderAsync } from 'docx-preview'
import React, { useEffect, useRef, useState } from 'react'
import type { SidebarFooterActionOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { SessionState } from '../session-types.ts'
import type {
  DocComment,
  DocumentView,
  SessionBrief,
  SessionDetail,
} from '../workbench-protocol.ts'
import { ContractCopilotClient } from './api.ts'

const STATE_LABELS: Record<SessionState, string> = {
  created: '待补齐',
  intake_done: '前置信息已确认',
  plan_ready: '审查计划就绪',
  applying: '正在生成修订',
  applied: '修订完成',
  partial: '部分完成',
  rejected: '完整性复核未通过',
  failed: '执行失败',
  delivered: '已交付',
}

const TOOL_LABELS: Record<string, string> = {
  contract_copilot_intake: '确认前置信息',
  contract_copilot_analyze: '完成风险分析',
  contract_copilot_apply: '生成修订与意见书',
  contract_copilot_finalize: '确认交付',
  contract_copilot_resume: '恢复审查任务',
}

const PHASES = ['前置信息', '分析与风险', '修订与批注', '交付与复审'] as const

const S: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(19, 25, 34, 0.42)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  panel: { background: 'var(--dsw-alias-bg-base, #fff)', color: 'var(--dsw-alias-fg-base, #1d1d1b)', borderRadius: 12, width: 'min(1240px, 96vw)', height: 'min(800px, 92vh)', display: 'flex', flexDirection: 'column', boxShadow: '0 16px 56px rgba(0,0,0,0.28)', overflow: 'hidden' },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid var(--dsw-alias-border-l2, #e5e3dd)' },
  title: { fontSize: 14, fontWeight: 650 },
  close: { border: 0, background: 'transparent', fontSize: 18, cursor: 'pointer', color: 'var(--dsw-alias-fg-muted, #777)' },
  body: { display: 'grid', gridTemplateColumns: '250px minmax(360px, 1fr) 316px', flex: 1, minHeight: 0 },
  list: { borderRight: '1px solid var(--dsw-alias-border-l2, #e5e3dd)', overflow: 'auto', padding: 10 },
  doc: { overflow: 'auto', padding: '20px 26px', background: 'var(--dsw-alias-bg-subtle, #faf9f6)' },
  docFrame: { background: '#fff', color: '#1d1d1b', border: '1px solid #e5e3dd', borderRadius: 6, padding: '28px 36px', lineHeight: 1.8, fontSize: 14 },
  side: { borderLeft: '1px solid var(--dsw-alias-border-l2, #e5e3dd)', overflow: 'auto', padding: 14 },
  row: { padding: '9px 10px', borderRadius: 7, cursor: 'pointer', marginBottom: 2 },
  pill: { display: 'inline-block', padding: '2px 10px', borderRadius: 10, fontSize: 12, background: '#eef2fb', color: '#2f5aae' },
  card: { border: '1px solid var(--dsw-alias-border-l2, #e5e3dd)', borderRadius: 7, padding: '10px 12px', marginBottom: 12, fontSize: 13 },
  field: { marginBottom: 10 },
  input: { boxSizing: 'border-box', width: '100%', padding: '7px 8px', border: '1px solid var(--dsw-alias-border-l2, #d9d6cf)', borderRadius: 5, background: 'var(--dsw-alias-bg-base, #fff)', color: 'var(--dsw-alias-fg-base, #1d1d1b)', fontSize: 13 },
  opt: { display: 'inline-block', margin: '0 6px 6px 0', padding: '3px 10px', border: '1px solid #d9d6cf', borderRadius: 12, fontSize: 12, cursor: 'pointer' },
  btn: { background: '#2f5aae', color: '#fff', border: 0, borderRadius: 5, padding: '7px 14px', fontSize: 13, cursor: 'pointer' },
  muted: { color: 'var(--dsw-alias-fg-muted, #7b7975)', fontSize: 12 },
}

const insDelCss = `
  .ccp-doc ins.cc-ins { color:#1d8348; background:#e6f3ec; text-decoration:underline; }
  .ccp-doc del.cc-del { color:#b03a2e; background:#f9e6e3; text-decoration:line-through; }
  .ccp-doc sup.cc-comment { color:#2f5aae; cursor:help; margin:0 1px; }
  @media (max-width: 900px) {
    .ccp-workbench-body { grid-template-columns: 210px minmax(320px, 1fr) !important; }
    .ccp-workbench-side { display: none; }
  }
`

/** Private face supplied by this plugin's sidebar slot registration. */
export interface WorkbenchFace {
  readonly client: ContractCopilotClient
}

export type RailEntryButtonProps = SidebarFooterActionOwnerProps & WorkbenchFace

/** Official sidebar footer action opening the Contract Copilot workbench. */
export function RailEntryButton({ client, wide }: RailEntryButtonProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [latest, setLatest] = useState<SessionBrief | undefined>(undefined)
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
  const active = latest !== undefined && latest.state !== 'delivered'
  const title = latest === undefined
    ? '合同审查工作台'
    : `${latest.contractName} · ${STATE_LABELS[latest.state]}`
  return (
    <>
      <button
        aria-label="打开合同审查工作台"
        type="button"
        title={title}
        onClick={() => setOpen(true)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: wide ? 'flex-start' : 'center', gap: 8,
          width: '100%', minWidth: 0, padding: wide ? '7px 10px' : '8px 0', borderRadius: 8,
          border: '1px solid', borderColor: active ? '#2f5aae' : 'var(--dsw-alias-border-l2, #d9d6cf)',
          background: active ? '#eef2fb' : 'transparent',
          color: 'var(--dsw-alias-fg-base, #1d1d1b)', fontSize: 13,
          cursor: 'pointer', textAlign: 'left', position: 'relative',
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 16 }}>📋</span>
        {wide ? <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>合同审查</span> : null}
        {latest !== undefined ? (
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: active ? '#2f5aae' : '#3fae6a', flexShrink: 0, ...(wide ? {} : { position: 'absolute', right: 5, top: 5 }) }} />
        ) : null}
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
        <button type="button" style={viewButton(mode === 'word')} onClick={() => { setMode('word'); setRenderVersion(value => value + 1) }}>Word 视图</button>
        <button type="button" style={viewButton(mode === 'simple')} onClick={() => setMode('simple')}>简版（修订高亮）</button>
        {error !== undefined ? <span title={error} style={{ ...S.muted, color: '#b03a2e' }}>Word 渲染失败，已显示简版</span> : null}
      </div>
      <div ref={holder} style={{ ...S.docFrame, padding: 0, border: 0, minHeight: 400, display: mode === 'word' ? 'block' : 'none' }} />
      {mode === 'simple' ? <div className="ccp-doc" style={S.docFrame} dangerouslySetInnerHTML={{ __html: props.fallbackHtml }} /> : null}
    </>
  )
}

function viewButton(selected: boolean): React.CSSProperties {
  return {
    ...S.btn,
    padding: '2px 10px',
    fontSize: 12,
    background: selected ? '#2f5aae' : '#fff',
    color: selected ? '#fff' : '#2f5aae',
    border: '1px solid #c9d4ec',
  }
}

function ReviewProgress({ state }: { readonly state: SessionState }): React.JSX.Element {
  const current = phaseIndex(state)
  const failed = state === 'failed' || state === 'rejected'
  return (
    <div aria-label="合同审查进度" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5, marginTop: 10 }}>
      {PHASES.map((phase, index) => {
        const done = current > index
        const active = current === index
        const color = failed && active ? '#b03a2e' : done ? '#3f8d62' : active ? '#2f5aae' : '#c9c6bf'
        return (
          <div key={phase} style={{ minWidth: 0 }}>
            <div style={{ height: 4, borderRadius: 2, background: color }} />
            <div style={{ marginTop: 4, fontSize: 10, color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{phase}</div>
          </div>
        )
      })}
    </div>
  )
}

function phaseIndex(state: SessionState): number {
  switch (state) {
    case 'created': return 0
    case 'intake_done': return 1
    case 'plan_ready':
    case 'applying':
    case 'rejected':
    case 'failed': return 2
    case 'applied':
    case 'partial': return 3
    case 'delivered': return 4
  }
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

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

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
        if (alive) setLoadError(`工作台连接失败：${errorMessage(caught)}`)
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
        setLoadError(undefined)
      } catch (caught) {
        if (alive && !controller.signal.aborted) setLoadError(`读取审查详情失败：${errorMessage(caught)}`)
      }
    }
    void load()
    const timer = setInterval(() => { void load() }, 5_000)
    return () => { alive = false; clearInterval(timer); controller.abort() }
  }, [client, selected])

  const submitAnswers = async (): Promise<void> => {
    if (selected === undefined) return
    try {
      await client.submitAnswers(selected, answers)
      setNotice('已提交。请让 Agent 继续当前审查，它会消费这些答案。')
    } catch (caught) {
      setNotice(`提交失败：${errorMessage(caught)}`)
    }
  }

  const startReview = async (): Promise<void> => {
    if (newContractPath.trim() === '') return
    try {
      const result = await client.startReview(newContractPath.trim())
      setSelected(result.sessionId)
      setAnswers({})
      setNewContractPath('')
      setNotice(result.nextStep)
    } catch (caught) {
      setNotice(`创建失败：${errorMessage(caught)}`)
    }
  }

  const submitRecheck = async (): Promise<void> => {
    if (selected === undefined || recheckPath.trim() === '') return
    try {
      const result = await client.recheck(selected, recheckPath.trim())
      setRecheckPath('')
      setNotice(result.hint)
    } catch (caught) {
      setNotice(`提交失败：${errorMessage(caught)}`)
    }
  }

  const missing = detail?.session.intakeMissing ?? []
  const stats = detail?.session.outputs.stats
  const comments: DocComment[] = doc?.comments ?? []

  return (
    <div role="dialog" aria-modal="true" aria-label="Contract Copilot 审查工作台" style={S.overlay} onClick={onClose}>
      <style>{insDelCss}</style>
      <div style={S.panel} onClick={event => event.stopPropagation()}>
        <div style={S.head}>
          <span style={S.title}>📋 Contract Copilot · 审查工作台</span>
          <button aria-label="关闭合同审查工作台" type="button" style={S.close} onClick={onClose}>✕</button>
        </div>
        {loadError !== undefined ? <div role="alert" style={{ padding: '7px 18px', background: '#fff0ee', color: '#a53a2d', fontSize: 12 }}>{loadError}</div> : null}
        <div className="ccp-workbench-body" style={S.body}>
          <div style={S.list}>
            <div style={{ ...S.card, marginBottom: 10 }}>
              <div style={{ ...S.muted, marginBottom: 6 }}>➕ 新建审查</div>
              <input aria-label="合同 DOCX 本地绝对路径" style={S.input} placeholder="合同 DOCX 本地绝对路径" value={newContractPath} onChange={event => setNewContractPath(event.target.value)} />
              <button type="button" style={{ ...S.btn, marginTop: 6, width: '100%' }} onClick={() => { void startReview() }} disabled={newContractPath.trim() === ''}>开始（表单先行）</button>
            </div>
            {sessions.length === 0 ? (
              <div style={S.muted}>尚无审查任务。可在上方输入合同路径，或直接让 Agent 审查合同。</div>
            ) : sessions.map(session => (
              <button
                type="button"
                key={session.id}
                style={{ ...S.row, width: '100%', border: 0, textAlign: 'left', color: 'inherit', background: session.id === selected ? '#eef2fb' : 'transparent' }}
                onClick={() => { setSelected(session.id); setAnswers({}) }}
              >
                <div style={{ fontSize: 13, fontWeight: 550, overflow: 'hidden', textOverflow: 'ellipsis' }}>{session.contractName}</div>
                <div style={S.muted}>{STATE_LABELS[session.state]} · {new Date(session.updatedAt).toLocaleTimeString()}</div>
              </button>
            ))}
          </div>
          <div style={S.doc}>
            {doc !== undefined && selected !== undefined ? (
              <WordPane client={client} sessionId={selected} reviewedDocx={doc.reviewedDocx} fallbackHtml={doc.html} label={doc.label} />
            ) : <div style={S.muted}>选择左侧审查任务查看文档。</div>}
          </div>
          <div className="ccp-workbench-side" style={S.side}>
            <div style={S.card}>
              <div style={S.muted}>当前状态</div>
              <div style={{ marginTop: 6 }}><span style={S.pill}>{detail === undefined ? '—' : STATE_LABELS[detail.session.state]}</span></div>
              {detail !== undefined ? <ReviewProgress state={detail.session.state} /> : null}
              {stats !== undefined ? <div style={{ marginTop: 8, ...S.muted }}>成功 {stats.applied} · 失败 {stats.failed} · 仅意见书 {stats.reportOnly}</div> : null}
            </div>
            {detail?.session.outputs.reviewedDocx !== undefined ? (
              <div style={S.card}>
                <div style={S.muted}>交付产物</div>
                <div style={{ marginTop: 7, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <a style={{ ...S.btn, textAlign: 'center', textDecoration: 'none', display: 'block' }} href={client.downloadUrl(detail.session.id, 'reviewed')}>⬇ 审核修订版 DOCX</a>
                  {detail.session.outputs.reportDocx !== undefined ? (
                    <a style={{ ...S.btn, textAlign: 'center', textDecoration: 'none', display: 'block', background: '#47639c' }} href={client.downloadUrl(detail.session.id, 'report')}>⬇ 审查意见书 DOCX</a>
                  ) : null}
                </div>
              </div>
            ) : null}
            {detail?.session.state === 'delivered' ? (
              <div style={S.card}>
                <div style={{ ...S.muted, marginBottom: 6 }}>对方改稿后复审</div>
                <input aria-label="新版合同 DOCX 的本地绝对路径" style={S.input} placeholder="新版合同 DOCX 本地绝对路径" value={recheckPath} onChange={event => setRecheckPath(event.target.value)} />
                <button type="button" style={{ ...S.btn, marginTop: 6 }} onClick={() => { void submitRecheck() }} disabled={recheckPath.trim() === ''}>指向新版合同</button>
              </div>
            ) : null}
            {missing.length > 0 ? (
              <div style={{ ...S.card, background: '#fffbf0', borderColor: '#f0e0a0', color: '#1d1d1b' }}>
                <div style={{ fontSize: 12, fontWeight: 650, marginBottom: 8 }}>需要你确认（{missing.length}）</div>
                {missing.map(item => (
                  <div key={item.field} style={S.field}>
                    <div style={{ ...S.muted, marginBottom: 4 }}>{item.question}</div>
                    {item.options !== undefined && item.options.length > 0 ? item.options.map(option => (
                      <label key={option} style={{ ...S.opt, background: answers[item.field] === option ? '#eef2fb' : '#fff' }}>
                        <input type="radio" name={item.field} checked={answers[item.field] === option} onChange={() => setAnswers({ ...answers, [item.field]: option })} /> {option}
                      </label>
                    )) : <input style={S.input} value={answers[item.field] ?? ''} onChange={event => setAnswers({ ...answers, [item.field]: event.target.value })} />}
                  </div>
                ))}
                <button type="button" style={S.btn} onClick={() => { void submitAnswers() }}>提交给 Agent</button>
              </div>
            ) : null}
            {comments.length > 0 ? (
              <div style={S.card}>
                <div style={{ ...S.muted, marginBottom: 6 }}>💬 批注（{comments.length}）</div>
                {comments.slice(0, 12).map(comment => (
                  <div key={comment.id} style={{ fontSize: 12, marginBottom: 8, paddingLeft: 6, borderLeft: '2px solid #c9d4ec' }}>
                    <div style={{ color: '#2f5aae', fontWeight: 550 }}>{comment.author.split('｜')[0] ?? comment.author}</div>
                    <div style={{ color: 'var(--dsw-alias-fg-muted, #5c5b59)' }}>{comment.text.slice(0, 120)}{comment.text.length > 120 ? '…' : ''}</div>
                  </div>
                ))}
              </div>
            ) : null}
            {detail !== undefined && detail.findings.length > 0 ? (
              <div style={S.card}>
                <div style={{ ...S.muted, marginBottom: 6 }}>审查发现（{detail.findings.length}）</div>
                {detail.findings.slice(0, 20).map((finding, index) => (
                  <div key={String(finding.id ?? index)} style={{ fontSize: 12, marginBottom: 6 }}>
                    <b>{String(finding.id ?? index + 1)}</b> {String(finding.risk ?? '')}
                    <span style={S.muted}>（{String(finding.severity ?? '?')} / {String(finding.action ?? 'auto')}）</span>
                  </div>
                ))}
              </div>
            ) : null}
            {detail !== undefined && detail.session.historyTail.length > 0 ? (
              <div style={S.card}>
                <div style={{ ...S.muted, marginBottom: 7 }}>最近交付记录</div>
                {[...detail.session.historyTail].reverse().map((entry, index) => (
                  <div key={`${entry.at}-${String(index)}`} style={{ display: 'grid', gridTemplateColumns: '8px 1fr', columnGap: 7, marginBottom: 7 }}>
                    <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 4, marginTop: 5, background: index === 0 ? '#2f5aae' : '#aeb9cf' }} />
                    <div style={{ fontSize: 12 }}>
                      <div>{TOOL_LABELS[entry.tool] ?? entry.tool}</div>
                      <div style={S.muted}>{STATE_LABELS[entry.from]} → {STATE_LABELS[entry.to]} · {new Date(entry.at).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {notice !== undefined ? <div role="status" style={{ ...S.card, background: '#1d1d1b', color: '#fff' }}>{notice}</div> : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
