# 当前任务

## CC-V4-R01：`docx-preview` 批注 DOM 与导航策略验证

- 状态：已并入 CC-V4-005（派发前收敛）
- 目标：针对当前锁定的 `docx-preview@0.4.0` 和真实 DOCX fixture，确认 `renderComments` 输出、批注正文关联、稳定选择器、滚动/高亮方案与无法定位时的降级策略。
- 边界：只读源码、依赖和 fixture；结果写入 worker Session Context，不修改产品代码或共享文档。
- 验收：给 CC-V4-003 提供可直接执行的 DOM 断言、交互步骤、风险清单和推荐实现，不以记忆推断第三方库行为。

## CC-V4-R02：工作台独立浏览器验收合同

- 状态：已并入 CC-V4-006 与 CC-V4-004（派发前收敛）
- 目标：基于现有 DSH Web 验收入口和样例，定义明暗主题、桌面/窄屏、对话框焦点、批注双向导航的候选绑定验收合同。
- 边界：只读 DSH 与插件现状；结果写入 worker Session Context，不启动长期服务、不修改产品代码或共享文档。
- 验收：列出可机械断言的 DOM/尺寸/焦点条件、真实用户路径、证据文件命名与清理要求，供 CC-V4-004 reviewer 使用。

## CC-V4-001：工作台视觉与窄屏交互统一

- 状态：实现完成并进入集成分支；待 CC-V4-004 真实浏览器验收
- 基线：`6c52c76`（律师决策工作台已验收）
- 目标：让工作台在 DSH 明暗主题与桌面/窄屏布局中保持一致、可读、可操作，并补齐对话框键盘焦点管理。
- 文件边界：`src/client/Workbench.tsx`、`src/client/index.tsx` 与现有 client 测试；typed locale 模块由 CC-V4-006 单独交付；不修改 Host、协议、DOCX 解析或 Python。
- 验收：夜间模式不再出现浅色孤岛或低对比文本；窄屏不隐藏案件操作入口；对话框具备初始焦点、Tab 环与关闭后焦点归还；UI 文案由 typed locale 字典拥有；client typecheck、聚焦测试与 build 通过。
- 证据：`420c73a` 实现壳层，`acea9f7` 修复 typed locale 集成后通过；最终集成分支的 client typecheck、完整测试 256/256 和 build 通过。

## CC-V4-002：批注定位锚点模型

- 状态：已由 CC-V4-003 消费并进入集成分支；待 CC-V4-004 真实浏览器验收
- 基线：`6c52c76`（律师决策工作台已验收）
- 目标：Host/协议层为 DOCX 批注和简版文档渲染提供稳定、可持久传输的定位信息，供工作台执行双向跳转与高亮。
- 文件边界：`src/docx-view.ts`、`src/workbench-protocol.ts`、`src/host-api.ts` 及其对应测试；不修改 `src/client/Workbench.tsx`、共享文档或 Python。
- 验收：每条批注具有稳定 id 和可解析锚点；正文输出存在可选择的对应标记；无法精确定位时保留可解释降级信息；协议/RPC 兼容简单视图与 Word 预览；聚焦测试与 build 通过。
- 证据：`35a342e`、`b48ba5d`、`1d2868a`、`d1c909d`；最终集成分支 docx-view、host-api、完整测试 256/256 和 build 通过。

## CC-V4-005：客户端批注导航控制器

- 状态：已由 CC-V4-003 接线并进入集成分支；待 CC-V4-004 真实浏览器验收
- 基线：`6434e82`
- 目标：在独立纯客户端模块中实现稳定选择器、正文定位、滚动/聚焦、短暂高亮清理和未命中结果，供 CC-V4-003 接入工作台。
- 文件边界：只新增 `src/client/comment-navigation.ts` 与 `tests/comment-navigation.spec.ts`；不修改 Workbench、Host、协议、依赖或共享文档。
- 验收：无需真实浏览器即可确定性验证找到/未找到锚点、特殊 id 转义、滚动与高亮生命周期；client typecheck、聚焦测试与 build 通过。
- 证据：`e30efb8` 与 `d1c909d`；最终集成分支导航控制器、client typecheck、完整测试 256/256 和 build 通过。

