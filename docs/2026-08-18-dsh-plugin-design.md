# Contract Copilot → DSH Plugin 改造设计稿

> **创建日期**：2026-08-18
> **状态**：v0.2（已审计修订，可进入实现）
> **作者**：maoking（v0.1 基于 brainstorming 会话 + 讨论会实录 + 代码实测；v0.2 由审计会话逐条核对源 skill Python/DSH 仓库后修订）
> **目标读者**：实现 agent、合作律师、未来自己

---

## 0. 摘要（TL;DR）

把现有 Claude/Codex 形态的 `contract-copilot` skill（v1.6.3，~29KB SKILL.md + 14 个 Python 模块）改造为 **DeepSeek Harness plugin**，落地在独立 GitHub 仓库 `cat-xierluo/dsh-contract-copilot`。核心动作是**把 SKILL.md §3.2 定义的 4 步审查流程 plugin 化**，让 agent 不再依赖单轮对话颗粒度。**Python 脚本一行不动**，plugin 通过异步 `child_process.spawn` 调现有 CLI 入口。安装方式 `dsh plugin --profile <name> add ./dsh-contract-copilot`，无需 npm publish。

v0.2 审计后的三个关键修正：(1) **intake 是硬前置**——Python 非交互模式下 `review_intensity` 缺失会静默默认"强势"，plugin 必须总是显式传参；(2) **进度粒度 = tool 调用粒度**——Python CLI 执行期间无任何流式输出，"监听 stdout 实时进度"不成立；(3) **integrity gate 无需 plugin 侧回滚**——Python 在写出任何正式交付物之前检查并以非零退码拒绝。

---

## 1. 背景与动机

### 1.1 来自讨论会的核心想法

2026-08-18 Vibe Working 群 DeepSeek Harness 法律 AI 讨论会上，maoking 反复强调的核心论点：

> "DSH 真正的差异点 = 运行轨迹可暴露、实时可读取"
> "可交互的 skill 的运行也是 DeepSeek Harness 能够带来的一种改变"
> "现有的 agent + skill 方式是没办法做到（批注 / 交互 / 重新导出）的"
> "plugin 可以监听信息，我们就可以在 UI 上去显示合同审查已经完成"

（原文：`Documents/Mac同步文件夹/.../260818 讨论会实录（逐字稿+PPT截图）_corrected.md`，第 01:24:18 / 01:30:30 段）

### 1.2 当前 contract-copilot 的痛点

| 痛点 | 现状 | DSH plugin 解决路径 |
|---|---|---|
| **单轮对话颗粒度太粗** | agent 一次问完所有 intake blocker，用户答完才能继续 | plugin 把 intake blocker 拆为独立 tool，按需 ask_user |
| **中间状态不可见** | agent 审到第几条、还有什么没审、卡在哪——用户看不到 | 每次 tool 调用更新 session 状态 → session 事件流 → UI 渲染（粒度 = tool 调用，见 §3.3 已知限制） |
| **不能中途插入决策** | "这条 finding 改不改" 必须等整轮跑完才知道 | plugin 在 4 步流程的检查点暴露 ask_user 决策 |
| **长程会话断开** | "合同审到一半我关了，下次继续" 现在靠记忆 | DSH session log 本身持久化；plugin 加 session 文件做状态恢复 |
| **多个 localhost 服务散乱** | 用户当前有案件看板、self-evolve、规则库等多个端口 | 本次**不做**（用户明确不要 F） |

### 1.3 设计原则

1. **不动 Python 脚本**：所有 Python 代码一行不改，仅通过 subprocess 调
2. **按 SKILL.md 四步审查流程 plugin 化**：插件结构 = §3.2 四步（前置澄清 / 分层扫描 / 条款落地 / 交付与跟进，操作细则见 §九 9.1–9.4）的映射
3. **5 项能力分阶段落地**：A（agent 主动调）+ B（进度可见）+ C（注入上下文）+ D（决策 hook）+ E（长程会话）
4. **本地优先 / 不走 npm publish**：每个 plugin 一个独立 GitHub 仓库，HMR 自动生效
5. **显式传参，不依赖隐式默认**：所有会影响审查结果的 CLI 参数由 plugin 层显式给出（见 §4.4 审计修正 2）

### 1.4 范围边界（v1 显式排除）

- ❌ **起草流程**（SKILL.md §十）：v1 不 plugin 化，只做审查流程
- ❌ **§9.5 复核环节的专用 tool**：对方改稿后的再审由 `resume` + `analyze`（指向新版合同）组合覆盖，不加第 8 个 tool（决策 Q22）
- ❌ F：整合多个 localhost 服务（用户明确不要）
- ❌ 重写 Python 脚本
- ❌ 贡献回 DSH 主仓库（独立仓库）

