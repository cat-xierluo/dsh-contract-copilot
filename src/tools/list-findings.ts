/**
 * Tool 3：contract_copilot_list_findings —— plan 检视点（能力 B+C）。
 *
 * 列出当前 plan 的审查项供用户检视；可顺带切换 edit_policy（正文落痕策略，
 * 与审查口径独立，SKILL.md §8.3）。
 */

import { readFileSync, writeFileSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { SessionStore } from '../session.ts'

type FindingBrief = {
  index: number
  id: string
  risk: string
  severity?: string
  action?: string
  hasEditPayload: boolean
}

type ListFindingsValue = {
  sessionId: string
  editPolicy: string
  counts: { total: number; withEditPayload: number }
  findings: FindingBrief[]
}

const EDIT_POLICIES = ['revise-first', 'balanced', 'comment-first'] as const

interface PlanFinding {
  id?: string
  risk?: string
  title?: string
  severity?: string
  level?: string
  action?: string
  replacement_text?: string
  insert_text?: string
  recommended_text?: string
}

interface PlanFile {
  meta?: { edit_policy?: string }
  findings?: PlanFinding[]
  risks?: PlanFinding[]
}

export function registerListFindingsTool(ctx: Context, store: SessionStore): void {
  ctx.tools.register(defineTool({
    name: 'contract_copilot_list_findings',
    description: '列出当前审查计划的审查项，供用户在执行前检视（可要求删改某项后重新 analyze）。'
      + '可通过 editPolicy 参数切换正文落痕策略（revise-first 优先直接修订 / balanced / comment-first 优先批注）。',
    parameters: {
      sessionId: { type: 'string', required: true, description: 'session id' },
      editPolicy: { type: 'string', description: '切换正文落痕策略：revise-first / balanced / comment-first' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value: ListFindingsValue) => [{
        type: 'text',
        text: `[contract-copilot] 共 ${value.counts.total} 项（含改文载荷 ${value.counts.withEditPayload} 项），`
          + `当前策略 ${value.editPolicy}：\n`
          + value.findings.map((f) => `  ${f.index}. [${f.severity ?? '?'}] ${f.risk}（${f.action ?? 'auto'}）`).join('\n'),
      }],
    },
    async execute(args): Promise<ListFindingsValue> {
      const session = store.get(args.sessionId)
      if (session === undefined) throw new Error(`contract-copilot: session 不存在: ${args.sessionId}`)
      if (session.planPath === undefined) {
        throw new Error(`contract-copilot: session 尚无审查计划（当前状态 ${session.state}），请先 analyze`)
      }
      const plan = JSON.parse(readFileSync(session.planPath, 'utf8')) as PlanFile
      const rawFindings = plan.findings ?? plan.risks ?? []

      let editPolicy = session.intake?.editPolicy ?? 'revise-first'
      if (args.editPolicy !== undefined) {
        if (!EDIT_POLICIES.includes(args.editPolicy as (typeof EDIT_POLICIES)[number])) {
          throw new Error(`contract-copilot: 不支持的 editPolicy: ${args.editPolicy}（可选 ${EDIT_POLICIES.join(' / ')}）`)
        }
        editPolicy = args.editPolicy
        plan.meta = { ...plan.meta, edit_policy: editPolicy }
        writeFileSync(session.planPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8')
        if (session.intake !== undefined) {
          store.save({ ...session, intake: { ...session.intake, editPolicy } })
        }
      }

      const findings: FindingBrief[] = rawFindings.map((finding, index) => ({
        index: index + 1,
        id: String(finding.id ?? `R${String(index + 1).padStart(3, '0')}`),
        risk: String(finding.risk ?? finding.title ?? '（未命名风险点）'),
        severity: finding.severity ?? finding.level,
        action: finding.action,
        hasEditPayload: finding.replacement_text !== undefined
          || finding.insert_text !== undefined
          || finding.recommended_text !== undefined,
      }))
      return {
        sessionId: session.id,
        editPolicy,
        counts: {
          total: findings.length,
          withEditPayload: findings.filter((f) => f.hasEditPayload).length,
        },
        findings,
      }
    },
  }))
}
