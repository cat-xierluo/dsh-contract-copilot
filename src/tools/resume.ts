/**
 * Tool 7：contract_copilot_resume —— 长程续接（能力 E，含 §9.5 复核回路入口）。
 *
 * 按 sessionId 或合同名索引恢复 session 为当前活跃，并按状态给出下一步指引。
 * 对方改稿后的再审 = resume 旧 session + analyze 指向新版合同重新提交 findings。
 */

import path from 'node:path'
import { existsSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { compactUndefinedDeep } from '../json.ts'
import type { ContractSession, SessionStore } from '../session.ts'
import { expandHome, normalizeContractKey } from '../paths.ts'

type ResumeValue = {
  sessionId: string
  contractName: string
  state: ContractSession['state']
  nextStep: string
  note?: string
}

/** 按状态给出续接后的下一步（与 progress.ts 的提示保持同一口径）。 */
function nextStepFor(state: ContractSession['state']): string {
  switch (state) {
    case 'created': return '补齐立场/审查目的/口径与审查人身份后重新 intake'
    case 'intake_done': return '读 references 后调 contract_copilot_analyze 提交 findings'
    case 'plan_ready': return '调 contract_copilot_list_findings 检视，或直接 contract_copilot_apply'
    case 'applying': return '上次执行中断在 applying，直接重新 apply'
    case 'applied': return '调 contract_copilot_finalize 收集交付物'
    case 'partial': return '读归档执行日志定位失败项：修 plan 重跑 apply，或带失败清单 finalize'
    case 'rejected': return '按完整性失败原因补齐 plan 字段后重新 apply'
    case 'failed': return '查看失败原因后重试 apply'
    case 'delivered': return '本轮已交付；对方改稿后对新版合同重调 analyze（§9.5 再审回路）'
  }
}

export function registerResumeTool(ctx: Context, store: SessionStore): void {
  ctx.tools.register(defineTool({
    name: 'contract_copilot_resume',
    description: '恢复历史审查 session（跨会话续接）。支持按 sessionId 或合同名（取最近一次）索引。'
      + '"上次审到一半的合同继续审"和"对方改稿后再审"都从这里进入。',
    parameters: {
      sessionId: { type: 'string', description: 'session id（与 contractName 二选一）' },
      contractName: { type: 'string', description: '合同名（取该合同最近一次 session）' },
      newContractPath: { type: 'string', description: '对方改稿后的新版合同路径（§9.5 再审时提供，替换 session 合同指向）' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value: ResumeValue) => [{
        type: 'text',
        text: `[contract-copilot] 已恢复 ${value.contractName}（${value.sessionId}）｜状态: ${value.state}｜下一步: ${value.nextStep}`,
      }],
    },
    async execute(args): Promise<ResumeValue> {
      let session: ContractSession | undefined
      if (args.sessionId !== undefined && args.sessionId !== '') {
        session = store.get(args.sessionId)
        if (session === undefined) throw new Error(`contract-copilot: session 不存在: ${args.sessionId}`)
      } else if (args.contractName !== undefined && args.contractName !== '') {
        session = store.latestByContractKey(normalizeContractKey(args.contractName))
        if (session === undefined) throw new Error(`contract-copilot: 没有找到该合同的 session: ${args.contractName}`)
      } else {
        throw new Error('contract-copilot: 需要 sessionId 或 contractName 之一')
      }

      let note: string | undefined
      if (args.newContractPath !== undefined && args.newContractPath !== '') {
        const newPath = path.resolve(expandHome(args.newContractPath))
        if (!existsSync(newPath)) throw new Error(`contract-copilot: 新版合同不存在: ${newPath}`)
        store.save({
          ...session,
          contractPath: newPath,
          contractName: path.basename(newPath, path.extname(newPath)),
        })
        note = `合同指向已更新为 ${newPath}；请重新 analyze 提交针对新版合同的 findings（§9.5 再审回路）`
      }

      store.setCurrent(session.id)
      const refreshed = store.get(session.id) ?? session
      return compactUndefinedDeep({
        sessionId: refreshed.id,
        contractName: refreshed.contractName,
        state: refreshed.state,
        nextStep: nextStepFor(refreshed.state),
        ...(note !== undefined ? { note } : {}),
      })
    },
  }))
}
