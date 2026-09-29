# 当前任务

## CC-DSH-001 — 纳入 dsh-plugins 并保留历史（2026-09-29）

- 状态：DONE（仓库接入与历史保全；产品兼容性未验收）。
- 验收证据：[validation.json](../../../docs/evidence/contract-import-20260929/validation.json)：80 个 main 提交保留，107 个全部引用提交、17 refs 与 2 份 WIP 补丁可恢复；原 5 个工作树未改。
- 来源：用户要求现有合同审查 DSH plugin 嵌入新项目并保留 Git 记录。
- 范围/验收：原 main 非 squash subtree；源 tree 与导入 tree 相等；main 的 80 个提交不改写；全部分支共 107 个提交可从 bundle 恢复；未提交受跟踪改动有补丁，原 5 个工作树不变。
- 跨仓库接入事实与配置由 [接入说明](../../../docs/CONTRACT-COPILOT.md)维护；项目任务 DSH-004 只做入口，不复制业务待办。
- 非目标：旧 V5/PR4/PR11 结项、升级依赖、模型调用、生产安装或 Python 改动。

## CC-DSH-002 — 新宿主适配与旧候选接续审计

- 状态：IN_PROGRESS（2026-09-29 用户指示恢复：首轮「0.1.7-rc.2 依赖与 API 对齐」已交付 v0.4.0——静态 typecheck×2/build、vitest 267/267、版本匹配 lint 0 FAIL；真实桌面装载与业务 Web 验收仍 NOT_VERIFIED，续接清单见验收记录）。此前 HOLD 期间的静态差距调研仍有效，两处保守结论已实测修正（见下）。
- 首轮交付（2026-09-29，v0.4.0）：[验收记录](../docs/acceptance/2026-09-29-runtime-0.1.7-rc.2-alignment.md)。要点：dsh-* 依赖钉定 0.1.7-rc.2（与 Desktop 2.0.15 内嵌一致）；消息 source 按上游 merge-extensible 模型注册插件自有 kind `contract-copilot`（Q48；上游已移除共享 `plugin` kind）；fetch 路由补必填 `requestBody:'buffered'`；移除 npm 无版本的 devDep `dsh-code-runtime`。**实测修正调研两处**：npm 0.1.7-rc.2 分发包带完整 .d.ts 且 `PreStepDecision`/`ToolRunContext` 在包导出面（无需改引 api-catalog）；client externals 8 项经版本匹配 lint 确认 ⊆ 0.1.7-rc.2 平台基线（P1-B 静态排除）。机械证据：dsh-plugins `docs/evidence/contract-017rc2-adapt-20260929/lint.json`。
- 输入：当前 sourceCommit、bundle 内 9 个本地分支、下方 CC-V5-008/009 和治理卡、DSH 固定研究版本、原 `docs/DSH-PLUGIN-REFERENCE.md`、[0.1.7-rc.2 接口差距调研](../../../docs/research/2026-09-29-contract-adapter-gap-017rc2.md)（2026-09-29 静态分析：运行时符号无断裂；`PreStepDecision`/`ToolRunContext` 不在原包导出面、完整声明在 dsh-tool-cordis api-catalog，改引即可；内嵌树 .d.ts 已剥离需以 npm 分发包为类型源；插件钉 0.1.2-rc.1 的 dedupe 风险为 P1）。
- 范围：先厘清 main/集成分支/PR 候选中的功能与未验收差异，复用已做修复，再对齐 Host/Client 依赖、slot、Session/Agent API、资源与主题；不要直接重写整个合同业务。
- 已知阻断：main pre-step 依赖全局 `store.current()`；跨 Agent 进度注入隔离与命令准入/取消/关闭恢复须沿旧任务补验；旧 lint/CI 缺口未关闭。旧 PR 状态只按记录时点理解，接续先只读刷新。
- 验收：新宿主实际版本/源码一致；七工具、律师批准与 plan hash 门、Word/简版预览及双向批注、跨案件/Agent 隔离、取消/重连/重启恢复、下载鉴权通过合成资料验证；版本匹配的 lint、启动与浏览器证据绑定最终候选。
- 隔离：显式实验 sessionsDir 与合成 skillRoot/config/archive，不用实际业务默认路径；不改 Python、不读取生产客户材料。遵守原资源/OOM 验证限制。
- 后续验证状态：静态/模拟级已通过（2026-09-29）；真实 Desktop 装载（Host apply、client 注入、cordis.patch、dedupe、自定义 source kind 的宿主 fall-through）与真实 Web 业务验收仍 NOT_VERIFIED，沿本卡验收清单续接。


## WAVE-2026-09-08：GLM 审计整改与独立验收

