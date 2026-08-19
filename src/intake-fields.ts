/**
 * intake 阻塞项的合并与缺失计算（intake tool 与工作台"新建审查"共用）。
 *
 * 合并顺序：显式入参 > 工作台 pendingAnswers > 审查记忆 > 审查人 profile。
 * 阻塞项对齐 SKILL.md §3.2.1：立场/审查目的/口径 + 审查人身份；
 * clientName 不阻塞但进缺失清单供表单一并收集。
 */

import type { ReviewMemoryRecord, ReviewerProfile } from './skill-config.ts'

export type MissingItem = { field: string; question: string; options?: string[] }

export interface IntakeArgs {
  partyRole?: string
  reviewPurpose?: string
  reviewIntensity?: string
  clientName?: string
  reviewerAuthor?: string
  reviewerOrganization?: string
  reviewerDepartment?: string
  editPolicy?: string
}

export interface ResolvedIntakeFields {
  partyRole: string
  reviewPurpose: string
  reviewIntensity: string
  clientName: string
  author: string
  organization: string
  department: string
  editPolicy: string
}

function pick(...sources: Array<unknown>): string {
  for (const source of sources) {
    const v = typeof source === 'string' ? source.trim() : ''
    if (v !== '') return v
  }
  return ''
}

/** 合并四层来源并计算缺失清单（clientName 缺失进清单但不阻塞）。 */
export function resolveIntakeFields(
  args: IntakeArgs,
  pending: Record<string, string>,
  memory: ReviewMemoryRecord | undefined,
  profile: ReviewerProfile,
): { fields: ResolvedIntakeFields; missing: MissingItem[] } {
  const fields: ResolvedIntakeFields = {
    partyRole: pick(args.partyRole, pending['partyRole'], memory?.party_role),
    reviewPurpose: pick(args.reviewPurpose, pending['reviewPurpose']),
    reviewIntensity: pick(args.reviewIntensity, pending['reviewIntensity'], memory?.review_intensity),
    clientName: pick(args.clientName, pending['clientName'], memory?.client_name),
    author: pick(args.reviewerAuthor, pending['reviewerAuthor'], profile.author),
    organization: pick(args.reviewerOrganization, pending['reviewerOrganization'], profile.organization),
    department: pick(args.reviewerDepartment, pending['reviewerDepartment'], profile.department),
    editPolicy: pick(args.editPolicy, pending['editPolicy']) || 'revise-first',
  }
  const missing: MissingItem[] = []
  if (fields.partyRole === '') missing.push({ field: 'partyRole', question: '本轮代表哪一方审查？', options: ['甲方', '乙方', '中立', '其他'] })
  if (fields.reviewPurpose === '') missing.push({ field: 'reviewPurpose', question: '本轮审查目的是什么？', options: ['签约前把关', '谈判修订', '其他'] })
  if (fields.reviewIntensity === '') missing.push({ field: 'reviewIntensity', question: '审查口径（风险识别与表达强度）？', options: ['克制', '常规', '强势'] })
  if (fields.author === '') missing.push({ field: 'reviewerAuthor', question: '审查人姓名？（写入 Word 批注与报告署名，仅存本地）' })
  if (fields.organization === '') missing.push({ field: 'reviewerOrganization', question: '律所/公司名称？' })
  if (fields.clientName === '') missing.push({ field: 'clientName', question: '客户名称（通常为我方主体名称）？' })
  return { fields, missing }
}

/** 阻塞项（排除 clientName）是否有缺失——决定 intake 放行与否。 */
export function hasBlockers(missing: MissingItem[]): boolean {
  return missing.some((item) => item.field !== 'clientName')
}
