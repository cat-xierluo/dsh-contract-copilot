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
import { asObjectArray, asString, compactUndefinedDeep } from '../json.ts'
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
  needs_negotiation: { type: 'boolean', description: '谈判/待确认类：默认批注，不改正文' },
  force_edit: { type: 'boolean', description: '显式授权直接修订。注意：实质性整段改写（替换与原文差异大）即使 action=replace 也默认降级为批注/意见书；确需落成 Word 修订时置 true' },
  is_typo_fix: { type: 'boolean', description: '笔误/错别字修正：直接修订不降级' },
  term_unification: { type: 'boolean', description: '术语统一：直接修订不降级' },
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
      + '每个 finding 必须带 legal_basis（法条依据）；summary 的概况字段必须从合同正文提取填写——'
      + '两者缺失都会在执行阶段被完整性门禁拒绝（报告渲染占位超阈值）。'
      + '修订收束规则：实质性整段改写即使 action=replace 也默认降级为批注，'
      + '确需落成 Word 修订时在 finding 上加 force_edit: true。'
      + 'integrity 拒绝后的修复、对方改稿后的再审（§9.5）都是重调本 tool。',
    parameters: {
      sessionId: { type: 'string', required: true, description: 'intake 返回的 session id' },
      summary: {
        type: 'object',
        required: true,
        description: '合同概况与结论汇总（写入 plan.summary，审查报告渲染必需）',
        additionalProperties: true,
        properties: {
          contractType: { type: 'string', required: true, description: '合同类型，如"设备采购合同"' },
          partyA: { type: 'string', required: true, description: '甲方名称（合同正文中的甲方主体）' },
          partyB: { type: 'string', required: true, description: '乙方名称（合同正文中的乙方主体）' },
          businessOverview: { type: 'string', required: true, description: '交易背景一句话概览' },
          contractAmount: { type: 'string', required: true, description: '合同金额，如"人民币壹佰万元整"' },
          paymentTerms: { type: 'string', required: true, description: '付款安排摘要' },
          rightsObligations: { type: 'string', required: true, description: '核心权利义务摘要' },
          overallRisk: { type: 'string', required: true, description: '总体风险等级，如"中高"' },
          coreConclusion: { type: 'string', required: true, description: '审查结论：可签 / 有条件可签 / 不建议签 + 一句话理由' },
          keyRecommendations: {
            type: 'array',
            required: true,
            description: '关键建议（3-5 条）',
            items: { type: 'string' },
          },
          keyMilestones: {
            type: 'array',
            description: '关键时间节点（可选；缺省会在报告中留一处占位）',
            items: { type: 'string' },
          },
        },
      },
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
      if (!['intake_done', 'plan_ready', 'rejected', 'partial', 'failed'].includes(session.state)) {
        throw new Error(
          `contract-copilot: 当前状态 ${session.state} 不能提交 findings；需先完成 intake（intake_done）。`
          + 'rejected/partial/failed 修复后可重新提交',
        )
      }
      const findings = asObjectArray(args.findings, 'findings')
      const intake = session.intake
      if (intake === undefined) throw new Error('contract-copilot: session 缺少 intake 数据，请重新 intake')

      const rawSummary = (typeof args.summary === 'object' && args.summary !== null
        ? args.summary
        : {}) as Record<string, unknown>
      const stringList = (value: unknown): string[] =>
        Array.isArray(value) ? value.map((item) => String(item)) : []

      // summary 键名对齐 scripts/report/reporting.py 读取的 plan.summary 字段；
      // 缺字段会在报告中渲染"待补充"，超过 10 处即被完整性门禁整体拒绝。
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
        summary: {
          contract_type: asString(rawSummary.contractType) ?? '',
          parties: {
            party_a: asString(rawSummary.partyA) ?? '',
            party_b: asString(rawSummary.partyB) ?? '',
          },
          business_overview: asString(rawSummary.businessOverview) ?? '',
          contract_amount: asString(rawSummary.contractAmount) ?? '',
          payment_terms: asString(rawSummary.paymentTerms) ?? '',
          rights_obligations: asString(rawSummary.rightsObligations) ?? '',
          overall_risk: asString(rawSummary.overallRisk) ?? '',
          core_conclusion: asString(rawSummary.coreConclusion) ?? '',
          key_recommendations: stringList(rawSummary.keyRecommendations),
          ...(Array.isArray(rawSummary.keyMilestones)
            ? { key_milestones: stringList(rawSummary.keyMilestones) }
            : {}),
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
      return compactUndefinedDeep({
        sessionId: session.id,
        planPath,
        findingsCount: findings.length,
        missingLegalBasis,
        nextStep: missingLegalBasis.length > 0
          ? '补齐缺失的法律依据后重新提交 analyze'
          : 'contract_copilot_list_findings 供用户检视，或直接 contract_copilot_apply',
      })
    },
  }))
}
