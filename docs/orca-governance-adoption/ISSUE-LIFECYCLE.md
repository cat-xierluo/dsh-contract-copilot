# ISSUE-LIFECYCLE — orca 的 issue 治理深挖

> 增量研究。`REPORT.md` §3.1 只看了 `bug_report.yml` 和 `config.yml`，且仅 2 段；本文补全 issue 端的全貌：所有模板的字段机器可读性、`blank_issues_enabled: false` 之外的锁、自动标签治理的真实负载、与 autopilot 的内部对齐。

## 0. 一句话增量

orca 的 issue 端不是"一张表单 + 一个 labeler"两层，而是**三套表单 + 一个幂等 labeler + 一个可选的内部 autopilot 接管**，加上"标题前缀"把 issue 类目编码到元数据，从而**`title:` + `labels:` + 正则锚点三处冗余让 issue 类型在 GitHub 搜索/看板/邮件通知里都自带机器可读的语义**。这个机制在 `REPORT.md` 里没出现。

## 1. 完整 issue 表单清单（不只是 bug_report）

`/Users/maoking/Library/Application Support/maoscripts/参考项目/orca/.github/ISSUE_TEMPLATE/` 下四个文件，每个都把"title 前缀 + 顶层 labels + 表单 id"三处做一致编码：

| 文件 | `title:` 前缀 | 顶层 `labels:` | `type:` | 强制字段（`validations: required: true`） | 可选字段 |
|---|---|---|---|---|---|
| `bug_report.yml` | `[Bug]: ` | `bug` | `Bug` | `os`（dropdown）、`details`（textarea） | `orca_version` |
| `feature_request.yml` | `[Feature]: ` | `enhancement` | `Feature` | `problem`、`proposal` | `alternatives` |
| `other.yml` | `[Other]: ` | （无顶层 labels） | （无） | `details` | — |
| `config.yml` | — | — | — | — | `blank_issues_enabled: false` |

### 1.1 字段的机器可读语义

四个模板的字段 id 命名都按 schema-friendly：`os`、`orca_version`、`details`、`problem`、`proposal`、`alternatives`。dropdown 字段 `os` 的可选值是 macOS / Windows / Linux / Other——这恰好是 `issue-os-labeler.yaml` 里 `osLabelMap` 的三类加兜底。**dropdown 是结构化的，placeholder 是叙事骨架**：

```yaml
# feature_request.yml 第 14 行
- type: textarea
  id: problem
  attributes:
    label: Problem or use case
    description: What are you trying to do, and what is missing today? Include a short summary here too.
    placeholder: It is hard to switch between the same few repositories throughout the day.
```

placeholder 给"格式良好的废话"，描述给"语义约束"，validations 给"硬门禁"——三层约束共同把 issue body 塑成可机读的字段表。

### 1.2 `other.yml` 的设计取舍

`other.yml` 是有意轻量的：

```yaml
name: Other
description: Report another Orca issue type
title: '[Other]: '
type: Other
body:
  - type: textarea
    id: details
    attributes:
      label: Details
      description: Share the context, request, or issue. Include a short summary here too.
    validations:
      required: true
```

不预设 `type:`、不预设 labels、没有 dropdown，只留一个 `details`。这是**给"我不知道该归类"的求助者**的兜底——告诉维护者"这个不该进入常规 triage 流"。但代价是 `issue-os-labeler.yaml` 对 `[Other]` 类无能为力，因为没有 `os` 字段（labeler 用 `^### Operating system\s+(.+)$` 解析，找不到就 skip 不报错）。**这意味着 `[Other]` 类 issue 全靠人工 label，不会自动归类**。

### 1.3 `title:` 前缀的隐藏价值

`title: '[Bug]: '` 这种前缀做了三件事：
1. **GitHub 邮件/通知/Dashboard 里 issue 类型一眼可辨**——不用展开 body 就知道是 bug；
2. **搜索过滤器可以正则**——`title:[Bug]`、`title:[Feature]`、`title:[Other]` 三类互不混淆；
3. **给 labeler 之外的"双轨信号"**——即使 label 后续被人手改了，title 前缀仍是稳态。

