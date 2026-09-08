# 当前任务

## CC-V5：工作台质量加固波次

- 状态：进行中；Wave 1 已派发，两个交付已进入 PR，锚点修复按独立审查意见返修
- 默认主干：`main`
- 集成分支：`feat-v5-quality-hardening`
- 集成目标：Wave 1 worker PR 均以 `feat-v5-quality-hardening` 为 base；里程碑完成后由该分支向 `main` 提最终 PR
- 集成所有者：当前 PM；固定 Worktree 为 `/Users/maoking/orca/workspaces/dsh-contract-copilot/feat-v5-quality-hardening`
- 分支生命周期：集成分支 `long-lived`（仅本里程碑期间保留），worker 分支 `ephemeral-worker`
- 里程碑：修复批注锚点精度边界，建立 DSH 主题 token 漂移门禁，并把真实 `force_edit` 修订产物接入可重复验收；全部交付须绑定独立 reviewer 与最终候选验证
- 同步策略：本波冻结 `origin/main` 的 `cddba4415057533a0a1b3fa77e091c968c65af26`；存在 open worker PR 时不移动集成基线

### CC-V5-001：异常 OOXML 批注锚点精度修复

- 状态：PR #2 返修中；首个提交 `d2ad698` 已通过交付价值门，但独立审查拒绝异常范围仍输出可导航空/截断锚点，修复 Task `CC-V5-001-R1` 已重新派给原 Worker
- 目标：当渲染器在计划终点前因异常 OOXML 提前停止时，不得仅因段尾补闭合了部分范围就把批注报告为 `exact`；精确状态必须证明真实终点已被消费。
- 文件边界：`src/docx-view.ts`、`tests/docx-view.spec.ts`；不修改抽取进程、Host、Client、协议或共享文档。
- 验收：新增失败回归覆盖“起点已输出、终点未消费、段尾被迫闭合”的路径；此路径稳定降级，正常范围与嵌套范围继续为 `exact`；聚焦测试、完整测试和 build 通过。
- 审查补充验收：未真实消费计划终点时，HTML 不得包含对应 `data-cc-anchor`；否则简单视图仍会把 fallback 范围当成成功导航目标。

### CC-V5-002：DSH 主题 token 运行时漂移门禁

- 状态：Worker 运行中；前两个 GLM 通道因 429/网络重试未产生代码并已精确清理，当前以独立直连 GLM Flash 通道在新分支重派
- 目标：把工作台主题 token 的真实性从源码内自维护 allowlist 提升为对锁定 DSH 客户端包已发布工件的机械核对，防止 DSH 升级后夜间模式因 token 消失而静默退回错误颜色。
- 文件边界：新增 `scripts/verify-dsh-theme-tokens.mjs` 及其测试，可按需要调整 `tests/workbench-client.spec.ts`；不修改 `src/client/Workbench.tsx` 的视觉设计、不改依赖版本或锁文件。
- 验收：校验器从当前安装的 `@deepseek-ai/dsh-client-ui-*` 已发布工件提取 token，证明 `DSH_THEME_TOKENS` 全部存在；不存在 token 的负例 fail closed；聚焦测试、client typecheck 和 build 通过。

### CC-V5-003：`force_edit` 修订产物可重复验收

- 状态：R1–R5 已收束；`8871747` 为行为/代码验证候选，后续提交仅补随行文档且不改变已验证代码与测试结果；PR #3 `OPEN / MERGEABLE / CLEAN`
- 目标：提供可重复工程验收资产，用合成合同和带 `force_edit: true` 的计划生成真实修订 DOCX，并证明工作台数据面输出可见的 `cc-ins`/`cc-del` 修订标记，为后续真实浏览器样例提供固定输入。
- 文件边界：新增独立 fixture/集成测试或验收脚本，优先位于 `tests/` 与 `scripts/acceptance/`；不修改 Python 脚本、DOCX 渲染器、Host 生产代码、Client 生产代码或共享文档。
- 验收：真实 Python CLI 生成物同时含 OOXML `w:ins`/`w:del`，再经现有工作台 document 路径投影为 `cc-ins`/`cc-del`；缺少依赖时明确 skip 原因，不能假绿；聚焦测试与完整测试通过。
- 当前证据：真实 CLI 与 document RPC 集成测试 16/16、完整测试 309/309、build 与 `git diff --check` 通过；父存活与父先退出负控均在后代独立 ready marker 后触发 abort/timeout，唯一 marker 枚举确认零残留；正常绿色路径同样零残留。Windows process-tree 语义 `NOT_VERIFIED`；全局 safe-push 身份门对历史混合作者 fail-closed（未改写既有提交）。验收脚本支持保留生成物作为后续真实浏览器样例输入。

