# 变更日志

## [0.4.0] — 2026-09-29 DSH 运行时对齐 0.1.7-rc.2

### Changed

- `@deepseek-ai/dsh-*` 依赖（dependencies 与 devDependencies）由 0.1.2-rc.1 全量钉定到 **0.1.7-rc.2**，与真实安装的 DSH Desktop 2.0.15 内嵌运行时一致，消除双版本漂移；cordis devDep 对齐内嵌 4.0.4（peer `^4.0.2` 不变）。移除 devDep `@deepseek-ai/dsh-code-runtime`（npm 无该版本分发且源码零引用）。
- 消息 source 适配 0.1.7 的 merge-extensible 模型：上游移除共享 `kind: 'plugin'`，新增 `src/message-source.ts` 以声明合并注册本插件自有 kind **`contract-copilot`**（沿用 dsh-llm `ContextFormed` mixin，`form: 'snapshot' + sections` 形状与旧 plugin kind 等价）；pre-step 进度注入与 Agent followup 调用点同步改写。
- `connection.fetch.register` 补 0.1.7 必填字段：工作台 events / download 两条 GET/HEAD 路由显式 `requestBody: 'buffered'`。
- 版本 0.3.0 → 0.4.0（不占用旧 README 历史描述中从未发布的 v0.3.1 语义）。验收记录见 `docs/acceptance/2026-09-29-runtime-0.1.7-rc.2-alignment.md`（typecheck×2 / build / vitest 267/267 / 版本匹配 lint 0 FAIL；真实桌面装载 NOT_VERIFIED）。

## 2026-09-29 Repository integration

- 本副本以完整历史 subtree 纳入 dsh-plugins；原 main 提交、分支历史与未提交改动保全。补充新的任务与同步入口，产品源码、锁定依赖、版本与 Python 行为不变。DSH 0.2 Desktop 适配待 CC-DSH-002 验收。

本文件记录本仓库已交付的用户可见变化。

## [Unreleased] — 推进中

### Fixed（2026-09-10，main 输出收集保尾上限）

- apply 的 Python CLI bridge（`src/python-bridge.ts` `runApplyCli`）子进程 stdout/stderr 收集改为每流独立、UTF-8 字节计量、保尾的 8MiB 上限：超限后继续排空管道，保留的是最新尾部——判类标记（完整性失败块/「存在失败项」都是 `SystemExit(1)` 前最后写入 stderr 的内容）与 `parseStdout` 的收尾 summary 行（产物路径/执行统计）在真实截断后仍存活，分类与产物解析不因超限降级；取消、进程树 TERM/KILL、forced settle 语义不变。此前保头截断在超限时恰好丢掉这些尾部标记（Q46 审查 F2）
- 新增真实超限行为测试（Q46 审查 F1）：`tests/python-bridge.integration.spec.ts` 以 fixture skillRoot + `sh` 子进程经真实管道向两流各写约 9.5MiB，证明两流独立封顶 ≤8MiB、前部 filler 被淘汰、退出前尾部标记仍驱动 `classify`/`parseStdout`；红绿证据：收集器临时改回保头方向后该测试失败（保留前部 filler、丢尾部标记），恢复保尾后 21/21 绿

### Maintenance（2026-09-10，分支与 worktree 二轮清理）

- 分支与 worktree 二轮批量清理（用户会话内确认，含 g14 树）：删除 13 个已结算/被取代 worker worktree 与 11 条本地分支 ref（worktree 18→5、本地分支 20→9），判定依据为编排 receipt 终态（g11–g13 全部 consumed/released、g14 terminal_missing 零产物）、tip 可达性（交付头经保留分支覆盖）与内容等价核验（governance-repair 树内四文件脏 diff 与已提交 `988d344` 逐字节一致）。16 个 session 证据先归档至 `.git/orchestration/cc-audit-20260908/archive-<session>/` 再删树；分支删除均按 expected-tip 绑定校验。保留：main、feat-v5（PR #4/#11 base）、`glm-cc-q46-main-tail-g12`（b4a126a 交付头）、`glm-cc-pr4-tail-cap-g12`（c086b47 PR #4 冻结候选头）、PR #11 head、governance-r2（988d344 待复审）、execution-r1（停车门冻结资产）、`ci/diagnose-force-edit-oom`（定界续接载体）、PR #4 head 同名本地 ref；远端分支全部不动（`origin/fix-cc-v5-async-docx-extraction` 为 PR #4 关联分支）。g14 recovery 凭证的 worktree:preserved 由本清理取代，恢复按 resumeConditions 新建 worktree 即可。详见 `branch-cleanup-20260910.json`。无产品代码变更。

### Maintenance（2026-09-09，PM 交接与验收状态）