## CC-V4-006：typed locale 工作台词典

- 状态：实现完成并进入集成分支；待 CC-V4-004 双语言浏览器验收
- 基线：`6434e82`
- 目标：把当前工作台产品文案整理为类型完整的中英文 locale 字典与取值 API，为 CC-V4-001/003 的最终接线提供单一来源。
- 文件边界：只新增 `src/client/locale.ts` 与 `tests/workbench-locale.spec.ts`；不修改 Workbench、Host、协议、依赖或共享文档。
- 验收：两种 locale 的键集合编译期/运行时一致，无空翻译，未知 locale 确定性回退；client typecheck、聚焦测试与 build 通过。
- 证据：`574b56d`、`acea9f7` 与 `b48ba5d`；最终集成分支 locale、client typecheck、完整测试 256/256 和 build 通过。

## CC-V4-003：批注双向导航与 Word 原生观感

- 状态：实现完成并进入集成分支；待 CC-V4-004 真实浏览器验收
- 目标：工作台启用 `docx-preview` 批注渲染，将侧栏批注与正文锚点连接；点击批注滚动到正文并短暂高亮，正文批注标记反向选中侧栏条目，同时兼顾键盘与降级路径。
- 验收：真实含批注 DOCX 在简单视图和 Word 预览中均可完成可见的定位反馈；未找到锚点时不误跳且给出状态；浏览器实操与截图/GIF 绑定候选提交。
- 证据：`b48ba5d`、`1d2868a`、`d1c909d`、`a6ba439`、`21bbc8a`；真实浏览器发现 run-style `.docx_commentreference` 后补齐相邻范围标记恢复 id、可见键盘入口与双向导航；最终集成分支完整测试 256/256、client typecheck 和 build 通过。

## CC-V4-007：专属 Agent 分析上下文闭环

- 状态：实现完成并进入集成分支；待 CC-V4-004 真实模型浏览器验收
- 目标：使只装载 7 个合同领域工具的 DSH Web 专属 Agent 获得确定的合同正文和最小审查指导，不依赖未装载的文件、shell 或 skill 工具。
- 验收：Host 从受信任的 session 合同路径抽取可见正文并有界注入；合同伪造数据边界被隔离；提取失败、空正文和无效配置 fail loud；交付提示不携带正文；真实模型能够从工作台进入 plan_ready。
- 证据：`ed6233a`、`47272ed`；新增 OOXML 正文抽取、提示边界与截断、失败状态、配置范围和 analyze 工具说明测试；最终集成分支完整测试 256/256、typecheck 和 build 通过。

## CC-V4-004：独立验收与项目收口

- 状态：进行中；静态门禁已通过，待最终候选的真实 DSH Web、GUI GIF 与独立 reviewer 结论
- 目标：由未参与实现的 reviewer 对暗色、窄屏、焦点、批注跳转、回归测试和文档一致性做独立验收；PM 只在通过后写回 CHANGELOG、ARCHITECTURE、ROADMAP 与本任务源。
- 验收：typecheck、完整测试、build、更新后的 dsh-plugin-lint、真实 DSH Web 浏览器流程和 GUI GIF 均绑定最终候选；未通过项退回原 worker 修复。

## CC-V3-001：律师决策工作台闭环

- 状态：已完成
- 分支：`feat/lawyer-decision-workbench`
- 基线：`69e1886`（DSH 0.1.2 工作台迁移已验收）
- 目标：工作台直接驱动专属 DSH Agent 完成风险分析，在生成修订版前强制暂停，由律师逐项决定处理方式，确认后恢复同一 Agent 完成修订与交付。

### 范围

- 建案后由工作台创建或恢复专属 DSH Agent，不再要求用户回聊天窗口补一句指令。
- 审查计划生成后进入强制律师决策门；未批准的计划不能调用 `contract_copilot_apply`。
- 每项 finding 支持“按建议处理、仅批注、仅意见书、忽略”，并可调整风险等级、填写律师备注。
- 决策保存为可审计历史；重新 analyze 或改变计划后，旧批准自动失效。
- 工作台展示 Agent 运行、等待律师、失败、可重试和已交付状态，并提供取消操作。