### CC-V5-004：DOCX 抽取异步化

- 状态：已登记，等待 Wave 2；与 CC-V5-001 共享 `src/docx-view.ts`，本波不并行派发
- 目标：将预览和 Agent 正文注入共用的 `spawnSync` 抽取改为有界异步子进程，避免大 DOCX 或慢 Python 冻结 DSH Host 事件循环。
- 文件边界：`src/docx-view.ts`、`src/host-api.ts`、`src/agent-coordinator.ts`、`src/config.ts`、`src/index.ts` 及对应抽取、Host、分析和配置测试；不修改 Python、Client、工作台协议、apply/finalize 工具链或依赖。
- 验收：Host RPC 与分析派发均 await 抽取；Connection/request signal 可取消子进程；超时、非零退出、输出过大和 malformed output 路径明确；事件循环可在抽取进行时继续调度；取消不误标合同损坏，分析失败不创建 Agent；`rg -n 'spawnSync' src` 无命中；完整测试和 build 通过。

### CC-V5-005：项目级文档体检配置

- 状态：已登记，等待后续维护波次
- 目标：为本项目提供匹配 `status/TASKS.md`、`[Unreleased]` CHANGELOG 和跨仓链接的 doc-curator 配置，替代当前误用 FaroPDF 配置产生的假 hard/adaptive 信号。
- 验收：历史范围检查不再误报任务源与 CHANGELOG 结构；真实断链负例仍 fail closed；不改变现有文档职责。

### CC-V5-010：窄屏页签键盘语义与 commandBusy 统一关闭门

- 状态：已交付待集成；分支 `cc-v5-modal-tabs-ux` 已 safe-push，等待 PM 建 PR（base `feat-v5-quality-hardening`）
- 目标：窄屏页签遵循完整 tab 键盘语义——roving tabindex 仅活动页签为 0，Arrow/Home/End 切换 pane 的同时把真实焦点迁移到新活动页签；命令执行中 Escape、遮罩点击、关闭按钮统一不得卸载工作台（关闭按钮以 `aria-disabled` 声明状态），空闲时三个入口都关闭并归还 launcher 焦点。
- 文件边界：`src/client/Workbench.tsx`、`tests/workbench-client.spec.ts`、`tests/workbench-session-switch.client.spec.tsx`；文档同步 `CHANGELOG.md`、`status/TASKS.md`。
- 验收：真实组件行为回归（最小 React 挂载器，非源码字符串）覆盖 roving 快照、ArrowLeft/Right/Home/End 焦点迁移、点击激活语义、busy 三入口不卸载且关闭按钮状态可感知、空闲三入口关闭与 launcher 焦点归还；聚焦测试、client typecheck、build、`git diff --check` 通过。
- 证据：先写回归后实现，4 个新行为用例在实现前按预期失败（tabIndex 缺失、无焦点迁移、End 不切换、无 aria-disabled 门）；实现后聚焦 vitest 63/63、全量 294/294（本任务新增 7 项）、build 通过、`git diff --check` 干净。`dsh-plugin-lint` 报 `10 FAIL / 3 WARN / 2 NOT_VERIFIED`，经 stash 对比在干净基线 `64a23c6` 上完全一致——均为新版 lint harness 对 `tsdown.client.config.ts` external 声明与主题 harness 的既有要求，非本任务引入；涉事文件超出本任务文件边界，留待 PM 在集成侧处置。

### CC-V5-008-R1：pre-step 进度注入按事件 Agent 精确关联案件