---

## 2. 命名 / 仓库 / 分发

### 2.1 命名定型

| 项 | 值 | 理由 |
|---|---|---|
| **本地目录路径** | `legal-dsh-plugin/dsh-contract-copilot/` | 与 `legal-skills/` 并列；DSH 社区习惯（`dsh-<name>`）|
| **GitHub 仓库路径** | `github.com/cat-xierluo/dsh-contract-copilot` | 用现有 GitHub 账号，避免新建 |
| **package.json `name`** | `@yangweixin/dsh-contract-copilot` | scope 作为作者标记；npm 公开发布不受阻（需 `publishConfig.access: "public"`），git 安装的 `allowBuilds` key 用全名 `@yangweixin/dsh-contract-copilot: true` |
| **Display name** | Contract Copilot | 沿用原 skill 名 |
| **作者** | 杨卫薪律师（微信 ywxlaw） | 写在 README + package.json `author` 字段 |
| **License** | CC-BY-NC 4.0 | 沿用原 skill |

### 2.2 分发方式（依据 `docs/user/develop/basic/publish.md`，已经审计核实）

**推荐路径（本地开发 + 自用）**：

```sh
# 一次性：把 plugin link 到 dsh profile
dsh plugin --profile lawyer add ./dsh-contract-copilot
# → pnpm link 到 $DSH_HOME/profiles/lawyer/package.json
# → reconcilePlugins（apps/cli/src/plugin.ts:59）读 package.json 的 dsh.bundle，
#   自动追加到 dsh.profile.bundles
# → HMR 生效：cordis-plugin-hmr 在 profile 启动时挂载（apps/cli/src/profile-boot.ts:283），
#   重新 build 插件后自动热更新
```

**替代路径（分享给其他律师）**：

```sh
dsh plugin --profile lawyer add github:cat-xierluo/dsh-contract-copilot
# 插件侧：package.json 需带自包含的 "prepare" 脚本（参照官方 turtle-ui：
#   不假设 monorepo 环境，不依赖 project references）
# 用户侧：profile 的 pnpm-workspace.yaml 需加
#   allowBuilds:
#     '@yangweixin/dsh-contract-copilot': true
```

**不需要的路径**：npm publish / monorepo / 私有 registry。tarball（`pnpm pack`）是免 allowBuilds 的备选。

### 2.3 仓库结构（polyrepo）

```
dsh-contract-copilot/                  ← 独立 git 仓库
├── docs/
│   └── 2026-08-18-dsh-plugin-design.md  ← 本文件
├── package.json                       ← dsh.bundle 声明 + prepare 构建脚本
├── tsconfig.json                      ← NodeNext，emit 到 lib/
├── cordis.patch.yml                   ← patch 层：插入本插件 row
├── src/
│   ├── index.ts                       # apply(ctx, config) 入口 + Config（schemastery）
│   ├── session.ts                     # ContractSession 读写（~/.dsh/contract-copilot/sessions/）
│   ├── python-bridge.ts               # 异步 spawn + 退码分类
│   ├── progress.ts                    # formatProgressMsg（pre-step 注入用）
│   └── tools/                         # 7 个 defineTool
├── lib/                               ← 构建产物（gitignore）
├── README.md                          ← 安装 + 使用说明
└── tests/                             ← 见 §7
```

依赖声明：`@deepseek-ai/cordis`、`@deepseek-ai/dsh-tools`、`@deepseek-ai/dsh-agent`、`@deepseek-ai/dsh-llm` 均为 **peerDependencies**（+ devDependencies 供本地构建）；profile 初始化时 `@deepseek-ai/dsh-base` 已把这些带进依赖图。

---

## 3. Plugin 形态

### 3.1 形态选择

**Function plugin**（`apply(ctx, config)` + 命名导出 `name / inject / Config`），**不是** Service Definition class。

理由：本插件无跨 plugin 消费需求——7 个 tool 共享的状态用 module-level 单例 + `ctx.effect()` 注册 disposer 足够；将来若被其他 plugin 消费（例如案件看板要读审查进度），再抽 Service Definition，那是结构性升级而非预先设计。

### 3.2 5 项核心能力定义

