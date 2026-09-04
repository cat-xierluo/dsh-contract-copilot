/** Browser/Host protocol for the authenticated Contract Copilot workbench. */

import type {
  ApplyOutputs,
  ContractSession,
  DecisionOption,
  HistoryEntry,
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
  | 'start'
  | 'recheck'

/** Session row rendered in the workbench queue. */
export interface SessionBrief {
  readonly id: string
  readonly contractName: string
  readonly state: SessionState
  readonly updatedAt: string
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
  readonly outputs: ApplyOutputs
  readonly updatedAt: string
  readonly historyTail: HistoryEntry[]
}

/** Session details and review findings. */
export interface SessionDetail {
  readonly session: SessionView
  readonly findings: Array<Record<string, unknown>>
}

/** One Word comment extracted from the DOCX package. */
export interface DocComment {
  readonly id: string
  readonly author: string
  readonly date?: string
  readonly text: string
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

/** Endpoint payload and result pairs used by both Host and Client adapters. */
export interface WorkbenchRpcMap {
  readonly state: { readonly input: Record<string, never>; readonly output: WorkbenchState }
  readonly detail: { readonly input: { readonly sessionId: string }; readonly output: SessionDetail }
  readonly document: { readonly input: { readonly sessionId: string }; readonly output: DocumentView }
  readonly answers: {
    readonly input: { readonly sessionId: string; readonly fields: Record<string, string> }
    readonly output: { readonly ok: true }
  }
  readonly start: { readonly input: { readonly contractPath: string }; readonly output: StartReviewResult }
  readonly recheck: {
    readonly input: { readonly sessionId: string; readonly newContractPath: string }
    readonly output: RecheckResult
  }
}
