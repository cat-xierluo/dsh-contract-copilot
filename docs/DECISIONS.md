# DECISIONS — 决策日志

本文件记录真实发生过的取舍与影响。**不虚构备选方案**，不复述历史流水。

每条决策编号连续（Q1 起），含 **结论 / 理由 / 影响 / 何时重新评估** 四要素。

---

## Q1 – Q16：v0.1 设计稿决策（2026-08-18 brainstorming）

详见 `docs/2026-08-18-dsh-plugin-design.md` §8（原设计稿决策日志），从 commit `0910e65` 起步。主题：目标用户、核心交互能力、改造路径、命名、仓库、scope、GitHub 用户名、Section 2 演化（v1→v4）等。

## Q17 – Q25：v0.2 审计修订决策（commit `ac00110`，2026-08-18）

| # | 决策点 | 结论 | 理由 |
|---|---|---|---|
| Q17 | 状态写盘机制 | **tool handler 内写** | `agent/post-step` 事件在 DSH 中不存在；tool 执行点是天然状态变更点 |
| Q18 | CLI 调用原语 | **异步 spawn + AbortSignal** | spawnSync 会冻结 harness（HMR/UI/listener）；只有异步才能支持中断 |
| Q19 | 能力 B 进度粒度 | **tool 调用粒度** | Python 执行期间零输出（实测 apply_review_plan.py 全部 print 在 main 尾部） |
| Q20 | 非交互参数策略 | **plugin 全量显式传参** | `review_intensity` 缺失静默默认"强势"（review_runtime.py:52）——口径必须来自用户 |
| Q21 | integrity 失败处理 | **plugin 不自建回滚** | Python 已在 save 之前检查并 `SystemExit(1)`，无产物可回滚（apply_review_plan.py:361-364） |
| Q22 | §9.5 复核环节 | **resume+analyze 组合覆盖** | 对方改稿再 = resume + analyze 指向新 DOCX |
| Q23 | 起草流程 | **v1 排除** | 先把审查回路做穿；起草无 Python CLI 可包 |
| Q24 | 归档位置 | **沿用 skill 默认** | 不改变用户"去 skill archive/ 看留痕"的既有习惯 |
| Q25 | ask 交互实现 | **工作台确认表单为主路径**（2026-08-19 由 Q31/Q33 取代原"tool 内 userQuestions"首选） | 表单在插件 UI 内完成交互（用户原始诉求）；agent 无参重调 intake 消费 pendingAnswers |

## Q26 – Q28：e2e 全链路实测后的真实缺口（commit `f92aaf8`，2026-08-19）

| # | 决策点 | 结论 | 理由 |
|---|---|---|---|
| Q26 | plan 的 summary 段 | **analyze 必填 summary** | 报告渲染器从 plan.summary 取概况/结论/建议；缺一渲染"待补充"，16 处 > 阈值 10 → integrity 整体拒绝 |
| Q27 | 被拒后的 re-analyze | **扩展到 rejected/partial/failed** | integrity 拒绝后的修复回路就是"改 summary/findings 再 analyze" |
| Q28 | 实质性改写的修订收束 | **沿用收束 + schema 文档化 force_edit** | action_executor.resolve_delivery_action 对 substantive rewrite 默认降级批注；schema description 告知 agent 显式授权 |

## Q29：tool 返回值适配 DSH lossless JSON（2026-08-19）

| 字段 | 内容 |
|---|---|
| **结论** | 每个 tool 在 `return` 前包一层 `compactUndefinedDeep` 深度剥离 undefined 字段 |
| **理由** | DSH 的 `walkJsonValue`（`packages/core/session/src/json.ts`）拒绝任何属性值为 `undefined` 的属性（包括嵌套对象里的 undefined）——typeof undefined !== 'object' 即 reject，且递归生效 |
| **影响** | 7 个 tool 返回值都得过 compact；**未使用** `tools/post-execute` listener（failed path 下 `next()` 不暴露 value，snapshotJsonValue 已在 ToolOutputError 之前抛出） |
| **何时重新评估** | DSH 升级版本对 lossless 校验规则调整时 |