| 能力 | 含义 | 实现依赖 |
|---|---|---|
| **A** | agent 自己能主动调审查步骤 | `ctx.tools.register` + `defineTool`（`@deepseek-ai/dsh-tools`） |
| **B** | 实时看到审查到第几步 | tool handler 更新 session 状态文件 → 状态跃迁反映在 DSH session 事件流 → UI 渲染 |
| **C** | 模型响应前自动注入上下文 | `ctx.on('agent/pre-step', waterfall)`（事件声明：`packages/core/agent/src/runtime-types.ts:231`） |
| **D** | 关键节点让用户点确认 | DSH 内置 `ask_user_question` tool（`packages/interaction/tool-ask-user`，消费 `ctx.userQuestions` seam） |
| **E** | 离开再回来接着审 | plugin session 文件 `~/.dsh/contract-copilot/sessions/<id>.json` |

**不做的**：见 §1.4。

### 3.3 已知限制（审计确认，接受并明示）

1. **CLI 内部无进度**：`apply_review_plan.py` 的全部 stdout（含"执行统计"行，`apply_review_plan.py:403-428`）在 main() 尾部一次性输出，执行循环内零输出。因此能力 B 的粒度是 **tool 调用级**（intake 完成 / plan 就绪 / apply 开始 / apply 结束 / 交付），不是 per-finding 级。要 per-finding 进度必须改 Python，违反原则 1，列为远期选项。
2. **apply 期间 UI 只能看到"applying"状态**，时长取决于 CLI 执行时间（大合同可能数分钟）。

---

## 4. 组件设计

### 4.1 设计演化

| 修订 | 错误 / 动机 | 修正 |
|---|---|---|
| v1 | 按 DSH 通用能力推，未贴 contract-copilot 实际工作流 | 修订 → |
| v2 | 按"工作流阶段"切，但没读 Python 代码 | 改 → |
| v3 | 忽略"Python 是原子 CLI，不能中途插入决策" | 改 → |
| v4 | 改回贴 SKILL.md §3.2 的 4 步流程 | ✅ |
| **v0.2（审计）** | 4 处事实/实现错误：`agent/post-step` 事件不存在；bridge argv 错误；`spawnSync` 阻塞事件循环；"监听 stdout 实时进度"前提不成立。另有 intake 未接 `review_memory.json` / `reviewer_profile` 非交互硬失败 / integrity flag 文档超前于代码 | 全部修正，见 §4.3、§4.4、§5、§6 |

### 4.2 7 个 Tools（SKILL.md §3.2 四步 + §九 9.1–9.4 的映射）

| # | Tool 名 | 对应流程 | 能力 | 职责 |
|---|---|---|---|---|
| 1 | `contract_copilot_intake` | §3.2.1 前置澄清（9.1 启动） | **D** | 读 `reviewer_profile.json` + `review_memory.json`（按合同名归一化 key 查命中）→ 缺什么问什么（阻塞项：立场/目的/口径三齐才放行）→ 写 session |
| 2 | `contract_copilot_analyze` | §3.2.2 分层扫描（9.2） | **C** | 接收 agent 产出的 findings 数组，组装完整 review-plan.json（meta 用 intake 值填充）写入 session 目录，校验最小 schema |
| 3 | `contract_copilot_list_findings` | 横切（plan 检视点） | **B + C** | 列出 plan 中的 findings 供用户检视；暴露 `edit_policy` 决策点（默认 revise-first） |
| 4 | `contract_copilot_apply` | §3.2.3 条款落地（9.3 风险处理） | **A + B** | 异步 spawn CLI，**全量显式传参**（见 §4.4），按退码分类更新状态 |
| 5 | `contract_copilot_finalize` | §3.2.4 交付与跟进（9.4 交付） | **B + E** | 收集双 DOCX 产物路径 + 归档目录，写入 session，标记 delivered |
| 6 | `contract_copilot_inspect_session` | 横切 | **B** | 任何时候查看 session 当前状态 |
| 7 | `contract_copilot_resume` | 横切（含 §9.5 复核回路的入口） | **E** | 按 DSH session id 或合同名索引恢复 session；对方向：`resume` 后对**新版合同**重跑 `analyze` 即覆盖 §9.5 对方改稿再审场景 |

阶段命名口径：§3.2 的步骤名（前置澄清/分层扫描/条款落地/交付与跟进）为流程骨架，§九 9.1–9.4 为操作细则，两处引用统一为"§3.2.X（9.Y）"。

### 4.3 1 个 Listener + tool 内持久化

