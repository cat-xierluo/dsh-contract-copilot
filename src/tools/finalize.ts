/**
 * Tool 5：contract_copilot_finalize —— §3.2.4 交付与跟进（9.4 交付阶段）。
 *
 * 校验双 DOCX 产物存在，固化为 delivered，输出交付清单
 * （完成口径：只有两个 Word 文件都交付才算完成，对齐 SKILL.md §9.4）。
 */

import { existsSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { compactUndefinedDeep } from '../json.ts'
import type { SessionStore } from '../session.ts'

type FinalizeValue = {
  sessionId: string
  reviewedDocx: string
  reportDocx: string
  archiveDir?: string
  stats?: { applied: number; failed: number; skipped: number; reportOnly: number }
  checklist: string[]
}

export function registerFinalizeTool(ctx: Context, store: SessionStore): void {
  ctx.tools.register(defineTool({
    name: 'contract_copilot_finalize',
    description: '收集并确认交付物：审核修订版 DOCX + Word 审查意见书 DOCX（两件齐才算完成）。'
      + '返回文件路径与归档目录；IM 会话发起的任务请把文件回传原会话（§9.4 渠道约定）。',
    parameters: {
      sessionId: { type: 'string', required: true, description: 'session id' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value: FinalizeValue) => [{
        type: 'text',
        text: `[contract-copilot] 交付就绪：\n  审核修订版: ${value.reviewedDocx}\n  审查意见书: ${value.reportDocx}`
          + `${value.archiveDir === undefined ? '' : `\n  归档目录: ${value.archiveDir}`}`,
      }],
    },
    async execute(args): Promise<FinalizeValue> {
      const session = store.get(args.sessionId)
      if (session === undefined) throw new Error(`contract-copilot: session 不存在: ${args.sessionId}`)
      if (session.state !== 'applied' && session.state !== 'partial') {
        throw new Error(`contract-copilot: 当前状态 ${session.state} 没有可交付产物；需 applied 或 partial`)
      }
      const reviewedDocx = session.outputs.reviewedDocx
      const reportDocx = session.outputs.reportDocx
      if (reviewedDocx === undefined || reportDocx === undefined) {
        throw new Error('contract-copilot: session 缺少产物路径（apply 未正常完成），请重新 apply')
      }
      for (const file of [reviewedDocx, reportDocx]) {
        if (!existsSync(file)) {
          throw new Error(`contract-copilot: 交付物不存在: ${file}；请重新 apply`)
        }
      }
      store.transition(session.id, 'contract_copilot_finalize', 'delivered')
      const checklist = [
        `审核修订版 DOCX: ${reviewedDocx}`,
        `Word 审查意见书 DOCX: ${reportDocx}`,
        session.outputs.archiveDir === undefined ? undefined : `过程留痕（plan/执行日志/MD 报告）: ${session.outputs.archiveDir}`,
        '两件 Word 文件交付给用户才算完成；IM 发起的任务请回传原会话',
      ].filter((item): item is string => item !== undefined)
      return compactUndefinedDeep({
        sessionId: session.id,
        reviewedDocx,
        reportDocx,
        archiveDir: session.outputs.archiveDir,
        stats: session.outputs.stats,
        checklist,
      })
    },
  }))
}