- 状态：已交付待独立审查；分支 `codex-cc-agent-progress-isolation-0908` 自集成分支 `35527c2` 起步，PR base `feat-v5-quality-hardening`（对应 AUDIT-2026-09-08 P1 项）
- 目标：pre-step 不再读 `store.current()`，改为按触发事件的 `agent.id` 精确匹配 `dshSessionId` 关联的唯一案件；无关联或关联歧义的 Agent 不注入、不消耗任何案件的 `lastInjectedCounter`；沿用 DSH 可记录消息机制（plugin snapshot user message），不引入隐藏模型状态
- 文件边界：`src/index.ts`、`src/session.ts`、新增 `tests/agent-progress-isolation.spec.ts`（`src/progress.ts` 经核无需改动）；随行 `status/TASKS.md`、`CHANGELOG.md`、`docs/ARCHITECTURE.md`
- 验收：新增 6 项用例全部经 `apply()` 实际注册的 pre-step listener 驱动——A/B Agent 交错各自注入且不互耗水位、无关联不注入（`setCurrent` 指向 pending 案件也不回退）、next 拒绝/turn 中止不消耗水位且恢复后正常注入、重复步幂等且内容反映最新状态、重复关联同一 DSH session 确定性不误注入、冷启动重建 SessionStore 后 resume 的 Agent 按磁盘关联注入且水位落盘；关联命中 0 个或多于 1 个一律返回 undefined（确定性、宁可不注入不误注入）
- 证据（2026-09-08）：先写测试后实现，新用例在实现前按预期失败（旧实现无 dshSessionId 关联路径）；scoped `vitest run tests/agent-progress-isolation.spec.ts tests/progress.spec.ts tests/session.spec.ts --bail 1` 30/30 通过、`tsc -p tsconfig.json --noEmit` 通过、`git diff --check` 干净。多 Agent 真实 DSH Web 路径 `NOT_VERIFIED`，留待 PM 集成验收

## CC-V4-010：简版文档导航根接线（CC-V4-004 验收退回）

- 状态：已完成；真实浏览器复验与 CC-V4-004 独立 reviewer 合并门均通过
- 基线：`bda0e24`
- 目标：把简版文档 JSX 挂载点绑定到 `simpleHolder`；此前 `simpleHolder.current` 恒为 `null`，导航 effect 在定位前静默返回。
- 文件边界：`src/client/Workbench.tsx`、`tests/workbench-client.spec.ts`。
- 验收：Word 与简版 holder ref 均有源码接线回归；client typecheck、完整测试和 build 通过；真实 DSH Web 简版侧栏点击命中 `data-cc-anchor` 并出现 `cc-comment-flash`。
- 证据：Worker 提交 `a084d4d`，集成提交 `cfcfb77`；266/266 测试通过；价值交付后门禁接受；真实浏览器命中 `SPAN[data-cc-anchor]`，高亮为琥珀底色及描边。

## CC-V4-009：跨案件与同案件导航生命周期（CC-V4-004 验收退回）

- 状态：已完成；真实浏览器复验与 CC-V4-004 独立 reviewer 合并门均通过
- 目标：A→B→A 返回旧案件时复位已处理导航水位；重复激活当前案件保持幂等，不清空仍有效状态。
- 文件边界：`src/client/Workbench.tsx`、`tests/workbench-client.spec.ts`。
- 验收：导航水位按案件生命周期复位，同一案件重复激活为 no-op；真实 DSH Web 两条路径均可再次定位并高亮正文。
- 证据：集成提交 `e24a9a5`、`bda0e24`；265/265 阶段测试通过，最终 266/266；两项价值交付后门禁均接受；真实浏览器 A→B→A 与同案件重复点击后均重新出现 `cc-comment-flash`。

## CC-V4-008：简单视图批注前向导航修复（CC-V4-004 验收退回）