**只有一个事件监听**（能力 C）。v0.1 的第二个 listener 监听的 `agent/post-step` 事件**在 DSH 中不存在**（实际事件集：`pre-step / status / request / request-error / error / inbox / session / session-start / turn-stopping / disposed`）。状态写盘改在**每个 tool handler 的尾部**完成——tool 执行完是天然的状态变更点，无需事件。

```ts
// 能力 C：每步注入进度上下文（参照 time-context 的成熟写法，
// packages/context/time-context/src/index.ts:170）
ctx.on('agent/pre-step', async (
  { agent, turn, step, signal },   // payload 见 runtime-types.ts:231
  next,
): Promise<PreStepDecision> => {
  const decision = await next()    // 必须先调 next()，不能 short-circuit
  if (decision.kind === 'reject' || signal.aborted) return decision
  const session = store.current()
  if (!session || !store.progressChangedSinceLastInjection(session)) return decision
  return {
    kind: 'enter',
    messages: [...decision.messages, createUserMessage(formatProgressMsg(session))],
  }
})
```

**幂等控制**（v0.1 缺失）：`progressChangedSinceLastInjection` 按 `session.state` + 单调计数器判断，只有状态真的变化才注入，避免每步重复注入同一条进度消息膨胀 transcript。

### 4.4 CLI bridge（`python-bridge.ts`）

**调用方式（v0.2 修正）**：异步 `spawn`（不是 `spawnSync`——apply 可能运行数分钟，同步调用会阻塞整个 harness 事件循环，冻结 HMR / UI / 其他 listener），支持 `AbortSignal`（中断时 kill 子进程）：

```ts
const child = spawn(
  config.pythonExecutable,                          // 默认 'python3'，Config 字段
  [
    `${config.skillRoot}/scripts/review/apply_review_plan.py`,  // 脚本绝对路径
    '--input', docxPath,
    '--plan', planPath,
    '--output', outputDocxPath,
    '--report-docx', reportDocxPath,                // 产物路径钉死在 session 目录
    '--client-name', intake.clientName,
    '--party-role', intake.partyRole,
    '--review-intensity', intake.reviewIntensity,
    '--edit-policy', intake.editPolicy ?? 'revise-first',
    '--author', intake.reviewer.author,
    '--organization', intake.reviewer.organization,
    ...(intake.reviewer.department ? ['--department', intake.reviewer.department] : []),
  ],
  { signal },                                       // abort 即终止
)
```

脚本自带 sys.path 引导（`apply_review_plan.py:22-25`），任意 cwd 可用；v0.1 草稿里 `'-'` + 模块路径的 argv 写法是错误的。

**显式传参是硬要求（审计修正 2）**。Python 非交互判定是 `sys.stdin.isatty() and sys.stdout.isatty()`（`review_runtime.py:203`），经 child_process 调用自动非交互，**无需也不存在 `--no-interactive` flag**。但非交互默认值有陷阱：

| 参数 | 缺失时的非交互行为 | 位置 | 后果 |
|---|---|---|---|
| `--review-intensity` | **静默默认"强势"** | `review_runtime.py:52` | 没问口径就按最激进口径审完——事故级 |
| `--party-role` | 保持空串（代码注释明言"交调用方显式请求确认"） | `review_runtime.py:466` | 报告立场栏为空 |
| `--client-name` | 推断或"未提及/待补充" | `review_runtime.py:456-464` | 报告客户栏降级 |
| `--author`/`--organization` | **直接 raise ValueError**（fail loud） | `resolve_reviewer_profile` | apply 失败 |

所以 plugin 层 intake 收集的信息必须全量显式传入，一个都不能靠 Python 默认值兜底。

**stdout 解析**：只在进程结束后解析尾部固定行（"输出 DOCX / 输出报告 DOCX / 归档目录 / 审查上下文 / 执行统计"），提取产物路径与统计数字写入 session。执行期间无任何输出可解析（§3.3 限制 1）。

**退码分类**（§6 详述）：`0` = 全部成功；`1` + integrity 失败信息 = 拒绝交付（无正式产物）；`1` + "存在失败项" = 部分成功（有产物）；其他非零 = 异常。

**副作用须知**：`resolve_review_context` 每次运行都会**写回** `review_memory.json`（`review_runtime.py:504`）——plugin 与 Python 的状态边界是：**intake 读 memory，apply 全量显式传参，写回自然发生**，plugin 不另行维护 review_memory 的副本。

---

## 5. 数据流（v0.2 补全）

### 5.1 事件链：用户说"审查这份合同"

