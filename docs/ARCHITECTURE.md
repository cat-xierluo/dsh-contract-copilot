# ARCHITECTURE

本文件描述 **当前已实现** 的架构与边界。路线与未来规划在 `docs/ROADMAP.md`。

## 1. 形态

`@yangweixin/dsh-contract-copilot` 是 **function plugin**（`apply(ctx, config)` + 命名导出 `name / inject / Config`）。不是 Service Definition。

**理由**：本插件目前没有跨 plugin 消费需求，7 个 tool 与工作台共享同一个 `SessionStore` 实例；注册项的生命周期由当前 Cordis context 管理。

## 2. 数据流

```
工作台命令 → ContractAgentCoordinator → 专属 DSH Agent
                                      ↓ followup / whenIdle / cancel
用户消息或专属 Agent → agent loop → tool handler → SessionStore (原子写 JSON)
                              ↓
                    planReview 律师批准门
                              ↓
                       Python CLI 异步 spawn
                              ↓
                  DOCX 产物 → session.outputs
                              ↓
                      finalize → delivered

DSH sidebar.footer.action → ContractCopilotClient
                              ├─ Connection RPC → SessionStore / 文档渲染
                              ├─ /api 精确 Fetch → SSE 状态事件
                              └─ /api 精确 Fetch → DOCX 流式下载
```

详细事件链、状态机、session 文件结构见 `docs/2026-08-18-dsh-plugin-design.md` §5。

## 3. 模块布局

```
src/
├── index.ts                 # apply 入口：注册 7 个 tool + pre-step 进度注入
├── config.ts                # Config + 内嵌 Workbench 开关 + resolveConfig 校验
├── session-types.ts         # Host/Client 共用的纯 session 数据类型（零 Node 依赖）
├── session.ts               # SessionStore：9 态状态机 + 原子写 + 损坏恢复 + 事件订阅
├── workbench-protocol.ts    # 鉴权 RPC、事件和下载协议常量及 DTO
├── plan-review.ts           # 计划 hash、逐 finding 决定、获批计划投影与 apply 门禁
├── agent-coordinator.ts      # 案件专属 Agent 的创建、恢复、命令互斥、取消和释放
├── host-api.ts              # Connection RPC + 认证 SSE/下载精确路由
├── python-bridge.ts         # 异步 spawn + 退码四分类（success/partial/rejected/error）
├── docx-view.ts             # OOXML → HTML（React 简版视图输入）
├── progress.ts              # pre-step 注入文案 + 幂等判据
├── skill-config.ts          # 读 reviewer_profile / review_memory（Python 独占写入）
├── paths.ts                 # ~ 展开 + 合同 key 归一化（与 Python 一致）
├── json.ts                  # 收窄 + compactUndefinedDeep（lossless JSON 合规）
├── client/
│   ├── index.tsx            # 官方 sidebar.footer.action 注册
│   ├── api.ts               # 浏览器侧认证传输适配器
│   └── Workbench.tsx        # 队列、Word、四阶段、表单、产物与历史
└── tools/
    ├── intake.ts            # §3.2.1 前置澄清（必填 summary 合并来源：args > pendingAnswers > memory > profile）
    ├── analyze.ts           # §3.2.2 分层扫描（plan 必填 summary + findings）
    ├── list-findings.ts     # 检视点（可切 edit_policy）
    ├── apply.ts             # §3.2.3 条款落地（异步 spawn，AbortSignal）
    ├── finalize.ts          # §3.2.4 交付（双 DOCX 校验）
    ├── inspect-session.ts   # 横切：状态查询
    └── resume.ts            # 长程续接 + §9.5 再审回路（newContractPath 替换合同指向）

lib/                         # tsc/tsdown 构建产物（gitignore）
tests/                       # Vitest 单元与真实 Python spawn 集成测试
```

## 4. 7 个工具的职责边界

| Tool | 状态机入口 | 能力 | 错误处理 |
|---|---|---|---|
| `contract_copilot_intake` | `created → intake_done` | D（决策点） | 阻塞项未齐 → `status: blocked` 返回 missing 清单 |
| `contract_copilot_analyze` | `intake_done → plan_ready` | C（注入上下文） | legal_basis 软校验 + summary 必填 |
| `contract_copilot_list_findings` | 不改态 | B+C | plan 不存在抛错 |
| `contract_copilot_apply` | `plan_ready → applying → {applied, partial, rejected, failed}` | A+B | 四分类退码 + 中断回 plan_ready |
| `contract_copilot_finalize` | `{applied, partial} → delivered` | B+E | 双 DOCX 校验 + 目录存在性 |
| `contract_copilot_inspect_session` | 不改态 | B | — |
| `contract_copilot_resume` | 不改态 | E | — |

## 5. 关键不变量

