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
import { findContractMemory, readReviewerProfile, readReviewMemory } from '../skill-config.ts'
import type { IntakeData, SessionStore } from '../session.ts'
import { expandHome, normalizeContractKey } from '../paths.ts'

type MissingItem = {
  field: string
  question: string
  options?: string[]
}

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
    async execute(args): Promise<IntakeValue> {
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

      const session = store.create(contractPath, contractName)
      // 合并顺序：显式入参 > 工作台页面提交的 pendingAnswers > 审查记忆 > > 审查人 profile
      // pendingAnswers 来自工作台表单：调用方不传时，让工作台表单成为输入源
      const pending = session.pendingAnswers ?? {}
      const pickString = (...sources: Array<unknown>): string | undefined => {
        for (const source of sources) {
          const v = typeof source === 'string' ? source.trim() : ''
          if (v !== '') return v
        }
        return undefined
      }
      const partyRole = pickString(args.partyRole, pending['partyRole'], memory?.party_role) ?? ''
      const reviewIntensity = pickString(args.reviewIntensity, pending['reviewIntensity'], memory?.review_intensity) ?? ''
      const clientName = pickString(args.clientName, pending['clientName'], memory?.client_name) ?? ''
      const author = pickString(args.reviewerAuthor, pending['reviewerAuthor'], profile.author) ?? ''
      const organization = pickString(args.reviewerOrganization, pending['reviewerOrganization'], profile.organization) ?? ''
      const department = pickString(args.reviewerDepartment, pending['reviewerDepartment'], profile.department) ?? ''
      const reviewPurpose = pickString(args.reviewPurpose, pending['reviewPurpose']) ?? ''
      const editPolicy = pickString(args.editPolicy, pending['editPolicy']) ?? 'revise-first'
      // 重新计算 missing（可能 pendingAnswers 已填上了）
      const remaining: MissingItem[] = []
      if (partyRole === '') remaining.push({ field: 'partyRole', question: '本轮代表哪一方审查？', options: ['甲方', '乙方', '中立', '其他'] })
      if (reviewPurpose === '') remaining.push({ field: 'reviewPurpose', question: '本轮审查目的是什么？', options: ['签约前把关', '谈判修订', '其他'] })
      if (reviewIntensity === '') remaining.push({ field: 'reviewIntensity', question: '审查口径？', options: ['克制', '常规', '强势'] })
      if (author === '') remaining.push({ field: 'reviewerAuthor', question: '审查人姓名？' })
      if (organization === '') remaining.push({ field: 'reviewerOrganization', question: '律所/公司名称？' })
      if (clientName === '') remaining.push({ field: 'clientName', question: '客户名称？' })

      if (remaining.length > 0) {
        // clientName 不阻塞（对齐 §3.2.1），其它全阻塞
        const blockers = remaining.filter((item) => item.field !== 'clientName')
        if (blockers.length > 0) {
          // 把 missing 与 pendingAnswers 写回 session（工作台表单消费 missing）
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
      }

      const resolvedClientName = clientName === '' ? '未提及/待补充' : clientName
      const intake: IntakeData = {
        clientName: resolvedClientName,
        partyRole,
        reviewPurpose: args.reviewPurpose ?? '',
        reviewIntensity,
        editPolicy: args.editPolicy ?? 'revise-first',
        reviewer: { author, organization, department: department === '' ? undefined : department },
        ...(args.deadline !== undefined ? { deadline: args.deadline } : {}),
        ...(args.priority !== undefined ? { priority: args.priority } : {}),
        ...(args.allowRestructure !== undefined ? { allowRestructure: args.allowRestructure } : {}),
        ...(args.defaultAuthorization !== undefined ? { authorization: args.defaultAuthorization } : {}),
      }
      store.transition(session.id, 'contract_copilot_intake', 'intake_done', (target) => {
        target.intake = intake
        delete target.intakeMissing
        delete target.pendingAnswers
      })
      const note = clientName === ''
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
