# Contract Copilot（DSH Plugin）

合同审查四步流程（前置澄清 → 分层扫描 → 条款落地 → 交付跟进）的 DeepSeek Harness 插件。
原 [contract-copilot] skill 的 Python CLI 一行未改，本插件作为流程外壳提供：结构化 intake、
plan 载体、执行退码分类、进度注入与跨会话续接。设计稿见 `docs/2026-08-18-dsh-plugin-design.md`。

## 前置条件

- DSH CLI（`dsh`），Node ≥ 22
- 本机 `contract-copilot` skill 目录（含 `scripts/` 与 `config/`）
- Python 3 与依赖：`python3 -m pip install -r <skill根>/scripts/requirements.txt`（defusedxml）

## 安装

```sh
# 本地目录
dsh plugin --profile lawyer add ./dsh-contract-copilot

# 或从 GitHub（首次 add 会因 prepare 构建未授权失败，按提示在 profile 的
# pnpm-workspace.yaml 加 allowBuilds: '@yangweixin/dsh-contract-copilot': true 后重跑）
dsh plugin --profile lawyer add github:cat-xierluo/dsh-contract-copilot
```

在 profile 的 `cordis.patch.yml` 里配置 skill 根目录（必填）：

```yaml
- replace:
    - id: contract-copilot
      config:
        skillRoot: /path/to/legal-skills/skills/contract-copilot
```

可选配置：`pythonExecutable`（默认 `python3`）、`sessionsDir`（默认
`~/.dsh/contract-copilot/sessions`）、`injectProgress`（默认 `true`）。

## 使用

对 agent 说"审查这份合同"，工具链自动流转：

1. `contract_copilot_intake` —— 前置澄清（立场/目的/口径/审查人；命中本地审查记忆时沿用）
2. `contract_copilot_analyze` —— agent 读 skill references 后提交结构化 findings，生成 review-plan.json
3. `contract_copilot_list_findings` —— 执行前检视；可切换 edit_policy
4. `contract_copilot_apply` —— 执行批注/修订（数分钟），产物：修订批注一体版 DOCX + 审查意见书 DOCX
5. `contract_copilot_finalize` —— 校验双 DOCX 交付
6. `contract_copilot_inspect_session` / `contract_copilot_resume` —— 进度查询 / 跨会话续接（含对方改稿后的再审）

## 已知限制

- 进度粒度是 tool 调用级；Python CLI 执行期间无流式输出（设计稿 §3.3）
- `apply` 的四类结果中 `partial`（有交付物但有失败项）与 `rejected`（完整性门禁拒绝、无交付物）都是正常域结果，按返回的 `guidance` 处理
- 每个审查项必须有可核验的 `legal_basis`（法条依据），否则交付被完整性门禁拒绝

## License

CC-BY-NC-4.0 © 杨卫薪律师（微信 ywxlaw）
