# ROADMAP

愿景：把合同审查的体验从"聊天里跑 SKILL.md"升级到"成熟法律 AI 产品形态"——DSH 插件 UI（侧栏 / 工作台 / 抽屉），实时状态 + Word 修订可视化 + 确认点。

## 阶段划分

### v1：session-first（**已交付** ✅ 2026-08-19）

- ✅ 7 个 tool 真实链路跑通（headless + 本地网关 + 真实 Python CLI）
- ✅ e2e 三轮实测：含 `rejected`（缺 summary）→ `applied`（含 summary）→ `delivered`
- ✅ 退码分类四类全部命中（success / partial / rejected / error）
- ✅ 66 个单测全绿

**退出条件**：用户能用 `dsh --profile lawyer "审查这份合同"` 真实审一份合同，产物双 DOCX 可开，归档完整。**当前未做用户验收**（V2/V3/V4 实现期验证点见 `ARCHITECTURE.md` §7）。

### v1.1：增量增强（**可选**，看 v2 是否直接覆盖）

- resume 跨会话实测（已完成机制层验证，缺用户路径验证）
- partial 分类补面（已知 success/partial 两条；缺 error 端到端）
- V2 / V3 / V4 实现期验证点
- 53 → 66 单测扩展到覆盖 python-bridge 的 `runApplyCli` 真实 spawn 路径（需 defusedxml）

### v2：DSH 原生插件 UI（**下一里程碑**）

- ✅ 方向已确认：`package.json#dsh.client` + `ctx.slots.inject(...)`（DECISIONS Q31）
- ⏳ 拆 localhost 错路径代码（已 commit，见 CHANGELOG）
- ⏳ 实现 `src/client/index.ts`：3 个 slot 组件（侧栏入口 / 工作台主面板 / 确认表单）
- ⏳ 独立构建配置（tsdown browser bundle，参照 `packages/client/ui-theme`）
- ⏳ 实测 lawyer profile web UI 中"Contract Copilot"图标可见 + 工作台可用
- ⏳ 把 intake 的 `ask_user_question` 路径迁到页面表单（`pendingAnswers` 已在 schema 内，但表单 UI 还未做）

**退出条件**：用户能在 `http://127.0.0.1:3080` 的 DSH web UI 中看到"Contract Copilot"侧栏入口，点开抽屉看到：当前 session 列表 + 选中 session 的文档预览（含 ins/del 修订高亮 + 批注气泡）+ 进度状态 + 确认表单。

## 不在范围

- 起草流程（SKILL.md §十）plugin 化——v1 排除；架构层面需独立能力
- 整合多个 localhost 服务（F 项）——用户明确排除
- 贡献回 DSH 主仓库——独立仓库维持
- 重写 Python 脚本——项目硬约束