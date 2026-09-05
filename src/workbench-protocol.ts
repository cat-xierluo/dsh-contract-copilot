/** Browser/Host protocol for the authenticated Contract Copilot workbench. */

import type {
  ApplyOutputs,
  AutomationState,
  ContractSession,
  DecisionOption,
  FindingDisposition,
  HistoryEntry,
  PlanReview,
  SessionState,
} from './session-types.ts'

/** Authenticated JSON RPC channel owned by this plugin. */
export const WORKBENCH_RPC_CHANNEL = '/contract-copilot'

/** Authenticated exact Fetch route for SessionStore change events. */
export const WORKBENCH_EVENTS_PATH = '/api/contract-copilot.events'

/** Authenticated exact Fetch route for source and delivery DOCX files. */
export const WORKBENCH_DOWNLOAD_PATH = '/api/contract-copilot.download'

/** JSON operations exposed to the browser workbench. */
export type WorkbenchRpcEndpoint =
  | 'state'
  | 'detail'
  | 'document'
  | 'answers'
  | 'approve'
  | 'run-analysis'
  | 'run-delivery'
  | 'cancel'
  | 'start'
  | 'recheck'

/** Session row rendered in the workbench queue. */
export interface SessionBrief {
  readonly id: string
  readonly contractName: string
  readonly state: SessionState
  readonly updatedAt: string
  readonly automationStatus?: AutomationState['status']
}

/** Authenticated state response. */
export interface WorkbenchState {
  readonly sessions: SessionBrief[]
}

/** Session fields the workbench may display. */
export interface SessionView {
  readonly id: string
  readonly contractName: string
  readonly contractPath: string
  readonly state: SessionState
  readonly intake?: ContractSession['intake']
  readonly intakeMissing?: DecisionOption[]
  readonly planReview?: PlanReview
  readonly automation?: AutomationState
  readonly outputs: ApplyOutputs
  readonly updatedAt: string
  readonly historyTail: HistoryEntry[]
}

/** Session details and review findings. */
export interface SessionDetail {
  readonly session: SessionView
  readonly findings: Array<Record<string, unknown>>
}

/**
 * Deterministic reason why a comment's body range could not be wrapped in an
 * exact marker. Enumerated so clients can branch without parsing prose.
 */
export type CommentAnchorFallbackReason =
  /** No range markers at all (point comment with only a reference mark). */
  | 'range-missing'
  /** commentRangeStart without a matching commentRangeEnd. */
  | 'range-unclosed'
  /** Start and end exist but never pair inside one renderable paragraph. */
  | 'range-crosses-paragraph'
  /** Range markers live inside w:ins/w:del blocks the simple renderer cannot mark. */
  | 'range-in-tracked-change'
  /** Comment body exists in comments.xml but is never referenced in document.xml. */
  | 'orphan-comment'

/**
 * Resolved body location for one Word comment. `exact` guarantees the simple
 * HTML contains a `data-cc-anchor` range marker for `anchorId`; `fallback`
 * carries an explainable reason and, when a reference bubble exists, its
 * rendered paragraph index.
 */
export type CommentAnchor =
  | {
      readonly status: 'exact'
      readonly paragraphIndex: number
      /** Decoded plain text covered by the comment range (for text matching). */
      readonly quote: string
    }
  | {
      readonly status: 'fallback'
      readonly reason: CommentAnchorFallbackReason
      readonly paragraphIndex?: number
    }

/** One Word comment extracted from the DOCX package. */
export interface DocComment {
  /** OOXML w:id. Present in the source file but not stable across re-saves. */
  readonly id: string
  readonly author: string
  readonly date?: string
  readonly text: string
  /**
   * Stable content-derived anchor id (format `ccm-<hex>[ suffixed '-N' for
   * identical duplicates]) shared by this entry and its body markers.
   */
  readonly anchorId: string
  readonly anchor: CommentAnchor
}

/** Host-rendered document fallback plus delivery paths. */
export interface DocumentView {
  readonly label: string
  readonly html: string
  readonly comments: DocComment[]
  readonly reviewedDocx?: string
  readonly reportDocx?: string
}

/** Result of starting a review from the workbench. */
export interface StartReviewResult {
  readonly sessionId: string
  readonly contractName: string
  readonly missing: DecisionOption[]
  readonly nextStep: string
}

/** Result of pointing a delivered review at a new draft. */
export interface RecheckResult {
  readonly ok: true
  readonly hint: string
}

/** Browser input for one lawyer finding decision. */
export interface FindingDecisionRequest {
  readonly findingId: string
  readonly disposition: FindingDisposition
  readonly severity?: string
  readonly note?: string
}

/** Result of projecting an approved plan to disk. */
export interface ApprovePlanResult {
  readonly ok: true
  readonly approvedPlanHash: string
  readonly approvedFindings: number
  readonly omittedFindings: number
}

/** Accepted dedicated-Agent command. Completion arrives through session events. */
export interface AgentDispatchResult {
  readonly accepted: true
  readonly dshSessionId: string
  readonly phase: 'analysis' | 'delivery'
}

/** Endpoint payload and result pairs used by both Host and Client adapters. */
export interface WorkbenchRpcMap {
  readonly state: { readonly input: Record<string, never>; readonly output: WorkbenchState }
  readonly detail: { readonly input: { readonly sessionId: string }; readonly output: SessionDetail }
  readonly document: { readonly input: { readonly sessionId: string }; readonly output: DocumentView }
  readonly answers: {
    readonly input: { readonly sessionId: string; readonly fields: Record<string, string> }
    readonly output: { readonly ok: true }
  }
  readonly approve: {
    readonly input: {
      readonly sessionId: string
      readonly sourcePlanHash: string
      readonly decisions: FindingDecisionRequest[]
    }
    readonly output: ApprovePlanResult
  }
  readonly 'run-analysis': {
    readonly input: { readonly sessionId: string }
    readonly output: AgentDispatchResult
  }
  readonly 'run-delivery': {
    readonly input: { readonly sessionId: string }
    readonly output: AgentDispatchResult
  }
  readonly cancel: {
    readonly input: { readonly sessionId: string }
    readonly output: { readonly accepted: true }
  }
  readonly start: { readonly input: { readonly contractPath: string }; readonly output: StartReviewResult }
  readonly recheck: {
    readonly input: { readonly sessionId: string; readonly newContractPath: string }
    readonly output: RecheckResult
  }
}
