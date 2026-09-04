/** Dedicated DSH Agent lifecycle owned by the Contract Copilot workbench. */

import { createHash } from 'node:crypto'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentHandle } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { assertApprovedPlan } from './plan-review.ts'
import type { ContractSession, SessionStore } from './session.ts'

type AgentPhase = 'analysis' | 'delivery'

interface ActiveCommand {
  readonly agent: Agent
  readonly phase: AgentPhase
  cancelled: boolean
  settled: Promise<void>
}

export interface AgentDispatchResult {
  readonly accepted: true
  readonly dshSessionId: string
  readonly phase: AgentPhase
}

/** Stable failures returned to the authenticated workbench RPC layer. */
export class AgentCoordinatorError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
  }
}

/** Owns Agent handles and converts their live lifecycle into durable product state. */
export class ContractAgentCoordinator {
  private readonly handles = new Map<string, AgentHandle>()
  private readonly active = new Map<string, ActiveCommand>()
  private closing = false

  constructor(
    private readonly ctx: Context,
    private readonly store: SessionStore,
  ) {}

  /** Start or resume the dedicated Agent and stop after it produces a review plan. */
  runAnalysis(sessionId: string): Promise<AgentDispatchResult> {
    return this.dispatch(sessionId, 'analysis')
  }

  /** Resume the dedicated Agent after lawyer approval and generate delivery files. */
  runDelivery(sessionId: string): Promise<AgentDispatchResult> {
    return this.dispatch(sessionId, 'delivery')
  }

  /** Cancel one in-flight command and wait for the Agent to become idle. */
  async cancel(sessionId: string): Promise<{ readonly accepted: true }> {
    const command = this.active.get(sessionId)
    if (command === undefined) {
      throw new AgentCoordinatorError('contract-copilot/not-running', '当前案件没有正在运行的 Agent 命令。')
    }
    command.cancelled = true
    command.agent.cancel({ kind: 'user' })
    await command.settled
    return { accepted: true }
  }

  /** Test/host synchronization point for one accepted command. */
  whenSettled(sessionId: string): Promise<void> {
    return this.active.get(sessionId)?.settled ?? Promise.resolve()
  }

  /** Stop admission, cancel commands, then dispose every owned Agent handle. */
  async dispose(): Promise<void> {
    if (this.closing) return
    this.closing = true
    const commands = [...this.active.values()]
    for (const command of commands) {
      command.cancelled = true
      command.agent.cancel({ kind: 'disposed' })
    }
    await Promise.all(commands.map(command => command.settled))
    const handles = [...this.handles.values()]
    this.handles.clear()
    await Promise.all(handles.map(handle => handle.dispose()))
  }

