/**
 * host half 的同源数据面：把 SessionStore / 文档渲染暴露给浏览器 client half。
 *
 * 模式（session-log-export 先例）：host 在 ctx.webServer 注册 prefix 路由，
 * 浏览器端直接 fetch 同源 URL——不需要额外 RPC 层。
 *
 * 端点：
 *   GET  /state                          session 列表
 *   GET  /events                         SSE：store 变更实时推送（A2）
 *   GET  /sessions/:id                   详情（intake/missing/outputs/history/findings）
 *   GET  /sessions/:id/document          OOXML → HTML 渲染（修订/批注高亮）
 *   POST /sessions/:id/answers           工作台确认表单回收 → pendingAnswers
 *   POST /sessions/:id/recheck           对方改稿再审：更新 contractPath（A3）
 *   GET  /sessions/:id/download/:kind   产物 DOCX 下载（A1）
 *
 * webServer 是可选服务（headless profile 没有）：用 ctx.get 取（packages/AGENTS.md
 * 的可选服务规则），拿不到就静默跳过——工具链在 headless 下照常工作。
 */

import { readFileSync, statSync } from 'node:fs'
import { createReadStream } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { PluginConfig } from './config.ts'
import { extractDocxParts, parseCommentsXml, renderDocumentHtml } from './docx-view.ts'
import type { ContractSession, SessionStore } from './session.ts'
import { existsSync } from 'node:fs'
import { expandHome } from './paths.ts'

/** webServer 服务的结构子集（避免引入 dsh-host-webserver 依赖）。 */
interface WebServerLike {
  register(route: {
    kind: 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void
  }): () => void
}

const ROUTE_PREFIX = '/contract-copilot'
/** POST body 上限：本数据面只收表单字段与路径，1MB 绰绰有余。 */
const MAX_BODY_BYTES = 1024 * 1024