- 当前 Codex 任务接任唯一 PM，完成原 GLM PM 交接并恢复 10 分钟 heartbeat；任务源补齐两份独立 review 的有效提交与证据、已完成 reviewer 的资源释放，以及合并前仍待处置的取消路径和治理续接问题。未合并或发布产品变更。
- 将取消路径 N1 纳入合并前返修并建立排队任务；补齐进度隔离独立 review 的机械验收记录，明确区分代码审查通过、云端检查缺失和真实工作台尚未验收。
- N1 返修的独立 GLM 复审通过，71 项定向测试及类型检查证据完成机械验收，已释放实现及复审 Worker 的运行资源。该结论限于冻结候选的 N1 与累计生命周期修复，完整 PR #4 和真实工作台仍待验收，尚未合并产品修复。
- 补齐 PR #4 完整源码候选验收任务，区分已验收的取消逻辑和待审的抽取、配置、Host 接线；后续仍需打包与真实工作台验证。
- 记录 PR #4 独立审查连接中断后的暂停与原会话保留策略；校正生命周期总卡的 N1 已验收状态，未将未完成审查或外部故障写作产品交付。
- 派发独立 GLM 执行 PR #11 的打包和真实多 Agent 工作台验收，并将该任务纳入 PM heartbeat；保留两项暂停会话，未将源码审查通过等同于运行时验收或产品发布。
- 明确 PR #11 验收可使用隔离的本地确定性模型服务，保留真实工作台、Agent 和持久化链路及零合同外发边界；尚未形成运行时通过结论。
- PR #11 运行时验收因脚本内额外安装与全量 skill 复制暂停，已停止对应 worker 和已识别的遗留服务、释放运行租约并暂停 heartbeat；保留证据待安全处置，不视为验收通过或产品交付。
- 用户授权继续稳定性恢复后，将 PR #11 验收拆成“安全脚本设计 → 独立审查 → 全新隔离运行”三个串行门；首个 GLM 子任务仅产出执行前脚本，不安装或启动任何运行资源。
- 首个安全脚本任务通过价值门，但 GLM 额度为 0% 时派发在零资源副作用阶段被拒；任务保持 ready，改由 heartbeat 在额度恢复后重试同一冻结合同，不绕过判停线或换用其他模型。
- GLM 额度恢复后已按原冻结合同派发安全脚本 Worker；独立 worktree、Dispatch、终端与 provider lease 身份已核对，未授予安装或启动运行时服务的权限。
- 安全脚本候选通过静态交付门并完成资源结算，随后已交给不同 Dispatch/Session 的 GLM reviewer 做只读安全审查；脚本尚未执行，PR #11 运行时仍未验收。
- 安全脚本独立复审正式 ACCEPT 并完成资源结算；随后派发新的 GLM Worker，只在冻结候选上准备 tarball、全新私有 DSH profile 与可复核 manifest。安装、manifest 复核和 runtime 启动保持串行分离，当前仍未执行脚本或形成真实工作台通过结论。
- profile 准备首轮在候选包生成后因安装命令 shell allowlist 快照缺口 fail-closed；已结算该 Worker，并以全新 Task/Dispatch 只续做私有 profile 与 manifest。资源复查同时收束两个此前遗漏的旧 unsafe runtime 孤儿进程及其回环监听器；未删除旧证据、未启动当前 runtime gate。
- 恢复 Worker 已从冻结 tarball 建立全新私有 DSH web profile，并通过实体哈希、realpath、依赖与资源零增量检查；准备者资源已结算。现由不同 GLM reviewer 只读复核 manifest 与运行前假设，脚本仍未执行。
- profile/manifest 独立复审正式 ACCEPT；Orca runtime 两次重启后由唯一 PM 恢复 generation 4 控制面，并在保全 worktree 进度的前提下并行续接三个 GLM 5.3 Flash Worker：PR #4 完整源码候选复审、治理候选恢复提交、PR #11 单次真实 runtime gate。三者均使用独立 worktree 和冻结合同，当前仅表示任务已启动，不表示产品验收或合并完成。
- Orca 随后第三次重启，三个恢复 Worker 同时失去终端且均无正式 Delivery；PM 重绑 generation 5、保全治理四文件 diff及其余工作树，并确认 runtime gate 未留下 owned 进程或指定端口监听。新 runtime 连续一个 heartbeat 周期保持 ready 后，三个 GLM Worker 已在原 worktree 有界恢复，未把控制面中断记为产品失败。
- 第四次 Orca 重启前，治理 Worker 已提交 `988d344` 并正式交付；PM 独立复跑 17 项配置测试、Host/Client noEmit 与 diff-check 均通过并结算资源，后续仍需不同 GLM reviewer。PR #4 与 runtime Worker 因控制面中断暂停；当前系统负载高于恢复阈值，各测试 worktree 同步 Q46 堆顶护栏前不再恢复重负载任务。
- 2026-09-09 晚注销风暴事故排查收口：受控复现确认治理恢复 worktree 无固有 OOM 测试（283/283 全绿，`--bail 1` + 2048 堆顶），21:22/21:52 两次 vitest worker V8 `FatalProcessOutOfMemory` 定性为负载诱导——ORCA 会话恢复路径拉起的全量 vitest 绕过了 `pnpm test` 入口的堆顶护栏（裸入口 fork worker 默认可到 ~4GB）。据此把 2048MiB 合约护栏下沉到 `vitest.config.ts` 的 `poolOptions.forks.execArgv`，任何入口跑测试每个 worker 都带 2048 顶、单 worker 爆只死自己；裸入口以临时 spec 断言 `process.execArgv` 实测生效。见 DECISIONS Q46。
- 分支与 worktree 批量清理（用户确认）：删除 11 个已收口 worker worktree 与 10 个分支 ref（worktree 22→11、本地分支 22→12），判定依据为编排 receipt 终态与 tip 可达性；各 session 证据先归档至 `.git/orchestration/cc-audit-20260908/archive-<session>/` 再删树。保留全部活跃 worker 现场、PR #4/#11 交付链分支、集成分支与远端素材分支；详见同目录 `branch-cleanup-20260909.json` 与 `status/TASKS.md` CC-V5 清理记录。无产品代码变更。
- 负载门曾连续两个 heartbeat 通过后，PM 将 Q46 的 2048MiB worker 堆顶及致命错误诊断报告配置等价同步至治理、PR #4、PR #11 runtime 三个保留 worktree，并把 Run 重绑为 generation 8；派发前负载回升至 27.86，故未启动新 Worker。三个 Q46 同步提交只改变各自验收环境，不改变冻结业务候选或合并结论。
- 负载随后再次连续两轮低于 20，派发前复查为 11.25；generation 8 已并行启动治理独立 review、PR #4 完整候选 review 和 PR #11 单次 runtime gate 三个 GLM 5.3 Flash Worker。机械额度预检的 11% 低于默认判停线，本波依据用户关于重置卡和充足额度的明确指令作限域 override；当前仅表示任务运行中，尚无 Delivery、验收或合并结论。
- Orca runtime 再次切换导致 generation 8 三个 Worker 同时 terminal_missing；精确 Dispatch 资源已释放，worktree 和证据保留。治理审查已写完整 ACCEPT 报告但缺正式 Delivery，PR #4 尚无报告，PR #11 仅复制运行脚本与 manifest 且单次 runtime 预算未消耗。Run 已改由 generation 10 GLM 控制桥接管；此前临时 Codex 控制桥未领取业务任务、现已关闭，后续派发执行者仅使用 GLM 或 MiniMax。高负载及 Q46 新增保护提交同步完成前不恢复 Worker。
- 系统负载恢复后将 Run 重绑至 generation 11 GLM 控制桥；新鲜价值门、额度门（GLM 81%）和内存门（8 个 3 GiB 槽位）通过。本波已启动两个 GLM 5.3 Flash Worker：独立审查 main 的 Q46/OOM 安全基线，以及在 PR #4 候选 `058ce80` 修复 Host CLI 与 force-edit acceptance 的无界输出收集并补真实截断行为测试；两个 Dispatch 均已核对冻结 head、隔离 worktree、输入接收和 active provider lease。重型验证继续强制脱离 Orca 进程树，当前尚无 Worker Delivery、合并或产品验收结论。
- Q46/OOM 安全基线独立审查已正式完成并由 PM 接纳审查交付：实际 2 个 spec 20/20、Host noEmit 与 diff-check 通过，reviewer 未运行重型验证、未修改 tracked 文件，资源已结算。审查同时确认两项必须后续修复的缺口：main 输出上限尚无真实截断行为测试，且保头截断会丢失位于尾部的分类、统计和用户诊断信息；在独立返修与复审前不宣称该安全基线完全收口。PR #4 输出上限 Worker 继续运行。
- PR #4 第一版输出 cap 提交 `4c9cd04` 完成 8 文件范围与 33/33、类型检查、diff-check 的价值后门，但 PM 依据独立审查拒绝冻结该候选：保头截断在真正超限时会丢失退出前的分类标记、产物路径、统计与用户错误尾部。该 Worker 资源已结算，提交保留为下一轮保尾返修起点；main 同类实现也必须补行为测试并改保尾后再独立验收。
- generation 12 已并行启动两个 GLM 5.3 Flash 保尾返修 Worker：一条从 main `f25b041` 修复 Host bridge 并补真实子进程超限行为测试，另一条从 PR #4 首版 `4c9cd04` 同步修复 Host 与 force-edit acceptance collector。新鲜价值、44% 额度和 6 个 3 GiB 内存槽位门通过且未使用 override；两个 Dispatch 已核对冻结 head、隔离 worktree、input accepted 与 active provider lease。当前仍是返修运行态，不代表 Delivery、验收或合并完成。
- main 保尾返修已交付 `b4a126a` 并通过 PM 机械与源码检查：stdout/stderr 各自按 UTF-8 字节保留最新 8 MiB、达到上限后继续排空；真实子进程向两流各输出约 9.5 MiB 的测试证明尾部判类、产物路径与统计仍可解析。2 个 spec 21/21、类型检查、diff-check 和价值后门通过，Worker 资源已结算；该实现仍待不同 GLM/MiniMax reviewer，尚未进入 main。PR #4 同类返修继续运行。
- PR #4 保尾返修也已交付 `c086b47` 并通过 PM 范围、源码与价值后门检查：Host 与 force-edit acceptance 两条收集器均按每流独立 UTF-8 字节预算保留最新 8 MiB，真实超限与多字节边界用例 35/35；类型检查和 diff-check 通过，Worker 资源已结算。随后并行启动两个新的 GLM 独立 reviewer，分别冻结 main `b4a126a` 与 PR #4 `c086b47`；当前仅表示 review 运行中，尚无 verdict、集成或合并结论。

