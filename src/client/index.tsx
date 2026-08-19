/**
 * 浏览器 half（dsh.client）：把"审查工作台"挂进 DSH web UI。
 *
 * 挂载点 conversation.session.header.utilities（会话头部按钮区，
 * session-log-export 同款先例）。数据从 host half 的同源数据面取
 * （/contract-copilot/*，见 src/host-api.ts）。
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { ContractWorkbenchButton } from './Workbench.tsx'

export const inject = ['slots']

/** 注册会话头部的工作台按钮（打开全屏工作台对话框）。 */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('conversation.session.header.utilities', () =>
    ctx.slots.register(
      { name: 'conversation.session.header.utilities', id: 'contract-copilot-workbench' },
      ContractWorkbenchButton,
    ))
}