- Heartbeat：用户于 2026-09-08 明确要求自动回访验收；`contract-copilot-glm`（Contract Copilot GLM 成果验收）每 10 分钟跟进本波任务。generation 12 两个保尾返修与 generation 13 两个独立 reviewer 均已结算；generation 14 因第 6 次 worker OOM 后的 Orca runtime 切换失去终端且未形成 Delivery，旧 Dispatch/terminal/provider lease 已精确结算。继续以正式 Delivery 和 PM 独立验收为完成边界。
- 负载保护指令（2026-09-09 23:05，用户经 claude 会话指示，PM heartbeat 恢复后立即执行）：22:59:37 ORCA 资源组 vitest 再次 V8 `FatalProcessOutOfMemory`（启动 54 秒爆，同 21:22/21:52 指纹；证据存档 `~/Desktop/diagnostics-2026-09-09-vitest-oom/`），22:59 ORCA 崩溃换 runtime 后 PM/三 worker 终端全部 missing，系统负载 200+（重启风暴 + Spotlight 索引未完）。恢复任何 worker 前：①先把 main 护栏提交 `b2e73d4`（`vitest.config.ts` `poolOptions.forks.execArgv=['--max-old-space-size=2048']`，DECISIONS Q46 / TASK-2026-09-09-oom-guard-sink）同步进会跑测试的 worker worktree（cherry-pick 或手动加同款配置）；②系统 1 分钟负载回落到正常运行区间（<20）前，不派发、不恢复任何跑全量 vitest 或启动 DSH/浏览器/本地模型的重负载 worker；治理 / PR #4 / PR #11 三任务均暂停在当前边界，负载正常后再有界续接。
- 统筹：2026-09-09 用户指定当前 Codex 任务为唯一 PM；业务 Worker 后端按用户 2026-09-10 校正只允许 GLM 或 MiniMax。Run `run_fce28ffada88` 的 generation 11 GLM 控制桥属于旧 runtime `5082b1e3-d120-4e74-82fa-dcd9ec218bd8`；当前 runtime 已切换为 `0c63513b-ae8d-414e-be14-05fc6e899bfc`，恢复出的同 tab 仅停在 shell prompt，不作为活跃控制桥。此前临时 Codex 控制桥仅执行控制面恢复且已关闭；后续不使用 Codex 作为派发执行者。
- generation 11 波次：两个 GLM Worker 均已正式完成并结算终端与 provider lease。Q46 review 接纳为 `ACCEPT_WITH_FINDINGS`；PR #4 输出上限实现提交 `4c9cd0482fbd03bd257cd1e4d4d42ed86b9c10ce` 的 8 文件范围与 33/33、Host noEmit、diff-check 证据通过 value-postflight，但 PM 判定 `REWORK_REQUIRED`：其按原合同实现的保头截断会在超限时丢失尾部分类标记、产物路径、统计与用户可见错误尾部，不能冻结为最终候选。两个 worktree/分支及证据保留，消费 receipt 在 Git common-dir `orchestration/cc-audit-20260908/{q46-oom-main-review,pr4-output-cap-repair}-g11-consumed.json`。
- generation 12 波次：两个 GLM 实现均已正式交付并结算。main 返修 `task_0cbed090f0ff` / `ctx_4fac327348c7` 交付 `b4a126ac112223342dace9863243264465637748`，5 文件范围、真实双流各约 9.5 MiB 子进程测试 21/21、Host noEmit、diff-check 与 value-postflight 通过；PR #4 返修 `task_ac1e7ef9c7c3` / `ctx_d3627b95fcbb` 交付 `c086b47dfec25e0752931f3f1493ddfdd8ae9972`，8 文件范围、Host/acceptance 保尾测试 35/35、Host noEmit、diff-check 与 value-postflight 通过。PM 检查确认两条路径均为每流独立、UTF-8 字节 8 MiB 保尾并持续排空，接纳为 `IMPLEMENTATION_ACCEPTED_PENDING_REVIEW`；终端与 provider lease 已结算，消费 receipt 分别为 `main-tail-cap-g12-consumed.json` 与 `pr4-tail-cap-g12-consumed.json`。
- generation 13 波次：两个不同 Dispatch/Session 的 GLM 5.3 Flash reviewer 均已正式交付 `ACCEPT_WITH_FINDINGS`，零 blocker。main review `task_bd82ec22133e` / `ctx_b751e4b66ef8` 冻结并放行 `b4a126ac112223342dace9863243264465637748`，2 个 spec 21/21、Host noEmit、diff-check 与 PM value-postflight 通过；PR #4 review `task_2239d63c48c1` / `ctx_a90e9ab224d4` 冻结 `c086b47dfec25e0752931f3f1493ddfdd8ae9972` 并复审 `058ce80..c086b47` 完整 cap 堆叠，3 个 spec 35/35、Host noEmit、diff-check 与 PM value-postflight 通过。两条任务的 terminal 与 provider lease 已释放，Delivery 全部消费并 ack，receipt 分别为 `main-tail-review-g13-consumed.json` 与 `pr4-tail-review-g13-consumed.json`。main 候选已集成并由 PM 在最终树复跑 21/21、Host noEmit 与双 diff-check；PR #4 仅完成输出 cap 专项放行，仍须恢复完整源码门，不得扩大为整个 PR 已接受。
- 【止血指令·第 6 次 worker OOM 后（2026-09-10 17:1x，用户经 claude 会话下达，PM 立即执行）】17:05:12 g14 worker（`glm-cc-pr4-full-source-g14`）在 Orca 树内跑 scoped specs（含 force-edit）→ vitest worker 48 秒同指纹 V8 OOM（第 6 次）→ 17:05:53 daemon 第 7 次重启。新证据：①该 worktree 为新检出、未同步 Q46 护栏与陷阱（`/tmp/cc-oom-reports` 零报告为证）；②g11 已修两条无界收集路径（head `c086b47`）后仍爆 ⇒ 引爆点另有其源、**force-edit spec 的 2GB 累积根因未定位**。指令：①PR #4 链（full-source review / 任何后续返修）在 Orca 进程树内**禁止执行任何 vitest**——包括 scoped specs；测试验证一律推 GitHub Actions（workflow_dispatch）或独立 Terminal.app 执行并回填证据，Orca 内只允许读代码/typecheck/diff-check；②任何新 worktree 建立后必须先同步 main 的 Q46 护栏提交（`vitest.config.ts` 三参数版，现 main HEAD 含 `37d1b24`）才允许后续动作；③force-edit spec 引爆根因由 claude 会话走 CI 定界（等用户推送授权），定位修复前该 spec 视为禁区。
- 外部 CI 定界回访（2026-09-10 17:39）：诊断分支直接起于冻结候选 `c086b47`。run `34459640945` / head `8fe7769` 对 17:05 crash-scene `revised.docx` 单独执行 render 链，1/1 通过（documentXml 4251 字符、0 comments、HTML 274 字符、2ms），无 fatal-error report；run `34460166243` / head `0039563` 在 2048MiB 护栏下跑全套件，347 passed / 11 skipped、无 fatal-error report，其中 cap 专项 7/7 通过。该证据排除了这份 crash-scene DOCX 的纯 render 路径与常规无真实 skill-root 套件，但 `force-edit-workbench.integration.spec.ts` 因缺 `defusedxml`、`python-docx` 和真实 skill root 而 10/10 skipped，故尚未覆盖第 6 次 OOM 的实际 force-edit 路径，不能解除禁区或恢复派发。
- generation 14 波次：独立 GLM 5.3 Flash 完整源码 reviewer `task_d14f6497e97b` / `ctx_cf4bba584559` 原冻结 base `35527c2bc39e969bed807c7b67f3dc64ce83f182`、head `c086b47dfec25e0752931f3f1493ddfdd8ae9972`。17:05 在 Orca 树内执行含 force-edit 的 scoped vitest 时触发第 6 次同指纹 worker OOM，随后 runtime 从 `5082b1e3-d120-4e74-82fa-dcd9ec218bd8` 切换到 `0c63513b-ae8d-414e-be14-05fc6e899bfc`；Dispatch 以 `terminal_missing` failed/abandoned，未形成 STATUS、报告、命令日志、worker_done 或 Delivery，不构成代码 REJECT。PM 按 `acceptance-recovery.v1` 将其分类为 `safety_unknown → park`，精确 terminal resource 与 GLM provider lease 已释放，worktree 保留；证据为 `pr4-full-source-g14-recovery.json`。
- 并行波次 R2：三项任务文件边界正交，均通过 quota、内存、价值、隔离、dispatch_bind 与 input accepted 门，模型合同为 `glm-5.3-flash[1M]` 且未使用 override。PR #4 reviewer 只读 18 文件候选；治理 implementer 在全新 worktree 只读导入旧脏树的四个候选文件，旧树不写不删；runtime verifier 只允许一次冻结命令并独占其启动的 DSH/浏览器/本地模型资源。结构化 receipt 分别为 `pr4-candidate-r2-receipt.json`、`governance-r2-receipt.json`、`pr11-runtime-execution-r1-receipt.json`。
- 08:08 回访：N1 返修已建同 Run 子任务 `task_4ce88f2a778c`，排队原因及完整边界见 CC-V5-009-R2；无新 Dispatch，不能称已派 Worker。进度隔离 r2 的独立角色门、交付价值后门均 PASS（提取其已有 executed[]，并非本轮重跑测试），证据 `isolation-r2-postflight-evidence.json`。PR #11 仍 OPEN / MERGEABLE / CLEAN，head 未变，但云端 checks 为空、真实 Web 未验，不据此直接合并。治理恢复复查仍 UNKNOWN/no_actionable_quota_evidence，无唤醒输入。
- 状态：MAIN_INTEGRATED / PR4_FULL_SOURCE_GATE_PARKED / CI_DIAGNOSIS_PARTIAL / ORCA_VITEST_FORBIDDEN / MERGE_HELD（2026-09-10 17:39）。main 保尾返修已集成且最终树聚焦验证通过；PR #4 `c086b47` 本身未被拒绝。两次外部 CI 均无 OOM，但实际 force-edit 集成 spec 被跳过，尚不足以解除 `safety_unknown` 泊车；Orca 内仍禁止任何 vitest，新 worktree仍须先同步 Q46 护栏。
- 独立 review：生命周期 `task_20dd70cb276f` / `ctx_f7b1b13977f3` / `cc-lifecycle-review-0908`，冻结 `c0c973378ca6d623c974c4914a940747bb813afb`，报告 ACCEPT、66/66，另有上述 N1。进度隔离原 `ctx_697af9f99a67` 未形成有效验收；实际交付为同一 `task_9cc39bdac119` 的 `ctx_43e3b330a1d0` / `cc-isolation-review-r2-0908` / worktree `codex-cc-isolation-review-r2`，HEAD 为 `94818478d2470429b9c0d76e7ebbb4fba99ea855`，报告 ACCEPT、30/30，PM 已核对 HEAD 与 review-acceptance-gate。该 reviewer 首次在错误 main 基线上的 21/21 作废，不计入验收；修正后包含新隔离 spec 的 30/30 才是有效证据。两份报告及命令日志保存在各自 Session Context；生命周期 review 仅覆盖本轮 R10 后修复，不代表远端旧 PR #4 全部通过。
- 本轮验收证据：生命周期 head `c0c973378ca6d623c974c4914a940747bb813afb`，5 个 spec 共 66/66、Host noEmit 与 diff-check 退出 0；进度隔离 head `94818478d2470429b9c0d76e7ebbb4fba99ea855`，3 个 spec 共 30/30、Host noEmit 与 diff-check 退出 0，[PR #11](https://github.com/cat-xierluo/dsh-contract-copilot/pull/11) 为 OPEN，base 为 feat-v5-quality-hardening，远端 head 一致。PM 实际命令日志及结构化 executed[] 证据保存于 Git common-dir 的 `orchestration/cc-audit-20260908/pm-{lifecycle,isolation}-verification.json`；两份 worker-value-postflight 均通过，独立 review 结果见上项；尚未合并，未做全量、真实 Web 或发布验收。
- 资源与恢复：generation 8 三个 Dispatch `ctx_8c591fdefb41`、`ctx_54b36ad76245`、`ctx_8b222fc40cdf` 均为 failed/terminal_missing，terminalResource 已 released，旧终端不存在；三个 worktree 与 Session Context 证据保留。恢复前必须连续确认 runtime 稳定和负载低于 20，并把 main 新增 Q46 配置保护提交 `37d1b24` 等价同步到三个验收环境；之后通过原 Task 的 `--retry-of` 新建 GLM 或 MiniMax Dispatch，不复用旧生命周期身份。
- 派发记录：generation 8 治理 review `task_46b3907a9181` / `ctx_8c591fdefb41`、PR #4 review `task_0503bce321b5` / `ctx_54b36ad76245`、PR #11 runtime `task_895f7ccf5427` / `ctx_8b222fc40cdf` 均已因控制面恢复失败结算；不是业务 REJECT。派发前机械额度预检显示 11%，本波依据用户明确额度授权作限域 override；下一次恢复仍须重新执行新鲜额度、内存、负载和价值门，不能沿用旧放行结果。恢复凭证为 `wave-g8-recovery-g10.json`。
- 文件/依赖隔离：生命周期修复从 R10 `99d6243` 起步，拥有 coordinator/host-api 及对应测试；进度隔离从集成 `35527c2` 起步，拥有 index/session/progress 及对应测试；治理修复从本地主干（含本次审计文档，代码与远端 main 一致）起步，拥有 CODEOWNERS/CI/package.json/配置回归测试。三者不能共用一个检出版本，因此建立独立 worktree；文档仅改各自受影响小节。
- 任务：`CC-V5-009-R1` → `codex-cc-command-lifecycle-0908`；`CC-V5-008-R1` → `codex-cc-agent-progress-isolation-0908`；`GOV-01-R1` → `codex-cc-governance-repair-0908`。Orca/spawn 将分支名中的斜杠规范为连字符，记录实际分支名。
- 设计约束：命令在首个 await 前取得案件所有权，统一取消/关闭并等待收束；进度只按触发 Agent 的 dshSessionId 关联；治理只修有效账号/路径与受支持 Node，保留手动 Actions 和现有律师授权门。beginRecheck 功能扩展、自动 CI、Python 修改不进入本波。
- 安装授权：用户本次整改授权涵盖新 worktree 的锁定依赖安装；PM 将精确命令 `CI=true pnpm install --frozen-lockfile --ignore-scripts --config.package-lock=true` 写入 worker 安装合同，仅作用于其本地 node_modules，禁止软链共享、改 lockfile 或全局安装。沿用 setup inherit，避免自动 setup 在安装门禁落盘前执行。
- 验证：Worker 仅跑合同指定的 scoped spec/typecheck；测试日志保存在其 Session Context，不无界输出。2048 MiB 堆顶保留；全量验证由 PM 在独立验收阶段串行安排。Review 必须绑定40位最终head、不同dispatch/session、有命令退出码证据；未验证的Web/Windows/云端路径如实保留。
- PR：进度隔离交付到 V5 集成分支；治理交付到 main；生命周期先交本地提交给 PM，验收后纳入既有 PR #4，避免为同一异步抽取范围创建重复 PR。不得修改 main 的已有本地提交或强推历史。
- 控制面合同：Git common-dir 的 `orchestration/cc-audit-20260908/dispatch-spec.json` 与 `wave-manifest.json`；Run/Task/Dispatch receipt 及结果在同目录维护，当前任务状态以 Orca Delivery 与 PM验收记录为准。

## AUDIT-2026-09-08：后续 Agent 交付审计与状态校正

- 状态：审计完成；下列整改未完成。本次只更新任务源，不修产品代码、不更新远端 PR、不合并或清理 worktree。
- 范围：本地 main `4518fa2312763bbfbe4285004446c3269d78cee0`（远端 main `30f74753727a5182980fa3fed3359ca55b085f99`）、V5 集成 `35527c2bc39e969bed807c7b67f3dc64ce83f182`、R10 `99d6243`，以及 GitHub PR #2–#10 的实时状态。以下记录校正旧卡的交付状态；原实现范围仍沿用原卡。
- 结论：治理文件和测试层加固已落 main；V5 尚未交付 main；R10 的抽取函数用例通过，但 Agent 命令生命周期仍有阻断缺口。历史 reviewer ACCEPT 与总测试数不能替代这些路径的验证。

| 优先级 | 发现与证据 | 跟踪与退出条件 |
|---|---|---|
| P1 | R10 `src/agent-coordinator.ts` 在 await 抽取与 acquireAgent 之后才登记 active。受控屏障复现同案件两个 runAnalysis 均 accepted，create/followup 各 2 次；抽取中 cancel 返回 `contract-copilot/not-running`；dispose 在抽取 Promise 未结束时返回。 | CC-V5-009：补齐命令准入、抽取取消、创建期间关闭与清理的统一所有权；独立 reviewer 验证全部竞态后才可收口。 |
| P1 | main 与 R10 的 `src/index.ts` pre-step 只读 `store.current()`，未用触发事件的 Agent id 匹配 `dshSessionId`，并更新该案件的 lastInjectedCounter。其他 Agent 先进入 pre-step 时可能收到当前案件名称/进度并消耗其注入水位。这是既有遗漏，非 R10 新引入。 | CC-V5-008：精确关联案件与 DSH session，验证 A/B Agent 隔离、无关联 Agent 不注入、冷启动与恢复。当前为源码确认，实际多 Agent Web 路径 `NOT_VERIFIED`。 |
| P2 | GitHub `codeowners/errors` 返回 14 条错误：4 条 Invalid owner（中文显示名称）、10 条 Unknown owner（@maoking）。末尾 `*` 还覆盖前面规则；若干路径写成不存在的目录而实际为 `.ts` 文件。 | gov-01 重新打开：按真实路径与有效写权限账号校正；远端 errors 为 0，并验证代表性 PR 的 owner 匹配。不得由审计推断或新增协作者权限。 |
| P2 | `.github/workflows/ci.yml` 三个 job 均指定 Node 20，项目 engines 为 >=22，锁定 tsdown 0.22.14 要求 ^22.18.0 或 >=24.11.0。手动 CI 尚不能作为受支持环境的验收证据。 | gov-01：统一受支持 Node 版本，区分 Host/Client typecheck，验证声明的安装、测试、构建入口；保留手动触发策略。云端执行 `NOT_VERIFIED`。 |
| P2 | PR #4 仍 OPEN / CONFLICTING，远端 head 为 `066270d`、无 review/check；本地 R10 已含该 head 及集成 `35527c2`，但未推送。#2/#3/#5/#6/#7/#8 合入的目标是集成分支，不是 main。 | CC-V5 收口：先修阻断、冻结候选并独立审查，再更新 PR #4；里程碑合入 main 后才能称主版本交付。R10 是原 PR 的后续提交链，不是平行重写路线。 |
| P2 | R10 的 node_modules 是指向 main 的符号链接；本机 pnpm 11.7.0 的 exec 触发依赖检查后因 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` 拒绝继续。两份锁文件/依赖树不能视为独立验收环境。 | CC-V5 收口：建立候选独立依赖环境并固定包管理器版本后复验；本次保留现有链接，未强制清空依赖。 |

### 本次验证与证据边界

- main：`NODE_OPTIONS=--max-old-space-size=2048 pnpm exec vitest run tests/docx-extract.spec.ts --bail 1`，2/2 PASS。本机 pnpm 在执行前自动运行了依赖准备与 prepare/build；未产生受跟踪文件差异。这是同步版测试证据，不能证明 R10 或历史负载事故已全部解决。
- R10：上述 pnpm 入口在依赖检查阶段失败；改用已安装 runner `NODE_OPTIONS=--max-old-space-size=2048 node node_modules/vitest/vitest.mjs run tests/docx-extract.spec.ts --bail 1`，13/13 PASS，含 TERM→KILL、优雅 TERM、并发独占目录和 spawn-failed。只证明当前安装依赖下的单 spec，不冒充 frozen-lockfile 干净安装或全量验收。
- Coordinator 定向复现：用真实 ContractAgentCoordinator/SessionStore，把 extractContractBody 替为可控 Promise 屏障；同案件发起两个 runAnalysis，屏障释放前调用 cancel，再释放并收集结果。输出 `accepted=2, creates=2, followups=2, cancelDuringExtraction=contract-copilot/not-running`。另一路在屏障释放前 await dispose，确认分析仍 pending；释放后才以 coordinator-closed 拒绝。临时脚本 `/tmp/cc-audit-coordinator-20260908.mjs`，命令 `NODE_OPTIONS=--max-old-space-size=2048 node --experimental-transform-types /tmp/cc-audit-coordinator-20260908.mjs`，退出 0；这是确定性调度诊断，不是实际模型/子进程验收。
- GitHub：`gh repo view --json isPrivate,nameWithOwner` 确认当前为私有仓；`gh api repos/cat-xierluo/dsh-contract-copilot/codeowners/errors` 返回上述 14 条错误。CODEOWNERS 仅作用于 PR，不能用来自动路由 Issue；最后匹配规则优先，依据 [GitHub 文档](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)。
- 文档：doc-curator `--only context-sync --since cddba44` 返回 1 ok / 0 hard，但实际使用 FaroPDF 兜底配置，只检出 DECISIONS 已更新，不能证明本项目任务状态正确。CC-V5-005 仍未完成。Q44 只在异步分支，main Q45 对其引用需要随集成补齐；旧 lint 的 10 FAIL 也没有整改验收，不得宣称发布门禁全绿。
- 本次未运行全量测试、云端 Actions、真实 DSH Web/模型或 Windows 验收。未新增 worker、未干预其他 Agent 的运行资源；本次审计不构成任何分支的合并许可证明。

### 接续顺序

1. 先处理 CC-V5-009 的生命周期缺口与 CC-V5-008 的 Agent 隔离；两项涉及共享接线，派发前重新核对文件所有权和依赖，不同时修改同一模块。
2. gov-01 的 CODEOWNERS/Node 配置校正可与产品整改按文件边界独立推进；gov-04 自动 CI 方案保持暂停，避免覆盖现行手动策略。
3. R10 独立依赖环境与最终候选验收 → 更新/审合 PR #4 → 集成分支吸收 main 的治理/测试改动并解决文档冲突 → 真实工作台验收 → 里程碑 PR。清理仅在合并与资源归属确认后执行。

## Q46-MAIN-TAIL-CAP-G12：main 输出收集保尾上限与真实超限行为测试

- 状态：INTEGRATED（2026-09-10）；实现提交 `b4a126ac112223342dace9863243264465637748` 经独立 GLM reviewer `ACCEPT_WITH_FINDINGS`、零 blocker 与 PM value-postflight 放行后集成 main；按派发合同未单独 push 或新建 PR
- 目标：落实 Q46 审查 F1/F2——F1：main 的 `OUTPUT_CAP` 此前零行为测试；F2：原保头截断方向与真实标记位置相反（判类标记与 summary 行都在输出尾部）
- 范围：仅 `src/python-bridge.ts`（stdout/stderr 改为每流独立、UTF-8 字节计量、保尾 8MiB，达上限后继续排空管道；修正注释）与 `tests/python-bridge.integration.spec.ts`（新增真实超限行为测试）；取消、进程树 TERM/KILL、forced settle、`classify`/`parseStdout` 语义不变；不改治理、PR11 或其他产品行为，不动 Python 脚本
- 验收：真实子进程经真实管道向两流各写约 9.5MiB，证明两流独立 ≤8MiB、前部 filler 被淘汰、退出前尾部判类标记与产物路径/统计行仍驱动 `classify`/`parseStdout`；三条 scoped 命令 exit 0
- 证据（2026-09-10）：新增 describe「runApplyCli 输出上限（真实超限 spawn）」（fixture skillRoot + `pythonExecutable: 'sh'`，yes/head 灌 512KiB 前部 filler + 9MiB 后部 filler + 尾部标记，exit 1）。断言：两流各自 `byteLength ≤ 8MiB` 且 `> 7MiB`（独立预算、真实触发截断）、前部 filler（`AAA-FRONT-FILLER-`/`STDERR-A-FRONT-`，整体落在被淘汰前缀内）不存在、后部 filler 与尾部存活、`kind === 'partial'`、`parsed` 四元组精确匹配。红绿证据：收集器临时改回保头方向后同命令失败（`not to contain 'AAA-FRONT-FILLER-'`，exit 1），恢复保尾后 21/21 绿。verified_head 与逐命令退出码见 `.claude/agent-sessions/cc-q46-main-tail-g12/verification.json`（提交后于最终树复跑三条命令）

## TASK-2026-09-06-orca-gov-01：governance: dsh Phase 1 — PR 模板 + CODEOWNERS + CI baseline

- 状态：`IMPLEMENTATION_ACCEPTED_PENDING_REVIEW（2026-09-09 23:14）：提交 988d344 已通过 PM 四项独立复验；Dispatch ctx_54ef8fb95dec 的 Worker/provider lease 已 release，Delivery 已 ack。结构化证据格式缺口由控制面 receipt 记录，不扩大为代码通过；系统负载回落且 reviewer worktree 同步 Q46 护栏后再派不同 GLM reviewer。`
- 类型：`implementation`
- 来源：2026-09-06 桌面 `orca-governance-adoption` 调研；同目录 `ADOPTION-dsh-contract-copilot.md` §1 + `CHECKLIST.md` Phase 1
- 关联材料：`docs/orca-governance-adoption/ADOPTION-dsh-contract-copilot.md`、`docs/orca-governance-adoption/CHECKLIST.md`

### 问题

dsh-contract-copilot 是公有仓库但仓库内 0 个 `.github/` 文件：PR 描述纯自由文本（无机读锚点）、业务规则路径无 CODEOWNERS 路由、完全无 CI——`ADOPTION-dsh-contract-copilot.md` 现状盘点已把"完全没有 CI"列为最大缺口。协作律师 `@杨卫薪律师` 对业务规则有审核资格但代码层 ownership 未声明，PR review 只能靠口头找人。

### 目标

按 orca-style 给 dsh 装最小可用的入口与门禁三件套，让 PR 描述可机读、协作律师自动进入 review 圈、CI 在合并前必跑 typecheck + test + build（含 `NODE_OPTIONS=--max-old-space-size=2048` 堆顶防护，与本机 vitest 堆顶一致，固化 `7eae439` 的止血措施到 CI runner）。

### 验收标准

- [x] `.github/pull_request_template.md` 新建（约 50 行 Markdown，含 ELI5 / Summary / Why / What Changed / Linked Issue / Visual Proof / Test Plan / AI Disclosure / Notes / Checklist 锚点，模板全文见 `ADOPTION-dsh-contract-copilot.md` §1.1）— 交付 head `e8a7c73`，50 行，含全部锚点
- [ ] `.github/CODEOWNERS` 有效路由：校正实际 `.ts` 路径、有效 owner 与规则顺序；GitHub errors 为 0 且代表性 PR 请求正确 owner。原验收只确认文本存在，2026-09-08 远端校验否定其有效性。
- [ ] `.github/workflows/ci.yml` 三 job 文件已落地，但 Node 20 不满足项目/锁定构建器要求；在受支持版本完成验收后勾选。保留 `workflow_dispatch` 手动触发与 2048 MiB 堆顶；手动运行本身仍使用 Actions 资源。
- [ ] 仓库 Settings → Branches → main → Branch protection rules 勾 `test` 与 `typecheck` 为 required status check — **N/A**：CI 不再自动触发（workflow_dispatch），分支保护 required check 不再有意义；合并前通过本地 `pnpm typecheck && pnpm test && pnpm build` 全跑验证
- [ ] 在 fork 或新 branch 上各填一个 PR 跑完整 CI（typecheck + test + build），确认 ELI5 / What Changed 等锚点可机读、CODEOWNERS 自动请求律师 review — **留给维护者**（web UI；CODEOWNERS 律师路由已知不触发因律师账号未加 Collaborator，按用户 2026-09-06 修订走本地协作路径）
- [x] commit 风格沿用 dsh 现有约定（英文 type prefix + 中文说明 + 中文正文），示例：`chore(governance): adopt orca-style PR template + CODEOWNERS + CI baseline (Phase 1)` — 逐字一致
- [x] 不修改任何已有源文件、测试；新增文件仅限 `.github/` 下 — diff 4 文件（PR 模板/CODEOWNERS/ci.yml/CHANGELOG）；后补加 package.json typecheck script（CI 防御补全，PM 授权）

### 执行证据（2026-09-06）

- **PR #10**：https://github.com/cat-xierluo/dsh-contract-copilot/pull/10（head `e8a7c73356bc0d06f38d00ca6c9e66685ebb9057`，base main）
- **scoped 验证复跑**：`grep -q 'max-old-space-size=2048' .github/workflows/ci.yml` 等全部 PASS
- **safe-push OID 全链核验**：IDENTITY_GATE_COMMIT_OK / base=291c57c / head=e8a7c73 / commits=1 / expected name+email match
- **PM 接管 audit ambiguous**（同卡 03）：与 INFRA-FOLLOWUPS #1 同根因，PM 在 PR #10 留 comment 标内容等价证明
- **资源收口**：worker worktree /Users/maoking/orca/workspaces/dsh-contract-copilot/chore-governance-phase1 已 `git worktree remove --force`，CLEANED

### 风险与边界

- 2026-09-08 勘误：中文显示名称被 GitHub 判为 Invalid owner，不能当作有效 GitHub username；`@maoking` 亦报 Unknown owner。修复前先核实既有账号/写权限，不能据旧卡推断权限或擅加协作者。
- 当前仓库为私有（2026-09-08 GitHub 查询），旧“公有免费适用”前提失效；第三方机器人与计费未验证，本卡不引入。
- CI 端 `NODE_OPTIONS=--max-old-space-size=2048` 是合约级必保留的——见 `orca-oom-crash-loop.md` 2026-09-06 14:25 / 15:16 / 16:32 三轮收场记录，崩 1 次/59 秒与崩 1 次/107 秒的实际差就是这道护栏
- Phase 2（路径感知 pr.yml + verify required check）、Phase 3（CodeRabbit + pullfrog）由本卡 4 / 卡 3 / 卡 2 后续处理，本卡不引入

---

## TASK-2026-09-06-orca-gov-02：test: 根治 dsh vitest 状态污染循环 — 临时目录严格隔离 + claude 工作流限定

- 状态：`main 测试层加固已完成；历史独立 reviewer 证据保留。2026-09-08 审计限定：同步版验证不能推及 R10、所有并发负载或整机 OOM 根因；R10 命令生命周期另由 CC-V5-009 跟踪。`
- 类型：`implementation`
- 来源：2026-09-06 桌面 `orca-governance-adoption` 调研 + 同日 `orca-oom-crash-loop.md` 末段 16:32 全套件长跑归因
- 关联材料：`docs/orca-governance-adoption/CHECKLIST.md`（dsh Phase 1 注解段）、`docs/orca-governance-adoption/ADOPTION-dsh-contract-copilot.md` §1.3 堆上限注解

### 问题

dsh vitest 测试套件存在"claude 会话反复跑 `pnpm test` → 状态污染 → 失败 → 重试 → 崩溃循环"的真实事故链。`orca-oom-crash-loop.md` 2026-09-06 16:32 全套件长跑 24 分钟终版归因：113 个测试里 25 失败 / 7 个 spec 失败、**零新崩溃报告**（堆顶 + 后台 I/O 双保险已让 OOM 假说不成立）。真正根因是**会话侧状态污染而非 OOM**：
- `docx-extract` 4 个失败：30s test timeout（后台优先级下 Python 子进程慢）+ 临时目录 fixture ID 残留（`expected [] to deeply equal ['cc-docx-65575-...']`）——跨 spec 临时目录不隔离
- `agent-coordinator` 6 个失败：全 10s `beforeEach` hook 超时，启动 DSH 进程派生在后台优先级下被卡
- 崩 1 次/59 秒是被 `NODE_OPTIONS=--max-old-space-size=2048`（commit `7eae439`）截断的**次生现象**，根因是会话侧并发 + 临时目录不隔离 + 真实 Python/DSH 子进程派生叠加

`AGENTS.md` / `CLAUDE.md` 没有限定 claude 工作流（"不要让 claude 跑 `pnpm test` 全量"），导致 claude 会话继续触发同款循环。

### 目标

把 16:32 终版归因的"真正根因"在 dsh 仓库内修掉：① 给关键 spec 加 `beforeEach` / `afterAll` 临时目录严格隔离；② 提到 `agent-coordinator.spec.ts` 的 hook 超时上限 ≥30s；③ 在 `AGENTS.md` / `CLAUDE.md` 加 claude 工作流限定——让 claude 跑单 spec 或 `--bail` 早停，不跑全量。

### 验收标准

- [x] `tests/docx-extract.spec.ts` 加临时目录严格隔离：beforeEach 把进程级 TMPDIR 重定向进独占 mkdtemp 目录，afterEach 还原环境后断言零 `cc-docx-*` 残留（守卫自检注入假残留验证过断言会红）；勘误：卡内引用的失败信息实际顺序为 `expected ['cc-docx-...'] to deeply equal []`（vitest 打印"实际 to deeply equal 期望"），语义即"发现残留"，归因方向不变
- [x] hook 超时上限 ≥30s：落地为新增 `vitest.config.ts` 全局 `hookTimeout: 30_000`（卡内明示允许的全局方案），覆盖 agent-coordinator 及所有在 hook 里派生真实 python3 的 spec
- [x] `AGENTS.md` 新增"claude 会话跑测试的限定"段：禁止 agent 会话直接 `pnpm test` 跑全量；推荐 `pnpm vitest run tests/<single-spec>` 或 `--bail 1` 早停
- [x] 受控环境（机器空闲、单 runner、堆顶在位）3 连跑 16 个 spec 完整套件：266/266 全绿 ×3（每轮 ~1.4s）、零临时目录残留断言失败、零崩溃报告；`$TMPDIR` 无新增残留
- [x] 提交后由独立 reviewer 在 PM 同一 commit 上复跑一次，确认结果一致（2026-09-06 通过：独立会话在 507aaef / HEAD 6a48422 上静态核对 hookTimeout 与 TMPDIR 隔离断言后全量复跑 2 次，均 266/266 全绿、退出码 0、零崩溃、零 hook 超时；cc-docx-extract- 计数运行前后均 5、零新增，mtime 确认全为历史遗留。结论：验收通过）
- [x] 提交信息沿用 dsh 风格：`test: dsh vitest 状态污染根治 — 临时目录隔离 + hook 超时 + claude 工作流限定`
- [x] 不修改 product 源码（`src/`）；只动 `tests/docx-extract.spec.ts`、`vitest.config.ts`（新建）、`AGENTS.md`

### 执行证据（2026-09-06）

- 根因物证：`$TMPDIR` 内 5 个 `cc-docx-extract-*` 残留目录（含 noisy-python / term-ok-python / garbage-python fixture 与 `cc-docx-<pid>-<rand>` 子目录），时间戳与 8 份 node OOM 崩溃报告（09-05 21:29/21:41/21:57/22:53/23:02 + 09-06 14:25/15:05/15:12/15:31）一一对应；另有 7 个 `cc-bridge-term-*` 残留
- 基线：main 空闲机器全量 266/266 全绿、1.59s——证明失败为负载诱导（并发全量跑 → python3 派生超 hook/test 上限 → 在飞清理泄漏 → 残留断言失败），非确定性 bug
- 修复验证：守卫自检（注入 `cc-docx-999999-injected.py` → 断言红，失败信息含注入文件名）→ 删除自检文件；全量 3 连跑 266/266；dsh-plugin-lint 已跑（10 FAIL 均为 §5 client 构建产物存量问题，与本次无关，§8 卫生 PASS）
- 附带修复：docx-extract fixture 不再依赖 python-docx（旧 makeDocx 的 `|| true ||` 回退永不执行）；决策记录 Q45

### 风险与边界

- 本卡**不**移除 `NODE_OPTIONS=--max-old-space-size=2048`——堆顶是与 CI 共享的合约级护栏（见卡 1 §1.3 验证）
- 临时目录隔离是治本方向；不引"减少 vitest worker 数量"——用户已拒绝该方案（本卡原记录 [[no-worker-count-limits]]）
- 16:32 归因已确认 vitest OOM 假说不成立——本卡不重做 OOM 调查，避免循环
- 如 3 次复跑仍出现 docx-extract 临时目录残留，可能需要 `mkdtemp` 串行化（不直接动 worker 数）——超出本卡，留作后置观察
- CC-V5-004 异步抽取（DECISIONS Q44，feat-v5 波次）合入 main 后，docx-extract.spec 以该分支的异步版为准（其 mkdtemp-per-run + TMPDIR 重定向设计与本卡同构）

---

## TASK-2026-09-06-orca-gov-03：governance: dsh Phase 1 增补 — issue 业务规则模板 + module dropdown

- 状态：`模板内容已交付 main；GitHub 表单实操尚未验收（2026-09-08 校正）。PR #9 为 CLOSED、非 MERGED；其两份 Issue 模板与 main 内容一致，不能把本地内容收编表述为 PR #9 已合并。`
- 类型：`implementation`
- 来源：2026-09-06 桌面 `orca-governance-adoption` 调研
- 关联材料：`docs/orca-governance-adoption/ISSUE-LIFECYCLE.md` §6.2、`docs/orca-governance-adoption/CHECKLIST.md` dsh §Phase 1 增补段

### 问题

dsh 是合同审查业务规则工具——bug 类型高度结构化（合同主体 / 计划审核 / 字段抽取 / docx 渲染 / Python 桥），但仓库内 0 个 issue 表单、0 个 issue labeler、0 张业务规则专用 issue 模板。用户/律师直接打 issue 没有结构化表单，CODEOWNERS 路由靠"@律师"手动提及，template 字段缺失导致 reviewer 第一次回复常常是"麻烦告诉我这是哪条规则"（见 `ISSUE-LIFECYCLE.md` §6.2 的对偶论证）。

### 目标

按 `ISSUE-LIFECYCLE.md` §6.2 的"业务规则审核专用版"落地两个文件：① 新建 `01-business-rule-review.yml`（杨律师专属，触发条件=用户投诉合同审查逻辑错/律师提出改进）；② 在 `bug_report.yml`（新建）加 `module` dropdown（intake / plan-review / docx-view / python-bridge / session），让 CODEOWNERS 自动路由 + 模板字段双重定位。

### 验收标准

- [x] `.github/ISSUE_TEMPLATE/01-business-rule-review.yml` 新建（含杨律师专属字段如 `rule_version`、`affected_contract_clause`、`repro_docx_path`，完整 YAML 见 `ISSUE-LIFECYCLE.md` §6.2）— 交付 head `e9ec7c9`，三必填字段齐
- [x] `.github/ISSUE_TEMPLATE/bug_report.yml` 新建：含 `module` dropdown（intake / plan-review / docx-view / python-bridge / session），加上 `os`、`details` 必填字段；title 前缀 `[Bug]: `、type: Bug、labels: ["bug"] — module 五选项齐，fields=3
- [ ] 若需要禁止空白 Issue，核对 `.github/ISSUE_TEMPLATE/config.yml` 的 `blank_issues_enabled: false` 配置与实际入口；当前尚未落地。
- [ ] 验证 bug 与 business-rule-review 表单的必填字段、module dropdown 与提交结果；CODEOWNERS 只处理 PR review，不列为 Issue 自动路由验收。
- [x] commit 风格：`chore(governance): issue template — 业务规则审核 + module dropdown (Phase 1 增补)` — 逐字一致
- [x] 不修改任何已有源文件、测试；新增文件仅限 `.github/ISSUE_TEMPLATE/` — diff 恰 3 文件 +98/−0

### 执行证据（2026-09-06）

- **PR #9**：https://github.com/cat-xierluo/dsh-contract-copilot/pull/9（head `e9ec7c9599d5aa9fd0927c32398ea3364991d228`，base main）
- **三门全过**：dispatch-value-gate（v2 spec ok）→ worker-value-postflight（ok:true，2 evidence，零越界）→ review-acceptance-gate（ACCEPT，ordinary_delivery:true）
- **独立 reviewer**：7/7 PASS（字段、边界、YAML、CHANGELOG、内容质量、commit 风格）；4 条非阻断观察：label 仓库预建、rule_version 示例口径、node_modules 工作区残留（已清）、docs 入库状态（误报，6a48422 已含）
- **PM 接管 audit ambiguous**：multi-agent-orchestration skill INFRA-FOLLOWUPS #1 已知 bug（pr-audit hunk-header 指纹边界导致 diff 内容等价被判 ambiguous→suspected）；safe-push OID 全链核验替代审计 exact：IDENTITY_GATE_COMMIT_OK / base=291c57c / head=e9ec7c9；PM 在 PR #9 留 comment 标内容等价证明
- **资源收口**：worker worktree /Users/maoking/orca/workspaces/dsh-contract-copilot/chore-issue-templates 已 `git worktree remove --force`，provider-lease 文件保留（脚本不管）

### 风险与边界

- 本卡**不**创建 labeler workflow（`issue-labeler.yaml`）——folia 的影响面→severity 映射对 dsh 不直接适用（dsh 的"影响面"是业务规则被破坏面，不是 macOS/Windows/Linux）。后续如需按 `module` 自动加 label，再开卡 3+
- 不创建 `other.yml`——`ISSUE-LIFECYCLE.md` §1.2 论证"other 是兜底不是默认"，dsh 双维护者+律师可直接走 bug_report + business-rule-review 二选一
- `01-business-rule-review.yml` 的字段命名要稳定 schema-friendly（`rule_version` 而非 `规则版本`）——便于后续 AI reviewer / 内部 PM 消费
- worker 自动 push + 开 PR 是另一会话 2026-09-06 v2.22.0 默认权限升级带来的副作用（worker 隔离在专属分支、push+PR 是必要交付路径、安全类按分段校验放宽）；本仓派发 spec 未显式授予 push 权，worker 依赖默认新规则执行——已 PM 接管认领而非推倒重来

---

## TASK-2026-09-06-orca-gov-04：governance: dsh Phase 2 — 路径感知 PR workflow + verify 必为 required check

- 状态：`暂停／需重订方案（2026-09-08 审计）：现行 CI 已改手动触发，本卡自动 PR workflow 与 required check 的前提过期，不再按旧卡直接派发。`
- 类型：`implementation`
- 来源：2026-09-06 桌面 `orca-governance-adoption` 调研
- 关联材料：`docs/orca-governance-adoption/ADOPTION-dsh-contract-copilot.md` §2.1–§2.2、`docs/orca-governance-adoption/PR-LIFECYCLE.md` §3.3 反直觉警示、`docs/orca-governance-adoption/PR-LIFECYCLE.md` §6 信任脚本模式

### 问题

当前 `.github/workflows/ci.yml` 仅手动触发，docs-only PR 不会自动跑全量。以下目标/验收保留为原方案，尚未按手动策略重订；先明确本地验收与合并门如何执行，再决定是否恢复自动 PR 检查。

### 目标

按 `ADOPTION-dsh-contract-copilot.md` §2.1 实现 detect → fan-out → verify 聚合模式，docs-only PR 跳过贵 job（typecheck / test / build 全 skipped，verify 打印"docs-only"消息后通过）。**关键补丁**：分支保护必须显式把 `verify` 勾为 required check（避免 orca 那种"有 CI 但拦不住 PR"的反例）。`pr-test-loc.yml` 写权限 workflow 脚本从 default branch 拉（不执行 PR head），照搬 `PR-LIFECYCLE.md` §6 的"高权限 workflow 不执行 PR 代码"原则。

### 验收标准

- [ ] `.github/workflows/pr.yml` 新建：detect job（按 `git diff --name-only origin/main...HEAD` 输出 `src_changed` / `docs_only` / `worktree_only` 三个布尔）→ fan-out（`typecheck` / `test` / `build` 三 job 按 `src_changed` 触发）→ verify 聚合 job（`needs: [detect, typecheck, test, build]` + `if: always()`；docs-only PR 走"docs-only"快速通过路径）
- [ ] `.github/workflows/pr-test-loc.yml` 新建：测试 vs 实现 LoC 比值评论到 PR；**关键安全设计**——脚本通过 Files API 从 default branch（`main`）拉取（`actions/checkout@v6` with `ref: main`），不执行 PR head 代码（参考 `PR-LIFECYCLE.md` §6 完整 YAML）
- [ ] 仓库 Settings → Branches → main → Require status checks 显式勾 `verify` 为 required check（**不**只勾 `typecheck` / `test`——这是 orca 反例的核心教训）
- [ ] 提交一个 docs-only PR（如改 `README.md` 单行），确认 typecheck / test / build 全部 skipped、verify 通过
- [ ] 提交一个 src 改动 PR，确认 typecheck / test / build 全跑、verify 通过
- [ ] commit 风格：`chore(governance): path-aware PR workflow + verify required check (Phase 2)`
- [ ] 重订时明确与现行手动 `ci.yml` 的关系；旧“保留 push:main 常规 CI”描述已不成立。

### 风险与边界

- **不照搬 orca 的 e2e 红态降级逻辑**——`PR-LIFECYCLE.md` §2.2 明确建议"folia / dsh 不应照搬 orca 的 e2e 红态降级"，除非 e2e 稳定绿 1 个月。dsh 没有 e2e，不涉及
- 关键安全点：pr-test-loc.yml 持 `pull-requests: write`，必须从 default branch 拉脚本，否则恶意 PR 可借 workflow 篡改度量逻辑或发垃圾评论
- 本卡**不**引入 CodeRabbit / pullfrog——属 Phase 3
- 分支保护勾 verify 这一步必须在 GitHub web UI 手动操作（API 在 org 级别不可见），PR 验证前请 reviewer 截图保留

---

## TASK-2026-09-06-orca-gov-05：investigation: 完成 orca 治理调研的全套对照 — 从 dsh 出发探索 folia 同款落地

- 状态：`已完成（2026-09-06，落地部分随 6a48422 提交；原"本卡显式不 commit"验收项被用户 2026-09-06 下午授权推进推翻）`；跨仓库对照（dsh ↔ folia，Phase 4）不在本卡范围、未做
- 类型：`investigation`
- 来源：2026-09-06 桌面 `orca-governance-adoption` 调研
- 关联材料：`docs/orca-governance-adoption/` 全部 11 份文件、本卡 1–4

### 问题

2026-09-06 桌面 `orca-governance-adoption/` 11 份文件是 orca 治理体系的完整调研（2782 行），但桌面文件夹未来可能不可达。dsh 仓库需要的不是"读完桌面文件再决定怎么做"，而是"一打开仓库就能找到所有调研材料并继续工作"。本卡是元任务——保证接手 agent 在 dsh 仓库内能完成"定位调研材料 + 理解 4 张实现卡 + 跨仓库对照（dsh ↔ folia）"的完整链路。

### 目标

让接手 agent 在 dsh 仓库内能完成三件事：① 找到 `docs/orca-governance-adoption/` 11 份文件并按 `HANDOFF.md` 文件清单顺序读；② 按 `status/TASKS.md` 顶部 4 张实现卡的卡序（卡 1 → 卡 2 → 卡 3 → 卡 4）领卡；③ 在 dsh 落地过程中能对照 `ADOPTION-folia.md` 验证 folia 同款机制（如 `_test` / `_lint` 路径分支、squash merge 配置），把 folia 已验证的 YAML / 配置直接复用为 dsh 起点。

### 验收标准

- [x] 11 份材料已落库，`6a48422` 与当前文件清单可核对；与桌面原稿逐字节一致是历史自报，本次未复验，且 HANDOFF 已有有意新增的仓库入口。
- [x] 5 张治理任务卡已落库。
- [x] HANDOFF 顶部已有本仓库入口及任务源指向。
- [x] CHANGELOG 的 Planning（2026-09-06）段已有材料与任务卡说明，版本号未改。
- [x] `git show --stat 6a48422` 为 14 个文档文件，含同批卡 02 的 DECISIONS；原未提交状态/文件数合同被实际合并提交取代。
- [x] 该提交没有 src/、tests/、package.json、tsconfig、CI 配置改动。
- [x] 原“不 commit”验收已被本卡记录的后续授权取代；交付提交为 `6a48422`，不再保留为未完成事项。
- [x] 本卡产物不含源码、测试或 CI/Issue 模板；治理实现由其他卡跟踪。

### 风险与边界

- 桌面 `orca-governance-adoption/` 是只读参照源，本仓库内的副本是"dsh 接受 orca 治理调研的完整入口"——**复制而非引用**，避免桌面不可达时丢上下文
- 本卡 5 与卡 1/2/3/4 是元-实现关系：先有本卡 5 把材料落到 dsh，再派发卡 1/2/3/4
- 跨仓库对照（dsh ↔ folia）属 Phase 4 探索——不在本卡 5 范围
- 用户授权（DEC-046）下"自动推进策略"对 5 张卡的派发：默认 `converge` 模式全局同时活跃 worker ≤3、docs-only 必须至少推动 `DRAFT → READY`；本卡 1 / 卡 3 / 卡 4 是 implementation，卡 2 是 test，卡 5 是 investigation — 任何一张派发前确认与 CC-V5 / CC-V4-* 在途任务的资源/分支不冲突

---

## CC-V5：工作台质量加固波次（搁浅恢复，2026-09-06 PM 接管）

- 状态：进行中；波次定义与任务卡权威在集成分支 `feat-v5-quality-hardening` 的 status/TASKS.md（PR #2/#3/#5/#6/#7/#8 已合入该分支，PR #4 OPEN 待审）
- 2026-09-05 会话中断导致波次搁浅：R3 现场（TERM→KILL + mkdtemp，Q44 修订）已保全为 `fix-cc-v5-async-docx-extraction` 上的 WIP commit `56d2805`
- 2026-09-08 校正：R4 为中断现场提交 `612575d`；后由 R10 `99d6243` 完成两个测试缺口，抽取 spec 本次 13/13 通过，但整个异步命令生命周期尚未收口。后续须先整改、独立审查，再更新 PR #4 → 里程碑 PR。
- 独立佐证：`package.json` vitest 堆顶止血已落 main（`7eae439`）
- 2026-09-07 分支清理记录保留：6 个 stale 分支及 worktree 已清理；`contract-copilot-v301-assets` 按原验收记录保留。2026-09-08 校正：R10 是 PR #4 head `066270d` 的后代，含 merge-forward `dda96bc` 及集成 tip `35527c2`，不是平行路线；继续保留待修复/审查，不需把集成 PR 补丁平铺重放。本次未执行清理。
- 2026-09-07 审计发现：远端 PR #4（`066270d`）base 落后 feat-v5 tip——其基线只含到 #2，缺 #3/#5/#6/#7/#8 约 3129 行，审合前须先 update branch 或 rebase 到最新集成分支
- 2026-09-09 分支清理（用户确认，worktree 22→11、本地分支 22→12）：删除 11 个已收口 worker worktree 及 10 个分支 ref——isolation-review-0908/r2（r1 force-settle 留待收口、r2 ACCEPT 30/30 已进 main）、command-lifecycle-0908 + lifecycle-review-0908（R1 交付 c0c9733 已是 R2 交付 058ce80 祖先）、lifecycle-n1-review-0909 与 pr4-candidate-review-0909（同 tip 058ce80，ref 可删）、pr11-runtime-safe-design/safe-review/profile-manifest-review-0909 及 PARKED 的 pr11-runtime-review-0909（已被 safe→prep→execution 链取代）。**保留**：`codex-cc-lifecycle-n1-0909` 分支（058ce80 为 PR #4 收口交付头）、三个活跃 GLM worker 现场（governance-r2 / pr4-candidate-r2 / execution-r1）、governance-repair-0908（只读恢复输入）、prep-r1/r2（execution-r1 依赖）、`codex-cc-agent-progress-isolation-0908`（PR #11 head）、r10 / docx-extraction（PR #4 链）、feat-v5（集成分支）、远端 v301-assets（用户决定保留）。各 session 证据已归档至 `.git/orchestration/cc-audit-20260908/archive-<session>/`，清理 receipt 同目录 `branch-cleanup-20260909.json`；分支删除均按 expected-tip 绑定（仅 isolation-review-r2 因已进 main 用 `-d`）。
- 2026-09-10 分支清理二轮（用户会话确认，worktree 18→5、本地分支 20→9）：删除 13 个已结算/被取代 worker worktree（g11–g13 全部 consumed/released 的 7 个 + governance-repair/prep-r1/r2/pr4-candidate-review-r2/R3/R10 旧现场 6 个）与 11 条分支 ref，session 证据 16 个目录先归档 `.git/orchestration/cc-audit-20260908/archive-<session>/`。**g14 树经用户确认删除**（recovery 凭证 worktree:preserved 被取代：树内零产物，恢复按 resumeConditions 新建 worktree，冻结 head `c086b47` 经 `glm-cc-pr4-tail-cap-g12` 可达）；governance-repair 脏 diff 与 `988d344` 逐字节等价后删。保留分支含交付头 `glm-cc-q46-main-tail-g12`(b4a126a)、`glm-cc-pr4-tail-cap-g12`(c086b47)、`ci/diagnose-force-edit-oom`（定界续接载体）；远端未动（`origin/fix-cc-v5-async-docx-extraction` = PR #4 head 严禁删除）。PM 注意：governance-r2 树 CHANGELOG/TASKS 与 feat-v5 树 package.json 的未提交编辑仍在，未触碰。详见 `branch-cleanup-20260910.json`。

### CC-V5-008：恢复 Agent 专属进度注入任务

- 状态：实现及独立 review 已交付；冻结 head、30/30 有效证据与资源结算见本页 WAVE-2026-09-08。PR #11 尚未合并，真实多 Agent Web 路径仍为 NOT_VERIFIED，任务不关闭。
- 目标：pre-step 按事件 Agent id 精确查找 dshSessionId 对应案件；无关联案件不注入，不消费其他案件进度水位。
- 范围：`src/index.ts`、`src/session.ts`、`src/progress.ts` 与对应测试/受影响文档；不改 Python 或律师授权规则。
- 验收：A/B 案件与无关联 Agent 的交错 pre-step、相同案件重复步、冷启动/resume 均隔离且可恢复；绑定最终候选的独立审查与代表性 DSH 路径。诊断依据见本次审计表。

### CC-V5-008-RUNTIME-GATE：PR #11 打包与多 Agent 真实入口验收

- 状态：HIGH_LOAD_HOLD / RUNTIME_NOT_EXECUTED（2026-09-09 22:59）；Dispatch `ctx_2327323e5c12` 因第四次 Orca 重启 terminal_missing 并已 release。无 runtime-gate owned 进程或 43187/53849 监听，单次执行预算继续保留；负载 `<20` 且 worktree 同步 Q46 护栏前不恢复。真实工作台仍 NOT_VERIFIED。
- 旧 unsafe 现场：PM 在 16:16 发送纠正消息 `msg_64f9c0a5b4f3`，随后发现旧脚本仍执行内嵌 profile 安装、全量 skill 复制及清除旧运行目录；旧任务因此按 safety_unknown 停止，精确进程、端口、Dispatch 与 lease 已结算，证据保留在 `pr11-runtime-receipt.json` 与 `pr11-runtime-safety-recovery.json`。该旧结果不作为当前门禁证据。
- 恢复决策：用户授权继续稳定性恢复后，脚本设计、静态复审、profile 准备、manifest 复审已串行完成；当前 runtime Worker 只使用合成 fixture、已验收 tarball/manifest 与独立运行目录。允许执行一次冻结验收命令不扩大为额外安装、真实 skill 读取或外网访问授权。
- 恢复 R1：用户于 2026-09-09 授权当前 PM 接手后续任务并优先稳定运行。新建同 Run 子任务 `task_6a5214f8049a`（CC-V5-008-RUNTIME-GATE-SAFE-DESIGN），先由全新 GLM 5.3 Flash worktree 仅编写执行前脚本候选；本阶段禁止安装、build/pack、启动 DSH/浏览器/模型服务、读取真实 skill 或旧复制件，也不执行候选脚本。静态策略门由 Git common-dir 的 `runtime-gate-static-policy.mjs` 提供，派发价值门 PASS。完成后必须换不同 Dispatch/Session 独立审查，获准后才另建真实运行任务。
- R1 派发：17:46 首次 spawn 因 `glm-api` 余量 0% 在零副作用阶段拒绝；18:30 新鲜 summary 显示余量恢复至 89%，未使用 override，18:35 重试成功。Dispatch `ctx_fbb67d7a8716` / Session `cc-pr11-runtime-safe-design-0909` / 终端 `term_ebfc3754-c95f-4025-b7c5-0cafd21a94fb`，精确 worktree/branch/head、dispatch_bind、input accepted 与 live exactWorker 已核对；无安装或运行时服务授权。结构化证据见 `pr11-runtime-safe-design-receipt.json`。
- R1 交付与复审：安全脚本候选收到正式 worker_done；worker 三条静态命令及 PM 独立复跑均 exit 0，PM 计算 SHA256 `0b18543eeecba7a5065e9c6f575a3f8bbed698a49867d24a73097389df987386`，交付价值后门 PASS。精确外部终端关闭，worker/provider lease released，再 ack Delivery；脚本从未执行且无安装/服务资源。不同角色的复审 Task `task_f08d7898d8f3` / Dispatch `ctx_5586f20f0049` / Session `cc-pr11-runtime-safe-review-0909` 已正式交付 ACCEPT，四条命令 exit 0、零 blocker；原 review JSON 的机械字段偏差经 `verification_evidence_missing/internal_recoverable` 分类，只生成语义不变的控制面消费副本并通过 review gate。Reviewer 资源已结算、Delivery 已 ack；四项非阻断意见（预检退出码文案、CDP loopback 防御、watchdog 报告语义、hardlink 范围）转交后续执行，不扩大为运行时通过。
- R2 profile 准备：新建同 Run Task `task_6a0b1e29c6df` / Dispatch `ctx_5498202a2a71` / Session `cc-pr11-runtime-profile-prep-r1-0909`，冻结 PR #11 head。GLM 5.3 Flash quota/value/isolation/dispatch_bind/input 门均通过，未使用额度 override。权限只覆盖自身 Session Context、ignored `node_modules/lib` 与派发前不存在的 `/tmp/cc-pr11-runtime-dsh-home-execution-r1-0909`；仅授权 frozen install 和将本地 `candidate.tgz` 添加到私有 web profile 两条精确安装命令。该 Worker 不得执行 runtime-gate、启动 DSH/浏览器/模型服务或监听端口。交付后必须换不同 Dispatch/Session 独立复核 manifest、tarball、安装实体、DSH 假设与脚本 hash，复核 ACCEPT 后才创建运行任务。结构化合同与 receipt 为 Git common-dir 的 `pr11-runtime-profile-prep-{spec.json,prompt.md,receipt.json}`。
- R2 准备恢复：首个 profile 准备 Worker 已完成 frozen install1、30/30、build、pack 和 hash，candidate SHA256 为 `3684d2edc8e384a2d81aedfd3449488e725917ddda480e320ec1a9bf43a0dcc6`；profile install 因命令存在 `authorized_commands` 但缺失于 `allowed_shell_commands` 的授权快照机械失配而 fail-closed。Worker 未改 guard、未执行 runtime、未创建私有 DSH_HOME，正式 failed 后按精确终端/租约顺序完成 release 与 Delivery ack。已结算 Dispatch 不允许 reauthorize；控制面正确拒绝原地复活。因此另建更窄的 Task `task_9156b4e20198` / Dispatch `ctx_cf81db593582` / Session `cc-pr11-runtime-profile-prep-r2-0909` / 全新 worktree，只读复用 R1 tarball/lib，唯一安装命令同时进入 install 与 shell allowlist，仅续做私有 profile 与 manifest。身份/额度/value/dispatch_bind/input 均通过，无 override；详情见 `pr11-runtime-profile-prep-r2-{spec.json,prompt.md,receipt.json}`。
- R2 交付与 manifest 复审：R2 正式 worker_done，私有 web profile 从 R1 `candidate.tgz` 安装成功；27 项实体断言、五条 R2 命令、PM 独立 hash/realpath/package/端口复核及归一化 postflight 均通过。原 verification 路径占位符按 internal_recoverable 只在控制面生成精确命令副本，原报告与一次 `/tmp`→`/private/tmp` realpath 失败/修复记录保留。R2 精确终端关闭、worker/provider lease released，Delivery 已 ack；runtime-gate 从未执行。随后派发不同角色 Task `task_3cbd547779ef` / Dispatch `ctx_9c40e3025ba8` / Session `cc-pr11-runtime-profile-manifest-review-0909`，无 repair/install/runtime 权限，只读复核 manifest、tarball、安装实体、DSH 假设、浏览器/端口及脚本 hash。Reviewer ACCEPT 并完成机械门前不得创建 runtime execution。合同与 receipt 见 `pr11-runtime-profile-manifest-review-{spec.json,prompt.md,receipt.json}`。
- R3 manifest 验收与 runtime 派发：不同角色 reviewer 对冻结 head `94818478d2470429b9c0d76e7ebbb4fba99ea855` 正式 ACCEPT，87/87、脚本 hash `0b18543eeecba7a5065e9c6f575a3f8bbed698a49867d24a73097389df987386`、候选 tarball hash `3684d2edc8e384a2d81aedfd3449488e725917ddda480e320ec1a9bf43a0dcc6` 与资源预检均通过；reviewer 未执行 runtime。Orca runtime 随后重启，PM 以 generation 3 结算旧资源并新建执行 Task `task_c27042d79442` / Dispatch `ctx_13d9514fe5ad` / Session `cc-pr11-runtime-execution-r1-0909`。该 Worker 仅可复制已验收脚本/manifest，前三道静态门通过后最多执行一次精确 runtime 命令；失败、超时或清理不完整即 REJECT，不得重试。
- 旧 unsafe 资源补漏：20:23 资源复查发现旧 worktree `codex-cc-pr11-runtime-review-0909` 自 16:16 遗留的孤儿 shell PID 4811 与 runtime-gate PID 4828，后者持有 `127.0.0.1:53849`。cwd、argv、PPID 与监听器均证明其属于旧 unsafe 验收而非当前 Worker；PM 仅向这两个精确 PID 发送 SIGTERM，均在宽限期内退出，端口复查为空。该遗漏补记于 `pr11-runtime-safety-recovery.json`，旧证据继续保留。
- 输入：PR #11 候选 `94818478d2470429b9c0d76e7ebbb4fba99ea855`、集成 base `35527c2bc39e969bed807c7b67f3dc64ce83f182`；已接受源码 review 与 30/30 证据复用，不重复逐行审查。
- 所有权：独立 GLM 5.3 Flash runtime verifier，Session `cc-pr11-runtime-execution-r1-0909`、短分支/worktree `codex-cc-pr11-runtime-execution-r1-0909`。只写自身 Session Context；所有 tracked 文件、Python、用户 DSH 配置及其他 worktree 禁止修改。不安装、不 build/pack、不 push/开 PR/合并；Codex PM 验收并统一写回。
- 目标：从候选打包件而非源码链接启动独立 DSH profile，以本地合成案件与 replay 验证 A/B Agent 交错、无关联 Agent、同案重复步、冷启动及重启恢复。真实 session/请求日志证明案件关联与注入水位，Web DOM/截图证明工作台入口、切换和恢复；缺任何必需路径均保留 NOT_VERIFIED，不以单测替代。
- 2026-09-09 15:51 执行补充：PM 已回复 worker 问询 `msg_0ba2e9c47883`，现场未发现其他测试/构建入口在飞，可立即串行 build/pack。缺少可安全复用的录制时，允许自身 Session Context 内、仅监听 `127.0.0.1` 的确定性 HTTP/SSE 服务替代 replay，真实 DSH adapter/profile/插件链保持不变；仅用子进程假 key，禁止外部 fallback 和读取用户 session。A/B 分配须可核验而非依赖全局请求顺序；注入内容必须来自候选插件，不能由 fixture 伪造。此方案不证明模型质量或与录制 replay 完全等价。详细授权及检查证据见 `pr11-runtime-local-provider-approval.json`；未修改运行权限 guard。
- 验证：复制后先核对脚本/manifest SHA256、Node 语法与静态策略，再以 2048 MiB 堆顶执行一次 Session Context 内 `runtime-gate.mjs`，最后 `git diff --check`。精确命令与资源边界见 Git common-dir 的 `orchestration/cc-audit-20260908/pr11-runtime-execution-r1-{spec.json,prompt.md,receipt.json}`；runtime 命令不得重试。
- 交付/失效：精确 head/base、tarball SHA256、DSH 版本、executed[] 退出码、逐项真实路径证据及 ACCEPT/REJECT；停止所拥有服务/浏览器，提供资源零净增量证明。head/base 变化即失效，最迟 2026-09-16 复核。正式 worker_done/Delivery 后由 PM 过验收门再结算资源；不声明全产品发布验收完成。

### CC-V5-009：恢复 Agent 命令生命周期与复核入口任务

- 状态：本轮准入/取消/关闭及 N1 返修已局部独立验收；完整 PR #4 源码候选、打包与真实工作台仍未验收，详情见下方 R2 和 CANDIDATE-GATE 卡。原统一 beginRecheck 方案需补全任务合同再派发，不能仅按历史标题实现。
- 目标：一个案件从抽取开始即由一条命令拥有；cancel/dispose 覆盖抽取及 Agent 创建，并等待所拥有的异步工作收束。
- 范围：`src/agent-coordinator.ts`、`src/host-api.ts` 及对应测试/文档；复核相关 SessionStore/Tool 改动在补齐合同后纳入，避免漏掉旧计划与批准失效语义。
- 验收：两个请求在首次 await 前后交错只能接受一个；抽取中 cancel 有效；create/resume 未完成时 dispose 不遗留 handle、迟到 followup 或错误持久状态；相关失败有界且零归属资源残留。不得仅以现有“首次 runAnalysis await 完成后再发第二次”的 busy 用例代替并发验证。

### CC-V5-009-R2：上游中止后的取消与结果投影（N1 返修）

- 状态：ACCEPTED_SCOPED（2026-09-09 09:35）；第 1 个返修 episode 已收束。候选 `058ce80c8ae5c317cc2a83dd9980425acbb286ca` 通过独立复审及两道机械门，71/71、Host noEmit、diff-check 均有独立退出码证据；N1 代码阻断解除，但 PR #4 全候选、真实工作台与合并收口尚未完成。
- 输入：已审候选 `c0c973378ca6d623c974c4914a940747bb813afb` 及生命周期 reviewer 报告 N1。原 ACCEPT 作为历史保留，PM 将 N1 纳入合并前阻断。
- 目标：accepted/followup 后的 upstream abort 不得抑制后续用户 cancel，也不得把仍正常执行的成功交付误投影为 idle；中止、cancel、dispose 交错必须具有一致语义、幂等取消和唯一句柄释放。
- 范围：仅 `src/agent-coordinator.ts`、`tests/agent-command-lifecycle.spec.ts`、`tests/agent-coordinator.spec.ts`；随行更新本任务与 CHANGELOG、受影响 ARCHITECTURE。不改 Python、Client、SessionStore、依赖或律师批准门，不增加 beginRecheck。
- 派发合同：Git common-dir 的 `orchestration/cc-audit-20260908/lifecycle-n1-{spec.json,prompt.md,recovery.json,receipt.json}`。复用同 Run 子任务 `task_4ce88f2a778c`，实际 Dispatch `ctx_b54c55728b44` / Session `cc-lifecycle-n1-0909` / 终端 `term_7b87f064-259c-4731-97d7-adbba39abdea`；spawn 退出 0、dispatch_bind=ok。短分支/worktree `codex-cc-lifecycle-n1-0909` 的 HEAD 已核对为上述冻结候选，独立 local 依赖及自身 Session Context 写权限已显式配置；保留旧分支及 reviewer 树。仅本地提交，独立复审后纳入既有 PR #4，不新开重复 PR。
- 验收：受控 Promise/AbortController 新回归先在修复前失败，再在修复后通过；沿用 R1 五个 scoped spec、Host noEmit、diff-check 三条精确命令（2048 MiB 堆顶）。以最终 40 位 head、executed[] 日志和不同 Dispatch/Session 的独立复审收口；真实 Web 仍须单独验证。
- 资源：实现 Dispatch 已 settled/succeeded；PM 关闭匹配 incarnation 的精确终端并 release，provider lease 已释放，再 ack `delivery_ab8c947f9dbd`。分支/worktree 保留待复审及 PR 收口，未 push 或修改 PR。

### CC-V5-009-R2-REVIEW：N1 返修独立复审

- 状态：ACCEPTED_SCOPED / RESOURCE_SETTLED（2026-09-09 09:35）；同 Run 子任务 `task_7c78851fc4f5`、独立 GLM Dispatch `ctx_dd53f8f4ccac` 正式交付 ACCEPT、零 blocker。PM 核对冻结 HEAD、干净工作树、日志及角色身份后，两道机械门 PASS。关闭原精确终端并 release，provider lease 已释放，再 ack `delivery_53e6b4ffc6c0`；工作树保留待 PR 收口。
- 输入：冻结 `058ce80c8ae5c317cc2a83dd9980425acbb286ca`；实现身份 `ctx_b54c55728b44` / `cc-lifecycle-n1-0909`。审 N1 增量 `c0c9733..058ce80`，同时核对 R10 后累计生命周期互动；不把本次审查扩大为远端旧 PR #4 或整个工作台验收。
- 范围：GLM 5.3 Flash，独立短分支/worktree `codex-cc-lifecycle-n1-review-0909`，Session `cc-lifecycle-n1-review-0909`；只读实现和受影响文档，只写自身 Session Context，禁止修代码、提交、push 或新开 PR。安装沿用本波精确 local 命令，不共享依赖。
- 验收：最终 HEAD 一致；Agent 登记/followup 时序、上游中止与 cancel/dispose 交错、结果投影、早期中止及唯一释放均有具体审查结论；独立复跑 R2 同三条命令，交付 review-acceptance.json 与 postflight-evidence.json 及真实日志。不同 Dispatch/Session、角色门和价值后门通过才可接纳；真实 Web 仍 NOT_VERIFIED。
- 合同：Git common-dir `orchestration/cc-audit-20260908/lifecycle-n1-review-{spec.json,prompt.md,receipt.json}`。消费方为当前 Codex PM，目标为既有 PR #4 纳入决策；head 改变旧 review 即失效。派发与资源身份以 receipt 为准。
- 证据格式：原报告将 review_expiry 写成对象、postflight 写 verdict 而非 decision，原始机械门拒绝；PM 经 internal_recoverable 分类，仅在控制面消费副本中序列化 expiry、将原 ACCEPT 映射为 accept，原报告和测试结论均未改。副本为 `lifecycle-n1-review-{acceptance,postflight}-consumed.json`。RESULT.md 的实现 Session 有笔误，结构化身份与原 Dispatch metadata 一致；不以该笔误否定已核实的角色分离，也不回写作者报告。
- 下一验收范围：既有 PR #4 远端仍为 `066270d` / OPEN / CONFLICTING / checks 空；本地 `058ce80` 相对真实远端集成 `35527c2` 共 18 文件。GitHub PR 的 baseRefOid 返回旧 `d0bcc97`，分支 API 与 fetch 均确认集成现头仍 `35527c2`，不能误判为他人推进。后续检查原 PR 唯一性、完整出站身份、完整候选配置/抽取/Host 路径、打包与真实工作台；只复用本次 N1 有效结论，不重派相同局部 review。

### CC-V5-PR4-CANDIDATE-GATE：既有 PR #4 完整源码候选门

- 状态：PARKED_RUNTIME_SAFETY_UNKNOWN（2026-09-10 17:18）；输出保尾返修 `c086b47dfec25e0752931f3f1493ddfdd8ae9972` 已经独立专项 review 零阻塞放行，但 generation 14 完整源码 reviewer 因第 6 次 OOM 后 runtime 切换丢失，未形成 Delivery 或 verdict。专项结论不能替代完整源码门，PR #4 保持 merge held。
- Review finding（2026-09-10 10:0x，claude 会话排查 5 次 worker OOM 后登记，已返修并完成专项验收）：候选 `scripts/acceptance/force-edit-acceptance.mjs` 的 `ownedSpawn` 原对 stdout/stderr 无上限收集，与 09:33 诊断报告 `old_space.used=2.11GB` 的累积形态同族；`c086b47` 已改为与 main `src/python-bridge.ts` `OUTPUT_CAP_BYTES` 同语义的每流独立 8MiB 保尾收集并获零阻塞放行。按 AGENTS.md，acceptance 脚本与全量验证只允许在 CI 或独立 Terminal.app 执行，不得在 ORCA 终端树内跑。
- 启动记录：09:54 价值、额度和内存门通过后启动独立 reviewer；09:52 全局 3 个活跃 Dispatch 时曾排队，启动前复查已降为 1。属于本波 PR4 收口，不扩功能波次。
- 派发：generation 14 Task `task_d14f6497e97b` / Dispatch `ctx_cf4bba584559` / Session `cc-pr4-full-source-g14` / worktree `glm-cc-pr4-full-source-g14` 已 failed/abandoned 并完成 terminal/provider 结算；worktree 仅保留冻结输入和调度元数据，无 reviewer 结果。恢复时必须创建新的 GLM 或 MiniMax Task/Dispatch/Session，不能复用旧生命周期身份。
- 输入：base `35527c2bc39e969bed807c7b67f3dc64ce83f182`、候选 `c086b47dfec25e0752931f3f1493ddfdd8ae9972`；其中 N1 生命周期与 `058ce80..c086b47` cap 专项结论只作为复用输入，不替代完整组合审查。既有 PR4 仍用旧 head `066270d`；候选是其后代，不建重复 PR。
- 目标与非重复边界：复用 N1 及 R10 后生命周期 ACCEPT，补齐尚无完整独立结论的原始异步抽取/R3/R4/R10：抽取进程超时与 TERM→KILL、输出上限、临时目录、配置校验、Host/插件 Signal 接线及公开文档的一致性，形成完整源码候选 ACCEPT/REJECT。
- 执行：下一位独立 GLM 或 MiniMax reviewer 只读源码、运行 Host/Client noEmit 与 diff-check；Orca 进程树内禁止所有 vitest，包括单 spec 和 scoped 组合。测试必须由 GitHub Actions workflow_dispatch 或与 Orca 无父子关系的独立 Terminal.app 串行执行并回填绑定同一 head 的日志；force-edit spec 在根因定位前保持禁区。
- 验收：源码 reviewer 与外部测试证据共同绑定相同 base/head；原计划 7 个受影响 spec 的证据只有在 CI 或独立 Terminal.app 运行才有效。完整源码 ACCEPT/REJECT 还须覆盖抽取、配置、Host/协调器、生命周期和 cap 组合；打包、真实 Web、多 Agent、Windows、云端仍 NOT_VERIFIED。
- 合同及退出：Git common-dir `orchestration/cc-audit-20260908/pr4-candidate-r2-{spec.json,prompt.md,receipt.json}`；当前 Codex PM 消费，head/base 改变则结论失效；正式 Delivery 后先独立复验与释放精确运行资源，再 ack，工作树保留待真实 PR 收口。
- 恢复记录：原连接/runtime 故障证据继续保留；最新 generation 14 证据为 `pr4-full-source-g14-recovery-input.json`、`pr4-full-source-g14-recovery.json` 与 `wave-g14-manifest.json`。旧会话没有可复用的半截业务结论；仅复用此前已正式接受的 N1 与 cap 专项验收。
- CI 证据边界：[`34459640945`](https://github.com/cat-xierluo/dsh-contract-copilot/actions/runs/34459640945) 只验证真实 crash-scene DOCX 的 render 链；[`34460166243`](https://github.com/cat-xierluo/dsh-contract-copilot/actions/runs/34460166243) 的 347/358 测试通过但 force-edit 集成 10 项全 skip。下一步必须让与 `c086b47` 绑定的 CI/独立 Terminal 环境具备真实 skill root 与 Python 依赖并实际执行该 spec，或先取得新的确定性根因证据；不能把“workflow success”扩大为完整源码门通过。

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

## TASK-2026-09-09-oom-guard-sink：vitest 堆顶护栏下沉到 config 层

- 状态：已完成（2026-09-09 晚，claude 会话；用户在排查收口后指定"现在落地"）。
- 类型：implementation（测试基建）。
- 来源：2026-09-09 晚注销风暴 vitest OOM 事故排查。21:21 GUI 注销进行中，ORCA 会话恢复机制在 21:42 重建 governance 恢复 worktree（`codex-cc-governance-r2-0909`）、21:48 续写四文件 diff、21:51 拉起全量 vitest，21:22/21:52 两个 worker（`com.stablyai.orca` 资源组）V8 `FatalProcessOutOfMemory`。受控复现（空闲机器、`--bail 1`、2048 堆顶）283/283 全绿 ⇒ 非测试固有缺陷，定性负载诱导（Q45 同族）；真实缺口是护栏只挂 `pnpm test` 入口，自动恢复路径的裸 vitest worker 默认堆顶 ~4GB。
- 边界：只改 `vitest.config.ts`（新增 `poolOptions.forks.execArgv: ['--max-old-space-size=2048']`）；不动 pool 类型、worker 数（Q45）、任何测试文件与 Python 脚本。
- 验收与证据：
  - 临时 spec 断言 worker `process.execArgv` 含 `--max-old-space-size=2048`，裸入口（无 NODE_OPTIONS，等价 ORCA 恢复场景）通过后即删；
  - 裸入口 `pnpm vitest run tests/agent-coordinator.spec.ts tests/docx-extract.spec.ts` 6/6 + 2/2 通过；
  - 全量套件当晚因机器负载未跑（AGENTS.md 限定），留待 PM/CI 串行验收；`git status` 仅 `vitest.config.ts` 一处改动。
- 关联：DECISIONS Q46、CHANGELOG（2026-09-09 Maintenance）；事故诊断档案存 claude 会话记忆 `vitest-oom-orca-recovery-loop`。两份 .ips 崩溃报告原件已被系统清理（Retired 22:04），未留存。
