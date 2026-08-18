/**
 * Tool 2：contract_copilot_analyze —— §3.2.2 分层扫描（9.2）的落地。
 *
 * agent 先读 skill references 产出结构化 findings，本 tool 负责：
 * 组装完整 review-plan.json（meta 用 intake 值填充）→ 写入 session 产物目录 →
 * 前置软校验法律依据（integrity 门禁的早期反馈，门禁本身仍在 CLI）。
 */

import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { PluginConfig } from '../config.ts'
import { asObjectArray, asString } from '../json.ts'
import type { SessionStore } from '../session.ts'

type AnalyzeValue = {
  sessionId: string
  planPath: string
  findingsCount: number
  missingLegalBasis: string[]
  nextStep: string
}

const FINDING_ITEM_PROPERTIES = {
  id: { type: 'string', description: '审查项编号，如 R001（缺省自动按序号报告）' },
  risk: { type: 'string', description: '风险点标题（一句话）' },
  severity: { type: 'string', description: '风险等级：P0 / P1 / P2' },
  target_text: { type: 'string', description: '原文定位文本（用于批注/修订锚定）' },
  replacement_text: { type: 'string', description: '直接修订的替换文本（确定性改动）' },
  recommended_text: { type: 'string', description: '推荐措辞（revise-first 下可作为替换依据）' },
  comment: { type: 'string', description: '批注内容（风险说明与修改建议）' },
  action: { type: 'string', description: 'comment / replace / insert / delete / report-only / auto' },
  legal_basis: { type: 'string', description: '法律依据（必填：具体法条或可核验依据；缺失会导致交付被完整性门禁拒绝）' },
} as const

/** 与 integrity.py 的占位判定保持一致（_has_meaningful_legal_basis）。 */
const LEGAL_BASIS_PLACEHOLDERS = new Set(['/', '待补', '待补充', '未提及', '未提及/待补充', '依据待补'])

function legalBasisText(raw: Record<string, unknown>): string {
  const basis = raw.legal_basis
  if (Array.isArray(basis)) {
    return basis.map((item) => String(item).trim()).filter((item) => item !== '').join('；')
  }
  return String(basis ?? '').trim()
}

export function registerAnalyzeTool(ctx: Context, config: PluginConfig, store: SessionStore): void {
  ctx.tools.register(defineTool({
    name: 'contract_copilot_analyze',
    description: '提交结构化审查发现，生成 review-plan.json（SKILL.md §3.2.2 分层扫描 → §3.2.3 的计划载体）。'
      + '调用前请先读 skill 的 references/（contract-routing、review-framework、revision-strategy）。'
      + '每个 finding 必须带 legal_basis（法条依据），否则执行阶段会被完整性门禁整体拒绝。'
      + '对方改稿后的再审（§9.5）也是重调本 tool：指向新版合同重新提交 findings。',
    parameters: {
      sessionId: { type: 'string', required: true, description: 'intake 返回的 session id' },
      findings: {
        type: 'array',
        required: true,
        description: '结构化审查发现列表（先宏观后中观再微观）',
        items: { type: 'object', additionalProperties: true, properties: FINDING_ITEM_PROPERTIES },
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value: AnalyzeValue) => [{
        type: 'text',
        text: `[contract-copilot] 计划已生成（${value.findingsCount} 项）→ ${value.planPath}`
          + (value.missingLegalBasis.length > 0
            ? `；警告: ${value.missingLegalBasis.length} 项缺法律依据（${value.missingLegalBasis.join('、')}），apply 前请补齐`
            : ''),
      }],
    },
    async execute(args): Promise<AnalyzeValue> {
      const sessionId = asString(args.sessionId)
      if (sessionId === undefined) throw new Error('contract-copilot: 缺少 sessionId')
      const session = store.get(sessionId)
      if (session === undefined) throw new Error(`contract-copilot: session 不存在: ${sessionId}`)
      if (session.state !== 'intake_done' && session.state !== 'plan_ready') {
        throw new Error(
          `contract-copilot: 当前状态 ${session.state} 不能提交 findings；需先完成 intake（intake_done）`,
        )
      }
      const findings = asObjectArray(args.findings, 'findings')
      const intake = session.intake
      if (intake === undefined) throw new Error('contract-copilot: session 缺少 intake 数据，请重新 intake')

      const plan = {
        meta: {
          contract_name: session.contractName,
          client_name: intake.clientName,
          party_role: intake.partyRole,
          review_intensity: intake.reviewIntensity,
          edit_policy: intake.editPolicy,
          reviewer: intake.reviewer.author,
          reviewer_organization: intake.reviewer.organization,
          ...(intake.reviewer.department !== undefined ? { reviewer_department: intake.reviewer.department } : {}),
        },
        findings: args.findings,
      }
      const dir = store.artifactsDir(session.id)
      const planPath = path.join(dir, 'review-plan.json')
      writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8')

      // 软校验：法律依据缺失会导致 CLI 的完整性门禁整体拒绝（scripts/report/integrity.py）
      const missingLegalBasis = findings
        .map((finding, index) => ({ finding, fallback: `R${String(index + 1).padStart(3, '0')}` }))
        .filter(({ finding }) => {
          const normalized = legalBasisText(finding).replace(/\s/g, '')
          return normalized === '' || LEGAL_BASIS_PLACEHOLDERS.has(normalized)
        })
        .map(({ finding, fallback }) => asString(finding.id) ?? fallback)

      store.transition(session.id, 'contract_copilot_analyze', 'plan_ready', (target) => {
        target.planPath = planPath
      })
      return {
        sessionId: session.id,
        planPath,
        findingsCount: findings.length,
        missingLegalBasis,
        nextStep: missingLegalBasis.length > 0
          ? '补齐缺失的法律依据后重新提交 analyze'
          : 'contract_copilot_list_findings 供用户检视，或直接 contract_copilot_apply',
      }
    },
  }))
}
