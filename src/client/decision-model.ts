/** Pure client projections for lawyer decisions and workbench progress. */

import type { FindingDisposition } from '../session-types.ts'
import type { FindingDecisionRequest, SessionDetail } from '../workbench-protocol.ts'

export interface FindingDecisionDraft {
  readonly disposition?: FindingDisposition
  readonly severity?: string
  readonly note?: string
}

/** Return the zero-based workbench phase, or the phase count after delivery. */
export function phaseIndex(session: SessionDetail['session']): number {
  switch (session.state) {
    case 'created': return 0
    case 'intake_done': return 1
    case 'plan_ready': return session.planReview?.status === 'approved' ? 3 : 2
    case 'applying':
    case 'rejected':
    case 'failed': return 3
    case 'applied':
    case 'partial': return 4
    case 'delivered': return 5
  }
}

/** Return a persisted finding id or the same deterministic fallback used by analyze. */
export function findingId(finding: Record<string, unknown>, index: number): string {
  return String(finding.id ?? `R${String(index + 1).padStart(3, '0')}`)
}

/** Normalize one finding field for compact display. */
export function findingText(finding: Record<string, unknown>, key: string): string | undefined {
  const value = finding[key]
  if (Array.isArray(value)) return value.map(String).join('；')
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/** Build an approval request only when every displayed finding has a decision. */
export function decisionRequests(
  findings: Array<Record<string, unknown>>,
  drafts: Record<string, FindingDecisionDraft>,
): FindingDecisionRequest[] | undefined {
  const requests: FindingDecisionRequest[] = []
  for (const [index, finding] of findings.entries()) {
    const id = findingId(finding, index)
    const draft = drafts[id]
    if (draft?.disposition === undefined) return undefined
    requests.push({
      findingId: id,
      disposition: draft.disposition,
      ...(draft.severity === undefined || draft.severity === '' ? {} : { severity: draft.severity }),
      ...(draft.note === undefined || draft.note.trim() === '' ? {} : { note: draft.note.trim() }),
    })
  }
  return requests
}
