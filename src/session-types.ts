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
  intakeMissing?: DecisionOption[]
  pendingAnswers?: DecisionAnswers
  outputs: ApplyOutputs
  progressCounter: number
  lastInjectedCounter: number
  history: HistoryEntry[]
  createdAt: string
  updatedAt: string
}