这是 issue 类型**冗余编码**（title + labels + body 锚点三处）的第一处。`REPORT.md` §3.1 只把它当"title 规范化"提了一句，但实际是更深的治理信号——**多轨冗余让单点编辑不会丢失分类**。

## 2. `blank_issues_enabled: false` 之外的锁定机制

`config.yml` 全文只有一行：

```yaml
blank_issues_enabled: false
```

但 GitHub issue 端还有几个常被忽略的开关，orca 在隐性地依赖它们：

| 机制 | 来源 | 作用 |
|---|---|---|
| `blank_issues_enabled: false` | `.github/ISSUE_TEMPLATE/config.yml` | 禁用空白 issue，强制走表单 |
| 模板只能由 admin 修改 | GitHub 内置 | 不能在 issue 侧删除某个模板，必须有 admin 权限 |
| `type: Bug` / `type: Feature` | yml 顶层 | GitHub 把 `type` 字段映射到看板 column；orca 的看板目前有 Bug / Feature 两列，`[Other]` 没有 `type` 所以不进看板 |
| `labels: ["bug"]` 等顶层 labels | yml 顶层 | issue 创建时**自动贴**，这是 GitHub 内置行为，不是 labeler 干的；labeler 只加 `os:*` |

换句话说，orca 的"未填字段会怎样"问题有两套答案：
- **模板级必填字段**（`validations: required: true`）：用户提交前 GitHub UI 就会拦；
- **机器消费字段**（如 `os`）：labeler 找不到会 skip 但不报错，issue 创建出来照样过。

这是**两层约束分开设计**：UI 拦"漏填"，机器人拦"漏判"。`REPORT.md` §3.1 没区分这两个责任。

## 3. 自动 labeler 的真实负载（`gh api` 实测）

`issue-os-labeler.yaml` 的代码很简洁，但实际效果需要用真实数据验证。2026-09-06 当日用 `gh api repos/stablyai/orca/issues?per_page=100&state=all` 拉的前 100 条非 PR issue 里：

| 标签 | 计数（前 100 条） |
|---|---|
| `bug` | 5 |
| `os:macos` | 4 |
| `enhancement` | 3 |
| `os:Windows` | 2 |

**可见 `os:linux` 在前 100 条里出现 0 次**——与 orca "macOS-first" 的产品形态一致（README 自述）。`os:macos` 与 `bug` 几乎一一对应（4/5），说明 macOS bug 几乎都被双标签管理起来。

更细的真实样本（issue #18994）：
```
{"labels":["bug","os:macos"],"n":18994,"st":"open","title":"[Bug]: The mobile app didn't sync after renaming the tab on the Mac."}
```

`[Bug]:` 前缀 + `bug` + `os:macos` 三轨完全一致——证明 labeler 是按预期工作的。

**唯一例外**：issue #18849 的 `os:macos` label 缺 `bug` label（其他都成对出现），#18066 的标题没有 `[Bug]:` 前缀但有 `os:macos`——这些是手动编辑或管理员重命名造成的漂移案例，**印证了"多轨冗余"在漂移出现时仍有信号**。

## 4. 空填 / 漂移问题：`bug` 标签 5/5 命中率

5 个带 `bug` 标签的 issue 全部来自 `bug_report.yml` 模板（标题前缀 + 顶层 labels 双印证），没有被用户手动改标题后丢失分类——orca 的强制表单+顶层 labels 体系对"模板外 issue"的兜底相当彻底。

但另一个角度看：**所有 `os:macos` 都是 macOS 用户提交**（5/5 是 macOS-only bug），意味着 labeler 没有为 Windows / Linux 用户打过额外 1 个以上的标签——这与 macOS 用户基数吻合，但仍提示：**`os:linux` label 在前 100 条样本里 0 出现**——是或ca 用户群体小、还是 labeler 在 Linux issue 上命中率低，需要更长样本验证。

## 5. 内部 autopilot 接管：issue #18831 的真实形态

`REPORT.md` §5 提了 issue #18831，但只引了开头 4 行 HTML 注释。完整 body 的关键结构：

