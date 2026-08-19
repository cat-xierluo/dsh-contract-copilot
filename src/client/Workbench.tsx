/**
 * 审查工作台对话框：session 列表 + Word 修订视图 + 状态/确认表单。
 *
 * v0 范围：纯展示 + intake 阻塞项表单（POST answers）；文档 HTML 由 host
 * 侧渲染（renderDocumentHtml 已对文本做 escape），此处直接注入。
 */

import React, { useEffect, useState } from 'react'

interface SessionBrief {
  id: string
  contractName: string
  state: string
  updatedAt: string
}

interface IntakeMissingItem {
  field: string
  question: string
  options?: string[]
}

interface SessionDetail {
  session: {
    id: string
    contractName: string
    state: string
    intake?: Record<string, unknown>
    intakeMissing?: IntakeMissingItem[]
    outputs?: { reviewedDocx?: string; reportDocx?: string; stats?: Record<string, number> }
    updatedAt: string
  }
  findings: Array<Record<string, unknown>>
}

const STATE_LABELS: Record<string, string> = {
  created: '待补齐',
  intake_done: '前置信息已确认',
  plan_ready: '审查计划就绪',
  applying: '正在执行',
  applied: '执行成功',
  partial: '部分成功',
  rejected: '完整性拒绝',
  failed: '失败',
  delivered: '已交付',
}

const S: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  panel: { background: '#fff', borderRadius: 10, width: 'min(1180px, 94vw)', height: 'min(760px, 90vh)', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 48px rgba(0,0,0,0.25)', overflow: 'hidden' },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid #e5e3dd' },
  title: { fontSize: 14, fontWeight: 600 },
  close: { border: 0, background: 'transparent', fontSize: 18, cursor: 'pointer', color: '#888' },
  body: { display: 'grid', gridTemplateColumns: '250px 1fr 300px', flex: 1, minHeight: 0 },
  list: { borderRight: '1px solid #e5e3dd', overflow: 'auto', padding: 10 },
  doc: { overflow: 'auto', padding: '24px 32px', background: '#faf9f6' },
  docFrame: { background: '#fff', border: '1px solid #e5e3dd', borderRadius: 6, padding: '28px 36px', lineHeight: 1.8, fontSize: 14 },
  side: { borderLeft: '1px solid #e5e3dd', overflow: 'auto', padding: 14 },
  row: { padding: '8px 10px', borderRadius: 6, cursor: 'pointer' },
  pill: { display: 'inline-block', padding: '2px 10px', borderRadius: 10, fontSize: 12, background: '#eef2fb', color: '#2f5aae' },
  card: { border: '1px solid #e5e3dd', borderRadius: 6, padding: '10px 12px', marginBottom: 12, fontSize: 13 },
  field: { marginBottom: 10 },
  input: { width: '100%', padding: '6px 8px', border: '1px solid #d9d6cf', borderRadius: 4, fontSize: 13 },
  opt: { display: 'inline-block', margin: '0 6px 6px 0', padding: '3px 10px', border: '1px solid #d9d6cf', borderRadius: 12, fontSize: 12, cursor: 'pointer' },
  btn: { background: '#2f5aae', color: '#fff', border: 0, borderRadius: 4, padding: '7px 16px', fontSize: 13, cursor: 'pointer' },
  muted: { color: '#8a8884', fontSize: 12 },
}

const insDelCss = `
  .ccp-doc ins.cc-ins { color:#1d8348; background:#e6f3ec; text-decoration:underline; }
  .ccp-doc del.cc-del { color:#b03a2e; background:#f9e6e3; text-decoration:line-through; }
  .ccp-doc sup.cc-comment { color:#2f5aae; cursor:help; margin:0 1px; }
`

