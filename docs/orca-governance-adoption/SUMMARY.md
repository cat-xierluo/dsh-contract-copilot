# 一页纸总结：orca 治理模式 + 两个仓库的 Phase 1 清单

> 调研日期：2026-09-06。所有材料在 `/tmp/orca-governance-study/`：`REPORT.md`（架构解析）、`ADOPTION-folia.md`、`ADOPTION-dsh-contract-copilot.md`、本 SUMMARY.md。

## orca 模式精髓（三句话）

1. **结构性入口 + 机读模板 = 机器可判定**：issue 强制走表单（`blank_issues_enabled: false`）、PR 模板锚点让 CodeRabbit 能自动核验 ELI5/Visual Proof/Linked Issue/docstring 覆盖率（80% 门槛）；
2. **双 AI 交叉审查 = 人类只处理分歧**：CodeRabbit（规则/覆盖率型）管格式与可维护性契约，pullfrog（agent 跑在 Actions runner 里做语义推理）管正确性论证，两个 AI 意见一致时人类放心，分歧时人类只看分歧处；防陈旧元数据（“written against <commit SHA>”）解决大仓库高频合入下的过期问题；
3. **CODEOWNERS 按域路由 + verify 聚合 = 路径感知门禁**：detect job 把 PR diff 按 15 个布尔开关分类，下游 fan-out 只跑需要跑的 job，verify 聚合 required check，单点收敛判定。

## folia 仓库 Phase 1 清单（今天 30 分钟）

1. **重写 `.github/PULL_REQUEST_TEMPLATE.md`**：保留现有 Summary/Why/Test Plan/Checklist，新增 ELI5/Visual Proof/AI Disclosure/Agent skill upstream boundary/Notes 五个锚点；
2. **新增 `.github/CODEOWNERS`**：主维护者 maoking 兜底所有路径；`/src-renderer/tests/` 与 `/src/export/` 归合作律师 `@杨卫薪律师`；CI/发布相关文件 `@maoking` 独占；
3. **仓库 Settings 开启 “Issues must be created from a template”**：与 orca 的 `blank_issues_enabled: false` 等价。

**协作伙伴**：maoking（307 commits，主）、杨卫薪律师（96 commits，次）、xierluo（9 commits，备）。

## dsh-contract-copilot 仓库 Phase 1 清单（今天 1 小时）

1. **新增 `.github/pull_request_template.md`**：最小机读模板（ELI5/Summary/Why/What Changed/Linked Issue/Visual Proof/Test Plan/AI Disclosure/Notes/Checklist）；
2. **新增 `.github/CODEOWNERS`**：`/docs/business-rules/`、`/src/plan-review/`、`/src/intake-fields/`、`/src/host-api/contract-types.ts` 归合作律师 `@杨卫薪律师`；核心实现 / tests / CI 配置文件归主维护者 `@maoking`；兜底 `* @maoking`；
3. **新增 `.github/workflows/ci.yml`**：typecheck + test（含 `NODE_OPTIONS=--max-old-space-size=2048`，与本机一致）+ build；
4. **分支保护勾 typecheck + test 为 required check**。

**协作伙伴**：maoking（17 commits，主）、杨卫薪律师（1 commit，业务规则审核）。

## 风险与边界

- **folia 是私有仓库**：pullfrog for OSS 免费计划不适用；Phase 3 的 AI 审查要走付费或自托管方案（GitHub Copilot code review 是起步最简方案）；
- **dsh-contract-copilot 是公有仓库**：可直接用 pullfrog for OSS（DeepSeek Pro 免费）；
- **CODEOWNERS 用中文 GitHub username（@杨卫薪律师）合法**：但要在 Settings → Collaborators 里确认律师账号已加为协作者，否则 CODEOWNERS 不会触发 review request；
- **CI runner 上也要写 NODE_OPTIONS=--max-old-space-size=2048**：CI 默认无保护，与本机一致；
- **Phase 2-3 在 Phase 1 验证 1 周后再做**：避免一开始就过度配置。

## 后续观察

- 如果 PR 模板的 ELI5 / Linked Issue 出现大量空填写，需要把“必填”从规范改成“机器人直接拒收”——这正是 orca 走过的一步；
- 如果 Phase 1 上线后 4 周内 PR review 平均耗时仍超过 24h，再上 AI 审查层（folia 走 GitHub Copilot、dsh 走 pullfrog）；
- orca 的二级细节（如 bufo-bot Project 跟踪、跨仓 e2e workflow_call）folia 与 dsh 都不需要，跳过。

## 文件清单

```
/tmp/orca-governance-study/
├── REPORT.md                       (27.9KB · 三层架构 + 实证 + 设计原理)
├── ADOPTION-folia.md               (folia 分阶段落地)
├── ADOPTION-dsh-contract-copilot.md (dsh 分阶段落地)
└── SUMMARY.md                      (本文件 · 一页纸)
```
