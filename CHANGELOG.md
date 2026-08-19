# 变更日志

本文件记录本仓库已交付的用户可见变化。

## [Unreleased] — 推进中

### Added
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