## Q30：v2 交付形态——本地 localhost 工作台（2026-08-19，**已撤回**）

| 字段 | 内容 |
|---|---|
| **结论** | **撤回**——见 Q31 |
| **理由（撤回前）** | 插件自带 node:http 服务器（默认 127.0.0.1:8790），通过 SSE 推送 SessionStore 变更，浏览器跳独立地址 |
| **影响（撤回前）** | 已写：src/workbench/server.ts + src/workbench/page.ts（含 vanilla JS 内联 HTML 页面）；src/docx-view.ts（OOXML→HTML 渲染器） |
| **问题** | **方向错误**——用户原话："**我要的不是说你启动一个 local host** 而是这个工作台是在 dsh **以插件这个形式**，比如说侧边栏或者什么其他的方式去进行展示的"；类比"成熟的法律 AI 产品" |
| **撤回时机** | 2026-08-19 用户明确反馈后 |

## Q31：v2 交付形态——DSH 原生 client-modules + ui-slots（2026-08-19，**由 Q35 更新接入细节**）

| 字段 | 内容 |
|---|---|
| **结论** | 插件作为 out-of-tree 包，加 `package.json#dsh.client` 声明 + `exports["./client"]`，被 `packages/client/modules` 的 `ClientModuleRegistry` 扫描；client 入口用 `ctx.slots.inject(slot-name, () => ctx.slots.register({...}, Component))` 把 React 组件注册到 DSH web UI 的现有 slot |
| **理由** | 用户明确要求工作台"在 dsh 内"；DSH 已官方支持此路径（`packages/extensions/cordis-client-runner` 专门服务动态插件）；解析链 `createRequire(ctx.baseUrl).resolve(spec)` 不分 in-tree / out-of-tree |
| **影响** | ① 拆掉 `src/workbench/server.ts` + `page.ts`；② `src/docx-view.ts` 保留作 React 组件 props 输入；③ `SessionStore.subscribe()` 保留供 RPC 推送；④ 新增 `src/client/index.ts`（React + slots 注册）；⑤ package.json 加 `dsh.client` 与 exports；⑥ 独立构建配置（tsdown browser bundle，参照 `packages/client/ui-theme`） |
| **已验证（research only，未实现）** | (a) `ClientModuleRegistry` 扫描 loader 全 entries，写入 `window.__DSH_BOOT__`；(b) `/plugins/<id>/client.js` 由 `clientPath` 表里的磁盘路径 serve，不分 in-tree / out-of-tree；(c) `ui-slots` 实操样本（`packages/client/ui-theme` 注册到 `settings.general.item`） |
| **未验证风险** | ① slot 名要按 `packages/client/ui-*` 实际声明逐个核实；② out-of-tree pnpm link 时 HMR watch 范围；③ `dsh.client` bundle 用 tsdown 隔离 server bundle 的 lib/ 目录 |
| **何时重新评估** | DSH 主 web app 引入新的 slot 类型；profile 携带 client 包后启动失败 |
| **实施状态（2026-08-19）** | ✅ **已落地并浏览器实测通过**。实施中发现并修复两处契约细节：(a) banner 必须构造 `var module = { exports: {} }; var exports = module.exports;`（否则浏览器端 `exports is not defined`）；(b) `"type":"module"` 包内 cjs 产物默认 `.cjs` 后缀，需 `outExtensions` 强制 `.js`。挂载点最终选 `conversation.session.header.utilities`（会话头部按钮 + 全屏对话框）。旁证：用户 web profile 已有 5 个社区 out-of-tree 插件（dsh-better-sidebar 等）以同机制正常运行 |

## Q32：错路径归档（commit pending，2026-08-19）

| 字段 | 内容 |
|---|---|
| **结论** | `git rm` 删除 `src/workbench/server.ts` + `src/workbench/page.ts`；`src/docx-view.ts` 暂留待 v2 复用 |
| **理由** | 错路径代码无价值，但功能（OOXML 渲染）正确 |
| **影响** | 下一轮 v2 实施时按 Q31 拆解为 React 组件 |

