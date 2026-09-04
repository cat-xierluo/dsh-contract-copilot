/** Direct tool-entry tests for workbench session reuse and the delivery gate. */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PluginConfig } from '../src/config.ts'
import { approvePlan, beginPlanReview } from '../src/plan-review.ts'
import { SessionStore } from '../src/session.ts'
import { registerAnalyzeTool } from '../src/tools/analyze.ts'
import { registerApplyTool } from '../src/tools/apply.ts'
import { registerIntakeTool } from '../src/tools/intake.ts'

let root: string
let store: SessionStore
let config: PluginConfig

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'cc-tool-gates-'))
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

function registeredTool(register: (ctx: Context, config: PluginConfig, store: SessionStore) => void): ToolDefinition {
  let definition: ToolDefinition | undefined
  const ctx = {
    tools: { register: (tool: ToolDefinition) => { definition = tool } },
  } as unknown as Context
  register(ctx, config, store)
  if (definition === undefined) throw new Error('tool was not registered')
  return definition
}

function execution(): ToolRunContext {
  return {
    signal: new AbortController().signal,
    deferContext: () => {},
    concludeTurn: () => {},
  } as unknown as ToolRunContext
}

describe('Contract Copilot tool gates', () => {
  it('reuses the exact workbench session when intake receives its sessionId', async () => {
    const contractPath = path.join(root, '采购合同.docx')
    writeFileSync(contractPath, 'fixture')
    const session = store.create(contractPath, '采购合同')
    session.pendingAnswers = {
      partyRole: '甲方',
      reviewPurpose: '签约前把关',
      reviewIntensity: '常规',
      reviewerAuthor: '测试律师',
      reviewerOrganization: '测试律所',
      clientName: '示例客户',
    }
    store.save(session)

    const value = await registeredTool(registerIntakeTool).execute({
      sessionId: session.id,
      contractPath,
    }, execution()) as { sessionId: string; status: string }

    expect(value).toEqual(expect.objectContaining({ sessionId: session.id, status: 'ok' }))
    expect(store.listRecent()).toHaveLength(1)
    expect(store.get(session.id)?.state).toBe('intake_done')
  })

  it('rejects direct apply before Python starts when the plan lacks lawyer approval', async () => {
    const contractPath = path.join(root, '采购合同.docx')
    const planPath = path.join(root, 'review-plan.json')
    writeFileSync(contractPath, 'fixture')
    writeFileSync(planPath, `${JSON.stringify({ findings: [{ id: 'R001', risk: '付款风险', action: 'auto' }] })}\n`)
    const session = store.create(contractPath, '采购合同')
    session.state = 'plan_ready'
    session.intake = {
      clientName: '示例客户',
      partyRole: '甲方',
      reviewPurpose: '签约前把关',
      reviewIntensity: '常规',
      editPolicy: 'revise-first',
      reviewer: { author: '测试律师', organization: '测试律所' },
    }
    session.planPath = planPath
    session.planReview = beginPlanReview(planPath, undefined)
    store.save(session)

    await expect(registeredTool(registerApplyTool).execute({ sessionId: session.id }, execution()))
      .rejects.toMatchObject({ code: 'contract-copilot/plan-not-approved' })
    expect(store.get(session.id)?.state).toBe('plan_ready')
    expect(store.get(session.id)?.outputs).toEqual({})
  })

  it('rejects direct apply before Python starts when an approved plan is modified', async () => {
    const contractPath = path.join(root, '采购合同.docx')
    const planPath = path.join(root, 'review-plan.json')
    writeFileSync(contractPath, 'fixture')
    writeFileSync(planPath, `${JSON.stringify({ findings: [{ id: 'R001', risk: '付款风险', action: 'auto' }] })}\n`)
    const session = store.create(contractPath, '采购合同')
    session.state = 'plan_ready'
    session.intake = {
      clientName: '示例客户',
      partyRole: '甲方',
      reviewPurpose: '签约前把关',
      reviewIntensity: '常规',
      editPolicy: 'revise-first',
      reviewer: { author: '测试律师', organization: '测试律所' },
    }
    session.planPath = planPath
    session.planReview = beginPlanReview(planPath, undefined)
    session.planReview = approvePlan(session, session.planReview.sourcePlanHash, [
      { findingId: 'R001', disposition: 'accept' },
    ]).planReview
    store.save(session)
    writeFileSync(planPath, `${JSON.stringify({ findings: [] })}\n`)

    await expect(registeredTool(registerApplyTool).execute({ sessionId: session.id }, execution()))
      .rejects.toMatchObject({ code: 'contract-copilot/plan-changed' })
    expect(store.get(session.id)?.state).toBe('plan_ready')
  })
})

describe('Contract Copilot analyze description contract', () => {
  it('不把读取 skill references 设为硬前置：工作台专属回合使用内嵌指导与合同正文，交互式环境可选读', () => {
    const { description } = registeredTool(registerAnalyzeTool)

    // 旧文案的硬性前置对 DSH Web 专属 Agent（无 skill/fs 工具）不可执行
    expect(description).not.toContain('调用前请先读')
    expect(description).not.toContain('必须先读')

    // 工作台专属回合：分析提示已内嵌审查指导与合同正文，直接使用
    expect(description).toContain('工作台')
    expect(description).toContain('内嵌')
    expect(description).toContain('合同正文')

    // 具备 skill 工具的交互式环境：可选读，非硬性前置
    expect(description).toContain('可选读')
    expect(description).toContain('非硬性前置')
    expect(description).toContain('references/')
  })
})