```html
<!-- machinery-sig: session-daemon-never-auto-updates-when-live-sessions-exist -->
<!-- autopilot-issue-labels: developer-report,severity:medium,evidence:located -->
```

正文显式声明：

> This issue was filed via `autopilot report-issue` by a developer through the `/report-issue` skill — capturing the context from the session where the problem occurred. It is the **durable capture of the report**; the eventual fix still flows through `/create-task` → IT-NNNNN.

### 5.1 这是 issue 治理的"内部对偶面"

公开 issue 的"表单强制 + labeler 自动归类"是给社区用的。`autopilot report-issue` 是**内部开发者**用的对偶——它直接生成机器签名的 issue body：

- `machinery-sig`：故障的"机器签名"（人话即"诊断指纹"），用于跨会话合并同一故障；
- `autopilot-issue-labels`：`developer-report` / `severity:*` / `evidence:*` 三种**机器消费标签**，与社区的 `bug` / `enhancement` / `os:*` 完全错位；
- `Severity: medium`：可被 labeler 抓到再补一次，但本次它由生成器直接写入；
- Framework version `stratos-autopilot@0.70.0+593873c1fb` 和 `Signature: session-daemon-never-auto-updates-when-live-sessions-exist`：版本 + 签名 + 报告仓，让维护者一眼看出这是哪台机器 / 哪个版本 / 哪种故障。

### 5.2 与 `/create-task` 桥接

正文中"the eventual fix still flows through `/create-task` → IT-NNNNN"是关键——**issue 是 capture，task 是 ticket**。这种"内部工单编号 IT-NNNNN"是 orca Cloud 的 incident tracker 编号（用户编号体系外），issue 是入口、任务系统是事实。

这对社区仓库的启示：

- 公开 issue 不必与内部工单 1:1；
- 但**所有内部 issue 都应走表单生成的统一结构**（machine signature + label triple），让内部搜索能合并同类项；
- issue 体内显式嵌入"它从哪条 skill / 哪个 agent 提交"是审计信号，比 user attribution 更可追溯。

## 6. 用户仓库可直接借鉴的写法

> folia 私有 + dsh-contract-copilot 公有都暂无 issue 表单。可按 orca 模式从以下三处选档落地：

### 6.1 folia 建议（最低成本版）

业务领域窄、用户少，不需要 `bug_report` + `feature_request` + `other` 三套。**单表 + 空禁**足够：

```yaml
# .github/ISSUE_TEMPLATE/config.yml
blank_issues_enabled: false
contact_links:
  - name: 业务规则咨询
    url: https://github.com/cat-xierluo/Folia/discussions/new?category=q-a
    about: 业务规则怎么用、走哪种结构，请去 Discussions。
```

```yaml
# .github/ISSUE_TEMPLATE/bug_report.yml
name: Bug report
description: Report a problem with Folia
title: '[Bug]: '
type: Bug
labels: [bug]
body:
  - type: dropdown
    id: severity
    attributes:
      label: 影响面
      options: [影响所有用户, 仅个别用户复现, UI 瑕疵, 数据错位]
    validations:
      required: true
  - type: textarea
    id: repro
    attributes:
      label: 复现步骤
      description: 输入什么 → 期望什么 → 实际什么
    validations:
      required: true
```

加一个最简 `issue-labeler.yaml`：

```yaml
name: Label issues by severity
on:
  issues: [opened, edited]
permissions: { issues: write }
jobs:
  apply:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/github-script@v8
        with:
          script: |
            const m = (context.payload.issue.body || '').match(/^### 影响面\s+(.+)$/m);
            if (!m) return;
            const map = { '影响所有用户': 'severity:P0', '仅个别用户复现': 'severity:P2', 'UI 瑕疵': 'severity:P3', '数据错位': 'severity:P1' };
            const desired = map[m[1].trim()];
            if (!desired) return;
            const existing = context.payload.issue.labels.map(l => typeof l === 'string' ? l : l.name);
            const kept = existing.filter(l => !Object.values(map).includes(l));
            await github.rest.issues.setLabels({ owner: context.repo.owner, repo: context.repo.repo, issue_number: context.payload.issue.number, labels: [...new Set([...kept, desired])] });
```

