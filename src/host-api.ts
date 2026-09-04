/** Authenticated Host data plane for the embedded Contract Copilot workbench. */

import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import type { Context } from '@deepseek-ai/cordis'
import type {
  ConnectionRpcFailure,
  ConnectionRpcResult,
  HostConnectionHandle,
} from '@deepseek-ai/dsh-client-connection'
import type { PluginConfig } from './config.ts'
import { extractDocxParts, parseCommentsXml, renderDocumentHtml } from './docx-view.ts'
import { resolveIntakeFields } from './intake-fields.ts'
import { expandHome, normalizeContractKey } from './paths.ts'
import { approvePlan, PlanReviewError, type FindingDecisionInput } from './plan-review.ts'
import type { ContractSession, DecisionAnswers, SessionStore } from './session.ts'
import { findContractMemory, readReviewerProfile, readReviewMemory } from './skill-config.ts'
import {
  WORKBENCH_DOWNLOAD_PATH,
  WORKBENCH_EVENTS_PATH,
  WORKBENCH_RPC_CHANNEL,
  type DocumentView,
  type ApprovePlanResult,
  type RecheckResult,
  type SessionDetail,
  type StartReviewResult,
  type WorkbenchRpcEndpoint,
  type WorkbenchState,
} from './workbench-protocol.ts'

const SESSION_ID_PATTERN = /^[^\u0000-\u001F\u007F/\\]{1,200}$/u
const MAX_PATH_LENGTH = 4096
const MAX_ANSWER_FIELDS = 64
const MAX_ANSWER_TEXT_LENGTH = 20_000
const DOCX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

class WorkbenchRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

/** Register workbench routes when the Web profile provides Connection. */
export function registerHostApi(ctx: Context, config: PluginConfig, store: SessionStore): void {
  if (!config.workbench.enabled) return
  ctx.inject(['connection'], (connectionCtx) => {
    const connection = connectionCtx.connection as HostConnectionHandle
    connection.rpc.handle(
      WORKBENCH_RPC_CHANNEL,
      (endpoint, payload) => handleWorkbenchRpc(config, store, endpoint, payload),
    )
    connection.fetch.register({
      path: WORKBENCH_EVENTS_PATH,
      methods: ['GET'],
      fetch: request => Promise.resolve(workbenchEventsResponse(request, store)),
    })
    connection.fetch.register({
      path: WORKBENCH_DOWNLOAD_PATH,
      methods: ['GET', 'HEAD'],
      fetch: request => Promise.resolve(workbenchDownloadResponse(request, store)),
    })
  })
}

/** Dispatch one authenticated workbench JSON request. */
export async function handleWorkbenchRpc(
  config: PluginConfig,
  store: SessionStore,
  endpoint: string,
  payload: unknown,
): Promise<ConnectionRpcResult<unknown>> {
  try {
    const input = recordPayload(payload)
    switch (endpoint as WorkbenchRpcEndpoint) {
      case 'state':
        return success<WorkbenchState>({ sessions: store.listRecent(30) })
      case 'detail':
        return success(sessionDetail(store, sessionIdFrom(input)))
      case 'document':
        return success(documentView(config, requireSession(store, sessionIdFrom(input))))
      case 'answers': {
        const session = requireSession(store, sessionIdFrom(input))
        store.save({ ...session, pendingAnswers: answersFrom(input.fields) })
        return success({ ok: true as const })
      }
      case 'approve': {
        const session = requireSession(store, sessionIdFrom(input))
        const approved = approvePlan(
          session,
          stringField(input, 'sourcePlanHash'),
          decisionsFrom(input.decisions),
        )
        store.save({ ...session, planReview: approved.planReview })
        return success<ApprovePlanResult>({
          ok: true,
          approvedPlanHash: approved.planReview.approvedPlanHash!,
          approvedFindings: approved.approvedFindings,
          omittedFindings: approved.omittedFindings,
        })
      }
      case 'start':
        return success(startReview(config, store, stringField(input, 'contractPath')))
      case 'recheck':
        return success(recheck(store, sessionIdFrom(input), stringField(input, 'newContractPath')))
      default:
        throw new WorkbenchRequestError('contract-copilot/not-found', `未知工作台操作: ${endpoint}`)
    }
  } catch (error) {
    return failure(error)
  }
}

function success<T>(value: T): ConnectionRpcResult<T> {
  return { ok: true, value }
}

function failure(error: unknown): ConnectionRpcResult<never> {
  if (error instanceof PlanReviewError) {
    return { ok: false, error: rpcFailure(error.code, error.message) }
  }
  if (error instanceof WorkbenchRequestError) {
    return { ok: false, error: rpcFailure(error.code, error.message) }
  }
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false, error: rpcFailure('contract-copilot/internal', message) }
}