```
用户消息 ─→ agent-loop step ─→ agent 读插件 tool 描述
  ─→ [1] contract_copilot_intake(contractPath)
        读 config/reviewer_profile.json：缺 author/org → 问用户（D）
        读 config/review_memory.json：按合同名归一化 key 命中 → 沿用上次客户/立场/口径（§3.2.1）
        阻塞项校验：立场 + 目的 + 口径 三齐才放行；缺一即返回缺失清单，不推进
        → 写 session（state: intake_done）
  ─→ [2] agent 读 references（routing/framework/revision-strategy），产出 findings
  ─→ [3] contract_copilot_analyze(findings)
        组装 review-plan.json（meta = intake 值）→ 写 session 目录（state: plan_ready）
  ─→ [4] contract_copilot_list_findings() → 用户检视（D：edit_policy / 删改 finding）
  ─→ [5] contract_copilot_apply()
        异步 spawn CLI（全量显式参数）→ state: applying
        结束后按退码分类 → state: applied | rejected | partial | failed
  ─→ [6] contract_copilot_finalize()
        解析产物路径（审核修订版 DOCX + 审查报告 DOCX + 归档目录）→ state: delivered
  ─→ agent 向用户交付文件（IM 回传语义沿用 SKILL.md §9.4）
```

### 5.2 状态机

```
created ──intake──▶ intake_done ──analyze──▶ plan_ready
   ▲                                              │ list_findings（可反复）
   │                                              ▼
delivered ◀──finalize──── applied ◀────apply──── applying
                   │                            （abort/interrupt 可回 plan_ready）
                   │
        rejected / partial / failed（apply 的终态分支，见 §6）
```

- 任意持久态可通过 `inspect_session` 查看当前值
- `resume` 从任意持久态恢复到内存（跨 DSH 会话）
- integrity 拒绝（rejected）：修 plan 后可重新 apply（回 plan_ready）

### 5.3 session 文件与 DSH session 的映射

- 路径：`~/.dsh/contract-copilot/sessions/<id>.json`（`sessionsDir` 是 Config 字段）
- `<id>` 首选 **DSH session id**（实现期验证点 V3：通过 ctx 的 session 服务获取；若第三方插件不可得，回退为 `<合同key>-<时间戳>` 并在文件里同时记录 `dshSessionId` 字段，`resume` 按 `dshSessionId || contractKey + 最近 updatedAt` 索引）
- 字段：`version / dshSessionId / contractPath / contractKey / intake{...} / planPath / state / progressCounter / outputs{reviewedDocx, reportDocx, archiveDir, stats} / history[] / createdAt / updatedAt`
- 写入时机：每个 tool handler 尾部原子写（临时文件 + rename），progressCounter 单调递增供 pre-step 幂等判断

### 5.4 integrity gate 在 plugin 视角的接入点

integrity 检查在 Python **写出任何正式 DOCX 之前**执行（`apply_review_plan.py:361-364`）：失败 → stderr 输出原因（`format_integrity_failure`）→ `SystemExit(1)`，**不留正式交付物**。plugin 不做也不需要自己的回滚；职责是把退码分类为 `rejected`、透出 stderr 原因、引导 agent 修 plan 后重跑（§6）。

注意：SKILL.md §9.4 写的 `--skip-integrity-check --draft-authorization` **在当前 argparse 中不存在**（文档超前于代码，已列入 §9 待反馈源 skill）。plugin 不基于该 flag 设计任何路径。

---

## 6. 错误处理（v0.2 补全）

### 6.1 intake 阶段

| 情形 | 处理 |
|---|---|
| 用户拒绝填阻塞项（立场/目的/口径） | intake 返回明确的缺失清单 + "补齐后可继续"说明；session 停在 `created`；agent 不得推进实质审查（对齐 SKILL.md §3.2.1 暂停语义：只允许输出缺口清单与待确认问题） |
| 用户授权"按默认口径处理" | 记录授权来源到 session.intake.authorization，方可采用默认值（对齐 §3.2.1） |
| `reviewer_profile.json` 缺失/未确认 | intake 内先问审查人姓名/律所/部门（一次），answer 写回靠 apply 首次运行的 `save_profile`；plugin 不直接写该文件（保持 Python 单一写者） |

### 6.2 Python CLI 失败传播（退码分类）

