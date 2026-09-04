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

### v2：DSH 原生插件 UI（**核心已落地** ✅ 2026-08-19）

- ✅ 方向确认：`package.json#dsh.client` + `ctx.slots.inject(...)`（DECISIONS Q31）
- ✅ 拆除 localhost 错路径代码
- ✅ `src/client/`：会话头部"📋 审查工作台"按钮 + 三栏对话框（session 列表 / Word 文档视图含修订高亮与批注 / 状态·统计·产物·发现·确认表单）
- ✅ `src/host-api.ts` 数据面（headless 自动降级）
- ✅ `tsdown.client.config.ts` 构建契约（两处细节修复记录在 DECISIONS Q31）
- ✅ web profile 浏览器实测：按钮渲染 + 对话框三栏 + 合同正文 + 批注气泡 + 审查发现（截图验证通过）
- ⏳ 剩余：确认表单 → agent 消费的端到端用户路径实测（机制已通：pendingAnswers 回路在 v1 已验证）
- ⏳ 剩余：修订视图用带 force_edit 产物的 session 呈现（当前实测 session 是 force_edit 之前的产物，天然无 w:ins）

**退出条件**：用户在 DSH web UI 会话页看到工作台按钮，点开看到 session 列表 + 文档预览（修订高亮 + 批注气泡）+ 状态 + 确认表单，表单提交后 agent 可消费。**已达 90%**（表单→agent 消费的用户路径待实测）。

### v2.1：DSH 0.1.2 工作台迁移（**实现完成，验收中** 2026-09-04）

- ✅ DSH 与插件依赖升级到 `0.1.2-rc.1`，移除已删除的 `dsh-client-runtime`
- ✅ 入口迁到官方 `sidebar.footer.action`，不再轮询或改写 sidebar DOM
- ✅ JSON 操作迁到 Connection RPC；SSE 与 DOCX 下载迁到认证 `/api` 精确 Fetch 路由
- ✅ 工作台增加四阶段进度和最近八条状态跃迁
- ✅ Host/Client 共享协议拆成零 Node 依赖的数据层，浏览器工件不再牵入持久化实现
- ✅ Python 集成测试使用每次独有的配置和归档目录，不污染真实用户状态
- ⏳ 候选 commit 的隔离 profile boot、未登录负向探测与浏览器截图待绑定

**退出条件**：build、完整测试、dsh-plugin-lint、隔离 profile boot、三类未登录请求拒绝、浏览器侧栏入口与工作台关键区域均有候选绑定证据。

### v3：产品化精细交付（建议顺序）

1. **工作台直接派发审查任务**：从“创建 session 后提示用户再对 Agent 说一句”升级为受控后台 Agent 任务，消除双入口。
2. **逐 finding 决策台**：支持接受修订、仅批注、调整严重级别和暂缓，并把律师决定写入可审计事件。
3. **案件级交付包**：把原合同、修订版、意见书、关键决定和复审版本组织成一个可下载、可复核的案件视图。
4. **团队与批量队列**：只有单案闭环稳定后，再引入负责人、截止日、批量合同与跨用户协作。

## 不在范围

- 起草流程（SKILL.md §十）plugin 化——v1 排除；架构层面需独立能力
- 整合多个 localhost 服务（F 项）——用户明确排除
- 贡献回 DSH 主仓库——独立仓库维持
- 重写 Python 脚本——项目硬约束