## Q33：intake 复用 blocked session（2026-08-19）

| 字段 | 内容 |
|---|---|
| **结论** | intake 对同合同最近一个 `state=created` 且带非空 `pendingAnswers` 的 session **复用而非新建**（前提 contractPath 相同） |
| **理由** | 表单答案存在 session A、agent 重调 intake 若新建 session B 则答案丢失——工作台表单回路断在两半。复用后"blocked → 表单 → 无参重调"闭合成环 |
| **验证** | e2e 实测：blocked session `…0259953` → 表单答案写入 → 无参重调 intake → **同一 sessionId** 返回 ok（客户名来自表单而非 memory）→ analyze(force_edit) → apply 4/0/0/0 → finalize 全通 |

## Q34：实现期验证点 V2/V3/V4 结论（2026-08-19）

| # | 结论 | 证据 |
|---|---|---|
| V2 | **关闭（被表单方案取代）** | Q25 原首选"tool 内调 ctx.userQuestions"未实施；工作台确认表单（Q31）成为 intake 交互的主路径且 e2e 验证通过。Q25 的回退路径升级为正式路径 |
| V3 | **✅ 已接线** | `Agent.id` 即 `SessionId`（`packages/core/agent/src/runtime-types.ts:66`"The single identity shared with session"）；intake 通过 `exec.agent.id` 写入 `session.dshSessionId` |
| V4 | **❌ 不支持（记录为已知限制）** | 实测：out-of-tree 插件重建 lib/client.js（内容变化）后 `__DSH_BOOT__` rev 不变——client-modules 的 `rebuilt()` 只被 harness 仓库 `dev:web` watcher 触发，不 watch link: 插件。**out-of-tree 插件更新需重启 dsh web**（已记入 DSH-PLUGIN-REFERENCE.md §4） |

## Q35：DSH 0.1.2 工作台迁移边界（2026-09-04）

| 字段 | 内容 |
|---|---|
| **结论** | 保留 Python CLI、7 个 tool 与 `SessionStore`；把 Web 外壳迁移到 `sidebar.footer.action`、Connection 认证 RPC、认证事件流与精确下载路由。工作台增加四阶段进度和最近状态跃迁。 |
| **理由** | 旧插件在 DSH 0.1.2 仍可启动，但依赖已删除的 `dsh-client-runtime`、轮询非公开 sidebar DOM，且 `/contract-copilot/*` 在无浏览器会话 token 时仍返回数据。核心在新版依赖下构建和 69 项测试均通过，无需整体重写。 |
| **影响** | Client 组件通过独立 API 适配器访问 Host；headless 保留原有 agent tool 行为；旧的 `workbench.port/autoOpen/host` 配置退出。 |
| **何时重新评估** | 需要工作台直接创建后台 Agent、逐 finding 实时进度或跨插件消费 ContractSession 时，评估 Service Definition + Typert Remote。 |

## Q36：案件状态与 DSH 运行状态分层（2026-09-04）

| 字段 | 内容 |
|---|---|
| **结论** | ContractSession 继续作为合同计划、律师决定和交付物的权威来源；专属 DSH session 记录 Agent 消息、步骤和 tool 轨迹，两者通过 `dshSessionId` 关联。 |
| **理由** | DSH 运行过程可观察，但 live Agent 与进程同寿命；案件可能跨小时、刷新或重启，不能依赖内存 handle 恢复法律决定。 |
| **影响** | 工作台读取业务 session 投影案件状态，Agent 运行状态只补充当前执行信息；所有影响交付的决定必须先持久化。 |
| **何时重新评估** | ContractSession 成为其他插件的公共能力，或 DSH 提供适合业务记录的可扩展案件投影时。 |

## Q37：分析后设置不可绕过的律师决策门（2026-09-04）