  private async dispatch(sessionId: string, phase: AgentPhase): Promise<AgentDispatchResult> {
    if (this.closing) {
      throw new AgentCoordinatorError('contract-copilot/coordinator-closed', '合同审查 Agent 控制器正在关闭。')
    }
    if (this.active.has(sessionId)) {
      throw new AgentCoordinatorError('contract-copilot/agent-busy', '当前案件已有 Agent 命令正在运行。')
    }
    const session = this.requireSession(sessionId)
    this.assertPhase(session, phase)

    let agent: Agent
    try {
      agent = await this.acquireAgent(session)
    } catch (error) {
      this.saveAutomation(session, 'failed', errorMessage(error))
      throw new AgentCoordinatorError('contract-copilot/agent-start-failed', errorMessage(error))
    }

    const command: ActiveCommand = {
      agent,
      phase,
      cancelled: false,
      settled: Promise.resolve(),
    }
    this.active.set(sessionId, command)
    this.saveAutomation(
      this.requireSession(sessionId),
      phase === 'analysis' ? 'running-analysis' : 'running-delivery',
    )
    try {
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: phase === 'analysis' ? analysisPrompt(session) : deliveryPrompt(session) }],
        source: { kind: 'plugin', plugin: 'contract-copilot' },
      }))
      command.settled = this.observeSettlement(sessionId, command)
    } catch (error) {
      this.active.delete(sessionId)
      this.saveAutomation(this.requireSession(sessionId), 'failed', errorMessage(error))
      throw new AgentCoordinatorError('contract-copilot/agent-dispatch-failed', errorMessage(error))
    }
    return { accepted: true, dshSessionId: String(agent.id), phase }
  }

  private async acquireAgent(session: ContractSession): Promise<Agent> {
    const linkedId = session.dshSessionId
    if (linkedId !== undefined) {
      const owned = this.handles.get(linkedId)
      if (owned !== undefined) return owned.agent
      const live = this.ctx.agents.get(SessionId(linkedId))
      if (live !== undefined) return live
      const resumed = await this.ctx.agents.resume({ resumeSessionId: SessionId(linkedId) })
      this.handles.set(linkedId, resumed)
      return resumed.agent
    }

    const dshSessionId = SessionId(dedicatedAgentId(session.id))
    const selection = this.ctx.agentDefaultModel.currentSelection()
    const handle = await this.ctx.agents.create({
      sessionId: dshSessionId,
      meta: { cwd: path.dirname(session.contractPath) },
      agentOptions: selection,
    })
    this.handles.set(String(dshSessionId), handle)
    const current = this.requireSession(session.id)
    this.store.save({ ...current, dshSessionId: String(dshSessionId) })
    return handle.agent
  }

  private async observeSettlement(sessionId: string, command: ActiveCommand): Promise<void> {
    try {
      await command.agent.whenIdle()
      const session = this.requireSession(sessionId)
      if (command.cancelled) {
        const status = session.state === 'plan_ready' && session.planReview?.status === 'awaiting-decisions'
          ? 'waiting-decisions'
          : 'idle'
        this.saveAutomation(session, status)
      } else if (command.phase === 'analysis'
        && session.state === 'plan_ready'
        && session.planReview?.status === 'awaiting-decisions') {
        this.saveAutomation(session, 'waiting-decisions')
      } else if (command.phase === 'delivery' && session.state === 'delivered') {
        this.saveAutomation(session, 'delivered')
      } else {
        this.saveAutomation(
          session,
          'failed',
          command.phase === 'analysis'
            ? `Agent 已停止，但案件停在 ${session.state}，尚未生成待批准计划。`
            : `Agent 已停止，但案件停在 ${session.state}，尚未完成交付。`,
        )
      }
    } catch (error) {
      this.saveAutomation(this.requireSession(sessionId), 'failed', errorMessage(error))
    } finally {
      this.active.delete(sessionId)
    }
  }

  private assertPhase(session: ContractSession, phase: AgentPhase): void {
    if (phase === 'analysis') {
      if (!['created', 'intake_done', 'rejected', 'partial', 'failed'].includes(session.state)) {
        throw new AgentCoordinatorError(
          'contract-copilot/wrong-phase',
          `当前状态 ${session.state} 不能启动风险分析。`,
        )
      }
      return
    }
    if (session.state !== 'plan_ready') {
      throw new AgentCoordinatorError(
        'contract-copilot/wrong-phase',
        `当前状态 ${session.state} 不能生成交付物。`,
      )
    }
    assertApprovedPlan(session)
  }

  private saveAutomation(
    session: ContractSession,
    status: NonNullable<ContractSession['automation']>['status'],
    error?: string,
  ): void {
    const dshSessionId = session.dshSessionId
      ?? session.automation?.dshSessionId
      ?? dedicatedAgentId(session.id)
    this.store.save({
      ...session,
      automation: {
        dshSessionId,
        status,
        ...(error === undefined ? {} : { error }),
        updatedAt: new Date().toISOString(),
      },
    })
  }

  private requireSession(sessionId: string): ContractSession {
    const session = this.store.get(sessionId)
    if (session === undefined) {
      throw new AgentCoordinatorError('contract-copilot/not-found', `审查 session 不存在: ${sessionId}`)
    }
    return session
  }
}

function dedicatedAgentId(contractSessionId: string): string {
  const digest = createHash('sha256').update(contractSessionId).digest('hex').slice(0, 24)
  return `contract-copilot-${digest}`
}

function analysisPrompt(session: ContractSession): string {
  return [
    '这是 Contract Copilot 工作台发出的风险分析命令。',
    `业务 sessionId: ${JSON.stringify(session.id)}`,
    `合同绝对路径: ${JSON.stringify(session.contractPath)}`,
    '先阅读 contract-copilot skill 及其审查 references。',
    '调用 contract_copilot_intake，并同时传入上述 sessionId 与 contractPath，以消费工作台已经保存的前置信息。',
    '然后读取合同并调用 contract_copilot_analyze，提交完整 summary、findings 和逐项法律依据。',
    '到 plan_ready 后立即停止。不得调用 contract_copilot_apply 或 contract_copilot_finalize；必须等待律师在工作台逐项批准。',
  ].join('\n')
}

function deliveryPrompt(session: ContractSession): string {
  return [
    '这是 Contract Copilot 工作台在律师批准计划后发出的交付命令。',
    `业务 sessionId: ${JSON.stringify(session.id)}`,
    '计划已经由律师逐项决定并通过 hash 门禁。不要重新 analyze 或修改 review-plan.json。',
    '调用 contract_copilot_apply。仅当结果为 success 时继续调用 contract_copilot_finalize；partial、rejected、error 或中断时停止并如实说明。',
  ].join('\n')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