- 状态：已完成；真实浏览器复验与 CC-V4-004 独立 reviewer 合并门均通过
- 基线：`4a31b5c`
- 目标：修复简单视图点击侧栏批注必未命中的缺陷——Workbench 的导航效果把 `CommentNavigationInput.options`（简单视图 `data-cc-anchor` 打点属性）丢在共享 navigator 之外，属性策略按默认 `data-cc-comment-id` 寻址必然落空，每次跳转都报 `id-not-found`；同时补齐 `.cc-comment-flash` 高亮 CSS（控制器一直输出该 class，但从未有规则渲染，两套视图的高亮均不可见）。
- 文件边界：`src/client/comment-navigation.ts`、`src/client/Workbench.tsx`、`tests/comment-navigation.spec.ts`、`tests/workbench-client.spec.ts`；不修改 Host、协议、DOCX 解析或 Python。
- 验收：`CommentNavigator.navigate` 支持逐次视图绑定选项（逐键覆盖创建时选项）并由 Workbench 经 `executeNavigationRequest` 接缝传递；高亮规则覆盖 simple 与 word 两个文档容器且限定在文档画布内；client typecheck、全量测试与 build 通过；dsh-plugin-lint 机械层 0 FAIL。
- 证据：集成提交 `9f65ed7`；新增 6 项测试（navigator 逐次选项契约含旧缺陷回归对照、executeNavigationRequest 接线契约、flash CSS 覆盖与可见性），阶段基线 262/262、最终基线 266/266，typecheck/build 通过；真实 DSH Web 的 Word 与简版前向定位、高亮和反向选择均复验通过。

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

- 状态：已完成；集成、真实浏览器验收与独立 reviewer 合并门均通过
- 基线：`6c52c76`（律师决策工作台已验收）
- 目标：让工作台在 DSH 明暗主题与桌面/窄屏布局中保持一致、可读、可操作，并补齐对话框键盘焦点管理。
- 文件边界：`src/client/Workbench.tsx`、`src/client/index.tsx` 与现有 client 测试；typed locale 模块由 CC-V4-006 单独交付；不修改 Host、协议、DOCX 解析或 Python。
- 验收：夜间模式不再出现浅色孤岛或低对比文本；窄屏不隐藏案件操作入口；对话框具备初始焦点、Tab 环与关闭后焦点归还；UI 文案由 typed locale 字典拥有；client typecheck、聚焦测试与 build 通过。
- 证据：`420c73a` 实现壳层，`acea9f7` 修复 typed locale 集成后通过；最终集成分支的 client typecheck、完整测试 266/266 和 build 通过；真实浏览器通过明暗主题、窄屏三页签和 Escape 焦点归还。

## CC-V4-002：批注定位锚点模型

- 状态：已完成；已由 CC-V4-003 消费并通过真实浏览器验收与独立 reviewer 合并门
- 基线：`6c52c76`（律师决策工作台已验收）
- 目标：Host/协议层为 DOCX 批注和简版文档渲染提供稳定、可持久传输的定位信息，供工作台执行双向跳转与高亮。
- 文件边界：`src/docx-view.ts`、`src/workbench-protocol.ts`、`src/host-api.ts` 及其对应测试；不修改 `src/client/Workbench.tsx`、共享文档或 Python。
- 验收：每条批注具有稳定 id 和可解析锚点；正文输出存在可选择的对应标记；无法精确定位时保留可解释降级信息；协议/RPC 兼容简单视图与 Word 预览；聚焦测试与 build 通过。
- 证据：`35a342e`、`b48ba5d`、`1d2868a`、`d1c909d`；最终集成分支 docx-view、host-api、完整测试 266/266 和 build 通过。

## CC-V4-005：客户端批注导航控制器

- 状态：已完成；已由 CC-V4-003 接线并通过真实浏览器验收与独立 reviewer 合并门
- 基线：`6434e82`
- 目标：在独立纯客户端模块中实现稳定选择器、正文定位、滚动/聚焦、短暂高亮清理和未命中结果，供 CC-V4-003 接入工作台。
- 文件边界：只新增 `src/client/comment-navigation.ts` 与 `tests/comment-navigation.spec.ts`；不修改 Workbench、Host、协议、依赖或共享文档。
- 验收：无需真实浏览器即可确定性验证找到/未找到锚点、特殊 id 转义、滚动与高亮生命周期；client typecheck、聚焦测试与 build 通过。
- 证据：`e30efb8` 与 `d1c909d`；最终集成分支导航控制器、client typecheck、完整测试 266/266 和 build 通过。

## CC-V4-006：typed locale 工作台词典

