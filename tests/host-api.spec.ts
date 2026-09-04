/** Host workbench tests: validation, persistence, routes, SSE, and downloads. */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PluginConfig } from '../src/config.ts'
import type { ContractAgentCoordinator } from '../src/agent-coordinator.ts'
import { AgentCoordinatorError } from '../src/agent-coordinator.ts'
import { beginPlanReview } from '../src/plan-review.ts'
import {
  handleWorkbenchRpc,
  registerHostApi,
  workbenchDownloadResponse,
  workbenchEventsResponse,
} from '../src/host-api.ts'
import { SessionStore } from '../src/session.ts'
import { WORKBENCH_DOWNLOAD_PATH, WORKBENCH_EVENTS_PATH, WORKBENCH_RPC_CHANNEL } from '../src/workbench-protocol.ts'

let root: string
let store: SessionStore
let config: PluginConfig

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'cc-workbench-'))
  store = new SessionStore(path.join(root, 'sessions'))
  config = {
    skillRoot: path.join(root, 'skill'),
    pythonExecutable: 'python3',
    sessionsDir: path.join(root, 'sessions'),
    injectProgress: true,
    workbench: { enabled: true },
  }
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('handleWorkbenchRpc', () => {
  it('新建审查只接受存在的 DOCX，并返回前置信息表单', async () => {
    const contract = path.join(root, '采购合同.docx')
    writeFileSync(contract, 'fixture')

    const result = await handleWorkbenchRpc(config, store, 'start', { contractPath: contract })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({ contractName: '采购合同' })
    expect((result.value as { missing: unknown[] }).missing.length).toBeGreaterThan(0)
    expect(store.listRecent()).toHaveLength(1)
  })

  it('拒绝非 DOCX 与畸形 session id', async () => {
    const text = path.join(root, 'contract.txt')
    writeFileSync(text, 'fixture')

    await expect(handleWorkbenchRpc(config, store, 'start', { contractPath: text }))
      .resolves.toMatchObject({ ok: false, error: { code: 'contract-copilot/bad-request' } })
    await expect(handleWorkbenchRpc(config, store, 'detail', { sessionId: '../escape' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'contract-copilot/bad-request' } })
  })

  it('确认答案写回对应 session', async () => {
    const session = store.create(path.join(root, 'contract.docx'), 'contract')

    await expect(handleWorkbenchRpc(config, store, 'answers', {
      sessionId: session.id,
      fields: { partyRole: '甲方' },
    })).resolves.toEqual({ ok: true, value: { ok: true } })
    expect(store.get(session.id)?.pendingAnswers).toEqual({ partyRole: '甲方' })
  })

  it('逐项批准计划并返回稳定的领域错误码', async () => {
    const session = store.create(path.join(root, 'contract.docx'), 'contract')
    const planPath = path.join(root, 'review-plan.json')
    writeFileSync(planPath, `${JSON.stringify({ findings: [{ id: 'R001', risk: '付款风险', action: 'auto' }] })}\n`)
    session.planPath = planPath
    session.planReview = beginPlanReview(planPath, undefined)
    store.save(session)

    await expect(handleWorkbenchRpc(config, store, 'approve', {
      sessionId: session.id,
      sourcePlanHash: session.planReview.sourcePlanHash,
      decisions: [],
    })).resolves.toMatchObject({
      ok: false,
      error: { code: 'contract-copilot/incomplete-decisions' },
    })

    const approved = await handleWorkbenchRpc(config, store, 'approve', {
      sessionId: session.id,
      sourcePlanHash: session.planReview.sourcePlanHash,
      decisions: [{ findingId: 'R001', disposition: 'accept' }],
    })
    expect(approved).toMatchObject({ ok: true, value: { ok: true, approvedFindings: 1, omittedFindings: 0 } })
    expect(store.get(session.id)?.planReview?.status).toBe('approved')
  })

  it('通过工作台命令启动专属 Agent 并保留控制器错误码', async () => {
    const session = store.create(path.join(root, 'contract.docx'), 'contract')
    store.transition(session.id, 'contract_copilot_intake', 'intake_done')
    const runAnalysis = vi.fn(async () => ({ accepted: true as const, dshSessionId: 'agent-1', phase: 'analysis' as const }))
    const coordinator = { runAnalysis } as unknown as ContractAgentCoordinator

    await expect(handleWorkbenchRpc(config, store, 'run-analysis', { sessionId: session.id }, coordinator))
      .resolves.toMatchObject({ ok: true, value: { accepted: true, phase: 'analysis' } })
    expect(runAnalysis).toHaveBeenCalledWith(session.id)

    const busy = {
      runAnalysis: vi.fn(async () => {
        throw new AgentCoordinatorError('contract-copilot/agent-busy', 'busy')
      }),
    } as unknown as ContractAgentCoordinator
    await expect(handleWorkbenchRpc(config, store, 'run-analysis', { sessionId: session.id }, busy))
      .resolves.toMatchObject({ ok: false, error: { code: 'contract-copilot/agent-busy' } })
  })
})

describe('Connection registration', () => {
  it('注册一个鉴权 RPC channel 和两个 /api 精确 Fetch 路由', () => {
    const handle = vi.fn(() => async () => {})
    const register = vi.fn(() => async () => {})
    const ctx = {
      inject: (_services: readonly string[], callback: (child: unknown) => void) => {
        callback({ connection: { rpc: { handle }, fetch: { register } } })
      },
    } as unknown as Context

    registerHostApi(ctx, config, store, {} as ContractAgentCoordinator)

    expect(handle).toHaveBeenCalledWith(WORKBENCH_RPC_CHANNEL, expect.any(Function))
    expect(register).toHaveBeenCalledTimes(2)
    expect(register.mock.calls.map(([route]) => route.path)).toEqual([
      WORKBENCH_EVENTS_PATH,
      WORKBENCH_DOWNLOAD_PATH,
    ])
  })

  it('workbench.enabled=false 时不等待 Connection', () => {
    const inject = vi.fn()
    registerHostApi({ inject } as unknown as Context, { ...config, workbench: { enabled: false } }, store)
    expect(inject).not.toHaveBeenCalled()
  })
})

describe('authenticated Fetch handlers', () => {
  it('SSE 连接首先发送完整 session 快照并可取消', async () => {
    store.create(path.join(root, 'contract.docx'), 'contract')
    const response = workbenchEventsResponse(new Request(`http://dsh.test${WORKBENCH_EVENTS_PATH}`), store)
    const reader = response.body?.getReader()

    const first = await reader?.read()
    expect(new TextDecoder().decode(first?.value)).toContain('event: snapshot')
    expect(new TextDecoder().decode(first?.value)).toContain('contract')
    await reader?.cancel()
  })

  it('GET 流式返回源 DOCX，HEAD 只返回头部', async () => {
    const contract = path.join(root, '合同 文件.docx')
    writeFileSync(contract, 'docx-bytes')
    const session = store.create(contract, '合同 文件')
    const url = new URL(`http://dsh.test${WORKBENCH_DOWNLOAD_PATH}`)
    url.searchParams.set('sessionId', session.id)
    url.searchParams.set('kind', 'source')

    const get = workbenchDownloadResponse(new Request(url), store)
    const head = workbenchDownloadResponse(new Request(url, { method: 'HEAD' }), store)

    expect(get.status).toBe(200)
    await expect(get.text()).resolves.toBe('docx-bytes')
    expect(get.headers.get('content-disposition')).toContain(encodeURIComponent('合同 文件.docx'))
    expect(head.status).toBe(200)
    expect(head.body).toBeNull()
  })
})
