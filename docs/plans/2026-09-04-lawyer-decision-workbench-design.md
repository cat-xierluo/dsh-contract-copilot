# 律师决策工作台设计

日期：2026-09-04

状态：已确认，进入实现

目标版本：Contract Copilot `0.3.0`

## 1. 产品目标

工作台从审查结果的展示面升级为案件流程的控制面。律师在工作台建案后，插件创建专属 DSH Agent，自动完成前置信息消费和风险分析；计划生成后，无论模型还是用户直接调用工具，都不能越过律师决策门生成修订版。律师逐项选择处理方式并批准整份计划后，同一 Agent 才继续运行 `apply` 与 `finalize`。

本设计利用 DSH 的 Agent 生命周期、工具调用和持久会话能力，但不展示模型隐式推理，也不把短暂的运行状态当成案件事实。ContractSession 继续保存合同、计划、律师决定和交付物；DSH session log 保存 Agent 的消息、步骤和工具执行记录。两者通过 `dshSessionId` 关联。

## 2. 采用方案

采用“业务状态机 + 专属 DSH Agent + 强制律师决策门”。`ctx.agents.create()` 使用 DSH 当前默认模型选择创建 Agent，`followup()` 启动分析或继续交付，`whenIdle()` 提供明确的运行结束信号；应用重启后用 `ctx.agents.resume()` 恢复已有 DSH session。插件持有自己创建的 AgentHandle，并在卸载时取消和等待退出。

不采用 `workflowEngine` 作为案件主流程。当前 workflow run 由调用者前台持有，缺少后台 start/poll、journaling 与 restart resume；它适合一次性并行编排，不适合作为跨小时或跨天的合同案件状态源。也不采用只观察聊天工具事件的看板方案，因为它仍要求用户在聊天与工作台之间切换，不能形成不可绕过的律师决策门。

## 3. 状态与审计数据

ContractSession 增加 `automation` 和 `planReview` 两组可选字段，旧版本 session 仍可读取。

```text
automation
  dshSessionId
  status: idle | running-analysis | waiting-decisions | running-delivery | failed | delivered
  error?
  updatedAt

planReview
  sourcePlanHash
  status: awaiting-decisions | approved
  decisions: findingId -> current decision
  approvedPlanHash?
  history[]: append-only lawyer decision/approval records
```

每次 `analyze` 写出新计划后计算 `sourcePlanHash`，清空当前决定并进入 `awaiting-decisions`，但保留历史审计记录。律师决定包含处理方式、调整后的风险等级、可选备注、时间和来源。批准时验证计划 hash 与 finding 集合，确定性生成获批计划，原子写盘并记录 `approvedPlanHash`。`apply` 在执行 Python 前重新计算文件 hash；未批准或 hash 不一致都失败。

## 4. Finding 决策语义

第一版只提供四种互斥处理方式：

| 决定 | 对获批计划的影响 |
|---|---|
| 按建议处理 | 保留 Agent 生成的 action 与修改载荷 |
| 仅批注 | action 设为 `comment`，移除直接增删改载荷，保留风险说明与建议文本 |
| 仅意见书 | action 设为 `report-only`，不在合同正文落痕 |
| 忽略 | 从提交给 Python 的 findings 中移除，但审计历史仍保留该决定 |

风险等级调整覆盖 finding 的 `severity`。律师备注只进入决策审计，不自动改写法律分析或合同文字，避免把内部意见误当成对外批注。所有 finding 必须有决定后才能批准；批量“全部按建议处理”只是为每项生成显式决定，不是绕过审计。

## 5. 工作台交互

1. 律师输入 DOCX 路径并建案。
2. 如前置信息缺失，工作台展示原有表单；点击“提交并开始分析”后启动专属 Agent。
3. Agent 被明确要求只执行 intake 与 analyze。`apply` 的硬门禁确保即使模型继续调用也无法生成文件。
4. `plan_ready` 后工作台显示逐项决策卡：风险、定位原文、建议文本、法律依据、处理方式、风险等级和律师备注。
5. 律师可逐项选择或显式批量采用建议；点击“批准方案并生成交付物”时先批准计划，再向同一 Agent 发送交付指令。
6. Agent 执行 apply 与 finalize。工作台通过现有 SSE 更新状态，允许取消、失败后重试，并展示最终 DOCX。

工作台刷新只重新读取 ContractSession，不依赖浏览器内存。运行中的 Agent 状态若因进程退出而中断，下次操作先恢复 DSH session，再发送阶段对应的 followup。

## 6. 错误和并发处理

- 同一 ContractSession 同一时间只允许一个 Agent 命令在途；重复点击返回稳定的 busy 错误。
- RPC 请求携带当前 `sourcePlanHash`；浏览器展示旧计划时提交决定会得到 stale-plan 错误并刷新。
- 批准与计划写盘使用临时文件加 rename；业务 session 只在计划写成功后标为 approved。
- Agent 创建、恢复、模型请求或工具失败写入 `automation.error`，不把业务状态伪装成完成；用户可从当前阶段重试。
- 取消调用 DSH Agent 的 `cancel()`，等待 `whenIdle()` 后再更新业务状态；不会仅凭按钮响应声称已停止。
- 插件卸载时停止接收新命令，取消所持有的 Agent，并等待所有 handle dispose 到静止。

## 7. 验证策略

纯领域测试覆盖 hash、四种决定、全量决定检查、风险等级覆盖、原子写与批准失效。Host 测试使用伪 AgentRegistry 和 deferred promise，在状态屏障上验证 create/resume、重复命令、取消和 teardown，不使用固定 sleep。每个测试使用独立临时 session 与产物目录。

工具测试证明 `analyze` 生成待决策计划，`apply` 对未批准及被篡改计划 fail closed，并对获批计划继续真实 Python 集成路径。Client 测试覆盖逐项表单、批量决定、stale-plan 错误与动作禁用。发布验收从候选 tarball 启动隔离 DSH Web，使用真实模型或可回放会话完成建案到交付，并记录 DOM 断言以及 GIF 或截图。

## 8. 分期边界

`0.3.0` 只完成单案件、单律师、四种决定和一个专属 Agent。多人审批、权限角色、案件队列、批量合同、跨设备后台调度和 Python 内部逐 finding 执行进度推迟到后续版本。Python 脚本保持不变，因此修订生成期间仍只能显示 apply 级运行状态。
