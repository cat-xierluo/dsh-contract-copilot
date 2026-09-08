/**
 * agent/pre-step 进度注入与案件关联（CC-V5-008）。
 *
 * 全部用例驱动 apply() 实际注册的 pre-step listener（不测脱离 listener 的 helper）：
 * - 进度只跟随触发本步的 Agent：按事件 agent.id 精确匹配 dshSessionId 关联的案件
 * - 无关联 / 关联歧义的 Agent 不注入，也不消耗任何案件的 lastInjectedCounter
 * - next 拒绝或 turn 已中止时不注入、不消耗水位
 * - 同案件重复步幂等：一次状态变化只注入一次
 * - 冷启动（重建 SessionStore / 插件重载）后 resume 的 Agent 仍按磁盘关联注入
 *
 * 状态断言一律读磁盘 JSON：apply() 内部自建 SessionStore，与测试排布用的
 * store 是不同实例，内存对象互不可见；注入水位本就是持久化契约。
 */

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { apply } from '../src/index.ts'
import { SessionStore, type ContractSession } from '../src/session.ts'

type DshSessionId = ReturnType<typeof SessionId>
type BaseMessage = ReturnType<typeof createUserMessage>

type PreStepPayload = {
  agent: { readonly id: DshSessionId }
  messages: BaseMessage[]
  turn: number
  step: number
  signal: AbortSignal
}
type PreStepListener = (
  payload: PreStepPayload,
  next: () => Promise<PreStepDecision>,
) => Promise<PreStepDecision>

let root: string

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'cc-progress-isolation-'))
  // resolveConfig 要求 skillRoot 下存在 Python 入口（misconfiguration fails loud）
  mkdirSync(path.join(root, 'scripts', 'review'), { recursive: true })
  writeFileSync(path.join(root, 'scripts', 'review', 'apply_review_plan.py'), '# fixture\n', 'utf8')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** 调 apply() 并捕获它实际注册的 agent/pre-step listener。 */
function harness(sessionsDir: string): {
  readonly baseDecision: PreStepDecision
  readonly preStep: (agentId: string, options?: {
    readonly next?: () => Promise<PreStepDecision>
    readonly aborted?: boolean
  }) => Promise<PreStepDecision>
} {
  const baseMessage = createUserMessage({ content: [{ type: 'text', text: '用户输入' }] })
  const baseDecision: PreStepDecision = { kind: 'enter', messages: [baseMessage] }
  let registered: unknown
  const ctx = {
    on: (event: string, listener: unknown) => {
      if (event === 'agent/pre-step') registered = listener
      return () => {}
    },
    effect: () => () => {},
    inject: () => {},
    tools: { register: () => {} },
  } as unknown as Context
  apply(ctx, {
    skillRoot: root,
    pythonExecutable: 'python3',
    sessionsDir,
    injectProgress: true,
    workbench: { enabled: false, analysisContractTextMaxChars: 40_000 },
  })
  if (registered === undefined) throw new Error('apply() 未注册 agent/pre-step listener')
  const listener = registered as PreStepListener
  return {
    baseDecision,
    preStep: (agentId, options = {}) => {
      const controller = new AbortController()
      if (options.aborted === true) controller.abort()
      return listener(
        { agent: { id: SessionId(agentId) }, messages: [baseMessage], turn: 7, step: 3, signal: controller.signal },
        options.next ?? (async () => baseDecision),
      )
    },
  }
}

/** 排布用 store：建案 + 写入 dshSessionId 关联（与 coordinator/intake 的落盘写法一致）。 */
function linkedSession(store: SessionStore, name: string, dshSessionId: string): ContractSession {
  const created = store.create(path.join(root, `${name}.docx`), `${name}.docx`)
  store.save({ ...created, dshSessionId })
  return store.get(created.id)!
}

/** 推进状态（progressCounter 随 transition 递增，形成"待注入"进度）。 */
function advance(store: SessionStore, id: string, to: ContractSession['state']): void {
  store.transition(id, `contract_copilot_test→${to}`, to)
}

/** 磁盘上的持久化案件状态（权威断言来源）。 */
function persistedSession(sessionsDir: string, id: string): ContractSession {
  return JSON.parse(readFileSync(path.join(sessionsDir, `${id}.json`), 'utf8')) as ContractSession
}

function messageText(message: unknown): string {
  const content = (message as { content?: Array<{ text?: string }> }).content
  return (content ?? []).map((part) => part.text ?? '').join('')
}

/** enter 决策里最后一条（注入）消息的文本；未注入时返回 undefined。 */
function injectedText(decision: PreStepDecision): string | undefined {
  if (decision.kind !== 'enter' || decision.messages.length === 0) return undefined
  return messageText(decision.messages[decision.messages.length - 1])
}