### Maintenance（2026-09-08，交付审计）

- 校正治理与 V5 任务的交付状态，记录并发命令、案件进度隔离、CODEOWNERS 与 CI 环境缺口，并建立 GLM 实现及独立验收任务；已按用户要求接入当前任务的 10 分钟 heartbeat 回访验收，整改完成情况以 `status/TASKS.md` 为准。
- 两项修复已完成 PM 定向复验与交付范围检查；GLM 额度恢复后已派独立 reviewer。任务源记录冻结提交、验收证据及治理 Worker 的续跑授权等待，尚未宣称合并交付。

### Added（2026-09-06，治理三件套 Phase 1 — TASK-2026-09-06-orca-gov-01）

- 新增 `.github/pull_request_template.md`：ELI5 / Summary / Why / What Changed / Linked Issue / Visual Proof / Test Plan / AI Disclosure / Notes / Checklist 十段锚点，PR 描述从纯自由文本变为可机读（模板全文权威来源：`docs/orca-governance-adoption/ADOPTION-dsh-contract-copilot.md` §1.1）
- 新增 `.github/CODEOWNERS`：业务规则层（`/docs/business-rules/`、`/src/plan-review/`、`/src/intake-fields/`、`/src/host-api/contract-types.ts`）路由 `@杨卫薪律师` 审核；核心实现、`/tests/`、CI 与发布配置归 `@maoking`；兜底 `* @maoking`（§1.2）
- 新增 `.github/workflows/ci.yml`：`typecheck` / `test` / `build` 三 job，`on: pull_request` + `push: main`；test job 显式 `NODE_OPTIONS=--max-old-space-size=2048`，把 `7eae439` 的堆顶止血从本机合约固化到 CI runner（§1.3）
- 验证（scoped，不跑全量测试——.github-only 改动不影响测试，全量归宿为 GitHub Actions runner）：三文件存在；ci.yml 含 `max-old-space-size=2048` 与 `typecheck`；CODEOWNERS 含律师路由；`git status` 确认仅新增三文件 + 本条 CHANGELOG，零已有文件改动
- 已知缺口（源自 ADOPTION §1 权威模板与仓库现状的既存冲突，派发指令要求照抄权威文本，留待后续卡/提交补齐）：① package.json 无 `typecheck` 脚本（仅 `typecheck:client`），CI typecheck job 首跑会红；② ci.yml `node-version: 20` 与 engines `>=22` 不一致；③ `pull_request: [opened, synchronize, reopened]` 数组简写不是合法 GH Actions 语法（activity types 须嵌套在 `types:` 下，且这三个恰为默认值）；④ CODEOWNERS 律师路由引用的 4 条路径在仓库内不存在（src 为平铺文件 `plan-review.ts` / `intake-fields.ts` / `host-api.ts`，无 `docs/business-rules/` 目录），按 gitignore 语义这些规则永不命中——律师自动 review 请求不会触发，实际靠兜底 `* @maoking` 与手动 @律师
- 边界：分支保护勾 `test` / `typecheck` 为 required check、fork/branch PR 实测 CI 与锚点可机读属任务卡验收的后续人工步骤，不在本提交内；不修改任何已有源文件、测试、package.json、tsconfig