| 分类 | 判据 | 产物 | 状态 | agent 应做 |
|---|---|---|---|---|
| `success` | exit 0 | 双 DOCX + 归档 | `applied` | → finalize |
| `rejected`（integrity） | exit 1 + stderr 含 integrity 失败详情 | **无正式交付物** | `rejected` | 按 stderr 逐项修 plan（补法条依据/消占位）→ 重新 apply |
| `partial`（部分成功） | exit 1 + stderr "存在失败项" | 双 DOCX **已产出**，存在未写入 Word 的审查项 | `partial` | 读归档执行日志定位失败项 → 决定：修 plan 重跑，或带失败清单进入 finalize 并向用户明示 |
| `error` | 其他非零（ValueError / FileNotFoundError / ImportError: defusedxml） | 不确定 | `failed` | 透出 stderr 分类处理（缺依赖 → 提示 `pip install -r scripts/requirements.txt`；输入不存在 → 回 intake） |

两种非零退码的语义差异是 v0.1 完全没有区分的：`rejected` 连临时 DOCX 都不落（integrity 在 save 之前），`partial` 是"有交付物但注明失败项"——UI 与 agent 的话术必须分开。

### 6.3 中断与超时

- apply 支持 `AbortSignal`：用户/agent 中断 → kill 子进程 → 状态回 `plan_ready`，输出目录中半成品 DOCX 删除（该文件由 plugin 传参指定路径，属 plugin 管辖，可安全清理）
- 长时间无响应依赖 DSH 侧 tool-timeout/guard 插件配置，plugin 不自建超时逻辑

### 6.4 session 文件损坏

- 读到非法 JSON：改名 `<id>.json.corrupt-<n>` 留证，按 `created` 空态重建，`inspect_session` 明示发生过损坏重建
- `state` 值未知（版本不匹配）：同上处理，`version` 字段前向不兼容时拒绝加载并明示

---

## 7. 测试（v0.2 补全，映射源 skill 现有覆盖）

源 skill 现有：`scripts/tests/test_report_integrity.py`、`test_runtime_regressions.py`、`regression/contract-calibration/`（unittest discover 约定）。plugin 层按四层：

| 层 | 内容 | 依赖 |
|---|---|---|
| 单元（纯 TS） | session 状态机转换、pre-step 幂等判断、bridge argv 拼装、退码分类、review_memory 归一化 key 复刻逻辑 | vitest，无 Python |
| 集成 | fixture DOCX + 最小 plan 跑真实 CLI：成功 / 人为破坏法条依据触发 integrity 拒绝 / 含不可定位条款触发 partial，断言三分类 | 本机 python3 + defusedxml |
| 快照 | ACP/headless transcript 一份：intake→analyze→apply→finalize 全链路的 session 事件流对照（第三方仓库简化版 DSH snapshot 政策） | DEEPSEEK_API_KEY |
| e2e | `dsh --profile lawyer "审查这份合同"`（真实样例合同）人工验收：产物双 DOCX 可开、归档完整、resume 可续 | 同上 |

**e2e 实测记录（2026-08-19，headless profile + 本地网关 deepseek-v4-flash）**：
- intake → analyze → apply（真实 Python CLI，成功=3 失败=0 仅意见书=1）→ finalize 全链路跑通，session 状态机完整走完 `intake_done → plan_ready → applying → applied → delivered`
- 产物落位验证：session 目录双 DOCX + skill archive 完整留痕（input/plan/执行日志/MD 报告/manifest）
- 退码分类实测：第一轮因 plan 缺 summary 段被 integrity 拒绝 → `classify` 正确判 `rejected`（stderr 特征匹配生效）
- Word 修订实测：`force_edit: true` 的 replace 落成 w:ins/w:del 最小差异修订（合并 w:t 后验证替换文本完整在场；未删整段，只标删差异词"全部"）
- 首轮即抓到 3 个真实缺口（Q26/Q27/Q28），均已修复

---

## 8. 决策日志

v0.1 的 Q1–Q16 见 git 历史（0910e65）。v0.2 审计新增：