/** 会话头部按钮：打开工作台。 */
export function ContractWorkbenchButton(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" style={{ ...S.btn, background: '#fff', color: '#2f5aae', border: '1px solid #c9d4ec' }} onClick={() => setOpen(true)}>
        📋 审查工作台
      </button>
      {open ? <Workbench onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function Workbench(props: { onClose: () => void }): React.JSX.Element {
  const [sessions, setSessions] = useState<SessionBrief[]>([])
  const [selected, setSelected] = useState<string | undefined>(undefined)
  const [detail, setDetail] = useState<SessionDetail | undefined>(undefined)
  const [doc, setDoc] = useState<{ label: string; html: string } | undefined>(undefined)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [toast, setToast] = useState<string | undefined>(undefined)
  const [recheckPath, setRecheckPath] = useState('')

  // A2：SSE 实时列表（连接即收 snapshot；此后 store 变更即时推送）。断线降级轮询。
  useEffect(() => {
    let alive = true
    const loadList = async (): Promise<void> => {
      try {
        const r = await fetch('/contract-copilot/state')
        const data = await r.json() as { sessions: SessionBrief[] }
        if (alive) setSessions(data.sessions ?? [])
      } catch { /* 兜底轮询失败静默 */ }
    }
    void loadList()
    let es: EventSource | undefined
    try {
      es = new EventSource('/contract-copilot/events')
      es.addEventListener('snapshot', (ev) => {
        const data = JSON.parse((ev as MessageEvent<string>).data) as { sessions: SessionBrief[] }
        if (alive) setSessions(data.sessions ?? [])
      })
      es.addEventListener('session', (ev) => {
        const s = JSON.parse((ev as MessageEvent<string>).data) as SessionBrief
        if (!alive) return
        setSessions((prev) => {
          const idx = prev.findIndex((x) => x.id === s.id)
          if (idx >= 0) { const next = [...prev]; next[idx] = s; return next }
          return [s, ...prev]
        })
      })
    } catch { es = undefined }
    // SSE 不可用（或静默死亡）时的兜底轮询：低频 10s
    const timer = setInterval(loadList, 10000)
    return () => { alive = false; clearInterval(timer); es?.close() }
  }, [])

  useEffect(() => {
    if (selected === undefined) { setDetail(undefined); setDoc(undefined); return }
    let alive = true
    const load = async (): Promise<void> => {
      try {
        const r = await fetch(`/contract-copilot/sessions/${encodeURIComponent(selected)}`)
        if (!alive) return
        if (r.ok) setDetail(await r.json() as SessionDetail)
        const d = await fetch(`/contract-copilot/sessions/${encodeURIComponent(selected)}/document`)
        if (!alive) return
        if (d.ok) setDoc(await d.json() as { label: string; html: string })
      } catch { /* 静默 */ }
    }
    void load()
    const timer = setInterval(load, 5000)
    return () => { alive = false; clearInterval(timer) }
  }, [selected])

  const submitAnswers = async (): Promise<void> => {
    if (selected === undefined) return
    try {
      const r = await fetch(`/contract-copilot/sessions/${encodeURIComponent(selected)}/answers`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fields: answers }),
      })
      setToast(r.ok ? '已提交。请让 agent 重调 contract_copilot_intake 消费这些答案。' : '提交失败')
    } catch (error) {
      setToast(`提交失败: ${String(error)}`)
    }
  }

  // A3：对方改稿再审——把 session 指向新版合同，然后让 agent resume + analyze
  const submitRecheck = async (): Promise<void> => {
    if (selected === undefined || recheckPath.trim() === '') return
    try {
      const r = await fetch(`/contract-copilot/sessions/${encodeURIComponent(selected)}/recheck`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ newContractPath: recheckPath.trim() }),
      })
      const data = await r.json() as { hint?: string; error?: string }
      setToast(r.ok ? (data.hint ?? '已更新') : `失败: ${data.error ?? r.status}`)
    } catch (error) {
      setToast(`提交失败: ${String(error)}`)
    }
  }

  const missing = detail?.session.intakeMissing ?? []
  const stats = detail?.session.outputs?.stats

  return (
    <div style={S.overlay} onClick={props.onClose}>
      <style>{insDelCss}</style>
      <div style={S.panel} onClick={(e) => e.stopPropagation()}>
        <div style={S.head}>
          <span style={S.title}>📋 Contract Copilot · 审查工作台</span>
          <button type="button" style={S.close} onClick={props.onClose}>✕</button>
        </div>
        <div style={S.body}>
          <div style={S.list}>
            {sessions.length === 0 ? <div style={S.muted}>尚无 session——对 agent 说「审查 {'<合同路径>'}」开始。</div>
              : sessions.map((s) => (
                <div key={s.id} style={{ ...S.row, background: s.id === selected ? '#eef2fb' : undefined }}
                  onClick={() => { setSelected(s.id); setAnswers({}) }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{s.contractName}</div>
                  <div style={S.muted}>{STATE_LABELS[s.state] ?? s.state} · {new Date(s.updatedAt).toLocaleTimeString()}</div>
                </div>
              ))}
          </div>
          <div style={S.doc}>
            <div style={{ ...S.muted, marginBottom: 8 }}>{doc?.label ?? '选择左侧 session 查看文档'}</div>
            <div className="ccp-doc" style={S.docFrame} dangerouslySetInnerHTML={{ __html: doc?.html ?? '<p style="color:#8a8884">—</p>' }} />
          </div>
          <div style={S.side}>
            <div style={S.card}>
              <div style={S.muted}>当前状态</div>
              <div style={{ marginTop: 6 }}><span style={S.pill}>{detail ? (STATE_LABELS[detail.session.state] ?? detail.session.state) : '—'}</span></div>
              {stats !== undefined ? (
                <div style={{ marginTop: 8, ...S.muted }}>成功 {stats.applied ?? 0} · 失败 {stats.failed ?? 0} · 仅意见书 {stats.reportOnly ?? 0}</div>
              ) : null}
            </div>
            {detail?.session.outputs?.reviewedDocx !== undefined ? (
              <div style={S.card}>
                <div style={S.muted}>产物</div>
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <a style={{ ...S.btn, textAlign: 'center', textDecoration: 'none', display: 'block' }}
                    href={`/contract-copilot/sessions/${encodeURIComponent(detail.session.id)}/download/reviewed`}>⬇ 审核修订版 DOCX</a>
                  {detail.session.outputs.reportDocx !== undefined ? (
                    <a style={{ ...S.btn, textAlign: 'center', textDecoration: 'none', display: 'block', background: '#47639c' }}
                      href={`/contract-copilot/sessions/${encodeURIComponent(detail.session.id)}/download/report`}>⬇ 审查意见书 DOCX</a>
                  ) : null}
                </div>
              </div>
            ) : null}
            {detail?.session.state === 'delivered' ? (
              <div style={S.card}>
                <div style={{ ...S.muted, marginBottom: 6 }}>对方改稿后再审（§9.5）</div>
                <input style={S.input} placeholder="新版合同 DOCX 的本地绝对路径" value={recheckPath} onChange={(e) => setRecheckPath(e.target.value)} />
                <button type="button" style={{ ...S.btn, marginTop: 6 }} onClick={submitRecheck} disabled={recheckPath.trim() === ''}>指向新版合同</button>
              </div>
            ) : null}
            {missing.length > 0 ? (
              <div style={{ ...S.card, background: '#fffbf0', borderColor: '#f0e0a0' }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>需要你确认（{missing.length}）</div>
                {missing.map((m) => (
                  <div key={m.field} style={S.field}>
                    <div style={{ ...S.muted, marginBottom: 4 }}>{m.question}</div>
                    {m.options !== undefined && m.options.length > 0
                      ? m.options.map((o) => (
                        <label key={o} style={{ ...S.opt, background: answers[m.field] === o ? '#eef2fb' : '#fff' }}>
                          <input type="radio" name={m.field} checked={answers[m.field] === o} onChange={() => setAnswers({ ...answers, [m.field]: o })} /> {o}
                        </label>
                      ))
                      : <input style={S.input} value={answers[m.field] ?? ''} onChange={(e) => setAnswers({ ...answers, [m.field]: e.target.value })} />}
                  </div>
                ))}
                <button type="button" style={S.btn} onClick={submitAnswers}>提交给 agent</button>
              </div>
            ) : null}
            {detail !== undefined && detail.findings.length > 0 ? (
              <div style={S.card}>
                <div style={{ ...S.muted, marginBottom: 6 }}>审查发现（{detail.findings.length}）</div>
                {detail.findings.slice(0, 20).map((f, i) => (
                  <div key={i} style={{ fontSize: 12, marginBottom: 6 }}>
                    <b>{String(f.id ?? i + 1)}</b> {String(f.risk ?? '')}
                    <span style={S.muted}>（{String(f.severity ?? '?')} / {String(f.action ?? 'auto')}）</span>
                  </div>
                ))}
              </div>
            ) : null}
            {toast !== undefined ? <div style={{ ...S.card, background: '#1d1d1b', color: '#fff' }}>{toast}</div> : null}
          </div>
        </div>
      </div>
    </div>
  )
}