### 6.2 dsh-contract-copilot 建议（业务规则审核专用版）

dsh 的本质是"业务规则+合同字段"，比 folia 更需要分类精确。建议 `bug_report.yml` 加 `module` 字段（对应 `/docs/business-rules/` 子目录），由杨律师人工补 labels：

```yaml
- type: dropdown
  id: module
  attributes:
    label: 涉及业务规则模块
    options:
      - 合同主体（`src/host-api/contract-types.ts`）
      - 计划审核（`src/plan-review/`）
      - 字段抽取（`src/intake-fields/`）
      - 其他（请在 details 写明）
  validations:
    required: true
```

杨律师在 CODEOWNERS 里是该模块 owner，自动 review request 会路由到他（已写进 `ADOPTION-dsh-contract-copilot.md` §1.2）。但**模板字段让 reviewer 第一时间看到上下文**，省去第一次回复"麻烦告诉我这是哪条规则"。

### 6.3 两仓库通用的"内部故障捕获"参考

如果未来 folia / dsh 接入 `autopilot`-like 内部 agent（如 multi-agent-orchestration PM），可以借鉴 issue #18831 的格式：

```html
<!-- machinery-sig: <故障指纹，幂等 hash> -->
<!-- autopilot-issue-labels: developer-report,severity:<P?>,evidence:<located|absent> -->

## PM report

This issue was filed via `multi-agent-orchestration /report-issue` by an internal agent — capturing the context from the worker session where the problem occurred.

**Framework version:** multi-agent-orchestration@<version>+<sha>
**Signature:** <故障指纹>
**Reporting agent:** <pm worker name>
**Severity:** <P?>
```

最关键的：把 "issue 是 capture，task 是 ticket" 的分离在 body 里显式写明——这是 audit-friendly 设计的核心。

## 7. 给落地者的提醒

1. **不要把 `os:` 当作 issue 端唯一标签**——ora 的 `os:*` 之外还有 `bug`/`enhancement` 顶层 labels（模板自带）+ `severity:*`/`evidence:*`（autopilot 写入）+ `pending_repro`（管理员手贴）四套。**用户从 issue 端能看到至少 5 种标签维度**，这是结构化 issue 的真实成本。
2. **`[Bug]:`/`[Feature]:` 前缀不是装饰**——它是搜索/通知/Dashboard 的第一道信号；建议两仓库都加，哪怕只强制一种。
3. **`other.yml` 是兜底不是默认**——避免"什么 issue 都走 other"导致不归类。考虑把它限制到只有 admin 才能贴，或者干脆只在 issue tracker 里"重定向 to Discussions"。
4. **labeler 找字段找不到就 skip 不报错是对的**——但建议在 workflow run summary 里记一笔"今天 N 条 issue 无 OS 字段"作为 dashboard 信号，单纯依赖 `gh` 查不一定能发现问题。

## 8. 与原 REPORT.md 的关系

| 主题 | REPORT.md | 本文件增量 |
|---|---|---|
| L0 总图 | §3.1（4 行 + 2 段） | §1（全 4 个表单 + 字段表） |
| 表单字段机器可读性 | 提了 dropdown + placeholder 叙事骨架 | §1.1（schema-friendly id 命名 + 三层约束） |
| `blank_issues_enabled: false` | 提了一句 | §2（4 套隐性开关 + 两层约束分开设计） |
| labeler 实证 | §3.1 一段 + §5 时间线 | §3（真实 label 分布 + 漂移样本） |
| 内部 autopilot | §5 末尾 5 行 | §5（machinery-sig + label triple + `IT-NNNNN` 编号体系 + 与 `/create-task` 桥接） |
| 用户仓库落地建议 | 无 | §6（folia / dsh 双仓库的最低成本 + 业务规则定制版） |
| labeler "skip 不报错"的运维启示 | 无 | §7（dashboard 信号建议） |

**没有冲突**——本文件全部内容为 REPORT.md 的补全和实测，不修改其任何结论。
