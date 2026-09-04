/** Lawyer decision gate and deterministic plan projection. */

import { createHash } from 'node:crypto'
import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import type {
  ContractSession,
  FindingDecision,
  FindingDisposition,
  PlanReview,
  PlanReviewHistoryEntry,
} from './session-types.ts'

export interface FindingDecisionInput {
  readonly findingId: string
  readonly disposition: FindingDisposition
  readonly severity?: string
  readonly note?: string
}

interface PlanFile {
  readonly [key: string]: unknown
  readonly findings?: unknown[]
  readonly risks?: unknown[]
}

/** Domain failure with a stable RPC/tool error code. */
export class PlanReviewError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
  }
}

/** Hash the exact persisted plan bytes so external edits invalidate approval. */
export function hashPlanFile(planPath: string): string {
  return createHash('sha256').update(readFileSync(planPath)).digest('hex')
}

/** Start a new lawyer-review cycle while retaining earlier audit entries. */
export function beginPlanReview(
  planPath: string,
  previous: PlanReview | undefined,
  now = new Date().toISOString(),
): PlanReview {
  const sourcePlanHash = hashPlanFile(planPath)
  return {
    sourcePlanHash,
    status: 'awaiting-decisions',
    decisions: {},
    history: [
      ...(previous?.history ?? []),
      { at: now, kind: 'plan-generated', planHash: sourcePlanHash },
    ],
  }
}

/** Require the current plan to be approved and unchanged before Python runs. */
export function assertApprovedPlan(session: ContractSession): void {
  if (session.planPath === undefined || session.planReview?.status !== 'approved'
    || session.planReview.approvedPlanHash === undefined) {
    throw new PlanReviewError(
      'contract-copilot/plan-not-approved',
      '审查计划尚未经过律师逐项批准，不能生成修订版。',
    )
  }
  if (hashPlanFile(session.planPath) !== session.planReview.approvedPlanHash) {
    throw new PlanReviewError(
      'contract-copilot/plan-changed',
      '获批后的审查计划已经变化，必须重新分析并批准。',
    )
  }
}

/** Approve every finding and atomically write the lawyer-projected plan. */
export function approvePlan(
  session: ContractSession,
  expectedSourcePlanHash: string,
  inputs: readonly FindingDecisionInput[],
  now = new Date().toISOString(),
): { readonly planReview: PlanReview; readonly approvedFindings: number; readonly omittedFindings: number } {
  const planPath = session.planPath
  const review = session.planReview
  if (planPath === undefined || review === undefined) {
    throw new PlanReviewError('contract-copilot/plan-missing', '当前审查尚未生成可批准的计划。')
  }
  if (review.sourcePlanHash !== expectedSourcePlanHash || hashPlanFile(planPath) !== expectedSourcePlanHash) {
    throw new PlanReviewError('contract-copilot/stale-plan', '工作台中的计划已经过期，请刷新后重新决定。')
  }

  const plan = readPlan(planPath)
  const findings = planFindings(plan)
  const ids = findings.map((finding, index) => findingId(finding, index))
  const uniqueIds = new Set(ids)
  if (uniqueIds.size !== ids.length) {
    throw new PlanReviewError('contract-copilot/duplicate-finding-id', '审查计划包含重复 finding id，必须重新分析。')
  }

  const decisions = new Map<string, FindingDecisionInput>()
  for (const input of inputs) {
    validateDecisionInput(input)
    if (decisions.has(input.findingId)) {
      throw new PlanReviewError('contract-copilot/duplicate-decision', `finding ${input.findingId} 被重复决定。`)
    }
    if (!uniqueIds.has(input.findingId)) {
      throw new PlanReviewError('contract-copilot/unknown-finding', `finding 不存在: ${input.findingId}`)
    }
    decisions.set(input.findingId, input)
  }
  const undecided = ids.filter(id => !decisions.has(id))
  if (undecided.length > 0) {
    throw new PlanReviewError(
      'contract-copilot/incomplete-decisions',
      `仍有 ${undecided.length} 项未决定: ${undecided.join('、')}`,
    )
  }

  const audited: FindingDecision[] = ids.map((id) => {
    const input = decisions.get(id)
    if (input === undefined) throw new Error('unreachable: decision completeness checked')
    return {
      findingId: id,
      disposition: input.disposition,
      ...(normalizedOptional(input.severity) === undefined ? {} : { severity: normalizedOptional(input.severity) }),
      ...(normalizedOptional(input.note) === undefined ? {} : { note: normalizedOptional(input.note) }),
      decidedAt: now,
      decidedBy: 'workbench-user',
    }
  })
  const auditedById = Object.fromEntries(audited.map(decision => [decision.findingId, decision]))
  const approvedFindings = findings.flatMap((finding, index) => {
    const decision = auditedById[findingId(finding, index)]
    if (decision === undefined || decision.disposition === 'omit') return []
    return [projectFinding(finding, decision)]
  })
  const approvedPlan = replaceFindings(plan, approvedFindings)
  const serialized = `${JSON.stringify(approvedPlan, null, 2)}\n`
  atomicWrite(planPath, serialized)
  const approvedPlanHash = createHash('sha256').update(serialized).digest('hex')
  const historyEntry: PlanReviewHistoryEntry = {
    at: now,
    kind: 'plan-approved',
    sourcePlanHash: expectedSourcePlanHash,
    approvedPlanHash,
    decisions: audited,
  }
  return {
    planReview: {
      sourcePlanHash: expectedSourcePlanHash,
      status: 'approved',
      decisions: auditedById,
      approvedPlanHash,
      history: [...review.history, historyEntry],
    },
    approvedFindings: approvedFindings.length,
    omittedFindings: findings.length - approvedFindings.length,
  }
}

