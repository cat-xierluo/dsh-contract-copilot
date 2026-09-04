/** Typed zh/en workbench dictionary: the single source of all product copy for UI wiring. */

import type { AutomationStatus, FindingDisposition, SessionState } from '../session-types.ts'

/** Locales shipped with the workbench; unknown requests deterministically fall back to zh. */
export const LOCALES = ['zh', 'en'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'zh'

/**
 * zh is the source of truth. Fixed copy is a plain string; parametrized copy is a
 * function whose parameter object is the interpolation contract. en must restate
 * every key with the same parameter shapes, so both dictionaries and every call
 * site are checked by client typecheck.
 */
const zh = {
  // 会话状态标签（SessionState）
  'state.created': '待补齐',
  'state.intake_done': '前置信息已确认',
  'state.plan_ready': '审查计划就绪',
  'state.applying': '正在生成修订',
  'state.applied': '修订完成',
  'state.partial': '部分完成',
  'state.rejected': '完整性复核未通过',
  'state.failed': '执行失败',
  'state.delivered': '已交付',

  // 审查工具标签（历史记录中的 tool 名）
  'tool.contract_copilot_intake': '确认前置信息',
  'tool.contract_copilot_analyze': '完成风险分析',
  'tool.contract_copilot_apply': '生成修订与意见书',
  'tool.contract_copilot_finalize': '确认交付',
  'tool.contract_copilot_resume': '恢复审查任务',
  'tool.contract_copilot_recheck': '开始复审',

  // 五阶段进度条
  'phase.intake': '前置信息',
  'phase.analysis': '风险分析',
  'phase.decisions': '律师决策',
  'phase.delivery': '修订交付',
  'phase.done': '完成',

  // 专属 Agent 自动化状态（AutomationStatus）
  'automation.idle': '待启动',
  'automation.running-analysis': 'Agent 正在分析',
  'automation.waiting-decisions': '等待律师决策',
  'automation.running-delivery': 'Agent 正在生成交付物',
  'automation.failed': 'Agent 需要重试',
  'automation.delivered': 'Agent 已完成',

  // 律师处理方式（FindingDisposition）
  'disposition.accept': '按建议处理',
  'disposition.comment-only': '仅批注',
  'disposition.report-only': '仅意见书',
  'disposition.omit': '忽略',

  // 工作台入口与标题
  'workbench.dialogAria': 'Contract Copilot 审查工作台',
  'workbench.title': '📋 Contract Copilot · 审查工作台',
  'workbench.closeAria': '关闭合同审查工作台',
  'workbench.openAria': '打开合同审查工作台',
  'workbench.railLabel': '合同审查',
  'workbench.railTitle': '合同审查工作台',
  'workbench.railTitleWithState': (p: { readonly contractName: string; readonly state: string }): string => `${p.contractName} · ${p.state}`,

  // 窄屏三栏切换（≤900px 时保持全部区域可达）
  'pane.group': '工作台区域',
  'pane.tasks': '任务',
  'pane.document': '文档',
  'pane.operations': '操作',

  // 文档窗格
  'doc.wordView': 'Word 视图',
  'doc.simpleView': '简版（修订高亮）',
  'doc.renderFailed': 'Word 渲染失败，已显示简版',
  'doc.selectPrompt': '选择左侧审查任务查看文档。',
  'progress.aria': '合同审查进度',

  // 律师逐项决策面板
  'decision.panelTitle': '律师逐项决策',
  'decision.planApproved': '计划已批准',
  'decision.progress': (p: { readonly decided: number; readonly total: number }): string => `已决定 ${p.decided}/${p.total}`,
  'decision.acceptAll': '全部按建议',
  'decision.unnamedRisk': '未命名风险',
  'decision.originalText': (p: { readonly text: string }): string => `原文：${p.text}`,
  'decision.suggestion': (p: { readonly text: string }): string => `建议：${p.text}`,
  'decision.legalBasis': (p: { readonly text: string }): string => `依据：${p.text}`,
  'decision.dispositionLabel': '处理方式',
  'decision.dispositionAria': (p: { readonly findingId: string }): string => `${p.findingId} 处理方式`,
  'decision.severityAria': (p: { readonly findingId: string }): string => `${p.findingId} 风险等级`,
  'decision.noteAria': (p: { readonly findingId: string }): string => `${p.findingId} 律师备注`,
  'decision.dispositionPlaceholder': '请选择',
  'decision.keepSeverity': '原等级',
  'decision.notePlaceholder': '内部备注（不进入对外文书）',
  'decision.approveLockedHint': '请先决定全部审查项',
  'decision.approveAndGenerate': '批准方案并生成交付物',
  'decision.approvedBadge': '✓ 本计划已经律师批准并锁定',

  // 侧栏状态卡
  'status.currentLabel': '当前状态',
  'status.stats': (p: { readonly applied: number; readonly failed: number; readonly reportOnly: number }): string => `成功 ${p.applied} · 失败 ${p.failed} · 仅意见书 ${p.reportOnly}`,
  'status.startAnalysis': '启动风险分析',
  'status.stopAgent': '停止 Agent',
  'status.regenerate': '按获批方案生成交付物',

  // 交付产物
  'output.deliverables': '交付产物',
  'output.reviewedDocx': '⬇ 审核修订版 DOCX',
  'output.reportDocx': '⬇ 审查意见书 DOCX',

  // 对方改稿后复审
  'recheck.title': '对方改稿后复审',
  'recheck.pathAria': '新版合同 DOCX 的本地绝对路径',
  'recheck.placeholder': '新版合同 DOCX 本地绝对路径',
  'recheck.submit': '指向新版合同',

  // 前置信息补齐
  'intake.requiredTitle': (p: { readonly count: number }): string => `需要你确认（${p.count}）`,
  'intake.submitAndAnalyze': '提交并开始分析',

  // 新建审查
  'newReview.title': '➕ 新建审查',
  'newReview.pathAria': '合同 DOCX 本地绝对路径',
  'newReview.placeholder': '合同 DOCX 本地绝对路径',
  'newReview.submit': '建立审查案件',

  // 会话列表、批注与历史
  'list.empty': '尚无审查任务。可在上方输入合同路径，或直接让 Agent 审查合同。',
  'comments.title': (p: { readonly count: number }): string => `💬 批注（${p.count}）`,
  'history.recentTitle': '最近交付记录',

  // 操作结果与错误提示
  'notice.intakeMissing': '请先补齐全部必填前置信息。',
  'notice.analysisStarted': '专属 Agent 已启动，将在生成风险清单后等待你的逐项决定。',
  'notice.analysisStartFailed': (p: { readonly message: string }): string => `启动失败：${p.message}`,
  'notice.decisionsMissing': '请先决定全部审查项。',
  'notice.planLocked': (p: { readonly approved: number; readonly omitted: number }): string => `律师方案已锁定：执行 ${p.approved} 项，忽略 ${p.omitted} 项；Agent 正在生成交付物。`,
  'notice.approveFailed': (p: { readonly message: string }): string => `批准或派发失败：${p.message}`,
  'notice.agentStopped': 'Agent 已停止并进入静止状态，可以从当前阶段重试。',
  'notice.stopFailed': (p: { readonly message: string }): string => `停止失败：${p.message}`,
  'notice.retryStarted': 'Agent 已恢复，正在按获批方案重新生成交付物。',
  'notice.retryFailed': (p: { readonly message: string }): string => `重试失败：${p.message}`,
  'notice.createFailed': (p: { readonly message: string }): string => `创建失败：${p.message}`,
  'notice.recheckFailed': (p: { readonly message: string }): string => `提交失败：${p.message}`,
  'notice.connectionFailed': (p: { readonly message: string }): string => `工作台连接失败：${p.message}`,
  'notice.detailFailed': (p: { readonly message: string }): string => `读取审查详情失败：${p.message}`,
}

export type MessageKey = keyof typeof zh
export type WorkbenchMessages = { readonly [K in MessageKey]: (typeof zh)[K] }

/** en must repeat the full zh key set with identical parameter shapes; drift fails client typecheck. */
const en: WorkbenchMessages = {
  'state.created': 'Pending intake',
  'state.intake_done': 'Intake confirmed',
  'state.plan_ready': 'Review plan ready',
  'state.applying': 'Generating revision',
  'state.applied': 'Revision complete',
  'state.partial': 'Partially delivered',
  'state.rejected': 'Integrity recheck failed',
  'state.failed': 'Execution failed',
  'state.delivered': 'Delivered',

  'tool.contract_copilot_intake': 'Confirm intake',
  'tool.contract_copilot_analyze': 'Complete risk analysis',
  'tool.contract_copilot_apply': 'Generate revision & opinion report',
  'tool.contract_copilot_finalize': 'Confirm delivery',
  'tool.contract_copilot_resume': 'Resume review',
  'tool.contract_copilot_recheck': 'Start recheck',

  'phase.intake': 'Intake',
  'phase.analysis': 'Risk analysis',
  'phase.decisions': 'Lawyer decisions',
  'phase.delivery': 'Revision & delivery',
  'phase.done': 'Done',

  'automation.idle': 'Not started',
  'automation.running-analysis': 'Agent analyzing',
  'automation.waiting-decisions': 'Waiting for lawyer decisions',
  'automation.running-delivery': 'Agent generating deliverables',
  'automation.failed': 'Agent needs retry',
  'automation.delivered': 'Agent finished',

  'disposition.accept': 'Apply as suggested',
  'disposition.comment-only': 'Comment only',
  'disposition.report-only': 'Report only',
  'disposition.omit': 'Omit',

  'workbench.dialogAria': 'Contract Copilot review workbench',
  'workbench.title': '📋 Contract Copilot · Review Workbench',
  'workbench.closeAria': 'Close the contract review workbench',
  'workbench.openAria': 'Open the contract review workbench',
  'workbench.railLabel': 'Contract review',
  'workbench.railTitle': 'Contract review workbench',
  'workbench.railTitleWithState': p => `${p.contractName} · ${p.state}`,

  'pane.group': 'Workbench areas',
  'pane.tasks': 'Tasks',
  'pane.document': 'Document',
  'pane.operations': 'Operations',

  'doc.wordView': 'Word view',
  'doc.simpleView': 'Simple (tracked changes)',
  'doc.renderFailed': 'Word rendering failed; showing the simple view',
  'doc.selectPrompt': 'Select a review on the left to view its document.',
  'progress.aria': 'Contract review progress',

  'decision.panelTitle': 'Lawyer decisions, item by item',
  'decision.planApproved': 'Plan approved',
  'decision.progress': p => `Decided ${p.decided}/${p.total}`,
  'decision.acceptAll': 'Accept all suggestions',
  'decision.unnamedRisk': 'Unnamed risk',
  'decision.originalText': p => `Original: ${p.text}`,
  'decision.suggestion': p => `Suggestion: ${p.text}`,
  'decision.legalBasis': p => `Basis: ${p.text}`,
  'decision.dispositionLabel': 'Disposition',
  'decision.dispositionAria': p => `${p.findingId} disposition`,
  'decision.severityAria': p => `${p.findingId} severity`,
  'decision.noteAria': p => `${p.findingId} lawyer note`,
  'decision.dispositionPlaceholder': 'Choose',
  'decision.keepSeverity': 'Keep severity',
  'decision.notePlaceholder': 'Internal note (not included in deliverables)',
  'decision.approveLockedHint': 'Decide all findings first',
  'decision.approveAndGenerate': 'Approve plan and generate deliverables',
  'decision.approvedBadge': '✓ Plan approved by the lawyer and locked',

  'status.currentLabel': 'Current status',
  'status.stats': p => `Applied ${p.applied} · Failed ${p.failed} · Report-only ${p.reportOnly}`,
  'status.startAnalysis': 'Start risk analysis',
  'status.stopAgent': 'Stop agent',
  'status.regenerate': 'Generate deliverables from approved plan',

  'output.deliverables': 'Deliverables',
  'output.reviewedDocx': '⬇ Reviewed DOCX',
  'output.reportDocx': '⬇ Opinion report DOCX',

  'recheck.title': 'Recheck after counterparty revisions',
  'recheck.pathAria': 'Absolute local path of the new contract DOCX',
  'recheck.placeholder': 'Absolute local path to the new contract DOCX',
  'recheck.submit': 'Point to the new version',

  'intake.requiredTitle': p => `Needs your confirmation (${p.count})`,
  'intake.submitAndAnalyze': 'Submit and start analysis',

  'newReview.title': '➕ New review',
  'newReview.pathAria': 'Absolute local path of the contract DOCX',
  'newReview.placeholder': 'Absolute local path to the contract DOCX',
  'newReview.submit': 'Create review case',

  'list.empty': 'No reviews yet. Enter a contract path above, or ask the agent to review a contract.',
  'comments.title': p => `💬 Comments (${p.count})`,
  'history.recentTitle': 'Recent delivery log',

  'notice.intakeMissing': 'Complete all required intake fields first.',
  'notice.analysisStarted': 'The dedicated agent has started and will wait for your item-by-item decisions once the risk list is ready.',
  'notice.analysisStartFailed': p => `Failed to start: ${p.message}`,
  'notice.decisionsMissing': 'Decide all findings first.',
  'notice.planLocked': p => `Plan locked by the lawyer: applying ${p.approved} findings and omitting ${p.omitted}; the agent is generating deliverables.`,
  'notice.approveFailed': p => `Approval or dispatch failed: ${p.message}`,
  'notice.agentStopped': 'The agent has stopped and is idle; you can retry from the current phase.',
  'notice.stopFailed': p => `Failed to stop: ${p.message}`,
  'notice.retryStarted': 'The agent has resumed and is regenerating deliverables from the approved plan.',
  'notice.retryFailed': p => `Retry failed: ${p.message}`,
  'notice.createFailed': p => `Creation failed: ${p.message}`,
  'notice.recheckFailed': p => `Submit failed: ${p.message}`,
  'notice.connectionFailed': p => `Workbench connection failed: ${p.message}`,
  'notice.detailFailed': p => `Failed to load review details: ${p.message}`,
}

export const MESSAGES: Readonly<Record<Locale, WorkbenchMessages>> = { zh, en }

// Compile-time guards: label groups must cover their whole domain union, or typecheck fails.
type AssertNever<T extends never> = T
type StateLabelsComplete = AssertNever<Exclude<`state.${SessionState}`, MessageKey>>
type AutomationLabelsComplete = AssertNever<Exclude<`automation.${AutomationStatus}`, MessageKey>>
type DispositionLabelsComplete = AssertNever<Exclude<`disposition.${FindingDisposition}`, MessageKey>>

/** Normalize a locale tag; any unknown, malformed, or non-string value falls back to zh. */
export function resolveLocale(candidate: unknown): Locale {
  const normalized = typeof candidate === 'string'
    ? candidate.trim().toLowerCase().replace(/_/g, '-')
    : ''
  return normalized === 'en' || normalized.startsWith('en-') ? 'en' : DEFAULT_LOCALE
}

/** Browser-derived active locale; non-browser runs deterministically fall back to zh. */
export function browserLocale(): Locale {
  return resolveLocale(typeof navigator === 'undefined' ? undefined : navigator.language)
}

/**
 * Look up one message by locale and typed key. Parametrized keys require their
 * parameter object at the type level; plain keys take no argument. Unknown
 * locales resolve through `resolveLocale`; an unknown key echoes the key itself
 * so a missed wiring entry can never crash the workbench.
 */
export function t<K extends MessageKey>(
  locale: Locale | string | undefined,
  key: K,
  ...args: (typeof zh)[K] extends (params: infer P) => string ? readonly [params: P] : readonly []
): string {
  const value: string | ((params: never) => string) | undefined = MESSAGES[resolveLocale(locale)][key]
  if (value === undefined) return key
  if (typeof value === 'function') return value((args as readonly unknown[])[0] as never)
  return value
}

/** `t` bound to one locale for compact call sites; per-key parameter contracts are preserved. */
export function createTranslator(locale: Locale | string | undefined): <K extends MessageKey>(
  key: K,
  ...args: (typeof zh)[K] extends (params: infer P) => string ? readonly [params: P] : readonly []
) => string {
  return (key, ...args) => t(locale, key, ...args)
}