### Added（2026-09-06，issue 模板 Phase 1 增补 — TASK-2026-09-06-orca-gov-03）
- 新增 `.github/ISSUE_TEMPLATE/01-business-rule-review.yml`（杨律师业务规则审核专用）：schema-friendly 必填字段 `rule_version` / `affected_contract_clause` / `repro_docx_path`（字段约束显式要求脱敏/合成 DOCX 样例，防客户敏感信息入库）+ `details` 审核意见；title 前缀 `[Business rule]: ` 与顶层 label `business-rule` 双轨编码
- 新增 `.github/ISSUE_TEMPLATE/bug_report.yml`：`module` dropdown（intake / plan-review / docx-view / python-bridge / session，字段 description 内置 src 模块映射并引导规则类问题走业务规则审核表单）+ `os` + `details` 必填；`[Bug]: ` 前缀、`type: Bug`、`labels: ["bug"]` 三处冗余编码
- 依据 `docs/orca-governance-adoption/ISSUE-LIFECYCLE.md` §6.2 落地；按卡 03 边界不建 labeler workflow、不建 other.yml；仓库设置"Issues must be created from a template"与 fork 实测（module dropdown 渲染、CODEOWNERS 路由）需维护者在 GitHub web UI 完成后方可收卡
- 验证：scoped 自检——两文件存在、三字段 id 与 `module` 五选项/`[Bug]: ` 前缀/`labels` 关键结构齐全（`grep` 逐项核对）；零源码/测试改动，未跑全量测试套件

### Fixed（2026-09-06，vitest 状态污染根治 — TASK-2026-09-06-orca-gov-02）
- 新增 `vitest.config.ts`：全局 `hookTimeout: 30_000`——2026-09-05/06 崩溃循环期间 agent-coordinator 6 连败的真实形态是 beforeEach 里派生真实 python3 超过 vitest 默认 10s hook 上限；30s 与真实子进程用例的 testTimeout 对齐，不改 pool/worker 数
- `tests/docx-extract.spec.ts` 重写隔离契约：beforeEach 把进程级 TMPDIR 重定向进独占 mkdtemp 目录，afterEach 还原环境后断言零 `cc-docx-*` 残留——残留从"事后观察"变为确定性断言，且不受历史运行（进程被杀来不及清理）留在系统临时目录的陈旧条目影响；fixture 生成改用 `docx-fixture.ts` 的 python3 stdlib zipfile（旧 makeDocx 的 `|| true ||` 回退分支永不执行，python-docx 缺失时静默产出缺失文件）；真实子进程用例显式 30s 超时
- `AGENTS.md` 新增"claude 会话跑测试的限定"：agent 会话跑单 spec 或 `--bail 1` 早停，不直接 `pnpm test` 跑全量；全量留给与 CI 一致的受控场景；`NODE_OPTIONS=--max-old-space-size=2048` 堆顶为合约级护栏不得移除
- 验证：守卫自检（注入假 `cc-docx-*` 残留）确认断言会红后删除自检文件；受控环境全量 3 连跑 266/266 全绿（每轮 ~1.4s）、零残留断言失败、零崩溃报告；`$TMPDIR` 无新增残留（历史现场 5 个 `cc-docx-extract-*` 与崩溃报告时间戳一一对应，为归因物证）；dsh-plugin-lint 已跑，10 FAIL 均为 §5 client 构建产物存量问题、与本次改动无关
- 边界：不动 `src/` 产品代码；不移除堆顶；CC-V5-004 异步抽取（Q44）合入后 docx-extract.spec 以该分支异步版为准

### Planning（2026-09-06，orca 治理调研材料落库）
- 新增 `docs/orca-governance-adoption/` 目录，包含 11 份调研文件（`HANDOFF.md` / `SUMMARY.md` / `CHECKLIST.md` / `REPORT.md` / `ISSUE-LIFECYCLE.md` / `PR-LIFECYCLE.md` / `RELEASE-GOVERNANCE.md` / `MAINTAINER-WORKFLOW.md` / `UPDATE-INDEX.md` / `ADOPTION-folia.md` / `ADOPTION-dsh-contract-copilot.md`，与桌面源 byte-identical，共 2782 行）；为 orca 治理体系在 dsh 仓库的完整归口，桌面 `~/Desktop/orca-governance-adoption/` 未来不可达不影响
- `status/TASKS.md` 顶部追加 5 张任务卡（`TASK-2026-09-06-orca-gov-01`–`05`）：PR 模板+CODEOWNERS+CI baseline / vitest 状态污染根治 / issue 业务规则模板+module dropdown / 路径感知 pr.yml+verify required / 元调研收口——不修改版本号、不实现任何源码或 workflow 改动
- 调研背景：dsh vitest 套件 2026-09-05 深夜 + 09-06 14:25 / 15:16 / 15:31 / 16:32 四轮 OOM 崩溃循环的真正根因已定位为"会话侧状态污染"（22% 失败率 + docx-extract 临时目录残留 + agent-coordinator hook 超时），堆顶防护（commit `7eae439`，`NODE_OPTIONS=--max-old-space-size=2048`）是合约级保留的次生防护；根治方向由 `status/TASKS.md` 卡 02 跟踪
- `docs/orca-governance-adoption/HANDOFF.md` 顶部加 dsh 仓库入口声明：显式指向本目录 + 5 张任务卡，让接手 agent 一打开仓库即能找到完整调研材料

