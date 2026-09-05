# Contract Copilot v0.3.1 工作台体验收口验收

## 候选绑定

- 产品实现候选：`cfcfb7790c927919fcb5222e6ba87f3cc35bbbfe`
- DSH：`0.1.2-rc.1`，源码提交 `76fda729799fe9b3848dbe2c211d4b231032b81e`
- 插件包：`@yangweixin/dsh-contract-copilot@0.3.0`
- 浏览器验收 tarball SHA-256：`6b96c0f6d7334b13934c339959e030ab48c3684f9e29b5c6062aa27d9f87a198`
- 收口重打包 tarball SHA-256：`713d73025ac3e243e7fc29df6e9a34e499926a9dd15ec2c3d29457c98a8835d1`；只因 README 状态由“复核中”改为“已通过验收”而变化，排除 README 后与浏览器验收包逐文件一致，`lib/client.js` 与 `lib/index.js` SHA-256 分别仍为 `c576c8762b92fd29e91a57a6d87c0bf000f16ade718a3bd51e0f98df1994d784`、`3b79ec2bbaa280e56fc3c33d0c0dfae0f079f4d6db3f884afd2d3cc88a68408e`
- profile：独立临时 DSH home 与 Web profile；插件从上述 tarball 安装，不使用源码链接
- 数据：脱敏合成软件开发服务合同；不含真实客户、案号或身份材料

本记录所在提交还会包含验收文档本身。合并门 reviewer 以 PR 远端精确头为准，精确 reviewed head 和结论记录在 PR 审查证据中，避免用产品实现提交冒充最终文档头。

## 自动化门禁

| 门禁 | 结果 |
|---|---|
| `pnpm run typecheck:client` | 通过 |
| `pnpm run test` | 16 个文件，266/266 通过 |
| `pnpm run build` | Node 类型构建、Client 类型构建及 tsdown bundle 通过；`client.js` 542.13 kB，gzip 117.36 kB |
| `git diff --check` | 通过 |
| CC-V4-009 / CC-V4-010 worker value postflight | 通过；提交头、工程资产和三条验证命令已绑定 |
| 独立 GLM merge review | `ACCEPT`；reviewed head `cdcbbcca69dbaff768d98fe450f9a86ba7fa6ca2`；review-acceptance 与 merge-gate 均通过 |

## 真实 Agent 与案件状态

隔离 Web profile 使用真实 `deepseek-official / deepseek-v4-flash` 从合成合同完成风险分析，生成 8 项 finding，并停在 `plan_ready / waiting-decisions`，证明专属 Agent 的合同正文与最小审查指导注入可用。该会话仅用于分析验收，没有执行 apply。

浏览器交付态使用另一条脱敏合成会话；其审核修订版 DOCX 含一条真实 Word 批注，用于验证 Word 原生批注与简版锚点。两类会话用途分开记录，不把合成交付态描述为本次真实模型 apply 结果。

## 真实 DSH Web 浏览器验收

| 场景 | 观察结果 |
|---|---|
| 暗色主题 | 页面背景 `rgb(21, 21, 23)`；工作台背景 `rgb(44, 44, 46)`；前景文字 `rgb(249, 250, 251)`；无浅色孤岛 |
| 浅色主题 | 页面与工作台背景 `rgb(255, 255, 255)`；前景文字 `rgb(15, 17, 21)`；主题切换后工作台保持可读 |
| 窄屏 | 约 844 CSS px 视口出现“任务 / 文档 / 操作”三页签；从“操作”按 `ArrowLeft` 选择“文档”，业务区域仍可达 |
| 对话框焦点 | 打开后焦点位于工作台内；`Escape` 关闭后焦点返回“打开合同审查工作台”入口 |
| 简版侧栏 → 正文 | 点击批注命中 `SPAN[data-cc-anchor]`，附加 `cc-comment-flash`；背景 `rgb(253, 242, 204)`、描边 `rgb(215, 183, 102)` |
| 简版正文 → 侧栏 | 点击正文 `SUP.cc-comment` 后，对应侧栏批注按钮被选中并获得焦点 |
| Word 侧栏 → 正文 | 点击批注命中对应 `P` 并显示同一琥珀高亮与描边 |
| Word 正文 → 侧栏 | `.docx_commentreference` 显示 `💬`，具有 `role=button`、`tabindex=0` 和本地化辅助名称；点击或按 `Enter` 均回选并聚焦侧栏批注 |
| A→B→A | 返回已交付案件后，简版侧栏请求仍再次命中正文并高亮，旧案件已处理水位没有泄漏 |
| 同案件重复激活 | 重复点击当前案件后，侧栏请求仍命中正文并高亮，激活操作保持幂等 |

## 正式插件审查

更新后的 `dsh-plugin-lint` 在实现候选上机械输出 `0 FAIL / 3 WARN / 0 NOT_VERIFIED`。三项 WARN 的人工处置如下：

1. `stream`、`buffer`、`util`、`events` 来自客户端打包依赖 `jszip/readable-stream`；真实 DSH tarball boot 与浏览器加载通过，未形成未解析的运行时导入。
2. `comment-navigation.ts` 的中文文本是内部诊断；用户可见未命中状态由 typed locale 的 `commentMissStatusText` 提供。
3. `docs/DECISIONS.md` 中的 `dsh-client-runtime` 是记录迁移删除原因的历史决策，不是当前依赖或架构声明。

lint 运行绑定 PR 代码与打包头；后续收口提交只更新项目状态文档和 README 状态，不改变插件运行代码、构建工件或上述 WARN 处置。收口重打包已通过排除 README 的逐文件比较确认运行载荷一致。

## GUI GIF 与独立合并门

- GUI GIF：[`contract-copilot-v301-final.gif`](https://github.com/cat-xierluo/dsh-contract-copilot/blob/contract-copilot-v301-assets/contract-copilot-v301-final.gif?raw=true)，1200×900、11 秒、282489 bytes，SHA-256 `3f19a70ea655b5a1f1969349bd309957122cb3b63d578779c4549009c068aace`。资产分支只承载演示文件，合并后继续保留。
- 未参与实现的 GLM reviewer `cc-pr1-final-review-glm` 对完整 `origin/main...cdcbbcca69dbaff768d98fe450f9a86ba7fa6ca2` diff、测试、lint、浏览器证据和 GIF 给出字面结论 `ACCEPT`；`review-acceptance-gate.v1` 与 merge-gate postflight 均通过。
- reviewer 独立执行 `git diff --check origin/main...HEAD`、client `tsc` 与完整 `vitest`，最终退出码均为 0。首次 `tsc` 因只读 pnpm 链接断裂退出 1；PM 只修复环境链接，未改产品文件，原命令复跑通过，审查报告同时保留该环境事故。
- `doc-curator` 对 `origin/main..HEAD` 的上下文同步检查无 hard 阻断；唯一 adaptive 是通用规则要求 `## YYYY-MM-DD`，而本项目采用 `## [Unreleased]` 下的带日期详细小节。全量扫描使用 FaroPDF 兜底配置，与本项目任务源和跨仓库链接规则不匹配，不作为合并门禁。
