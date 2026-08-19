/**
 * 浏览器 half（dsh.client）：合同审查工作台入口 + 对话框。
 *
 * 入口位置（用户要求）：左侧边栏 rail——与任务看板/SSH 同排。
 * 该 rail 是社区侧栏插件占据 `sidebar` 槽后的内部区域，无公开子槽；
 * 任务看板/SSH 的做法是自带样式 DOM 注入，此处同款：把入口节点注入
 * 官方标记的 [data-slot=sidebar] 容器（比社区插件的私有类名稳定）。
 * 会话头部按钮与输入区 dock 已按用户要求移除，只保留这一个入口。
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { createRoot, type Root } from 'react-dom/client'
import { createElement } from 'react'
import { RailEntryButton } from './Workbench.tsx'

export const inject = ['slots']

const HOST_ID = 'contract-copilot-rail-host'

/** 注入左侧 rail 入口；容器晚出现时轮询重试，卸载时清理 React root 与节点。 */
export function apply(ctx: ClientContext): void {
  let mounted = false
  let host: HTMLElement | undefined
  let root: Root | undefined
  const timer = setInterval(() => {
    if (mounted) return
    const sidebar = document.querySelector('[data-slot=sidebar]')
    if (sidebar === null || sidebar instanceof HTMLElement === false) return
    host = document.createElement('div')
    host.id = HOST_ID
    host.dataset.plugin = 'contract-copilot'
    sidebar.appendChild(host)
    root = createRoot(host)
    root.render(createElement(RailEntryButton))
    mounted = true
    clearInterval(timer)
  }, 800)
  ctx.effect(() => () => {
    clearInterval(timer)
    void root?.unmount()
    host?.remove()
  }, 'contract-copilot: rail entry')
}