/**
 * Tool 4：contract_copilot_apply —— §3.2.3 条款落地（9.3 风险处理）。
 *
 * 异步 spawn apply_review_plan.py（全量显式传参），按退码四分类更新 session。
 * partial / rejected 是域结果（canonical value），不是异常（§6.2）。
 */

import { existsSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { PluginConfig } from '../config.ts'
import { runApplyCli } from '../python-bridge.ts'
import type { BridgeKind } from '../python-bridge.ts'
import type { SessionState, SessionStore } from '../session.ts'

type ApplyValue = {
  sessionId: string
  kind: BridgeKind | 'aborted'
  exitCode: number | null
  stats?: { applied: number; failed: number; skipped: number; reportOnly: number }
  outputs?: { reviewedDocx?: string; reportDocx?: string; archiveDir?: string }
  guidance: string
  stderrTail?: string
}

const KIND_GUIDANCE: Record<BridgeKind, string> = {
  success: '全部审查项执行成功，请调 contract_copilot_finalize 收集交付物',
  partial: '已产出交付物但存在未写入 Word 的审查项：读归档执行日志定位失败项，'
    + '修 plan 后重新 apply，或带失败清单 finalize 并向用户明示',
  rejected: '完整性复核未通过（无正式交付物）：按 stderr 逐项补齐 plan 字段（法律依据/占位），再重新 apply',
  error: '执行异常：按 stderr 定位原因（缺依赖 → pip install -r scripts/requirements.txt；'
    + '输入不存在 → 回 intake）后重试',
}

/** 退码分类 → session 终态（§6.2）。 */
function kindToState(kind: BridgeKind): SessionState {
  if (kind === 'success') return 'applied'
  if (kind === 'partial') return 'partial'
  if (kind === 'rejected') return 'rejected'
  return 'failed'
}

export function registerApplyTool(ctx: Context, config: PluginConfig, store: SessionStore): void {
  ctx.tools.register(defineTool({
    name: 'contract_copilot_apply',
    description: '执行审查计划：调用 contract-copilot 的 Python CLI 生成"修订批注一体版 DOCX + Word 审查意见书 DOCX"。'
      + '执行可能需要数分钟。结果分四类：success / partial（有交付物但有失败项）/ rejected（完整性门禁拒绝，无交付物）/ error。'
      + '审查人身份与口径会用 intake 收集的值显式传入。',
    parameters: {
      sessionId: { type: 'string', required: true, description: 'session id' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value: ApplyValue) => [{
        type: 'text',
        text: `[contract-copilot] apply 结果: ${value.kind}${value.stats === undefined ? '' : `
  成功=${value.stats.applied} 失败=${value.stats.failed} 跳过=${value.stats.skipped} 仅意见书=${value.stats.reportOnly}`}\n${value.guidance}`,
      }],
    },
    async execute(args, exec): Promise<ApplyValue> {
      const session = store.get(args.sessionId)
      if (session === undefined) throw new Error(`contract-copilot: session 不存在: ${args.sessionId}`)
      if (!['plan_ready', 'rejected', 'partial'].includes(session.state)) {
        throw new Error(
          `contract-copilot: 当前状态 ${session.state} 不能执行；需 plan_ready（rejected/partial 可修后重跑）`,
        )
      }
      const intake = session.intake
      if (intake === undefined || session.planPath === undefined) {
        throw new Error('contract-copilot: session 数据不完整（intake/plan 缺失），请重新走 intake → analyze')
      }

      const dir = store.artifactsDir(session.id)
      const outputDocx = path.join(dir, `${session.contractName}_reviewed.docx`)
      const reportDocx = path.join(dir, `${session.contractName}_审查报告.docx`)

      // 先置 applying（UI 立即可见），再执行
      store.transition(session.id, 'contract_copilot_apply', 'applying')

      const result = await runApplyCli({
        skillRoot: config.skillRoot,
        pythonExecutable: config.pythonExecutable,
        inputDocx: session.contractPath,
        planPath: session.planPath,
        outputDocx,
        reportDocx,
        clientName: intake.clientName,
        partyRole: intake.partyRole,
        reviewIntensity: intake.reviewIntensity,
        editPolicy: intake.editPolicy,
        author: intake.reviewer.author,
        organization: intake.reviewer.organization,
        department: intake.reviewer.department,
        signal: exec.signal,
      })

      if (exec.signal.aborted) {
        // §6.3：中断回 plan_ready；输出路径由 plugin 管理，半成品可安全清理
        if (existsSync(outputDocx)) unlinkSync(outputDocx)
        store.transition(session.id, 'contract_copilot_apply', 'plan_ready')
        return {
          sessionId: session.id,
          kind: 'aborted',
          exitCode: result.exitCode,
          guidance: '执行被中断，输出半成品已清理；可重新 apply',
        }
      }

      store.transition(session.id, 'contract_copilot_apply', kindToState(result.kind), (target) => {
        target.outputs = {
          reviewedDocx: result.parsed.reviewedDocx ?? outputDocx,
          reportDocx: result.parsed.reportDocx ?? reportDocx,
          archiveDir: result.parsed.archiveDir,
          stats: result.parsed.stats,
        }
      })
      return {
        sessionId: session.id,
        kind: result.kind,
        exitCode: result.exitCode,
        stats: result.parsed.stats,
        outputs: result.parsed,
        guidance: KIND_GUIDANCE[result.kind],
        stderrTail: result.kind === 'success' ? undefined : result.stderr.slice(-1500),
      }
    },
  }))
}
