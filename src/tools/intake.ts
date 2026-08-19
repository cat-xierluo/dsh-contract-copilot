/**
 * Tool 1：contract_copilot_intake —— §3.2.1 前置澄清（9.1 启动阶段）。
 *
 * 职责：读 reviewer_profile + review_memory 命中 → 合并调用方显式值 →
 * 阻塞项（立场/审查目的/口径 + 审查人身份）不齐返回缺失清单；
 * 齐全则固化为 session（state: intake_done）。缺失项由 agent 转问用户后带参重调。
 */

import { existsSync } from 'node:fs'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { PluginConfig } from '../config.ts'
import { compactUndefinedDeep } from '../json.ts'
import { hasBlockers, resolveIntakeFields } from '../intake-fields.ts'
import type { MissingItem } from '../intake-fields.ts'
import { findContractMemory, readReviewerProfile, readReviewMemory } from '../skill-config.ts'
import type { IntakeData, SessionStore } from '../session.ts'
import { expandHome, normalizeContractKey } from '../paths.ts'

type IntakeValue = {
  status: 'blocked' | 'ok'
  sessionId: string
  contractName: string
  memoryHit?: { clientName?: string; partyRole?: string; reviewIntensity?: string }
  missing?: MissingItem[]
  intake?: IntakeData
  note?: string
}

export function registerIntakeTool(ctx: Context, config: PluginConfig, store: SessionStore): void {
  ctx.tools.register(defineTool({
    name: 'contract_copilot_intake',
    description: '合同审查前置澄清（SKILL.md §3.2.1）：确认审查立场、审查目的、审查口径与审查人身份。'
      + '同名合同命中本地审查记忆时默认沿用上次记录。'
      + '返回 blocked 时请把 missing 清单逐项问用户（可用 ask_user_question），拿到答案后带参重调本 tool。'
      + '阻塞项未齐不得开始实质审查。',
    parameters: {
      contractPath: { type: 'string', required: true, description: '合同 DOCX 绝对路径' },
      clientName: { type: 'string', description: '客户名称（通常为我方主体名称）' },
      partyRole: { type: 'string', description: '审查立场：甲方 / 乙方 / 中立 / 其他' },
      reviewPurpose: { type: 'string', description: '审查目的：签约前把关 / 谈判修订 / 其他' },
      reviewIntensity: { type: 'string', description: '审查口径：克制 / 常规 / 强势' },
      deadline: { type: 'string', description: '截止时间（可选，不阻塞）' },
      priority: { type: 'string', description: '优先级（可选，不阻塞）' },
      allowRestructure: { type: 'boolean', description: '是否允许重构交易结构（默认只改文本）' },
      editPolicy: { type: 'string', description: '正文落痕策略：revise-first / balanced / comment-first（默认 revise-first）' },
      reviewerAuthor: { type: 'string', description: '审查人姓名（本地配置缺失时必填）' },
      reviewerOrganization: { type: 'string', description: '律所/公司名称（本地配置缺失时必填）' },
      reviewerDepartment: { type: 'string', description: '部门名称（可选）' },
      defaultAuthorization: { type: 'string', description: '用户授权按默认口径处理时的授权来源说明' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value: IntakeValue) => [{
        type: 'text',
        text: value.status === 'blocked'
          ? `[contract-copilot] 前置信息缺失（session ${value.sessionId}），请补齐: ${
            value.missing?.map((item) => item.field).join('、')
          }`
          : `[contract-copilot] 前置澄清完成（session ${value.sessionId}）：客户=${value.intake?.clientName}，`
            + `立场=${value.intake?.partyRole}，目的=${value.intake?.reviewPurpose}，`
            + `口径=${value.intake?.reviewIntensity}，策略=${value.intake?.editPolicy}`,
      }],
    },
    async execute(args, exec): Promise<IntakeValue> {
      const contractPath = path.resolve(expandHome(args.contractPath))
      if (!existsSync(contractPath)) {
        throw new Error(`contract-copilot: 合同文件不存在: ${contractPath}`)
      }
      if (!contractPath.toLowerCase().endsWith('.docx')) {
        throw new Error(`contract-copilot: 仅支持 DOCX 合同: ${contractPath}`)
      }
      const contractName = path.basename(contractPath, path.extname(contractPath))
      const memory = findContractMemory(readReviewMemory(config.skillRoot), normalizeContractKey(contractName))
      const profile = readReviewerProfile(config.skillRoot)

      // 工作台表单回路：同合同最近一个 blocked(带待消费 pendingAnswers)的 session
      // 直接复用，而不是新建——否则"表单答案存在 session A、重调 intake 建 session B"
      // 会把答案丢掉，回路断在两半。
      const reusable = store.latestByContractKey(normalizeContractKey(contractName))
      const session = reusable !== undefined
        && reusable.state === 'created'
        && reusable.contractPath === contractPath
        && reusable.pendingAnswers !== undefined
        && Object.keys(reusable.pendingAnswers).length > 0
        ? (store.setCurrent(reusable.id), reusable)
        : store.create(contractPath, contractName)
      // 合并与缺失计算抽到 intake-fields.ts（工作台"新建审查"共用同一套语义）
      const { fields, missing: remaining } = resolveIntakeFields(args, session.pendingAnswers ?? {}, memory, profile)

      if (hasBlockers(remaining)) {
        // 把 missing 写回 session（工作台表单消费 missing）
        store.save({ ...session, intakeMissing: remaining })
        return compactUndefinedDeep({
          status: 'blocked' as const,
          sessionId: session.id,
          contractName,
          memoryHit: memory === undefined ? undefined : {
            clientName: memory.client_name,
            partyRole: memory.party_role,
            reviewIntensity: memory.review_intensity,
          },
          missing: remaining,
        })
      }

      const intake: IntakeData = {
        clientName: fields.clientName === '' ? '未提及/待补充' : fields.clientName,
        partyRole: fields.partyRole,
        reviewPurpose: fields.reviewPurpose,
        reviewIntensity: fields.reviewIntensity,
        editPolicy: fields.editPolicy,
        reviewer: { author: fields.author, organization: fields.organization, department: fields.department === '' ? undefined : fields.department },
        ...(args.deadline !== undefined ? { deadline: args.deadline } : {}),
        ...(args.priority !== undefined ? { priority: args.priority } : {}),
        ...(args.allowRestructure !== undefined ? { allowRestructure: args.allowRestructure } : {}),
        ...(args.defaultAuthorization !== undefined ? { authorization: args.defaultAuthorization } : {}),
      }
      store.transition(session.id, 'contract_copilot_intake', 'intake_done', (target) => {
        target.intake = intake
        // V3：DSH agent id 即 session id（Agent.id "shared with session"）
        if (exec.agent !== undefined) target.dshSessionId = String(exec.agent.id)
        delete target.intakeMissing
        delete target.pendingAnswers
      })
      const note = fields.clientName === ''
        ? '客户名称未提供，暂记为"未提及/待补充"（可在 apply 前重新 intake 修正）'
        : undefined
      return compactUndefinedDeep({
        status: 'ok' as const,
        sessionId: session.id,
        contractName,
        intake,
        ...(note !== undefined ? { note } : {}),
      })
    },
  }))
}
