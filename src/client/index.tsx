/**
 * 浏览器 half（dsh.client）：把"审查工作台"挂进 DSH web UI。
 *
 * 挂载点 conversation.session.header.utilities（会话头部按钮区，
 * session-log-export 同款先例）。数据从 host half 的同源数据面取
 * （/contract-copilot/*，见 src/host-api.ts）。
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only：拉 ui-conversation 的 SlotMap 声明合并（slot 类型与运行时声明都在
// 所属 client 包；同时列在本包 dsh.client.inject 里保证加载顺序）。
// sidebar 槽是 ui-layout 独占渲染槽（实测外部 entry 不生效），不用。
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { ContractDockPanel, ContractWorkbenchButton } from './Workbench.tsx'

export const inject = ['slots']

/** 注册两个入口：会话头部按钮（全功能）+ 输入区 dock 常驻简版（TodoPanel 同款槽）。 */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('conversation.session.header.utilities', () =>
    ctx.slots.register(
      { name: 'conversation.session.header.utilities', id: 'contract-copilot-workbench' },
      ContractWorkbenchButton,
    ))
  ctx.slots.inject('conversation.input.dock', () =>
    ctx.slots.register(
      { name: 'conversation.input.dock', id: 'contract-copilot-dock' },
      ContractDockPanel,
    ))
}