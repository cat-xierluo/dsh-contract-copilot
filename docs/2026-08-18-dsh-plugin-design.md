# Contract Copilot → DSH Plugin 改造设计稿

> **创建日期**：2026-08-18
> **状态**：草案（v0.1），待审计 agent 复核
> **作者**：maoking（基于 brainstorming 会话 + 讨论会实录 + 代码实测）
> **目标读者**：审计 agent、合作律师、未来自己

---

## 0. 摘要（TL;DR）

把现有 Claude/Codex 形态的 `contract-copilot` skill（v1.6.3，~30KB SKILL.md + 14 个 Python 模块）改造为 **DeepSeek Harness plugin**，落地在独立 GitHub 仓库 `cat-xierluo/dsh-contract-copilot`。核心动作是**把 SKILL.md §3.2 定义的 4 步审查流程 plugin 化**，让 agent 不再依赖单轮对话颗粒度。**Python 脚本一行不动**，plugin 通过 `child_process` 调现有 CLI 入口。安装方式 `dsh plugin --profile <name> add ./dsh-contract-copilot`，无需 npm publish。

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
| **中间状态不可见** | agent 审到第几条、还有什么没审、卡在哪——用户看不到 | plugin 监听 session 事件流 → 实时写状态文件 → UI 渲染 |
| **不能中途插入决策** | "这条 finding 改不改" 必须等整轮跑完才知道 | plugin 在 SKILL.md 4 步流程的 4 个检查点都暴露 ask_user hook |
| **长程会话断开** | "合同审到一半我关了，下次继续" 现在靠记忆 | DSH session log 本身持久化；plugin 加 session 文件做状态恢复 |
| **多个 localhost 服务散乱** | 用户当前有案件看板、self-evolve、规则库等多个端口 | 本次**不做**（用户明确不要 F） |

### 1.3 设计原则

1. **不动 Python 脚本**：所有 Python 代码一行不改，仅通过 subprocess 调
2. **按 SKILL.md 4 步流程 plugin 化**：插件结构 = SKILL.md 流程的 1:1 映射
3. **5 项能力分阶段落地**：A（agent 主动调）+ B（实时进度）+ C（注入上下文）+ D（决策 hook）+ E（长程会话）
4. **本地优先 / 不走 npm publish**：每个 plugin 一个独立 GitHub 仓库，HMR 自动生效

---

## 2. 命名 / 仓库 / 分发

### 2.1 命名最终定型

| 项 | 值 | 理由 |
|---|---|---|
| **本地目录路径** | `legal-dsh-plugin/dsh-contract-copilot/` | 与 `legal-skills/` 并列；DSH 社区习惯（`dsh-<name>`）|
| **GitHub 仓库路径** | `github.com/cat-xierluo/dsh-contract-copilot` | 用现有 GitHub 账号，避免新建 |
| **package.json `name`** | `@yangweixin/dsh-contract-copilot` | scope 作为作者标记；不走 npm 所以不强制 |
| **Display name** | Contract Copilot | 沿用原 skill 名 |
| **作者** | 杨卫薪律师（微信 ywxlaw） | 写在 README + package.json `author` 字段 |
| **License** | CC-BY-NC 4.0 | 沿用原 skill |

### 2.2 分发方式（来自 `docs/user/develop/basic/publish.md` + `apps/cli/src/plugin.ts`）

**推荐路径（本地开发 + 自用）**：

```sh
# 一次性：把 plugin link 到 dsh profile
dsh plugin --profile lawyer add ./dsh-contract-copilot
# → pnpm link 到 $DSH_HOME/profiles/lawyer/package.json
# → reconcilePlugins 读 package.json 的 dsh.bundle，自动加入 dsh.profile.bundles
# → HMR 生效：编辑插件代码自动热更新
```

**替代路径（分享给其他律师）**：