- **Python 脚本一行不动**（项目硬约束）
- **session 文件原子写**：临时文件 + rename；损坏时改名留证后按 created 重建
- **tool 返回值必须 lossless JSON 合规**：每个 tool 在 return 前包 `compactUndefinedDeep`
- **pre-step 进度注入幂等**：仅在 `progressCounter > lastInjectedCounter` 时注入
- **apply 全量显式传参**：不依赖 Python 非交互默认值（review_intensity 缺失静默"强势"）
- **律师批准不可绕过**：analyze 生成 `awaiting-decisions` 计划；apply 仅接受逐项决定、已批准且文件 hash 未变化的计划
- **决策与执行分离**：律师备注只进入追加式审计历史；四种决定确定性投影到 Python plan，不把内部备注混入对外文书
- **案件状态与 Agent 轨迹分层**：ContractSession 保存业务事实；DSH session 保存消息、步骤和 tool 轨迹，两者只通过 `dshSessionId` 关联
- **一个案件一个在途命令**：Coordinator 在进程内拒绝重复分析或交付；取消和插件卸载均等待 Agent 进入 idle 后再报告完成

## 6. 边界与外部依赖

- Python CLI：`apply_review_plan.py`（v1.6.3），硬依赖 `defusedxml`
- session 文件目录：`~/.dsh/contract-copilot/sessions/<id>.json`（插件可配）
- DSH harness 0.1.2-rc.1：tools、llm、agent，以及 Web 侧 connection、ui-renderer、ui-sidebar
- Cordis：`@deepseek-ai/cordis`（peer）

## 7. 已知限制（运行时）

- **进度粒度 = tool 调用级**：Python CLI 执行期间零 stdout 输出（apply_review_plan.py:403-428 仅 main 尾部打印统计）
- **apply 长任务**（数分钟）占用案件专属 Agent 的当前 turn；工作台可继续显示状态并发送取消
- **out-of-tree HMR 不覆盖本插件**：重建 node/client 工件后必须重启 DSH Web
- **逐 finding 实时进度不可用**：Python CLI 在结束前不输出阶段事件；当前最细粒度是 tool 状态跃迁

## 8. DSH 0.1.2 工作台（DECISIONS.md Q35）

双面插件：**host half**（Node）+ **client half**（浏览器）。

```
sidebar.footer.action
        │
        ▼
ContractCopilotClient
   ├─ /contract-copilot/<endpoint> ── Connection RPC ── SessionStore
   ├─ /api/contract-copilot.events ── authenticated Fetch/SSE
   └─ /api/contract-copilot.download ── authenticated Fetch/stream
```

- 声明：`package.json` `dsh.client` 注入 connection、ui-renderer、ui-sidebar，并导出 `./client`
- 构建：`tsdown.client.config.ts` 复刻 closure-factory 工件契约（见 `docs/DSH-PLUGIN-REFERENCE.md` §4）
- 生命周期：Host 用 `ctx.inject(['connection'], …)` 延迟注册；没有 Connection 的 headless profile 不产生 Web 数据面
- 安全：RPC、SSE、GET/HEAD 下载在处理前经过 Connection 的 Host/Origin fence 与签名 Cookie 认证
- 渲染安全：文档 HTML 由 host 侧 `renderDocumentHtml` 生成（文本已 escape），client 直接注入

## 9. 律师计划批准门（DECISIONS.md Q36–Q39）

`analyze` 为缺省 finding 分配稳定的 `R001` 序号并拒绝重复 id，写盘后以原始文件字节计算 `sourcePlanHash`。每次重新分析或修改计划都会开始新的 `awaiting-decisions` 周期，清空当前决定但保留历史审计条目。

工作台批准请求携带当前 hash 和每项决定。Host 要求 finding 与决定一一对应，再按决定生成获批计划：`accept` 保留动作，`comment-only` 去除直接改文载荷并设为 comment，`report-only` 不在正文落痕，`omit` 从执行计划移除。获批计划原子写盘后记录 `approvedPlanHash`。

`contract_copilot_apply` 在启动 Python 前重新计算计划 hash。缺少批准或 hash 不一致时 fail closed，因此 Agent 提示词、工作台按钮和直接 tool 调用共享同一门禁。

## 10. 案件专属 Agent（DECISIONS.md Q36、Q38）

工作台通过认证 RPC 启动分析或交付。`ContractAgentCoordinator` 使用 `agentDefaultModel.currentSelection()` 创建案件专属 Agent，将业务 session id 写入严格阶段提示，并通过 `followup()` 发送命令。分析命令只允许 intake 与 analyze；交付命令只允许 apply，并在成功后 finalize。

`dshSessionId` 持久化后，进程内优先复用已持有或仍存活的 Agent，重启后调用 `ctx.agents.resume()`。创建失败不会写入不存在的 DSH session 关联，后续重试仍走 create；创建和恢复错误写入 `automation.error`。

Coordinator 用 `whenIdle()` 判断真实停止，再把运行状态投影为 `waiting-decisions`、`delivered`、`idle` 或 `failed`。同一案件存在在途命令时返回稳定的 `agent-busy` 错误；插件卸载先停止接收命令，再取消、等待并 dispose 自己持有的全部 AgentHandle。
