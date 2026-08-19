# ARCHITECTURE

本文件描述 **当前已实现** 的架构与边界。路线与未来规划在 `docs/ROADMAP.md`。

## 1. 形态

`@yangweixin/dsh-contract-copilot` 是 **function plugin**（`apply(ctx, config)` + 命名导出 `name / inject / Config`）。不是 Service Definition。

**理由**：本插件无跨 plugin 消费需求，7 个 tool 的共享状态用 module-level 单例 + `ctx.effect()` 注册 disposer 足够。

## 2. 数据流

```
用户消息 → agent loop → tool handler → SessionStore (原子写 JSON)
                              ↓
                       Python CLI 异步 spawn
                              ↓
                  DOCX 产物 → session.outputs
                              ↓
                      finalize → delivered
```

详细事件链、状态机、session 文件结构见 `docs/2026-08-18-dsh-plugin-design.md` §5。

## 3. 模块布局

```
src/
├── index.ts                 # apply 入口：注册 7 个 tool + pre-step 进度注入
├── config.ts                # Config + WorkbenchConfig（v2 预留）+ resolveConfig 校验
├── session.ts               # SessionStore：9 态状态机 + 原子写 + 损坏恢复 + 事件订阅
├── python-bridge.ts         # 异步 spawn + 退码四分类（success/partial/rejected/error）
├── docx-view.ts             # OOXML → HTML（v2 复用为 React 组件输入）
├── progress.ts              # pre-step 注入文案 + 幂等判据
├── skill-config.ts          # 读 reviewer_profile / review_memory（Python 独占写入）
├── paths.ts                 # ~ 展开 + 合同 key 归一化（与 Python 一致）
├── json.ts                  # 收窄 + compactUndefinedDeep（lossless JSON 合规）
└── tools/
    ├── intake.ts            # §3.2.1 前置澄清（必填 summary 合并来源：args > pendingAnswers > memory > profile）
    ├── analyze.ts           # §3.2.2 分层扫描（plan 必填 summary + findings）
    ├── list-findings.ts     # 检视点（可切 edit_policy）
    ├── apply.ts             # §3.2.3 条款落地（异步 spawn，AbortSignal）
    ├── finalize.ts          # §3.2.4 交付（双 DOCX 校验）
    ├── inspect-session.ts   # 横切：状态查询
    └── resume.ts            # 长程续接 + §9.5 再审回路（newContractPath 替换合同指向）

lib/                         # tsc emit，构建产物（gitignore）
tests/                        # vitest 单测（66 个全绿）
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

## 6. 边界与外部依赖

- Python CLI：`apply_review_plan.py`（v1.6.3），硬依赖 `defusedxml`
- session 文件目录：`~/.dsh/contract-copilot/sessions/<id>.json`（插件可配）
- DSH harness：`@deepseek-ai/dsh-tools`（defineTool）、`@deepseek-ai/dsh-llm`（createUserMessage）、`@deepseek-ai/dsh-agent`（PreStepDecision 类型）
- Cordis：`@deepseek-ai/cordis`（peer）

## 7. 已知限制（运行时）

- **进度粒度 = tool 调用级**：Python CLI 执行期间零 stdout 输出（apply_review_plan.py:403-428 仅 main 尾部打印统计）
- **apply 长任务**（数分钟）会阻塞单 conversation turn；异步 spawn 已支持 AbortSignal
- **未实现验证点**：V2（ctx.userQuestions tool 内可用性）、V3（DSH session id API）、V4（HMR watch 范围）

## 8. v2 工作台（已实现，DECISIONS.md Q31）

双面插件：**host half**（Node）+ **client half**（浏览器）。

```
src/
├── host-api.ts          # host 数据面：ctx.get('webServer') 可选注册 /contract-copilot/*
│                        #   GET /state | /sessions/:id | /sessions/:id/document
│                        #   POST /sessions/:id/answers（确认表单回收 → session.pendingAnswers）
├── docx-view.ts         # OOXML → HTML（python3 zipfile 抽取 + 纯函数渲染：修订/批注高亮）
└── client/              # 浏览器 half（不进 tsc node 构建；tsdown 打成 lib/client.js）
    ├── index.tsx        # apply：ctx.slots.inject('conversation.session.header.utilities', …)
    └── Workbench.tsx    # 按钮 + 三栏对话框（列表/文档/状态卡，轮询 3-5s）
```

- 声明：`package.json` `dsh.client {platform:web, inject:[@deepseek-ai/dsh-client-runtime]}` + `exports["./client"]`
- 构建：`tsdown.client.config.ts` 复刻 closure-factory 工件契约（见 `docs/DSH-PLUGIN-REFERENCE.md` §4）
- 降级：headless/无 webServer 的 profile 里数据面静默跳过，7 个 tool 照常
- 渲染安全：文档 HTML 由 host 侧 `renderDocumentHtml` 生成（文本已 escape），client 直接注入