describe('agent/pre-step 进度注入与案件关联（CC-V5-008）', () => {
  it('A/B 两个专属 Agent 交错 pre-step：各自注入各自案件的进度，不消耗对方水位', async () => {
    const dir = path.join(root, 'sessions')
    const store = new SessionStore(dir)
    const a = linkedSession(store, '合同A', 'agent-a')
    const b = linkedSession(store, '合同B', 'agent-b')
    advance(store, a.id, 'intake_done')
    advance(store, b.id, 'plan_ready')
    const { baseDecision, preStep } = harness(dir)

    const decisionA = await preStep('agent-a')
    expect(decisionA.kind).toBe('enter')
    // 原始消息保留，注入消息追加在尾部，内容是 A 案件的进度
    expect(decisionA.messages[0]).toBe(baseDecision.kind === 'enter' ? baseDecision.messages[0] : undefined)
    const textA = injectedText(decisionA)
    expect(textA).toContain('合同A.docx')
    expect(textA).toContain('待分析')
    expect(textA).not.toContain('合同B.docx')
    expect(persistedSession(dir, a.id).lastInjectedCounter).toBe(1)
    expect(persistedSession(dir, b.id).lastInjectedCounter).toBe(0)

    const decisionB = await preStep('agent-b')
    const textB = injectedText(decisionB)
    expect(textB).toContain('合同B.docx')
    expect(textB).not.toContain('合同A.docx')
    expect(persistedSession(dir, b.id).lastInjectedCounter).toBe(1)
    // B 的注入不回写 A 的水位
    expect(persistedSession(dir, a.id).lastInjectedCounter).toBe(1)
  })

  it('无关联 Agent 进入 pre-step：不注入、不消耗任何案件水位（禁止回退 current）', async () => {
    const dir = path.join(root, 'sessions')
    const store = new SessionStore(dir)
    const a = linkedSession(store, '合同A', 'agent-a')
    advance(store, a.id, 'intake_done')
    // 把"当前案件"指针指向有 pending 进度的 A：旧实现（store.current()）会把
    // A 的进度注给无关 Agent 并消耗 A 的水位；正确行为是完全不注入。
    store.setCurrent(a.id)
    const { baseDecision, preStep } = harness(dir)

    const decision = await preStep('stranger-agent')

    expect(decision).toBe(baseDecision)
    expect(persistedSession(dir, a.id).lastInjectedCounter).toBe(0)
  })

  it('next 拒绝或 turn 已中止：不注入也不消耗水位；恢复正常后仍可注入', async () => {
    const dir = path.join(root, 'sessions')
    const store = new SessionStore(dir)
    const a = linkedSession(store, '合同A', 'agent-a')
    advance(store, a.id, 'intake_done')
    const { baseDecision, preStep } = harness(dir)

    const rejected = await preStep('agent-a', { next: async () => ({ kind: 'reject' }) })
    expect(rejected).toEqual({ kind: 'reject' })
    expect(persistedSession(dir, a.id).lastInjectedCounter).toBe(0)

    const aborted = await preStep('agent-a', { aborted: true })
    expect(aborted).toBe(baseDecision)
    expect(persistedSession(dir, a.id).lastInjectedCounter).toBe(0)

    // 中止解除后的正常步：进度未被提前消费，仍注入一次
    const injected = await preStep('agent-a')
    expect(injectedText(injected)).toContain('合同A.docx')
    expect(persistedSession(dir, a.id).lastInjectedCounter).toBe(1)
  })

  it('同案件重复 pre-step 幂等：一次状态变化只注入一次；注入内容反映最新状态', async () => {
    const dir = path.join(root, 'sessions')
    const store = new SessionStore(dir)
    const a = linkedSession(store, '合同A', 'agent-a')
    advance(store, a.id, 'intake_done')
    advance(store, a.id, 'plan_ready')
    const { baseDecision, preStep } = harness(dir)

    const first = await preStep('agent-a')
    // 注入内容是最新状态（plan_ready），而不是只有第一条变化的旧状态
    expect(injectedText(first)).toContain('审查计划已就绪')
    expect(persistedSession(dir, a.id).lastInjectedCounter).toBe(2)

    const second = await preStep('agent-a')
    expect(second).toBe(baseDecision)
    expect(persistedSession(dir, a.id).lastInjectedCounter).toBe(2)
  })

  it('两个案件重复关联同一 DSH session：确定性不注入、不消耗水位（不误注入）', async () => {
    const dir = path.join(root, 'sessions')
    const store = new SessionStore(dir)
    const a = linkedSession(store, '合同A', 'agent-dup')
    const b = linkedSession(store, '合同B', 'agent-dup')
    advance(store, a.id, 'intake_done')
    advance(store, b.id, 'plan_ready')
    const { baseDecision, preStep } = harness(dir)

    const decision = await preStep('agent-dup')

    expect(decision).toBe(baseDecision)
    expect(persistedSession(dir, a.id).lastInjectedCounter).toBe(0)
    expect(persistedSession(dir, b.id).lastInjectedCounter).toBe(0)
  })

  it('冷启动：重建 SessionStore 后 resume 的 Agent 按磁盘关联注入，水位消费落盘且幂等', async () => {
    const dir = path.join(root, 'sessions')
    // 上一进程：建案 + 关联 + 推进（只落盘，不留内存）
    const previous = new SessionStore(dir)
    const a = linkedSession(previous, '合同A', 'agent-resume')
    const b = linkedSession(previous, '合同B', 'agent-other')
    advance(previous, a.id, 'intake_done')
    advance(previous, b.id, 'plan_ready')

    // 重启：全新 SessionStore + 重新 apply()（listener 从头注册，内存为空）
    const { baseDecision, preStep } = harness(dir)

    const first = await preStep('agent-resume')
    expect(injectedText(first)).toContain('合同A.docx')
    expect(injectedText(first)).toContain('待分析')
    // 其他案件（含同样有 pending 进度的 B）不被误注入、不消耗水位
    expect(persistedSession(dir, b.id).lastInjectedCounter).toBe(0)
    expect(persistedSession(dir, a.id).lastInjectedCounter).toBe(1)

    const second = await preStep('agent-resume')
    expect(second).toBe(baseDecision)
    expect(persistedSession(dir, a.id).lastInjectedCounter).toBe(1)
  })
})