### Added（2026-09-05，工作台体验基础）
- DOCX 批注获得内容派生的稳定锚点和可持久传输的定位元数据；简版正文同步输出可选择的锚点标记，无法精确定位时返回确定性降级原因
- 新增纯客户端批注导航控制器，统一稳定选择器解析、滚动、焦点、瞬时高亮清理和结构化未命中结果
- 新增类型完整的中英文工作台词典，以中文为键集事实源，并在编译期核对英文键、逐键插值参数和业务枚举覆盖

### Changed（2026-09-05，工作台壳层）
- 工作台视觉统一使用 DSH 官方主题变量；窄屏由隐藏操作栏改为任务、文档、操作三栏切换，所有区域保持可达
- 工作台对话框补齐初始焦点、Tab 环、执行中 Escape 门控和关闭后焦点归还
- 工作台产品文案统一由 typed locale 字典提供；未知或不可用浏览器 locale 确定性回退中文
- Word 预览启用原生批注渲染；侧栏批注与 Word/简版正文可双向选择、滚动、聚焦和瞬时高亮，未命中时给出本地化状态且不误跳
- 侧栏渲染全部批注并以作者短名和正文摘录组成辅助名称；切换审查会话时清理旧批注导航状态
- 同时兼容 `docx-preview` 的原生引用元素和 run-style `.docx_commentreference` 占位元素；后者从相邻范围结束标记恢复批注 id，并增强为可见、可聚焦且支持 Enter/Space 的入口
- 工作台专属 Agent 的分析回合由 Host 注入有界合同正文与最小审查指导，不再要求 DSH Web profile 开放通用文件或 skill 工具；伪造边界标记会被隔离，提取失败或正文为空时在创建 Agent 前显式失败

### Fixed（2026-09-05，验收修复）
- 简单视图点击侧栏批注恢复正文定位：导航控制器支持逐次视图绑定选项后，`data-cc-anchor` 打点属性随跳转传递；此前 Workbench 把它丢在共享 navigator 之外，简单视图每次跳转都按默认属性寻址而未命中（Word 视图经注释标记命中，不受影响）
- 批注跳转的短暂高亮在 Word 与简单两套视图真实可见：导航控制器一直输出 `cc-comment-flash`，但从未有对应 CSS；现以纸面静态琥珀底色加描边限定在两个文档容器内，明暗主题下均可读
- 批注导航请求的已处理水位随案件切换复位；A→B→A 返回旧案件后不会把新请求误判为已消费，同一案件重复激活也不会清空仍有效的导航状态
- 简版文档挂载点现在绑定 `simpleHolder`，侧栏跳转能取得实际正文根节点并命中稳定锚点；源码接线回归同时保护 Word 与简版两个 holder ref

### Testing（2026-09-05，工作台体验基础）
- client typecheck、16 个测试文件 266 项测试和 Node/Client build 通过
- 候选 `cfcfb77` 以 tarball 安装到 DSH `0.1.2-rc.1` 隔离 Web profile；真实浏览器通过明暗主题、窄屏页签、Escape 焦点归还、Word/简版侧栏前向定位与正文反向选择、A→B→A 和同案件重复激活复验
- 正式 `dsh-plugin-lint` 输出 `0 FAIL / 3 WARN / 0 NOT_VERIFIED`；三项 WARN 已按真实 tarball boot、typed locale 与历史决策语义完成人工处置
- 最终 GUI GIF 已绑定 SHA-256 `3f19a70ea655b5a1f1969349bd309957122cb3b63d578779c4549009c068aace`；未参与实现的 GLM reviewer 在 PR 头 `cdcbbcca69dbaff768d98fe450f9a86ba7fa6ca2` 给出 `ACCEPT`，结构化角色分离与 merge-gate 均通过
- 收口后重打包 SHA-256 为 `713d73025ac3e243e7fc29df6e9a34e499926a9dd15ec2c3d29457c98a8835d1`；与浏览器验收包相比仅 README 状态变化，运行载荷逐文件一致

### Planning（2026-09-04，工作台体验收口）
- 将暗色主题、窄屏操作区和对话框焦点统一划为工作台壳层任务，将 DOCX 批注稳定定位划为独立 Host/协议任务
- 批注双向跳转在两项基础验收后单独集成，避免并行任务同时修改工作台主组件
- 更新路线图、任务源和 Q41，明确使用 DSH 主题变量、typed locale 字典以及真实浏览器候选证据
- 将只读研究收敛为两个可复用工程资产：纯客户端批注导航控制器，以及类型完整的中英文工作台词典；最终浏览器验收仍由独立 reviewer 执行

### Docs（2026-09-04，工作台交互原则）
- 明确 DSH 的 Agent、Session、Tools 和状态事件是细粒度工作台交互的运行基础，并由 ContractSession 投影为可持久化、可操作、可审计的案件状态
- 明确可观察运行过程不等于模型隐藏思维链；新交互必须对应可恢复业务状态或授权门

### Planning（2026-09-04，律师决策工作台）
- 确认 `0.3.0` 采用案件专属 DSH Agent：工作台负责建案、启动分析、等待律师和恢复交付
- 确认 analyze 后设置不可绕过的律师决策门，并以 plan hash 约束批准有效性
- 确认第一版 finding 支持按建议处理、仅批注、仅意见书、忽略、风险等级调整和内部备注
- 设计与执行清单见 `docs/plans/2026-09-04-lawyer-decision-workbench-design.md`、`status/TASKS.md`

