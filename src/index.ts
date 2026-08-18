/**
 * Contract Copilot —— 合同审查四步流程的 DSH 插件入口。
 *
 * 形态：function plugin（设计稿 §3.1）。7 个 tool + 1 个 pre-step 进度注入。
 * 状态持久化在 tool handler 内完成（§4.3），session 文件见 session.ts。
 */

import type { Context } from '@deepseek-ai/cordis'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { Config, resolveConfig } from './config.ts'
import type { PluginConfig } from './config.ts'
import { formatProgressMsg, progressChangedSinceLastInjection } from './progress.ts'
import { SessionStore } from './session.ts'
import { registerAnalyzeTool } from './tools/analyze.ts'
import { registerApplyTool } from './tools/apply.ts'
import { registerFinalizeTool } from './tools/finalize.ts'
import { registerInspectSessionTool } from './tools/inspect-session.ts'
import { registerIntakeTool } from './tools/intake.ts'
import { registerListFindingsTool } from './tools/list-findings.ts'
import { registerResumeTool } from './tools/resume.ts'

export const name = 'contract-copilot'
export const inject = ['tools', 'agents']
export { Config }

export function apply(ctx: Context, raw: PluginConfig): void {
  const config = resolveConfig(raw)
  const store = new SessionStore(config.sessionsDir)

  registerIntakeTool(ctx, config, store)
  registerAnalyzeTool(ctx, config, store)
  registerListFindingsTool(ctx, store)
  registerApplyTool(ctx, config, store)
  registerFinalizeTool(ctx, store)
  registerInspectSessionTool(ctx, store)
  registerResumeTool(ctx, store)

  if (config.injectProgress) {
    // 能力 C：每步注入审查进度（幂等：仅状态变化后注入一次）
    ctx.on('agent/pre-step', async ({ signal }, next): Promise<PreStepDecision> => {
      const decision = await next()
      if (decision.kind === 'reject' || signal.aborted) return decision
      const session = store.current()
      if (session === undefined || !progressChangedSinceLastInjection(session)) return decision
      session.lastInjectedCounter = session.progressCounter
      store.save(session)
      const text = formatProgressMsg(session)
      return {
        kind: 'enter',
        messages: [
          ...decision.messages,
          createUserMessage({
            content: [{ type: 'text', text }],
            source: { kind: 'plugin', plugin: name, form: 'snapshot', sections: [{ name: 'contract-copilot-progress', text }] },
          }),
        ],
      }
    }, { prepend: true })
  }
}
