/**
 * host half 的同源数据面：把 SessionStore / 文档渲染暴露给浏览器 client half。
 *
 * 模式（session-log-export 先例）：host 在 ctx.webServer 注册 prefix 路由，
 * 浏览器端直接 fetch 同源 URL——不需要额外 RPC 层。
 *
 * webServer 是可选服务（headless profile 没有）：用 ctx.get 取（packages/AGENTS.md
 * 的可选服务规则），拿不到就静默跳过——工具链在 headless 下照常工作。
 */

import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { PluginConfig } from './config.ts'
import { extractDocxParts, parseCommentsXml, renderDocumentHtml } from './docx-view.ts'
import type { ContractSession, SessionStore } from './session.ts'

/** webServer 服务的结构子集（避免引入 dsh-host-webserver 依赖）。 */
interface WebServerLike {
  register(route: {
    kind: 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void
  }): () => void
}

const ROUTE_PREFIX = '/contract-copilot'

/** 注册数据面；无 webServer（headless）时静默跳过。返回 disposer 由调用方挂 ctx.effect。 */
export function registerHostApi(ctx: Context, config: PluginConfig, store: SessionStore): (() => void) | undefined {
  const webServer = ctx.get('webServer') as WebServerLike | undefined
  if (webServer === undefined) return undefined
  const disposer = webServer.register({ kind: 'prefix', path: ROUTE_PREFIX, handler: handle })
  ctx.effect(() => disposer, 'contract-copilot: workbench data routes')
  return disposer

  function handle(req: IncomingMessage, res: ServerResponse): void {
    const url = req.url ?? '/'
    const suffix = url.startsWith(ROUTE_PREFIX) ? url.slice(ROUTE_PREFIX.length).split('?')[0] : ''
    const method = req.method ?? 'GET'

    if (method === 'GET' && suffix === '/state') {
      json(res, 200, { sessions: store.listRecent(30) })
      return
    }

    const sessionMatch = /^\/sessions\/([\w.-]+)(\/(detail|document|answers))?$/.exec(suffix)
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
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
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