| 字段 | 内容 |
|---|---|
| **结论** | 每次 analyze 都使计划进入 `awaiting-decisions`；所有 finding 获得显式决定并批准后才允许 apply。批准与计划 hash 绑定，文件变化自动失效。 |
| **理由** | 只在提示词里要求 Agent 停止不能构成产品约束；律师确认必须同时约束工作台、Agent 和直接 tool 调用。 |
| **影响** | `apply` 新增 fail-closed 门禁；重新 analyze、改变计划或外部改写文件后必须重新批准。 |
| **何时重新评估** | 用户明确要求某类低风险合同采用预授权自动审查，并能定义可审计的授权规则时。 |

## Q38：专属 Agent 使用 AgentRegistry，不使用 workflowEngine（2026-09-04）

| 字段 | 内容 |
|---|---|
| **结论** | 工作台通过 `ctx.agents.create/resume` 创建或恢复一个案件专属 Agent，用 `followup/cancel/whenIdle` 驱动阶段；workflowEngine 不承担案件主流程。 |
| **理由** | Agent session 可持久化并恢复；当前 workflow run 是 holder-owned foreground collection，缺少后台 start/poll、journaling 和 restart resume。 |
| **影响** | 插件持有并完整 dispose 自己创建的 AgentHandle；新建 Agent 使用 DSH 当前默认模型选择，工作台记录 create/resume 失败。 |
| **何时重新评估** | workflow capability 提供后台句柄、持久检查点和重启恢复后。 |

## Q39：第一版 finding 决策词汇（2026-09-04）

| 字段 | 内容 |
|---|---|
| **结论** | 每项 finding 必选“按建议处理 / 仅批注 / 仅意见书 / 忽略”，另可调整 severity 和写内部律师备注。 |
| **理由** | 四种动作能映射现有 Python plan 语义，不要求改 Python；备注不自动进入对外文书，避免内部意见泄漏。 |
| **影响** | 批量采用建议仍生成逐项审计记录；`忽略`只从获批执行计划移除，原发现和决定保留在 session 历史。 |
| **何时重新评估** | 需要律师直接编辑替换文本、合并 finding 或新增人工 finding 时。 |

## Q40：DSH 可观察运行面支撑工作台交互粒度（2026-09-04）

| 字段 | 内容 |
|---|---|
| **结论** | 工作台以 DSH 暴露的 Agent 生命周期、持久 Session、命名 Tool 调用和状态事件作为运行信号，再将其投影为 ContractSession 中可持久化、可操作、可审计的案件状态。工作台不展示模型隐藏思维链。 |
| **理由** | 仅按完整对话轮次交互，无法在 analyze 与 apply 之间可靠设置律师暂停、逐项确认、取消、重试和恢复点。DSH 的运行面允许插件观察阶段结果并控制后续动作，同时由业务 session 保存法律决定。 |
| **影响** | 新交互必须对应明确的业务状态、决定或授权门，并能从持久状态恢复；Agent 轨迹用于解释运行过程，不取代 ContractSession 的业务权威。只具有调试价值且不能稳定重建的内部过程不进入产品界面。 |
| **何时重新评估** | DSH 提供具有持久检查点、业务事件投影和重启恢复语义的公共 workflow 能力时。 |

## Q41：工作台壳层与批注定位分层交付（2026-09-04）

| 字段 | 内容 |
|---|---|
| **结论** | 先分别交付主题/窄屏/焦点统一的工作台壳层与稳定的批注锚点模型，再在后续集成任务中接通 Word 批注渲染、双向选择、滚动和高亮。暗色视觉使用 DSH 官方主题变量，产品文案进入 typed locale 字典。 |
| **理由** | 壳层与 Host/协议锚点可以按文件独立实现和验证；点击批注跳转同时依赖两者，若在两个并行任务中都修改 `Workbench.tsx`，会造成职责重叠和合并风险。 |
| **影响** | 窄屏不再直接隐藏操作区，而以可切换区域保留完整能力；批注 id、锚点和降级原因成为 Host 到 Client 的显式数据；第二波集成只消费已验证的两项基础。 |
| **何时重新评估** | DSH 提供统一的文档批注组件与稳定选择协议，或 `docx-preview` 原生暴露可直接消费的双向批注导航接口时。 |