```sh
# 推到 GitHub 后
dsh plugin --profile lawyer add github:cat-xierluo/dsh-contract-copilot
# 需在 plugin 的 package.json 加 "prepare" script
# 需在 profile 的 pnpm-workspace.yaml 加 allowBuilds: dsh-contract-copilot: true
```

**不需要的路径**：npm publish / monorepo / 私有 registry。

### 2.3 仓库结构（polyrepo，不走 monorepo）

```
dsh-contract-copilot/                  ← 独立 git 仓库
├── .git/                              ← 已有
├── docs/
│   └── 2026-08-18-dsh-plugin-design.md  ← 本文件
├── package.json                       ← 待写（含 dsh.bundle 声明）
├── tsconfig.json                      ← 待写
├── src/                               ← 待写
│   ├── index.ts                       # apply(ctx, config) 入口
│   ├── service.ts                     # ContractCopilotSession
│   ├── tools.ts                       # 7 个 defineTool
│   ├── listeners.ts                   # 2 个 ctx.on
│   └── python-bridge.ts               # subprocess 调 Python CLI
├── cordis.patch.yml                   ← 待写（plugin 入口声明）
├── README.md                          ← 待写（安装 + 使用说明）
└── tests/                             ← 待写
```

---

## 3. Plugin 形态

### 3.1 形态选择

**Function plugin**（`apply(ctx, config)` + 命名导出 `name / inject / Config`），**不是** Service Definition class。

理由：
- 5 项核心能力中只有"会话状态持久化"需要长期挂在 ctx 上
- 用 module-level 单例 + `ctx.effect()` 注册 disposer 就足够
- 升级为 Service 会和 DSH 现有 `ctx.skills` / `ctx.tools` / `ctx.agents` 抢命名空间

### 3.2 5 项核心能力定义（来自 brainstorming Q4）

| 能力 | 含义 | 实现依赖 |
|---|---|---|
| **A** | agent 自己能主动调审查步骤 | `ctx.tools.register` |
| **B** | 实时看到审查到第几步 | `ctx.on` 监听 + 状态文件 + UI 渲染 |
| **C** | 模型响应前后自动注入上下文 | `ctx.on('agent/pre-step', waterfall)` |
| **D** | 关键节点让用户点确认 | DSH `ask_user` 能力 |
| **E** | 离开再回来接着审 | session 文件 + `~/.dsh/contract-copilot/sessions/<id>.json` |

**不做的**：
- ❌ F：整合多个 localhost 服务（用户明确不要）
- ❌ 重写 Python 脚本
- ❌ 贡献回 DSH 主仓库（独立仓库）

---

## 4. 组件设计（Section 2 三次修订版）

### 4.1 设计演化（避免重复犯同样错误）

| 修订次数 | 错误 | 修正 |
|---|---|---|
| v1（首版）| 按 DSH 通用能力推，未贴 contract-copilot 实际工作流 | 修订 → |
| v2 | 按"工作流阶段"切，但没读 Python 代码 | 改 → |
| v3 | 忽略"Python 是原子 CLI，不能中途插入决策" | 改 → |
| v4（现行）| 改回贴 SKILL.md §3.2 的 4 步流程 | ✅ |

### 4.2 7 个 Tools（按 SKILL.md 4 步流程 1:1 映射）

| # | Tool 名 | 阶段 | 能力 | 何时调 |
|---|---|---|---|---|
| 1 | `contract_copilot_intake` | §3.2.1 前置澄清 | **D** | CLI 前：ask_user 收集立场/目的/口径/客户/截止 |
| 2 | `contract_copilot_analyze` | §3.2.2 分层扫描 | **C** | CLI 前：读 references，生成 plan |
| 3 | `contract_copilot_list_findings` | 横切 | **B + C** | analyze 后 / apply 前：让用户检视 plan |
| 4 | `contract_copilot_apply` | §3.2.3 风险处理 | **A + B** | CLI 中：调 apply_review_plan.py，监听 stdout |
| 5 | `contract_copilot_finalize` | §3.2.4 交付 | **B + E** | CLI 后：收集 DOCX + 报告，写 session |
| 6 | `contract_copilot_inspect_session` | 横切 | **B** | 任何时候：看 session 当前状态 |
| 7 | `contract_copilot_resume` | 横切 | **E** | 长程续接：读 session 恢复状态 |

