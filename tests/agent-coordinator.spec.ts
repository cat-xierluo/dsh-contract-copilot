import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentHandle } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentCoordinatorError, ContractAgentCoordinator } from '../src/agent-coordinator.ts'
import { approvePlan, beginPlanReview } from '../src/plan-review.ts'
import { SessionStore } from '../src/session.ts'
import { writeContractDocx } from './docx-fixture.ts'

interface AgentFixture {
  readonly agent: Agent
  readonly handle: AgentHandle
  readonly followup: ReturnType<typeof vi.fn>
  readonly cancel: ReturnType<typeof vi.fn>
  readonly dispose: ReturnType<typeof vi.fn>
  readonly settle: () => void
}

let root: string
let store: SessionStore

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'cc-agent-coordinator-'))
  store = new SessionStore(path.join(root, 'sessions'))
  // 分析回合派发前 Host 会从 contractPath 提取合同可见文本（fail loud），
  // 所以每个用例的 contract.docx 都必须是可读且非空的 DOCX。
  writeContractDocx(path.join(root, 'contract.docx'), ['第一条 甲方：测试主体。', '第二条 乙方应按约交付。'])
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function agentFixture(id = 'contract-agent'): AgentFixture {
  const idle = Promise.withResolvers<void>()
  const followup = vi.fn()
  const cancel = vi.fn(() => { idle.resolve() })
  const dispose = vi.fn(async () => {})
  const agent = {
    id: SessionId(id),
    followup,
    cancel,
    whenIdle: () => idle.promise,
  } as unknown as Agent
  return {
    agent,
    handle: { agent, dispose },
    followup,
    cancel,
    dispose,
    settle: idle.resolve,
  }
}

function context(fixture: AgentFixture, options: { readonly live?: boolean } = {}): {
  readonly ctx: Context
  readonly create: ReturnType<typeof vi.fn>
  readonly resume: ReturnType<typeof vi.fn>
} {
  const create = vi.fn(async () => fixture.handle)
  const resume = vi.fn(async () => fixture.handle)
  const ctx = {
    agents: {
      get: vi.fn(() => options.live === true ? fixture.agent : undefined),
      create,
      resume,
    },
    agentDefaultModel: {
      currentSelection: () => ({ provider: 'fixture-provider', model: 'fixture-model' }),
    },
  } as unknown as Context
  return { ctx, create, resume }
}

function rejectingContext(fixture: AgentFixture): {
  readonly ctx: Context
  readonly create: ReturnType<typeof vi.fn>
  readonly resume: ReturnType<typeof vi.fn>
} {
  const create = vi.fn()
    .mockRejectedValueOnce(new Error('provider unavailable'))
    .mockResolvedValueOnce(fixture.handle)
  const resume = vi.fn(async () => fixture.handle)
  const ctx = {
    agents: {
      get: vi.fn(() => undefined),
      create,
      resume,
    },
    agentDefaultModel: {
      currentSelection: () => ({ provider: 'fixture-provider', model: 'fixture-model' }),
    },
  } as unknown as Context
  return { ctx, create, resume }
}

function pendingPlan(sessionId: string): void {
  const session = store.get(sessionId)!
  const planPath = path.join(store.artifactsDir(sessionId), 'review-plan.json')
  writeFileSync(planPath, `${JSON.stringify({ findings: [{ id: 'R001', risk: '付款风险', action: 'auto' }] })}\n`)
  store.transition(sessionId, 'contract_copilot_analyze', 'plan_ready', (target) => {
    target.planPath = planPath
    target.planReview = beginPlanReview(planPath, target.planReview)
  })
}