/** 注册数据面；无 webServer（headless）时静默跳过。 */
export function registerHostApi(ctx: Context, config: PluginConfig, store: SessionStore): (() => void) | undefined {
  const webServer = ctx.get('webServer') as WebServerLike | undefined
  if (webServer === undefined) return undefined

  // A2：SSE 订阅者集合（store 任何变更 → 推一条 session 快照）
  const sseClients = new Set<(payload: string) => void>()
  const unsubscribe = store.subscribe((session) => {
    const line = `event: session\ndata: ${JSON.stringify({
      id: session.id, contractName: session.contractName,
      state: session.state, updatedAt: session.updatedAt,
    })}\n\n`
    for (const send of sseClients) {
      try { send(line) } catch { /* 见 SessionStore.emit 的 catch 契约 */ }
    }
  })

  const disposer = webServer.register({ kind: 'prefix', path: ROUTE_PREFIX, handler: handle })
  ctx.effect(() => () => { unsubscribe(); disposer() }, 'contract-copilot: workbench data routes')
  return disposer

  function handle(req: IncomingMessage, res: ServerResponse): void {
    const url = req.url ?? '/'
    const suffix = url.startsWith(ROUTE_PREFIX) ? url.slice(ROUTE_PREFIX.length).split('?')[0] : ''
    const method = req.method ?? 'GET'

    if (method === 'GET' && suffix === '/state') {
      json(res, 200, { sessions: store.listRecent(30) })
      return
    }

    // A2：SSE 端点。连接即推一次当前快照，此后 store 变更实时推。
    if (method === 'GET' && suffix === '/events') {
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
      })
      const send = (payload: string): void => { res.write(payload) }
      send(`event: snapshot\ndata: ${JSON.stringify({ sessions: store.listRecent(30) })}\n\n`)
      sseClients.add(send)
      const ka = setInterval(() => { try { res.write(': keepalive\n\n') } catch { /* closed */ } }, 15000)
      req.on('close', () => { clearInterval(ka); sseClients.delete(send) })
      return
    }

    const sessionMatch = /^\/sessions\/([\w.-]+)(\/(detail|document|answers|recheck|download\/(reviewed|report)))?$/.exec(suffix)
    if (sessionMatch === null) {
      json(res, 404, { error: 'not found' })
      return
    }
    const id = sessionMatch[1] ?? ''
    const action = sessionMatch[3] ?? 'detail'

    if (method === 'GET' && action === 'detail') {
      const session = store.get(id)
      if (session === undefined) { json(res, 404, { error: 'session not found' }); return }
      json(res, 200, {
        session: {
          id: session.id,
          contractName: session.contractName,
          contractPath: session.contractPath,
          state: session.state,
          intake: session.intake,
          intakeMissing: session.intakeMissing,
          outputs: session.outputs,
          updatedAt: session.updatedAt,
          historyTail: session.history.slice(-8),
        },
        findings: planFindings(session),
      })
      return
    }

    if (method === 'GET' && action === 'document') {
      const session = store.get(id)
      if (session === undefined) { json(res, 404, { error: 'session not found' }); return }
      try {
        const docxPath = session.outputs.reviewedDocx ?? session.contractPath
        const { documentXml, commentsXml } = extractDocxParts(docxPath, config.pythonExecutable)
        const html = renderDocumentHtml(documentXml, parseCommentsXml(commentsXml))
        json(res, 200, {
          label: session.outputs.reviewedDocx !== undefined ? '审核修订版 DOCX' : '原合同',
          html,
          reviewedDocx: session.outputs.reviewedDocx,
          reportDocx: session.outputs.reportDocx,
        })
      } catch (error) {
        json(res, 500, { error: String(error) })
      }
      return
    }

    if (method === 'POST' && action === 'answers') {
      readBody(req).then((raw) => {
        try {
          const body = JSON.parse(raw) as { fields?: Record<string, string> }
          const session = store.get(id)
          if (session === undefined) { json(res, 404, { error: 'session not found' }); return }
          store.save({ ...session, pendingAnswers: body.fields ?? {} })
          json(res, 200, { ok: true })
        } catch (error) {
          json(res, 400, { error: String(error) })
        }
      }).catch((error: unknown) => json(res, 400, { error: String(error) }))
      return
    }

    // A3：对方改稿再审——更新 session 指向新版合同，用户再让 agent resume+analyze。
    if (method === 'POST' && action === 'recheck') {
      readBody(req).then((raw) => {
        try {
          const body = JSON.parse(raw) as { newContractPath?: string }
          const session = store.get(id)
          if (session === undefined) { json(res, 404, { error: 'session not found' }); return }
          const newPath = path.resolve(expandHome(String(body.newContractPath ?? '')))
          if (!existsSync(newPath)) { json(res, 400, { error: `新版合同不存在: ${newPath}` }); return }
          if (!newPath.toLowerCase().endsWith('.docx')) { json(res, 400, { error: '仅支持 DOCX' }); return }
          store.save({
            ...session,
            contractPath: newPath,
            contractName: path.basename(newPath, path.extname(newPath)),
          })
          json(res, 200, {
            ok: true,
            hint: '已指向新版合同。请让 agent 调 contract_copilot_resume（sessionId，不带 newContractPath）后重新 analyze 提交针对新版合同的 findings',
          })
        } catch (error) {
          json(res, 400, { error: String(error) })
        }
      }).catch((error: unknown) => json(res, 400, { error: String(error) }))
      return
    }

    // A1：产物下载（流式 + content-disposition）
    if (method === 'GET' && sessionMatch[4] !== undefined) {
      serveDownload(res, store, id, sessionMatch[4] === 'reviewed' ? 'reviewed' : 'report')
      return
    }

    json(res, 404, { error: 'not found' })
  }
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': String(Buffer.byteLength(text)) })
  res.end(text)
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    req.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > MAX_BODY_BYTES) {
        req.destroy()
        reject(new Error(`body 超过上限 ${MAX_BODY_BYTES} 字节`))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function serveDownload(res: ServerResponse, store: SessionStore, id: string, kind: 'reviewed' | 'report'): void {
  const session = store.get(id)
  if (session === undefined) {
    json(res, 404, { error: 'session not found' })
    return
  }
  const file = kind === 'reviewed' ? session.outputs.reviewedDocx : session.outputs.reportDocx
  if (file === undefined) {
    json(res, 404, { error: `${kind} DOCX 尚未产出` })
    return
  }
  try {
    const size = statSync(file).size
    res.writeHead(200, {
      'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'content-length': String(size),
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(file))}`,
    })
    createReadStream(file).pipe(res)
  } catch (error) {
    json(res, 500, { error: String(error) })
  }
}

function planFindings(session: ContractSession): Array<Record<string, unknown>> {
  if (session.planPath === undefined) return []
  try {
    const plan = JSON.parse(readFileSync(session.planPath, 'utf8')) as { findings?: unknown[]; risks?: unknown[] }
    const items = Array.isArray(plan.findings) ? plan.findings : Array.isArray(plan.risks) ? plan.risks : []
    return items as Array<Record<string, unknown>>
  } catch {
    return []
  }
}