function readPlan(planPath: string): PlanFile {
  const value = JSON.parse(readFileSync(planPath, 'utf8')) as unknown
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new PlanReviewError('contract-copilot/invalid-plan', '审查计划必须是 JSON 对象。')
  }
  return value as PlanFile
}

function planFindings(plan: PlanFile): Record<string, unknown>[] {
  const raw = Array.isArray(plan.findings) ? plan.findings : Array.isArray(plan.risks) ? plan.risks : []
  if (!raw.every(item => typeof item === 'object' && item !== null && !Array.isArray(item))) {
    throw new PlanReviewError('contract-copilot/invalid-plan', '审查计划 findings 格式无效。')
  }
  return raw as Record<string, unknown>[]
}

function replaceFindings(plan: PlanFile, findings: Record<string, unknown>[]): PlanFile {
  if (Array.isArray(plan.findings)) return { ...plan, findings }
  if (Array.isArray(plan.risks)) return { ...plan, risks: findings }
  return { ...plan, findings }
}

function findingId(finding: Record<string, unknown>, index: number): string {
  const raw = finding.id
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : `R${String(index + 1).padStart(3, '0')}`
}

function validateDecisionInput(input: FindingDecisionInput): void {
  if (input.findingId.trim() === '' || input.findingId.length > 200) {
    throw new PlanReviewError('contract-copilot/invalid-decision', 'findingId 格式无效。')
  }
  if (!(['accept', 'comment-only', 'report-only', 'omit'] as const).includes(input.disposition)) {
    throw new PlanReviewError('contract-copilot/invalid-decision', `不支持的处理方式: ${String(input.disposition)}`)
  }
  if (input.severity !== undefined && input.severity.length > 40) {
    throw new PlanReviewError('contract-copilot/invalid-decision', '风险等级超过长度上限。')
  }
  if (input.note !== undefined && input.note.length > 20_000) {
    throw new PlanReviewError('contract-copilot/invalid-decision', '律师备注超过长度上限。')
  }
}

function normalizedOptional(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized === '' ? undefined : normalized
}

function projectFinding(finding: Record<string, unknown>, decision: FindingDecision): Record<string, unknown> {
  const projected = { ...finding }
  if (decision.severity !== undefined) projected.severity = decision.severity
  if (decision.disposition === 'comment-only') {
    projected.action = 'comment'
    delete projected.replacement_text
    delete projected.insert_text
    delete projected.force_edit
    delete projected.deterministic_edit
    delete projected.is_typo_fix
    delete projected.term_unification
  } else if (decision.disposition === 'report-only') {
    projected.action = 'report-only'
    delete projected.force_edit
    delete projected.deterministic_edit
  }
  return projected
}

function atomicWrite(file: string, content: string): void {
  const tmp = `${file}.decision-${process.pid}-${Date.now()}.tmp`
  writeFileSync(tmp, content, 'utf8')
  try {
    renameSync(tmp, file)
  } catch (error) {
    try { unlinkSync(tmp) } catch { /* the failed rename owns best-effort temp cleanup */ }
    throw error
  }
}