describe('ContractAgentCoordinator', () => {
  it('creates a dedicated Agent and observes a deterministic waiting-decisions settlement', async () => {
    const session = store.create(path.join(root, 'contract.docx'), 'contract')
    const fixture = agentFixture()
    const runtime = context(fixture)
    const coordinator = new ContractAgentCoordinator(runtime.ctx, store)

    const result = await coordinator.runAnalysis(session.id)
    const settled = coordinator.whenSettled(session.id)

    expect(result).toMatchObject({ accepted: true, phase: 'analysis' })
    expect(runtime.create).toHaveBeenCalledWith(expect.objectContaining({
      meta: { cwd: root },
      agentOptions: { provider: 'fixture-provider', model: 'fixture-model' },
    }))
    expect(fixture.followup).toHaveBeenCalledOnce()
    expect(store.get(session.id)?.automation?.status).toBe('running-analysis')

    pendingPlan(session.id)
    fixture.settle()
    await settled

    expect(store.get(session.id)?.automation?.status).toBe('waiting-decisions')
    await coordinator.dispose()
    expect(fixture.dispose).toHaveBeenCalledOnce()
  })

  it('rejects a second command while the first command owns the case', async () => {
    const session = store.create(path.join(root, 'contract.docx'), 'contract')
    const fixture = agentFixture()
    const coordinator = new ContractAgentCoordinator(context(fixture).ctx, store)

    await coordinator.runAnalysis(session.id)
    await expect(coordinator.runAnalysis(session.id)).rejects.toMatchObject<Partial<AgentCoordinatorError>>({
      code: 'contract-copilot/agent-busy',
    })

    fixture.settle()
    await coordinator.dispose()
  })

  it('resumes the linked DSH session after a process-local handle is gone', async () => {
    const session = store.create(path.join(root, 'contract.docx'), 'contract')
    session.dshSessionId = 'persisted-agent'
    store.save(session)
    const fixture = agentFixture('persisted-agent')
    const runtime = context(fixture)
    const coordinator = new ContractAgentCoordinator(runtime.ctx, store)

    await coordinator.runAnalysis(session.id)

    expect(runtime.resume).toHaveBeenCalledWith({ resumeSessionId: SessionId('persisted-agent') })
    expect(runtime.create).not.toHaveBeenCalled()
    fixture.settle()
    await coordinator.dispose()
  })

  it('persists an initial create failure and retries by creating instead of resuming', async () => {
    const session = store.create(path.join(root, 'contract.docx'), 'contract')
    const fixture = agentFixture()
    const runtime = rejectingContext(fixture)
    const coordinator = new ContractAgentCoordinator(runtime.ctx, store)

    await expect(coordinator.runAnalysis(session.id)).rejects.toMatchObject<Partial<AgentCoordinatorError>>({
      code: 'contract-copilot/agent-start-failed',
    })
    expect(store.get(session.id)).toMatchObject({
      automation: { status: 'failed', error: 'provider unavailable' },
    })
    expect(store.get(session.id)?.dshSessionId).toBeUndefined()

    await expect(coordinator.runAnalysis(session.id)).resolves.toMatchObject({ accepted: true })
    expect(runtime.create).toHaveBeenCalledTimes(2)
    expect(runtime.resume).not.toHaveBeenCalled()

    fixture.settle()
    await coordinator.dispose()
  })

  it('runs delivery only for an approved plan and records delivered after true idle', async () => {
    const session = store.create(path.join(root, 'contract.docx'), 'contract')
    pendingPlan(session.id)
    const ready = store.get(session.id)!
    ready.planReview = approvePlan(ready, ready.planReview!.sourcePlanHash, [
      { findingId: 'R001', disposition: 'accept' },
    ]).planReview
    store.save(ready)
    const fixture = agentFixture()
    const coordinator = new ContractAgentCoordinator(context(fixture).ctx, store)

    await coordinator.runDelivery(session.id)
    const settled = coordinator.whenSettled(session.id)
    store.transition(session.id, 'contract_copilot_finalize', 'delivered')
    fixture.settle()
    await settled

    expect(store.get(session.id)?.automation?.status).toBe('delivered')
    await coordinator.dispose()
  })

  it('cancels and waits for quiescence before reporting acceptance', async () => {
    const session = store.create(path.join(root, 'contract.docx'), 'contract')
    const fixture = agentFixture()
    const coordinator = new ContractAgentCoordinator(context(fixture).ctx, store)

    await coordinator.runAnalysis(session.id)
    await expect(coordinator.cancel(session.id)).resolves.toEqual({ accepted: true })

    expect(fixture.cancel).toHaveBeenCalledWith({ kind: 'user' })
    expect(store.get(session.id)?.automation?.status).toBe('idle')
    await coordinator.dispose()
  })
})