### Added（2026-09-04，律师计划批准门）
- ContractSession 新增可选 `planReview`：保存当前计划 hash、逐 finding 决定、批准 hash 与追加式审计历史
- 工作台协议新增 plan approve RPC；任一 finding 未决定、未知或重复决定、旧页面 hash 均以稳定领域错误拒绝
- 四种决定确定性投影到获批 plan：保留建议、仅批注、仅意见书或从执行计划忽略，并支持风险等级覆盖和内部备注

### Added（2026-09-04，案件专属 Agent）
- 工作台新增分析、交付和取消命令，直接创建或恢复案件专属 DSH Agent，不要求律师返回聊天窗口补发指令
- Agent 分析阶段停在待律师决策，批准后由同一 DSH session 继续修订与交付；工作台持久显示运行、等待、失败和完成状态
- 同一案件只允许一个在途命令；取消、插件卸载和结果投影均等待 Agent 实际进入 idle
- 新建 Agent 继承 DSH 当前默认模型选择；首次创建失败保留错误但不产生无效 session 关联，重试仍可重新创建

### Added（2026-09-04，律师决策界面）
- 工作台改为“前置信息、风险分析、律师决策、修订交付、完成”五阶段，并展示 Agent 运行、等待、失败和已交付状态
- 每项风险卡可选择四种处理方式、调整 P0/P1/P2 等级并填写仅内部留存的律师备注；全部按建议仍生成逐项决定
- 计划全部决定后可一次完成批准和交付派发；运行中可取消，已批准但派发失败时可按原方案重试
- 空 finding 计划仍可显式批准；页面刷新后从业务 session 恢复当前决定，计划 hash 变化时丢弃旧页面草稿

### Security（2026-09-04，律师计划批准门）
- `contract_copilot_apply` 在 Python 启动前强制检查律师批准和文件 hash；未批准或批准后被改写的计划无法执行

### Fixed（2026-09-04，浏览器验收）
- 前置信息自由文本输入框使用问题正文作为辅助标签，键盘和辅助技术可直接识别输入目的
- Agent 到达“等待律师决策”或“已交付”后清除旧的运行中提示，避免持久状态与临时消息相互矛盾

### Changed（2026-09-04，DSH 0.1.2 迁移）
- 依赖从 DSH `0.1.0-rc.7` 升级到 `0.1.2-rc.1`，客户端由已移除的 `dsh-client-runtime` 迁到 connection、ui-renderer、ui-sidebar
- 工作台入口由手动追加 sidebar DOM 改为官方 `sidebar.footer.action`；折叠和展开侧栏均有对应显示
- Host 数据面由未认证 `/contract-copilot/*` HTTP 路由改为 Connection 认证 RPC，以及 `/api/contract-copilot.events`、`/api/contract-copilot.download` 精确 Fetch 路由
- 工作台新增“前置信息 → 分析与风险 → 修订与批注 → 交付与复审”四阶段进度，以及最近八条工具状态跃迁
- `workbench` 配置收敛为 `enabled`；删除已无意义的 `port`、`host`、`autoOpen`

### Security（2026-09-04）
- 工作台状态、文档渲染、表单提交、实时事件和 DOCX 下载统一复用 DSH Host/Origin fence 与签名 Cookie 认证
- RPC payload 对路径、session ID、答案数量与长度做显式校验；下载只接受 GET/HEAD 和固定产物类型

### Testing（2026-09-04）
- 候选 `e287ee2` 从 tarball 安装到隔离 DSH `0.1.2-rc.1` Web profile；使用脱敏合成合同和本地 replay provider 跑通 Agent 分析、律师批准、真实 Python apply、finalize 与双 DOCX 交付
- 浏览器验证批准前禁用、逐项决定后解锁、修订高亮、批注、交付统计和下载入口；DSH 重启后已交付状态、决定及批准锁完整恢复
- 正式 dsh-plugin-lint 五层审查通过，机械结果为 `0 FAIL / 0 WARN`；候选截图与报告见 `docs/acceptance/2026-09-04-lawyer-decision-workbench.md`
- 新增工作台纯投影与直接 tool 入口测试，覆盖五阶段、漏项禁用、决定字段规范化、空计划、精确 session 复用和未批准 apply 拒绝
- 13 个文件 103 项完整测试、真实 Python spawn、Node/Client build 与 `pnpm peers check` 通过
- 新增确定性 Agent 生命周期测试，覆盖 create/resume、busy、创建失败重试、批准后交付、取消和 teardown；不依赖固定 sleep
- DSH 运行时及测试 peer 依赖统一到 `0.1.2-rc.1`，`pnpm peers check` 无版本混装
- 新增 Host/Client 工作台测试，覆盖 RPC、错误传播、路由注册、SSE 生命周期、Unicode session ID 和 DOCX GET/HEAD 下载
- 真实 Python spawn 集成测试改用独有临时配置与归档目录，避免改写用户的 Contract Copilot 配置或 archive
- `pnpm run build`、9 个文件 80 项完整测试与 dsh-plugin-lint 机械层通过
- 候选 `943b1b7` 从真实 tarball 安装到隔离 DSH home 并启动 Web profile；匿名 RPC、事件、下载请求均返回 `401`
- 浏览器验收通过：官方侧栏入口、四阶段、最近操作、Word 正文、批注、发现、表单与下载入口均可见；证据见 `docs/acceptance/2026-09-04-dsh-0.1.2-workbench.md`

### Build（2026-09-04）
- 候选版本升级为 `0.3.0`，用于绑定 tarball、DSH profile 与浏览器验收证据
- 客户端 tsdown 配置改用 DSH 0.1.2 的 `deps.neverBundle/alwaysBundle` 与 `outputOptions`，并把 React 类型对齐到 React 18
- 新增受版本控制的 pnpm 锁文件，并仅允许 `esbuild` 执行安装脚本
- 完整构建先清理本包 `lib/`，防止已删除源码的旧 JavaScript 混入发布 tarball