### 4.3 2 个 Listeners

```ts
// 监听 agent 生命周期，注入上下文（能力 C）
ctx.on('agent/pre-step', async (payload, next) => {
  const decision = await next()  // 必须调 next()，不能 short-circuit
  const session = service.getSession()
  if (!session) return decision
  return {
    kind: 'enter',
    messages: [...decision.messages, formatProgressMsg(session)]
  }
})

// 状态写盘（能力 E）
ctx.on('agent/post-step', ({ session, agent }) => {
  service.persistSession(currentSessionId)
})
```

### 4.4 1 个 CLI bridge（`python-bridge.ts`）

通过 `child_process.spawnSync('python3', [...])` 调 contract-copilot 的现有 CLI 入口：

```ts
// 不重写 Python，仅做 CLI wrapper
const result = spawnSync('python3', [
  '-', '/path/to/contract-copilot',
  'scripts.review.apply_review_plan',
  '--input', docxPath,
  '--plan', planPath,
  '--output', outputDocxPath,
  '--author', author,
  '--organization', org,
  '--client-name', client,
  '--party-role', partyRole,
  '--review-intensity', intensity,
  '--edit-policy', editPolicy,
], { encoding: 'utf-8' })
```

stdout 解析：监听"执行统计: 成功=X"等行（apply_review_plan.py:411-423），更新实时进度（能力 B）。

---

## 5. 数据流（TODO：brainstorming 未完）

> **状态**：本节为占位，brainstorming 流程未完成 Section 3。需要补充：
> - 用户说"审查这份合同"到 plugin 接管的完整事件链
> - 4 步流程中每步的工具调用顺序
> - session 状态机的转换图
> - integrity gate 在 plugin 视角的接入点

---

## 6. 错误处理（TODO：brainstorming 未完）

> **状态**：本节为占位。需要补充：
> - intake 阶段用户拒绝填字段的处理
> - Python CLI 失败的错误传播（exit code != 0）
> - integrity gate 失败时的回滚策略
> - session 文件损坏的恢复机制

---

## 7. 测试（TODO：brainstorming 未完）

> **状态**：本节为占位。需要补充：
> - 单元测试覆盖（每个 tool 的 happy path + 异常 path）
> - 集成测试（plugin + Python CLI 真实跑一个 sample 合同）
> - snapshot 测试（DSH 事件流的产物对照）
> - 真实 e2e（`pnpm dsh --profile lawyer "审查这份合同"` 验证）

---

## 8. 决策日志（来自 brainstorming 完整记录）

| # | 决策点 | 选项 | 选择 | 理由 |
|---|---|---|---|---|
| Q1 | 目标用户 | A 自己/客户/平台/最小验证 | A 自己+律师 | 主要自用 |
| Q2 | 核心交互能力（多选）| 可批注/进度可见/中途决策/长程会话 | 全部 4 项都要 | Discussion 里 maoking 反复强调 |
| Q3 | 改造路径 | A 最小验证 / B 结构化拆分 / C 全功能重构 | A 最小验证 | 但 Q4 后转为 A+B+C+D+E 一次到位 |
| Q4 | plugin 能力（多选）| A/B/C/D/E/F | A+B+C+D+E，不要 F | Discussion 核心痛点 |
| Q5 | 新文件夹名 | 多个候选 | 和 legal-skills 平级（最终 Q6 定 legal-dsh-plugin） | 法律领域 |
| Q6 | 法律 plugin 名 | legal-dsh-plugins / -plugin | `legal-dsh-plugin`（单数） | DSH 官方习惯 |
| Q7 | package scope | @maoking / @ywxlaw / @yangweixin / 其他 | @yangweixin | 用户倾向 |
| Q8 | 是否走 npm publish | yes / no | **no** | GitHub 直接装即可 |
| Q9 | scope 选择 | 多 | yangweixin | |
| Q10 | GitHub 用户名 | maoking / yangweixin / cat-xierluo | cat-xierluo（用户现有） | 不新建账号 |
| Q11 | GitHub 用户名确认 | cat-xierluo | cat-xierluo | |
| Q12 | Section 2 v1 是否对 | 是/否 | 否，需修订 | 不够贴原 skill |
| Q13 | Section 2 v2 是否对 | 是/否 | 否，需再修订 | 没贴 Python 实际代码 |
| Q14 | 路线 trade-off | A 不动 Python / B 重构 Python | 通过重新理解"中途决策"绕过 | plugin 化 SKILL.md 4 步流程，每步都可插决策 |
| Q15 | Section 2 v3 是否对 | 是/否 | 是 | 贴合 SKILL.md §3.2 4 步流程 |
| Q16 | 计划文件落盘位置 | 多个 | `docs/2026-08-18-dsh-plugin-design.md` | 标准化日期前缀 |

