/** Pure persisted-session values shared by the Host and browser protocol. */

export type SessionState =
  | 'created'
  | 'intake_done'
  | 'plan_ready'
  | 'applying'
  | 'applied'
  | 'partial'
  | 'rejected'
  | 'failed'
  | 'delivered'

export type ReviewerIdentity = {
  readonly author: string
  readonly organization: string
  readonly department?: string
}

export type IntakeData = {
  clientName: string
  /** 甲方 / 乙方 / 中立 / 其他 */
  partyRole: string
  /** 签约前把关 / 谈判修订 / 其他（plugin 层阻塞项，CLI 不消费） */
  reviewPurpose: string
  /** 克制 / 常规 / 强势 */
  reviewIntensity: string
  deadline?: string
  priority?: string
  allowRestructure?: boolean
  /** revise-first / balanced / comment-first */
  editPolicy: string
  /** 用户授权“按默认口径处理”时的授权来源记录。 */
  authorization?: string
  reviewer: ReviewerIdentity
}

export type ApplyStats = {
  applied: number
  failed: number
  skipped: number
  reportOnly: number
}

export type ApplyOutputs = {
  reviewedDocx?: string
  reportDocx?: string
  archiveDir?: string
  stats?: ApplyStats
}

export type HistoryEntry = {
  at: string
  tool: string
  from: SessionState
  to: SessionState
}

export type DecisionOption = { field: string; question: string; options?: string[] }
export type DecisionAnswers = Record<string, string>

/** How the lawyer wants one analyzed finding handled in the delivery plan. */
export type FindingDisposition = 'accept' | 'comment-only' | 'report-only' | 'omit'

/** Current explicit decision for one finding. */
export type FindingDecision = {
  readonly findingId: string
  readonly disposition: FindingDisposition
  readonly severity?: string
  readonly note?: string
  readonly decidedAt: string
  readonly decidedBy: 'workbench-user'
}

/** Append-only record of plan generation and lawyer approval actions. */
export type PlanReviewHistoryEntry =
  | { readonly at: string; readonly kind: 'plan-generated'; readonly planHash: string }
  | {
    readonly at: string
    readonly kind: 'plan-approved'
    readonly sourcePlanHash: string
    readonly approvedPlanHash: string
    readonly decisions: FindingDecision[]
  }

/** Lawyer-review state for the current generated plan. */
export type PlanReview = {
  readonly sourcePlanHash: string
  readonly status: 'awaiting-decisions' | 'approved'
  readonly decisions: Record<string, FindingDecision>
  readonly approvedPlanHash?: string
  readonly history: PlanReviewHistoryEntry[]
}

/** Product-level projection of the dedicated DSH Agent lifecycle. */
export type AutomationStatus =
  | 'idle'
  | 'running-analysis'
  | 'waiting-decisions'
  | 'running-delivery'
  | 'failed'
  | 'delivered'

export type AutomationState = {
  readonly dshSessionId: string
  readonly status: AutomationStatus
  readonly error?: string
  readonly updatedAt: string
}

export type ContractSession = {
  version: 1
  id: string
  /** 发起 intake 的 DSH agent/session id。 */
  dshSessionId?: string
  contractPath: string
  contractKey: string
  contractName: string
  state: SessionState
  intake?: IntakeData
  planPath?: string
  planReview?: PlanReview
  automation?: AutomationState
  intakeMissing?: DecisionOption[]
  pendingAnswers?: DecisionAnswers
  outputs: ApplyOutputs
  progressCounter: number
  lastInjectedCounter: number
  history: HistoryEntry[]
  createdAt: string
  updatedAt: string
}
