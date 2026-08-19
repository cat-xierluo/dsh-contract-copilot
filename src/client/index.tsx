/**
 * 浏览器 half（dsh.client）：把"审查工作台"挂进 DSH web UI。
 *
 * 挂载点 conversation.session.header.utilities（会话头部按钮区，
 * session-log-export 同款先例）。数据从 host half 的同源数据面取
 * （/contract-copilot/*，见 src/host-api.ts）。
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only：拉 ui-conversation 的 SlotMap 声明合并（conversation.session.header.utilities
// 的 slot 类型与运行时声明都来自它；同时它在本包 dsh.client.inject 里保证加载顺序）。
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
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