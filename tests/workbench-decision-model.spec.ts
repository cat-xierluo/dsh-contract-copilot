/** Workbench decision projection tests without browser timing or DOM state. */

import { describe, expect, it } from 'vitest'
import type { SessionDetail } from '../src/workbench-protocol.ts'
import { decisionRequests, findingId, findingText, phaseIndex } from '../src/client/decision-model.ts'

function session(state: SessionDetail['session']['state'], approved = false): SessionDetail['session'] {
  return {
    id: 'case-1',
    contractPath: '/tmp/contract.docx',
    state,
    updatedAt: '2026-09-04T00:00:00.000Z',
    outputs: {},
    historyTail: [],
    ...(state === 'plan_ready' ? {
      planReview: {
        sourcePlanHash: 'source',
        sourceFindings: [],
        status: approved ? 'approved' : 'awaiting-decisions',
        decisions: {},
        history: [],
      },
    } : {}),
  }
}

describe('workbench decision model', () => {
  it('keeps lawyer approval as its own phase before delivery', () => {
    expect(phaseIndex(session('created'))).toBe(0)
    expect(phaseIndex(session('intake_done'))).toBe(1)
    expect(phaseIndex(session('plan_ready'))).toBe(2)
    expect(phaseIndex(session('plan_ready', true))).toBe(3)
    expect(phaseIndex(session('delivered'))).toBe(5)
  })

  it('does not construct an approval request while a finding is undecided', () => {
    const findings = [{ id: 'R001' }, { id: 'R002' }]
    expect(decisionRequests(findings, { R001: { disposition: 'accept' } })).toBeUndefined()
  })

  it('normalizes all decision fields and keeps the displayed finding order', () => {
    const findings = [{ id: 'R001' }, { id: 'R002' }]
    expect(decisionRequests(findings, {
      R001: { disposition: 'comment-only', severity: 'P1', note: '  内部复核  ' },
      R002: { disposition: 'omit', severity: '', note: '   ' },
    })).toEqual([
      { findingId: 'R001', disposition: 'comment-only', severity: 'P1', note: '内部复核' },
      { findingId: 'R002', disposition: 'omit' },
    ])
  })

  it('permits an explicitly empty plan and provides stable display fallbacks', () => {
    expect(decisionRequests([], {})).toEqual([])
    expect(findingId({}, 8)).toBe('R009')
    expect(findingText({ legal_basis: ['民法典第五百零九条', '第五百七十七条'] }, 'legal_basis'))
      .toBe('民法典第五百零九条；第五百七十七条')
  })
})