### Added（2026-08-19 第二轮）
- **A1 产物下载**：工作台右栏一键下载审核修订版/审查意见书 DOCX（流式 + `filename*=UTF-8''` 中文文件名）
- **A2 SSE 实时推送**：`/events` 端点 + client EventSource——store 变更即时上屏，轮询降为 10s 兜底
- **A3 再审入口（§9.5 UI 化）**：delivered session 右栏输入新版合同路径 → POST `/recheck` 更新 session 指向 → 用户让 agent resume+analyze
- **C1 client typecheck**：`tsconfig.client.json`（DOM + react-jsx）+ `@types/react`；类型上补齐 `@deepseek-ai/dsh-client-ui-conversation` devDep + `dsh.client.inject`（SlotMap 声明合并 + 加载顺序双保险，better-sidebar 同款做法）
- **加固**：POST body 1MB 上限（防无界 buffer）
- **D 源 skill 文档修正**（legal-skills 仓库）：版本戳 1.6.1→1.6.3、移除不存在的 `--skip-integrity-check` 描述

### Fixed
- host-api：`ctx.effect` 回调须返回 disposer（`() => () => {...}`）；shorthand `handler` 引用错名（boot fail-loud 即时暴露）

### Added（2026-08-19 第一轮）
- **工作台表单→agent 消费回路 e2e 闭环**（2026-08-19）：intake blocked → 表单答案（pendingAnswers）→ agent 无参重调 intake 消费（Q33 复用 blocked session，sessionId 不变）→ analyze(force_edit) → apply 4/0/0/0 → finalize
- **V3 接线**：intake 写入 `dshSessionId`（`exec.agent.id` 即 DSH session id）
- `tests/python-bridge.integration.spec.ts`：runApplyCli 真实 python3 spawn 的 success 路径集成测试（无 defusedxml 环境自动跳过）

### 已知限制
- **V4（HMR）不支持**：out-of-tree 插件重建 client bundle 后需重启 dsh web（见 DECISIONS Q34 / DSH-PLUGIN-REFERENCE）
- **v2 插件 UI（DSH 原生路径）落地并实测**（2026-08-19）：
  - `package.json` 声明 `dsh.client`（platform web, inject runtime）+ `exports["./client"]`
  - `src/client/`（浏览器 half）：会话头部"📋 审查工作台"按钮 + 三栏工作台对话框（session 列表实时轮询 / Word 文档视图含修订高亮与批注气泡 / 状态·统计·产物·审查发现·确认表单），挂载 `conversation.session.header.utilities`
  - `src/host-api.ts`（host half 数据面）：`ctx.get('webServer')` 可选注册 `/contract-copilot/*` 同源路由（state/detail/document/answers），headless 下自动跳过
  - `tsdown.client.config.ts`：复刻 harness closure-factory 工件契约（banner 构造 module/exports、cjs、平台模块 external）
  - **浏览器实测**：web profile 安装 → `__DSH_BOOT__` 注册 → bundle 下发 → 按钮渲染 → 对话框三栏 + 合同正文 + 批注 + 审查发现全部正常（截图验证）
- **协议文件建立**（2026-08-19）：`README.md` / `AGENTS.md`（`CLAUDE.md` symlink）/ `docs/ARCHITECTURE.md` / `docs/DECISIONS.md` / `docs/ROADMAP.md` / `docs/DSH-PLUGIN-REFERENCE.md` / `CHANGELOG.md`
- `src/docx-view.ts`（OOXML→HTML 渲染器）+ 集成测试（真实 python3 抽取，回归 ESM 内联 require 漏网 bug）；`src/session.ts` 事件订阅、`intakeMissing`/`pendingAnswers` 交互回路

### Fixed
- client bundle 工件契约两处对齐：banner 需构造 `var module = { exports: {} }; var exports = module.exports`（否则浏览器端 `exports is not defined`）；cjs 产物在 `"type": "module"` 包内需 `outExtensions` 强制 `.js`
- `extractDocxParts` ESM 下内联 `require('node:fs')` 的 ReferenceError（补集成测试防回归）

### Removed
- **v2 localhost 错路径代码**：`src/workbench/{server,page}.ts`（node:http 自起服务器方向已被否决，见 `docs/DECISIONS.md` Q30/Q31）

---

## [0.1.0] - 2026-08-19

### Added
- **feat: 插件骨架 v0.1** (`ece3fff`)——7 个 defineTool（intake/analyze/list_findings/apply/finalize/inspect_session/resume）+ session 9 态状态机 + Python bridge + pre-step 进度注入
- **feat: analyze 必填 summary 段 + re-analyze 状态扩展 + 修订授权语义文档化** (`f92aaf8`)——e2e 实测后修复三个真实缺口
- **fix: tool 返回值过 compactUndefinedDeep 满足 DSH lossless JSON 校验** (`395af88`)——深度递归剥离 undefined 字段
- **test: 53 → 66 个 vitest 单测** (`37d1fea`)——python-bridge/session/paths/progress/docx-view；+ 修 latestByContractKey 逻辑

### Docs
- **docs: §12 交付形态分阶段** (`f628e80`)——v1 session-first vs v2 插件工作台路线
- **docs: 设计稿 v0.2——审计修订** (`ac00110`)——修 4 处硬伤、补 §5/§6/§7、新增 §1.4/§3.3/§8 Q17-Q25、§9 审计回执
- **docs: DSH plugin 改造设计稿 v0.1（草案，待审计）** (`0910e65`)——brainstorming 初稿