### 非目标

- 不修改 Contract Copilot Python 脚本。
- 不实现多人权限、批量合同队列或跨设备任务调度。
- 不把 DSH `workflowEngine` 当作案件持久层；当前 workflow run 不支持后台收集与断点恢复。
- 不展示模型隐式推理内容。

### 验收

- [x] 设计、决策、架构、README、CHANGELOG 与任务状态一致。
- [x] 工作台建案后能够直接启动专属 Agent，并在 `plan_ready` 后停在“等待律师决策”。
- [x] 任一 finding 未决定时，批准操作失败；计划未批准时，Agent 或手工 tool 调用 `apply` 均失败。
- [x] 四种决定及风险等级调整能确定性投影到最终 `review-plan.json`，并保留追加式审计记录。
- [x] 计划变化后旧批准失效；批准后文件被外部改写时 `apply` 拒绝执行。
- [x] 刷新工作台和重启 DSH 后能够从业务 session 与 DSH session 恢复。
- [x] 单元测试、真实 Python 集成测试、build、dsh-plugin-lint 和 tarball 安装通过。
- [x] 从真实候选启动 DSH Web，完成建案、分析、逐项决策、修订、交付的浏览器验收并保留截图证据。

### 执行证据

- 2026-09-04：用户确认采用“分析后强制暂停、律师逐项决策、确认后才能修订交付”的交互模型。
- 2026-09-04：DSH 0.1.2 接口核对完成；选择 `ctx.agents.create/resume` 驱动专属 Agent，排除 foreground-only、无 journaling 的 `workflowEngine` 作为案件主流程。
- 2026-09-04：律师计划批准领域层完成；17 项聚焦测试通过，覆盖四种决定、审计保留、漏项、旧 hash、文件篡改、Host RPC 和 Client 调用。
- 2026-09-04：案件专属 Agent 编排完成；25 项聚焦测试通过，覆盖 create/resume、当前默认模型选择、重复命令、首次创建失败重试、取消、真实 idle、Host RPC 和 Client 命令。
- 2026-09-04：客户端 typecheck、Node build、完整客户端 bundle 与 `pnpm peers check` 通过；DSH 依赖族统一为 `0.1.2-rc.1`。
- 2026-09-04：五阶段律师决策界面完成；13 个文件 103 项完整测试、真实 Python spawn、Node/Client build 和 peer 校验通过，新增空计划、漏项、字段规范化、稳定状态提示、工作台 session 精确复用和直接 apply fail-closed 覆盖。
- 2026-09-04：真实 DSH Web 建案验收发现前置信息自由文本框缺少辅助标签；已用问题正文补齐 `aria-label`，随后随候选重建复验通过。
- 2026-09-04：候选 `e287ee2` 从 tarball 安装进隔离 DSH Web profile；自由文本框辅助标签复验通过。
- 2026-09-04：脱敏合成合同经本地 replay provider 跑通专属 Agent 分析、律师逐项批准、真实 Python apply、finalize 与双 DOCX 交付；批准前按钮禁用，决定后解锁。
- 2026-09-04：DSH 重启后恢复 `delivered`、R001 决定、批准锁、修订预览和两个下载入口；验收截图及正式 dsh-plugin-lint 报告见 `docs/acceptance/2026-09-04-lawyer-decision-workbench.md`。
- 2026-09-04：浏览器发现交付完成后临时运行提示未清除；最终候选已按持久 automation 稳定状态收敛提示并复验，运行中可见临时提示，到达 `delivered` 后 `role=status` 为空。

## CC-DOC-001：固化 DSH 工作台交互原则

- 状态：已完成
- 目标：把“DSH 的 Agent、Session、Tools 和状态事件支撑细粒度工作台交互”的判断写入项目权威上下文，并明确不展示模型隐藏思维链。
- 验收：README 提供产品说明；ARCHITECTURE 记录运行面到工作台职责的映射；DECISIONS 记录约束与重新评估条件；CHANGELOG 留痕。
- 证据：2026-09-04 新增 ARCHITECTURE §2.1 与 DECISIONS Q40，并同步 README 和 CHANGELOG。