function decisionsFrom(value: unknown): FindingDecisionInput[] {
  if (!Array.isArray(value) || value.length > 500) {
    throw new WorkbenchRequestError('contract-copilot/bad-request', 'decisions 必须是不超过 500 项的数组。')
  }
  return value.map((raw) => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new WorkbenchRequestError('contract-copilot/bad-request', 'decision 必须是 JSON 对象。')
    }
    const decision = raw as Record<string, unknown>
    const findingId = stringField(decision, 'findingId')
    const disposition = stringField(decision, 'disposition') as FindingDecisionInput['disposition']
    const severity = optionalString(decision, 'severity', 40)
    const note = optionalString(decision, 'note', MAX_ANSWER_TEXT_LENGTH)
    return { findingId, disposition, ...(severity === undefined ? {} : { severity }), ...(note === undefined ? {} : { note }) }
  })
}

function optionalString(payload: Record<string, unknown>, field: string, max: number): string | undefined {
  const value = payload[field]
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length > max) {
    throw new WorkbenchRequestError('contract-copilot/bad-request', `${field} 必须是长度不超过 ${max} 的字符串。`)
  }
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

function rpcFailure(code: string, message: string): ConnectionRpcFailure {
  return { code, message, details: {} }
}

function recordPayload(payload: unknown): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new WorkbenchRequestError('contract-copilot/bad-request', '请求参数必须是 JSON 对象。')
  }
  return payload as Record<string, unknown>
}

function stringField(payload: Record<string, unknown>, field: string): string {
  const value = payload[field]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new WorkbenchRequestError('contract-copilot/bad-request', `${field} 必须是非空字符串。`)
  }
  if (value.length > MAX_PATH_LENGTH) {
    throw new WorkbenchRequestError('contract-copilot/bad-request', `${field} 超过长度上限。`)
  }
  return value.trim()
}

function sessionIdFrom(payload: Record<string, unknown>): string {
  const sessionId = stringField(payload, 'sessionId')
  if (!SESSION_ID_PATTERN.test(sessionId) || sessionId === '.' || sessionId === '..') {
    throw new WorkbenchRequestError('contract-copilot/bad-request', 'sessionId 格式无效。')
  }
  return sessionId
}

function answersFrom(value: unknown): DecisionAnswers {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new WorkbenchRequestError('contract-copilot/bad-request', 'fields 必须是字符串字段对象。')
  }
  const entries = Object.entries(value)
  if (entries.length > MAX_ANSWER_FIELDS) {
    throw new WorkbenchRequestError('contract-copilot/bad-request', '确认字段数量超过上限。')
  }
  const answers = Object.create(null) as DecisionAnswers
  for (const [field, answer] of entries) {
    if (field === '' || field.length > 200 || typeof answer !== 'string' || answer.length > MAX_ANSWER_TEXT_LENGTH) {
      throw new WorkbenchRequestError('contract-copilot/bad-request', '确认字段的名称或内容无效。')
    }
    answers[field] = answer
  }
  return answers
}

function requireSession(store: SessionStore, sessionId: string): ContractSession {
  const session = store.get(sessionId)
  if (session === undefined) {
    throw new WorkbenchRequestError('contract-copilot/not-found', `审查 session 不存在: ${sessionId}`)
  }
  return session
}

function resolveDocxPath(input: string, label: string): string {
  const resolved = path.resolve(expandHome(input))
  if (!resolved.toLowerCase().endsWith('.docx')) {
    throw new WorkbenchRequestError('contract-copilot/bad-request', `${label}仅支持 DOCX。`)
  }
  if (!existsSync(resolved)) {
    throw new WorkbenchRequestError('contract-copilot/bad-request', `${label}不存在: ${resolved}`)
  }
  return resolved
}

function startReview(config: PluginConfig, store: SessionStore, inputPath: string): StartReviewResult {
  const contractPath = resolveDocxPath(inputPath, '合同')
  const contractName = path.basename(contractPath, path.extname(contractPath))
  const memory = findContractMemory(readReviewMemory(config.skillRoot), normalizeContractKey(contractName))
  const profile = readReviewerProfile(config.skillRoot)
  const { missing } = resolveIntakeFields({}, {}, memory, profile)
  const session = store.create(contractPath, contractName)
  if (missing.length > 0) store.save({ ...session, intakeMissing: missing })
  return {
    sessionId: session.id,
    contractName,
    missing,
    nextStep: missing.length > 0
      ? `右侧表单补齐后，对 Agent 说：审查 ${contractPath}（工作台表单已填）`
      : `直接对 Agent 说：审查 ${contractPath}`,
  }
}