## Q42：专属 Agent 的分析上下文由 Host 注入（2026-09-05）

| 字段 | 内容 |
|---|---|
| **结论** | 工作台在派发分析前由 Host 从业务 session 的合同路径提取 OOXML 可见正文，并把有界正文与最小审查指导注入专属 Agent 回合；不要求 DSH Web profile 开放通用文件、shell 或 skill 工具。 |
| **理由** | 真实 DSH Web 验证表明专属 Agent 只有 7 个合同领域工具，旧提示要求其自行读取 DOCX 与 skill references，形成无法执行的前置条件。Host 已持有经过路径校验的业务对象，能够在最早可解析点提供确定输入。 |
| **影响** | 正文放在明确的数据边界内，合同中的伪造边界标记会被隔离；注入上限由 `workbench.analysisContractTextMaxChars` 配置，默认 40000、硬上限 200000；提取失败或正文为空会持久化 failed 并在创建 Agent 前终止。交付回合不重复注入正文。 |
| **何时重新评估** | 专属 preset 获得可审计且受路径策略约束的文件/skill 能力，或超长合同需要分段检索而不适合有界全文提示时。 |

## Q43：兼容 docx-preview 的两种批注引用 DOM（2026-09-05）

| 字段 | 内容 |
|---|---|
| **结论** | 导航保留带批注 id 的原生 `.docx-comment-ref` 路径，同时支持 run-style `.docx_commentreference`：从相邻 `end of comment #id` 注释恢复 id，再增强为可见、可聚焦且支持 Enter/Space 的批注入口。 |
| **理由** | 真实 DSH Web 渲染的含批注 DOCX 使用 run-style 占位元素，没有早期测试假定的 `.docx-comment-ref`；仅依赖后一选择器会使正文到侧栏的反向导航失效。 |
| **影响** | 两种 DOM 共用同一选择、滚动和高亮控制器；只有恢复到有效批注 id 的占位元素才会增强，无法解析时保持未命中而不误跳。可见标记和辅助名称由 typed locale 提供。 |
| **何时重新评估** | 锁定的 `docx-preview` 版本提供稳定、公开且带 id 的批注引用接口时。 |

---

## Q45：vitest 状态污染根治落在测试层三件套（2026-09-06）

| 字段 | 内容 |
|---|---|
| **结论** | 2026-09-05/06 测试崩溃循环的修复不追加大堆顶、不砍并发 worker，落三件套：全局 `hookTimeout: 30_000`（新建 `vitest.config.ts`）、docx-extract 的 TMPDIR 重定向隔离 + afterEach 零残留断言、`AGENTS.md` 限定 claude 会话跑单 spec / `--bail 1` 不跑全量。 |
| **理由** | 16:32 全套件长跑归因确认 OOM 假说不成立（堆顶 + 后台 I/O 双保险下零新崩溃报告）；真实失败形态是负载诱导：beforeEach 派生真实 python3 超 vitest 默认 10s hook 上限（agent-coordinator 6 连败）、测试超时后在飞抽取的临时目录漏清理触发残留断言。$TMPDIR 内 5 个 `cc-docx-extract-*` 残留现场与 8 份崩溃报告时间戳一一对应，为直接物证；main 空闲机器 266/266 全绿（1.59s）证明非确定性 bug。worker 数缩减已被用户拒绝（TASKS 卡 02 风险段原记录），堆顶 2048 是与 CI 共享的合约级护栏。 |
| **影响** | 真实 python3 派生的 spec 获得与 30s testTimeout 对齐的 hook 上限；docx-extract 残留从"事后观察"变为确定性断言（守卫自检注入假残留验证过会红），且不再受历史运行留在系统临时目录的陈旧条目影响；agent 会话全量跑测试被规则禁止，负载源收敛。附带修复 docx-extract fixture 对 python-docx 的隐性依赖（旧回退分支永不执行）。 |
| **何时重新评估** | CC-V5-004 异步抽取（Q44，feat-v5 波次）合入 main 时，docx-extract.spec 以该分支异步版为准（同构的 TMPDIR 重定向 + mkdtemp-per-run 设计）；若受控 3 连跑再出现残留类失败，考虑 mkdtemp 串行化（不动 worker 数）。 |