| # | 决策点 | 选项 | 选择 | 理由 |
|---|---|---|---|---|
| Q17 | 状态写盘机制 | 监听 `agent/post-step` / tool handler 内写 / 监听 session 事件 | **tool handler 内写** | `agent/post-step` 在 DSH 中不存在；tool 执行点是天然状态变更点；session 事件流由 DSH 本身保证 |
| Q18 | CLI 调用原语 | `spawnSync` / 异步 `spawn` | **异步 spawn + AbortSignal** | apply 长任务同步阻塞会冻结整个 harness（HMR/UI/listener）；且异步才能支持中断 |
| Q19 | 能力 B 进度粒度 | CLI stdout 流式 / tool 调用粒度 / 改 Python | **tool 调用粒度** | Python 执行期间零输出（实测 `apply_review_plan.py` 全部 print 在 main 尾部）；改 Python 违反原则 1 |
| Q20 | 非交互参数策略 | 依赖 Python 默认值 / plugin 全量显式传参 | **全量显式传参** | `review_intensity` 缺失静默默认"强势"（`review_runtime.py:52`）；口径必须来自用户确认 |
| Q21 | integrity 失败处理 | plugin 自建回滚（删临时 DOCX）/ 沿用 Python 写前拒绝语义 | **沿用 Python 语义，plugin 只分类退码** | Python 已在 save 之前检查并 `SystemExit(1)`，无产物可回滚（`apply_review_plan.py:361-364`） |
| Q22 | §9.5 复核环节 | 第 8 个 tool / resume+analyze 组合 | **组合覆盖** | 对方改稿再审 = resume 旧 session + analyze 指向新 DOCX，无需新 tool；v1 收敛范围 |
| Q23 | 起草流程 | 一并 plugin 化 / 显式排除 | **v1 排除** | 先把审查回路做穿；起草无 Python CLI 可包，收益结构不同 |
| Q24 | 归档位置 | 重定向到 session 目录 / 沿用 skill 默认归档 | **沿用默认** | 不改变用户"去 skill archive/ 看留痕"的既有习惯；session 只记录返回的归档路径 |
| Q25 | ask 交互实现 | tool 内直接调 `ctx.userQuestions` / 返回缺失清单由 agent 转调内置 `ask_user_question` | **首选 tool 内直调，失败回退返回清单** | 直调是原子的一次 tool call（能力 D 的体验）；`userQuestions` seam 的 tool 内可用性为实现期验证点 V2 |
| Q26 | plan 的 summary 段 | analyze 只写 meta+findings / analyze 必填 summary | **必填 summary**（e2e 发现） | 报告渲染器从 plan.summary 取概况/结论/建议字段，缺失逐个渲染"待补充"，16 处 > 阈值 10 → integrity 整体拒绝（reporting.py `_safe_line` fallback） |
| Q27 | 被拒后的 re-analyze | 仅 intake_done/plan_ready 可提交 / 扩展到 rejected/partial/failed | **扩展**（e2e 发现） | integrity 拒绝后的修复回路就是"改 summary/findings 再 analyze"；不扩展则死锁在 rejected |
| Q28 | 实质性改写的修订收束 | 依赖 action=replace / 沿用 skill 收束 + schema 告知 force_edit | **沿用收束 + schema 文档化**（e2e 发现） | action_executor.resolve_delivery_action 对 substantive rewrite（差异≥25字）默认降级批注/意见书——这是源 skill 的克制设计；finding 带 `force_edit: true` 显式授权才落 Word 修订，schema description 已告知 agent 该语义 |

## 9. 审计回执（2026-08-18，v0.1 → v0.2）

**核实为准确的引用**：`dsh plugin --profile add` 机制与 `dsh.bundle` 声明（publish.md）、`reconcilePlugins`（`apps/cli/src/plugin.ts:59`）、HMR（`profile-boot.ts:283` 挂载 cordis-plugin-hmr）、github 安装的 prepare + allowBuilds 陷阱、`agent/pre-step` waterfall 语义、`ask_user_question` 为内置 tool、Python 模块数（14）与 SKILL.md 体量（~29KB）、skill 版本 1.6.3（CHANGELOG）。

**修正的引用**：`agent/post-step` 不存在（§4.3）；bridge argv（§4.4）；spawnSync（§4.4）；进度粒度（§3.3）；阶段命名统一为"§3.2.X（9.Y）"。

**待反馈源 skill 的两个问题**（不阻塞本插件）：
1. SKILL.md §十三 版本戳仍为 1.6.1（2026-08-11），CHANGELOG 已 1.6.3——版本戳未同步
2. §9.4 的 `--skip-integrity-check` / `--draft-authorization` 在 argparse 中不存在——文档超前于代码

**实现期验证点**（动工时逐个确认，不验证不进入下一里程碑）：
- V1：link 安装的插件在 profile 内能否解析 `@deepseek-ai/dsh-tools` / `dsh-llm` / `dsh-agent` 的运行时导入（peerDependencies 声明 + pnpm 解析行为）
- V2：tool handler 内调 `ctx.userQuestions` 的可用性与 headless 行为
- V3：获取当前 DSH session id 的公开 API
- V4：cordis-plugin-hmr 对 `link:` 本地插件的 watch 范围（lib/ 重建是否触发热更）

---

## 10. 参考资料

