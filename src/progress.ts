/**
 * pre-step 进度注入文案（能力 C）。
 *
 * 幂等规则：只有 progressCounter 超过 lastInjectedCounter 才注入新消息，
 * 避免每步重复注入同一条进度（设计稿 §4.3）。
 */

import type { ContractSession, SessionState } from './session.ts'

const STATE_LABELS: Record<SessionState, string> = {
  created: '待补齐审查前置信息',
  intake_done: '前置信息已确认，待分析',
  plan_ready: '审查计划已就绪，待执行',
  applying: '正在执行批注/修订（可能需要数分钟）',
  applied: '执行完成，待交付确认',
  partial: '部分成功：有交付物但存在失败项',
  rejected: '完整性复核未通过：无正式交付物',
  failed: '执行失败，请查看原因',
  delivered: '已交付',
}

const NEXT_HINTS: Record<SessionState, string> = {
  created: '下一步：补齐立场/审查目的/口径后重新调 contract_copilot_intake',
  intake_done: '下一步：读 references 后调 contract_copilot_analyze 提交 findings',
  plan_ready: '下一步：调 contract_copilot_list_findings 供用户检视，或直接 contract_copilot_apply',
  applying: '正在执行，请等待当前 tool 调用返回',
  applied: '下一步：调 contract_copilot_finalize 收集交付物',
  partial: '下一步：读归档执行日志定位失败项，修 plan 重跑或带失败清单 finalize',
  rejected: '下一步：按失败原因补齐 plan 字段（法条依据/占位），再重新 apply',
  failed: '下一步：检查报错原因后重试 apply',
  delivered: '本轮已交付；对方改稿后可 resume + analyze 指向新版合同做再审',
}

/** 一条紧凑的进度消息；注入为 user message（见 index.ts 的 pre-step listener）。 */
export function formatProgressMsg(session: ContractSession): string {
  return `[contract-copilot] ${session.contractName}｜状态: ${STATE_LABELS[session.state]}｜${NEXT_HINTS[session.state]}`
}

/** 幂等判据：自上次注入后是否有新的状态/数据变化。 */
export function progressChangedSinceLastInjection(session: ContractSession): boolean {
  return session.progressCounter > session.lastInjectedCounter
}