---

## Q46：vitest 堆顶护栏下沉到 worker 启动参数（2026-09-09）

| 字段 | 内容 |
|---|---|
| **结论** | 把 2048MiB 堆顶护栏从 `pnpm test` 入口的 `NODE_OPTIONS` 下沉到 `vitest.config.ts` 的 `poolOptions.forks.execArgv`：任何入口（ORCA 会话恢复、裸 `npx vitest`、agent 会话）跑测试，每个 fork worker 都强制带 `--max-old-space-size=2048`。不改 pool 类型与 worker 数（Q45 边界内）。 |
| **理由** | 2026-09-09 注销风暴中，ORCA 守护进程自动恢复会话并重跑全量 vitest（governance 恢复 worktree 21:42 重建、21:48 续写四文件 diff、21:51 拉起测试），该路径绕过入口护栏，两个 `com.stablyai.orca` 资源组的 vitest worker（默认堆顶 ~4GB）相继 V8 `FatalProcessOutOfMemory`，加速全机内存耗尽。同日受控复现（空闲机器、2048 堆顶、`--bail 1`）该 worktree 283/283 全绿，确认非测试固有缺陷，维持 Q45「负载诱导」定性——缺口不在测试而在护栏覆盖面：Q45 三件套约束了 claude 会话，未约束 ORCA 自动恢复路径。 |
| **影响** | 裸入口下 worker 也被锁 2048 顶：单 worker 爆堆只死自己、vitest 报一条失败，不再 4GB×N 拖垮 64GB 全机；`pnpm test` 入口双保险不变（环境变量与 execArgv 同值共存）。已实测：临时 spec 断言 worker `process.execArgv` 含该参数（通过后即删），裸入口跑 agent-coordinator/docx-extract 全过。全量套件因当晚机器负载未在本会话跑（遵循 AGENTS.md 限定），留待 PM/CI 串行验收。 |
| **何时重新评估** | 合法大 fixture 场景在 2048 顶下被误杀（worker 正常跑到顶被终止）时，按 spec 粒度评估放宽；vitest 大版本升级改变 forks pool 参数传递行为时复核；ORCA 提供恢复路径的负载/并发控制选项后，可重新权衡是否保留双保险。 |

---

## 决策索引（按主题）

**产品形态**
- Q22 / Q23 / Q25 — 范围边界（起草排除、复核组合覆盖、ask 交互首选 userQuestions）
- Q30 / Q31 / Q35 — localhost 错路径 → DSH 原生 UI → DSH 0.1.2 官方 slot 与认证连接层
- Q36 / Q37 / Q39 / Q40 / Q41 / Q42 / Q43 — 案件与运行状态分层、律师决策门、finding 决策词汇、工作台交互粒度、批注交付分层、分析上下文和真实批注 DOM

**DSH harness 适配**
- Q17 / Q18 / Q21 — 状态写盘、异步 spawn、integrity 不自建回滚
- Q26 / Q27 / Q28 — analyze 必填 summary、re-analyze 状态门、force_edit 授权
- Q29 — compactUndefinedDeep 适配 lossless JSON
- Q34 / Q35 / Q38 / Q40 / Q42 — DSH 会话接线、HMR 边界、0.1.2 工作台迁移、专属 Agent 驱动、可观察运行面与分析上下文注入

**作用域与命名**
- Q1 / Q5 / Q6 / Q7 / Q9 / Q10 / Q11 — 用户、仓库、scope、GitHub 用户名
- Q2 / Q3 / Q4 — 核心交互能力 5 项 + 排除项

**脚本与产物**
- Q19 / Q24 — 进度粒度、归档位置
- Q45 — vitest 状态污染根治落在测试层三件套（hookTimeout / TMPDIR 隔离断言 / claude 工作流限定）
- Q46 — vitest 2048MiB 堆顶护栏下沉到 forks worker 启动参数（覆盖 ORCA 恢复等裸入口）