- 状态：已完成；集成、双语言浏览器验收与独立 reviewer 合并门均通过
- 基线：`6434e82`
- 目标：把当前工作台产品文案整理为类型完整的中英文 locale 字典与取值 API，为 CC-V4-001/003 的最终接线提供单一来源。
- 文件边界：只新增 `src/client/locale.ts` 与 `tests/workbench-locale.spec.ts`；不修改 Workbench、Host、协议、依赖或共享文档。
- 验收：两种 locale 的键集合编译期/运行时一致，无空翻译，未知 locale 确定性回退；client typecheck、聚焦测试与 build 通过。
- 证据：`574b56d`、`acea9f7` 与 `b48ba5d`；最终集成分支 locale、client typecheck、完整测试 266/266 和 build 通过。

## CC-V4-003：批注双向导航与 Word 原生观感

- 状态：已完成；集成、真实浏览器验收与独立 reviewer 合并门均通过
- 目标：工作台启用 `docx-preview` 批注渲染，将侧栏批注与正文锚点连接；点击批注滚动到正文并短暂高亮，正文批注标记反向选中侧栏条目，同时兼顾键盘与降级路径。
- 验收：真实含批注 DOCX 在简单视图和 Word 预览中均可完成可见的定位反馈；未找到锚点时不误跳且给出状态；浏览器实操与截图/GIF 绑定候选提交。
- 证据：`b48ba5d`、`1d2868a`、`d1c909d`、`a6ba439`、`21bbc8a`、`9f65ed7`、`e24a9a5`、`bda0e24`、`cfcfb77`；真实浏览器发现并补齐 run-style Word 标记、简版导航选项、可见高亮、跨案件水位和简版 holder 接线；最终集成分支完整测试 266/266、client typecheck 和 build 通过。

## CC-V4-007：专属 Agent 分析上下文闭环

- 状态：已完成；真实模型浏览器验收、最终候选绑定与独立 reviewer 合并门均通过
- 目标：使只装载 7 个合同领域工具的 DSH Web 专属 Agent 获得确定的合同正文和最小审查指导，不依赖未装载的文件、shell 或 skill 工具。
- 验收：Host 从受信任的 session 合同路径抽取可见正文并有界注入；合同伪造数据边界被隔离；提取失败、空正文和无效配置 fail loud；交付提示不携带正文；真实模型能够从工作台进入 plan_ready。
- 证据：`ed6233a`、`47272ed`；新增 OOXML 正文抽取、提示边界与截断、失败状态、配置范围和 analyze 工具说明测试；隔离 DSH 0.1.2-rc.1 Web profile 使用真实 `deepseek-v4-flash` 从合成合同生成 8 项 finding，并停在 plan_ready / waiting-decisions；最终集成分支完整测试 266/266、typecheck 和 build 通过。

## CC-V4-004：独立验收与项目收口

- 状态：已完成；代码、静态门禁、真实 DSH Web、GUI GIF 与独立 reviewer 合并门均通过
- 目标：由未参与实现的 reviewer 对暗色、窄屏、焦点、批注跳转、回归测试和文档一致性做独立验收；PM 只在通过后写回 CHANGELOG、ARCHITECTURE、ROADMAP 与本任务源。
- 验收：typecheck、完整测试、build、更新后的 dsh-plugin-lint、真实 DSH Web 浏览器流程和 GUI GIF 均绑定最终候选；未通过项退回原 worker 修复。
- 当前证据：候选 `cfcfb77` 的 client typecheck、16 文件 266/266 测试、build 和 worker 价值交付后门禁通过；浏览器验收包 SHA-256 `6b96c0f6d7334b13934c339959e030ab48c3684f9e29b5c6062aa27d9f87a198` 安装到 DSH `0.1.2-rc.1`（`76fda729`）隔离 profile，明暗主题、窄屏、焦点、Word/简版双向导航、A→B→A 与同案件重复激活均通过真实浏览器复验。收口重打包 SHA-256 `713d73025ac3e243e7fc29df6e9a34e499926a9dd15ec2c3d29457c98a8835d1`，除 README 状态外与浏览器验收包逐文件一致。GUI GIF SHA-256 为 `3f19a70ea655b5a1f1969349bd309957122cb3b63d578779c4549009c068aace`；未参与实现的 GLM reviewer 在 PR 头 `cdcbbcca69dbaff768d98fe450f9a86ba7fa6ca2` 给出 `ACCEPT`，review-acceptance 与 merge-gate 结构化门禁均通过。正式证据见 `docs/acceptance/2026-09-05-workbench-ux-hardening.md`。

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
