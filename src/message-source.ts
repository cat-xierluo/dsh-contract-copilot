/**
 * 本插件的消息生产者 source kind（DSH 0.1.7-rc.2 适配）。
 *
 * 0.1.2 的共享 `kind: 'plugin'` 已被上游移除：MessageSourceMap 改为
 * merge-extensible，每个生产者在自己的模块声明自己的 kind，消费者对
 * 未知 kind 走 fall-through。本插件按该模型注册 `contract-copilot`
 * kind；`ContextFormed`（form: snapshot/notice/… 及其字段约束）沿用
 * dsh-llm 的公共 mixin，与旧 `plugin` kind 的 form/sections 形状一致。
 */

import type { ContextFormed } from '@deepseek-ai/dsh-llm'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'contract-copilot': { kind: 'contract-copilot' } & ContextFormed
  }
}