| 类型 | 路径 |
|---|---|
| 原 skill 入口 | `legal-skills/skills/contract-copilot/SKILL.md`（§3.2 四步、§八 文档操作、§九 标准审查流程） |
| 原 skill 变更日志 | `legal-skills/skills/contract-copilot/CHANGELOG.md`（1.6.3） |
| Python 主入口 | `scripts/review/apply_review_plan.py`（argparse 163-214；integrity 361-364；统计输出 403-428） |
| Python 审查上下文 | `scripts/review/review_runtime.py`（isatty 判定 :203；非交互默认 :455-469；memory 写回 :504；reviewer_profile :517） |
| DSH 仓库 | `参考项目/deepseek-harness/`（AGENTS.md / CLAUDE.md） |
| DSH 插件分发 | `docs/user/develop/basic/publish.md` + `apps/cli/src/plugin.ts` |
| DSH 插件教程 | `docs/user/develop/basic/index.md` + `tool.md`（defineTool 用法） |
| pre-step 事件声明 | `packages/core/agent/src/runtime-types.ts:231` |
| pre-step 实现参照 | `packages/context/time-context/src/index.ts:170`、`packages/skill/tool-skill/src/index.ts` |
| ask_user 内置工具 | `packages/interaction/tool-ask-user/src/index.ts` |
| HMR 挂载 | `apps/cli/src/profile-boot.ts:283` |
| 讨论会实录 | `Documents/Mac同步文件夹/.../260818 讨论会实录（逐字稿+PPT截图）_corrected.md` |

---

## 11. 元信息

- 文档版本：v0.2（已审计修订）
- v0.1（0910e65）：初稿，brainstorming 产物，Section 5/6/7 为占位
- v0.2：审计会话修订——修 4 处硬伤、补全 §5/§6/§7、新增 §1.4 范围边界与 §3.3 已知限制、决策日志 Q17–Q25
- 下次修订触发条件：实现期验证点 V1–V4 的结论、首个里程碑（骨架安装）落地后的事实修正

---

## 12. 交付形态分阶段（2026-08-18 用户讨论）

用户提出：插件能不能以"插件页面为主、agent session 隐身为后端"形态交付，而非当前设计的 session-first？架构答案：**可行，且 7 个 tool 是两种形态共享的后端**。

### 两层 "session"

- **DSH agent session**：完整的 agent 运行时（model + tools + event loop）。要调任何 tool，必须有一个 session 在调它——"agent session 必须有，否则没人在调 tool"
- **plugin ContractSession**（session.ts 的状态文件）：流程状态机，由首次 intake 自动创建，用户不需要"启动"它

### 两种形态对比

| | v1 session-first（当前骨架） | v2 插件工作台 |
|---|---|---|
| 主操作面 | agent 聊天（"审查这份合同"） | 插件页面（表单上传、卡片检视、按钮触发） |
| agent session 可见性 | 可见（聊天即 session） | 默认不可见，必要时可展开审计轨迹 |
| intake 收集 | 模型调 ask_user_question 转问用户 | 页面表单直收，作为 tool 参数一次提交 |
| 底层 tool | **同一套 7 个 tool** | **同一套 7 个 tool** |
| DSH 支撑 | 默认 | client `ui-slots` 注册页面 + `agents.create()` 编程式驱动后台 agent |

### 关键架构支撑（已核实）

- `packages/client/ui-slots` slot registry：插件可在声明的 slot 注册 React 组件，chain-kind slot 自提名
- `packages/core/agent/src/index.ts:405 agents.create(options)`：编程式创建 agent（headless/background）
- `packages/bundle/headless`、`packages/sdk/server`、`packages/acp/acp`：headless 与程序化驱动已是官方支持形态

### 设计倒挂需要正视

用户在讨论会（§1.1）反复强调的"DSH 差异点 = 运行轨迹可暴露、实时可读取"——把 session 完全藏起来会放弃这个卖点。**更合理的措辞**："插件页面是主操作面，session 是可按需展开的审计层"（律师想看"AI 为什么这么改"时可展开），而非"session 不可见"。对合同审查这种有交付审计要求的场景，轨迹可回溯是卖点不是噪音。

### v2 待确认

是否在 v1 之后做工作台页面。决策影响：
- v1 当前骨架无需任何改动即可 ship
- v2 工作量：ui-slots 注册（约 1 个新 client 插件包）+ intake 表单 UI + 主页路由 + agents.create 编排
- v2 也可以分两步：先加 slot 注册的侧栏入口/卡片（与 session 共存），再做独立工作台页面
