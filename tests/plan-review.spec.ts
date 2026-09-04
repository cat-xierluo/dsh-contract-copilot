import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  approvePlan,
  assertApprovedPlan,
  beginPlanReview,
  hashPlanFile,
  PlanReviewError,
  type FindingDecisionInput,
} from '../src/plan-review.ts'
import type { ContractSession } from '../src/session-types.ts'

function fixture(): { session: ContractSession; planPath: string } {
  const root = mkdtempSync(path.join(tmpdir(), 'contract-copilot-plan-review-'))
  const planPath = path.join(root, 'review-plan.json')
  writeFileSync(planPath, `${JSON.stringify({
    meta: { edit_policy: 'revise-first' },
    findings: [
      {
        id: 'R001',
        risk: '付款期限不明确',
        severity: 'P1',
        action: 'replace',
        replacement_text: '十个工作日内付款',
        recommended_text: '十个工作日内付款',
        force_edit: true,
      },
      { id: 'R002', risk: '争议解决地不利', severity: 'P0', action: 'auto', recommended_text: '由甲方所在地法院管辖' },
      { id: 'R003', risk: '通知条款可优化', severity: 'P2', action: 'auto', recommended_text: '电子邮件送达' },
      { id: 'R004', risk: '重复定义', severity: 'P2', action: 'comment', comment: '删除重复定义' },
    ],
  }, null, 2)}\n`, 'utf8')
  const session: ContractSession = {
    version: 1,
    id: 'case-1',
    contractPath: '/tmp/case.docx',
    contractKey: 'case',
    contractName: 'case',
    state: 'plan_ready',
    planPath,
    outputs: {},
    progressCounter: 1,
    lastInjectedCounter: 0,
    history: [],
    createdAt: '2026-09-04T00:00:00.000Z',
    updatedAt: '2026-09-04T00:00:00.000Z',
  }
  session.planReview = beginPlanReview(planPath, undefined, '2026-09-04T00:00:01.000Z')
  return { session, planPath }
}

const decisions: FindingDecisionInput[] = [
  { findingId: 'R001', disposition: 'accept' },
  { findingId: 'R002', disposition: 'comment-only', severity: 'P1', note: '谈判时重点说明' },
  { findingId: 'R003', disposition: 'report-only' },
  { findingId: 'R004', disposition: 'omit' },
]

describe('lawyer plan review', () => {
  it('requires every finding to have an explicit decision', () => {
    const { session } = fixture()
    expect(() => approvePlan(session, session.planReview!.sourcePlanHash, decisions.slice(0, 3)))
      .toThrow(/R004/)
  })

  it('rejects a stale browser hash before writing', () => {
    const { session, planPath } = fixture()
    const before = readFileSync(planPath, 'utf8')
    expect(() => approvePlan(session, 'stale', decisions)).toThrowError(PlanReviewError)
    expect(readFileSync(planPath, 'utf8')).toBe(before)
  })

  it('projects all four decisions and records append-only audit data', () => {
    const { session, planPath } = fixture()
    const approved = approvePlan(session, session.planReview!.sourcePlanHash, decisions, '2026-09-04T00:00:02.000Z')
    session.planReview = approved.planReview
    const plan = JSON.parse(readFileSync(planPath, 'utf8')) as { findings: Array<Record<string, unknown>> }

    expect(plan.findings).toHaveLength(3)
    expect(plan.findings[0]).toMatchObject({ id: 'R001', action: 'replace', replacement_text: '十个工作日内付款' })
    expect(plan.findings[1]).toMatchObject({ id: 'R002', action: 'comment', severity: 'P1', recommended_text: '由甲方所在地法院管辖' })
    expect(plan.findings[1]).not.toHaveProperty('replacement_text')
    expect(plan.findings[1]).not.toHaveProperty('force_edit')
    expect(plan.findings[2]).toMatchObject({ id: 'R003', action: 'report-only' })
    expect(plan.findings.find(finding => finding.id === 'R004')).toBeUndefined()
    expect(approved).toMatchObject({ approvedFindings: 3, omittedFindings: 1 })
    expect(approved.planReview.history.map(entry => entry.kind)).toEqual(['plan-generated', 'plan-approved'])
    expect(approved.planReview.decisions.R002).toMatchObject({ note: '谈判时重点说明', decidedBy: 'workbench-user' })
    expect(() => assertApprovedPlan(session)).not.toThrow()
  })

  it('fails closed when an approved file is changed externally', () => {
    const { session, planPath } = fixture()
    session.planReview = approvePlan(session, session.planReview!.sourcePlanHash, decisions).planReview
    writeFileSync(planPath, `${readFileSync(planPath, 'utf8')} `, 'utf8')
    expect(hashPlanFile(planPath)).not.toBe(session.planReview.approvedPlanHash)
    expect(() => assertApprovedPlan(session)).toThrow(/必须重新分析并批准/)
  })

  it('starts a new review cycle without erasing earlier audit history', () => {
    const { session, planPath } = fixture()
    session.planReview = approvePlan(session, session.planReview!.sourcePlanHash, decisions).planReview
    const next = beginPlanReview(planPath, session.planReview, '2026-09-04T00:00:03.000Z')
    expect(next.status).toBe('awaiting-decisions')
    expect(next.decisions).toEqual({})
    expect(next.history.map(entry => entry.kind)).toEqual(['plan-generated', 'plan-approved', 'plan-generated'])
  })
})
