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

## Q31：v2 交付形态——DSH 原生 client-modules + ui-slots（2026-08-19，**当前路线**）

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

---

## 决策索引（按主题）

**产品形态**
- Q22 / Q23 / Q25 — 范围边界（起草排除、复核组合覆盖、ask 交互首选 userQuestions）
- Q30 / Q31 — v2 形态：localhost 错路径 → DSH 原生 client-modules + ui-slots

**DSH harness 适配**
- Q17 / Q18 / Q21 — 状态写盘、异步 spawn、integrity 不自建回滚
- Q26 / Q27 / Q28 — analyze 必填 summary、re-analyze 状态门、force_edit 授权
- Q29 — compactUndefinedDeep 适配 lossless JSON

**作用域与命名**
- Q1 / Q5 / Q6 / Q7 / Q9 / Q10 / Q11 — 用户、仓库、scope、GitHub 用户名
- Q2 / Q3 / Q4 — 核心交互能力 5 项 + 排除项

**脚本与产物**
- Q19 / Q24 — 进度粒度、归档位置

## Q35：DSH 0.1.2 工作台迁移边界（2026-09-04）

| 字段 | 内容 |
|---|---|
| **结论** | 保留 Python CLI、7 个 tool 与 `SessionStore`；把 Web 外壳迁移到 `sidebar.footer.action`、Connection 认证 RPC、认证事件流与精确下载路由。工作台增加四阶段进度和最近状态跃迁。 |
| **理由** | 旧插件在 DSH 0.1.2 仍可启动，但依赖已删除的 `dsh-client-runtime`、轮询非公开 sidebar DOM，且 `/contract-copilot/*` 在无浏览器会话 token 时仍返回数据。核心在新版依赖下构建和 69 项测试均通过，无需整体重写。 |
| **影响** | Client 组件通过独立 API 适配器访问 Host；headless 保留原有 agent tool 行为；旧的 `workbench.port/autoOpen/host` 配置退出。 |
| **何时重新评估** | 需要工作台直接创建后台 Agent、逐 finding 实时进度或跨插件消费 ContractSession 时，评估 Service Definition + Typert Remote。 |