---

## 9. 待审计 agent 重点检查

**请审计 agent 重点关注**：

1. **Section 4.2 的 7 个 Tools 是否真的 1:1 覆盖了 SKILL.md §3.2 4 步流程**？有没有遗漏的检查点？
2. **Section 4.4 的 CLI bridge 是否会让 Python 重复跑 intake blocker**？即：plugin 已经通过 `contract_copilot_intake` 收集了信息，但 Python 在 `resolve_review_context` 里还是会二次 prompt。是否需要在 plugin 层用 `--no-interactive` 或环境变量跳过？
3. **Section 5 数据流未完成**：审计 agent 可以基于 Section 4 + SKILL.md §3.2 自己推一版数据流，作为对比。
4. **Section 6 错误处理未完成**：尤其是 integrity gate 失败时的回滚——是直接把临时 DOCX 删除，还是让用户决定？
5. **Section 7 测试未完成**：建议审计 agent 直接参考 contract-copilot 现有 `scripts/tests/` 的测试覆盖，映射到 plugin 层。
6. **Section 2.2 的 package.json name 是否需要带 scope**：如果用户后续真要走 npm publish，带 `@yangweixin/` scope 会卡住吗？

---

## 10. 参考资料

| 类型 | 路径 |
|---|---|
| 原 skill 入口 | `legal-skills/skills/contract-copilot/SKILL.md` |
| 原 skill README | `legal-skills/skills/contract-copilot/README.md` |
| 原 skill 决策日志 | `legal-skills/skills/contract-copilot/DECISIONS.md` |
| Python 主入口 | `scripts/review/apply_review_plan.py` |
| Python reviewer profile | `scripts/review/review_runtime.py` |
| Python 动作执行 | `scripts/review/action_executor.py` |
| Python 完整性门禁 | `scripts/report/integrity.py` |
| 讨论会实录 | `Documents/Mac同步文件夹/.../260818 讨论会实录（逐字稿+PPT截图）_corrected.md` |
| DSH 仓库 | `参考项目/deepseek-harness/CLAUDE.md` + `AGENTS.md` |
| DSH 插件加载机制 | `apps/cli/src/plugin.ts` + `docs/user/develop/basic/publish.md` |
| DSH 插件社区 | `awesome-dsh-plugin/awesome-dsh-plugin` |
| DSH 第一插件教程 | `docs/user/develop/basic/index.md` |
| DSH Capability Seams Agent Note | `.agents/notes/implemented/architecture/2026-06-13-capability-seams.md` |

---

## 11. 元信息

- 文档版本：v0.1（草案）
- 下次修订触发条件：审计 agent 反馈、Section 3/4/5 补充完成、用户对 Section 4 提出调整
- 关联文件：本仓库 `docs/` 下后续可能新增 `data-flow.md`、`error-handling.md`、`testing.md`