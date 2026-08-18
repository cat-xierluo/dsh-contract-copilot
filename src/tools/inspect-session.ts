/**
 * Tool 6：contract_copilot_inspect_session —— 横切状态查询（能力 B）。
 *
 * 带 sessionId 返回完整状态摘要；不带则返回最近 session 列表。
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { compactUndefinedDeep } from '../json.ts'
import type { ContractSession, SessionStore } from '../session.ts'

type InspectValue = {
  sessionId?: string
  session?: {
    contractName: string
    state: ContractSession['state']
    contractPath: string
    intake?: ContractSession['intake']
    planPath?: string
    outputs: ContractSession['outputs']
    updatedAt: string
    historyTail: ContractSession['history']
  }
  recent?: Array<{ id: string; contractName: string; state: string; updatedAt: string }>
}

export function registerInspectSessionTool(ctx: Context, store: SessionStore): void {
  ctx.tools.register(defineTool({
    name: 'contract_copilot_inspect_session',
    description: '查看合同审查进度：带 sessionId 返回该 session 的完整状态（阶段/intake/产物/历史）；'
      + '不带参数返回最近的 session 列表。用户问"审到哪了"时用这个 tool。',
    parameters: {
      sessionId: { type: 'string', description: 'session id（缺省则列出最近 session）' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value: InspectValue) => [{
        type: 'text',
        text: value.session === undefined
          ? `[contract-copilot] 最近 session：\n${(value.recent ?? [])
            .map((r) => `  ${r.updatedAt}｜${r.contractName}｜${r.state}`).join('\n')}`
          : `[contract-copilot] ${value.session.contractName}｜状态: ${value.session.state}｜更新于 ${value.session.updatedAt}`,
      }],
    },
    async execute(args): Promise<InspectValue> {
      if (args.sessionId === undefined || args.sessionId === '') {
        return compactUndefinedDeep({ recent: store.listRecent() })
      }
      const session = store.get(args.sessionId)
      if (session === undefined) throw new Error(`contract-copilot: session 不存在: ${args.sessionId}`)
      return compactUndefinedDeep({
        sessionId: session.id,
        session: {
          contractName: session.contractName,
          state: session.state,
          contractPath: session.contractPath,
          intake: session.intake,
          planPath: session.planPath,
          outputs: session.outputs,
          updatedAt: session.updatedAt,
          historyTail: session.history.slice(-8),
        },
      })
    },
  }))
}