### Verified（端到端）
- **headless profile + 自定义网关 127.0.0.1:8787（OpenAI 协议代理 deepseek-v4-flash）** 跑通全链路：intake → analyze（含 summary）→ apply（真实 Python CLI，成功=3 失败=0 仅意见书=1）→ finalize
- session 状态机完整走完 `intake_done → plan_ready → applying → applied → delivered`
- 产物双 DOCX + skill archive 完整留痕
- Word 修订实测：`force_edit: true` 的 replace 落成 w:ins/w:del 最小差异修订（XML 验证）
- 退码分类实测：第一轮因 plan 缺 summary 段被 integrity 拒绝 → `classify` 正确判 `rejected`
- partial 分类实测：python exit=1 + stderr "存在失败项" + 产物已产出 → classify 判 `partial`
- resume 跨进程实测：new SessionStore 实例按合同名从磁盘命中 `e2econtract-20260818164812` delivered 状态

---

## 格式说明

- `feat`：新功能（用户可见行为）
- `fix`：修复
- `docs`：仅文档
- `test`：测试
- `refactor`：内部重构
- **Verified** 区块：用户/agent 实测过的功能，不依赖静态检查
- 2026-09-10 上午第 5 次 worker OOM（09:21/09:33，主动复现触发）定界与永久修复：诊断报告确认 2.11GB 全在 old space（长期对象累积而非巨型字符串）、爆点为 PR4 候选测试的 vitest worker、`/Users/maoking/.hermes` node；`src/python-bridge.ts` 的 `runApplyCli` 输出收集改为每流独立 8MiB `OUTPUT_CAP_BYTES` 保尾模式（消除无上限 `+= chunk`，并保留输出末端判类与 summary）；`AGENTS.md` 新增「重负载验证与 ORCA 进程树解耦」——全量/acceptance/DSH 启动类验证只走 GitHub Actions 或独立 Terminal.app（进程树与 ORCA 无父子关系），ORCA 内只跑 scoped 单 spec；PR4 候选 acceptance 脚本的同族缺口已由 `c086b47` 返修并完成专项验收。隔离定界跑（独立 Terminal.app）进行中。
- ORCA 上游反馈与修复 PR：事故完整证据链已提交 issue [stablyai/orca#19828](https://github.com/stablyai/orca/issues/19828)（子进程 OOM 后 daemon 跟随重启 + 恢复在高压窗口重投重负载命令形成死循环；daemon.log 时间线、崩溃指纹、2.11GB 堆诊断为证据，关联 #12588/#16084/#13653）；基于用户 fork 提交修复 PR [stablyai/orca#19830](https://github.com/stablyai/orca/pull/19830)——startup-command 投递前的 opt-in 负载门（`ORCA_STARTUP_COMMAND_MAX_LOAD_PER_CPU`，默认关闭零行为变化；负载超限时延迟投递、PTY 留提示、`startup-command-deferred-load` 事件记录），断开"恢复→重跑→再崩"的放大环。PR 含 7 项新测试、现有 8/8 无回归、typecheck 干净。另修正一处归因：09:21 的崩溃报告实为本会话验证 `--report-directory` 缺陷的测试进程，非事故（真正事故链为昨晚 4 次 + 09:33 共 5 次）。
- 2026-09-10 generation 13 独立 GLM 验收完成：main 保尾修复 `b4a126a` 与 PR #4 cap 堆叠 `058ce80..c086b47` 均获 `ACCEPT_WITH_FINDINGS`、零 blocker；对应 scoped specs 分别 21/21 与 35/35，Host noEmit、diff-check 及 PM value-postflight 通过，所有 reviewer terminal、provider lease 与 Delivery 已结算。main 候选已本地集成并在最终树复跑 21/21、Host noEmit 与双 diff-check；PR #4 仅完成 cap 专项验收，完整源码门和真实工作台路径仍未验证。
- 2026-09-10 generation 14 已派出新的独立 GLM 5.3 Flash reviewer，对 PR #4 完整源码候选 `35527c2..c086b47` 恢复冻结门；新鲜价值、41% 额度、5 个 3GiB 内存槽、负载、角色、输入接收和 provider lease 七门通过且无 override。reviewer 只读业务树并执行 7 个 scoped specs、Host/Client noEmit 和 diff-check；当前仅为运行态，尚无 verdict、合并或真实工作台验收结论。
- 2026-09-10 generation 14 在执行含 force-edit 的 scoped vitest 时触发第 6 次同指纹 worker OOM，随后 Orca runtime 切换；reviewer 以 `terminal_missing` 失败且没有 STATUS、报告、worker_done 或 Delivery，不构成代码 REJECT。PM 按机械恢复表判为 `safety_unknown → park`，已释放精确 terminal resource 与 GLM provider lease并保留冻结 worktree；PR #4 链后续在 Orca 内禁止一切 vitest，新 worktree 必须先同步 Q46 护栏，测试证据改由 GitHub Actions workflow_dispatch 或独立 Terminal.app 产生。
- 【CI 定界收口】ORCA 树内第 6 次 worker OOM 根因定界完成（诊断分支 `ci/diagnose-force-edit-oom`，run #34459640945 / #34460166243）：①以 17:05 崩溃现场修订 DOCX 为 fixture 云端复现渲染链——4251 字符 XML 渲染 2ms 无异常，**渲染核心排除**；②全量 21 spec / 347 测试在 CI 以 2048 顶跑 42 秒全绿零 OOM（force-edit 10 例因真实 skill 根不可达按设计 skip），**多 spec 累积排除**。结合 g12 已修无界收集后仍爆：**引爆非仓库内确定性代码缺陷，而是 ORCA 终端树环境耦合**（后台 QoS 降级 + 系统高压窗口下 worker 走平时不触发的路径）——与三次本机受控复刻全绿、六次树内必爆自洽。修复策略定案：结构性隔离（止血指令 + AGENTS.md 解耦规则已生效）+ 上游断环（stablyai/orca#19830/#19828 排队中）+ 陷阱待命（新 worktree 强制同步，再爆自动留 JS 栈）。