function recheck(store: SessionStore, sessionId: string, inputPath: string): RecheckResult {
  const session = requireSession(store, sessionId)
  const contractPath = resolveDocxPath(inputPath, '新版合同')
  const contractName = path.basename(contractPath, path.extname(contractPath))
  store.save({
    ...session,
    contractPath,
    contractKey: normalizeContractKey(contractName),
    contractName,
  })
  return {
    ok: true,
    hint: '已指向新版合同。请让 Agent 恢复本 session，并重新分析新版合同。',
  }
}

function sessionDetail(store: SessionStore, sessionId: string): SessionDetail {
  const session = requireSession(store, sessionId)
  return {
    session: {
      id: session.id,
      contractName: session.contractName,
      contractPath: session.contractPath,
      state: session.state,
      intake: session.intake,
      intakeMissing: session.intakeMissing,
      planReview: session.planReview,
      automation: session.automation,
      outputs: session.outputs,
      updatedAt: session.updatedAt,
      historyTail: session.history.slice(-8),
    },
    findings: planFindings(session),
  }
}

function documentView(config: PluginConfig, session: ContractSession): DocumentView {
  const docxPath = session.outputs.reviewedDocx ?? session.contractPath
  const { documentXml, commentsXml } = extractDocxParts(docxPath, config.pythonExecutable)
  const comments = parseCommentsXml(commentsXml)
  return {
    label: session.outputs.reviewedDocx !== undefined ? '审核修订版 DOCX' : '原合同',
    html: renderDocumentHtml(documentXml, comments),
    comments: [...comments.entries()].map(([id, comment]) => ({ id, ...comment })),
    reviewedDocx: session.outputs.reviewedDocx,
    reportDocx: session.outputs.reportDocx,
  }
}

/** Create the authenticated EventSource response for SessionStore changes. */
export function workbenchEventsResponse(request: Request, store: SessionStore): Response {
  const encoder = new TextEncoder()
  let dispose = (): void => {}
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let active = true
      const send = (event: string, value: unknown): void => {
        if (!active) return
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`))
      }
      const unsubscribe = store.subscribe((session) => {
        send('session', {
          id: session.id,
          contractName: session.contractName,
          state: session.state,
          updatedAt: session.updatedAt,
        })
      })
      const heartbeat = setInterval(() => {
        if (active) controller.enqueue(encoder.encode(': keepalive\n\n'))
      }, 15_000)
      const release = (close: boolean): void => {
        if (!active) return
        active = false
        clearInterval(heartbeat)
        unsubscribe()
        request.signal.removeEventListener('abort', abort)
        if (close) controller.close()
      }
      const abort = (): void => { release(true) }
      dispose = () => { release(false) }
      if (request.signal.aborted) abort()
      else request.signal.addEventListener('abort', abort, { once: true })
      send('snapshot', { sessions: store.listRecent(30) })
    },
    cancel() { dispose() },
  })
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
    },
  })
}

/** Stream one authenticated source or delivery DOCX response. */
export function workbenchDownloadResponse(request: Request, store: SessionStore): Response {
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      throw new WorkbenchRequestError('contract-copilot/bad-request', '下载仅支持 GET 或 HEAD。')
    }
    const url = new URL(request.url)
    const sessionId = sessionIdFrom({ sessionId: url.searchParams.get('sessionId') })
    const kind = url.searchParams.get('kind')
    if (kind !== 'source' && kind !== 'reviewed' && kind !== 'report') {
      throw new WorkbenchRequestError('contract-copilot/bad-request', 'kind 必须是 source、reviewed 或 report。')
    }
    const session = requireSession(store, sessionId)
    const file = kind === 'source'
      ? session.contractPath
      : kind === 'reviewed'
        ? session.outputs.reviewedDocx
        : session.outputs.reportDocx
    if (file === undefined || !existsSync(file)) {
      throw new WorkbenchRequestError('contract-copilot/not-found', `${kind} DOCX 尚未产出。`)
    }
    const headers = {
      'content-type': DOCX_CONTENT_TYPE,
      'content-length': String(statSync(file).size),
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(file))}`,
    }
    if (request.method === 'HEAD') return new Response(null, { status: 200, headers })
    const body = Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>
    return new Response(body, { status: 200, headers })
  } catch (error) {
    const result = failure(error)
    const body = result.ok ? undefined : JSON.stringify({ error: result.error })
    const status = !result.ok && result.error.code === 'contract-copilot/not-found'
      ? 404
      : !result.ok && result.error.code === 'contract-copilot/internal'
        ? 500
        : 400
    return new Response(body, {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
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
