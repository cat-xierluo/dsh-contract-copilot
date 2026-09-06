## ELI5

<!-- 一段话给非开发人员（如合作律师）说明这个 PR 干了什么 -->

## Summary

<!-- 1-3 行说做了什么 -->

-

## Why

<!-- 为什么要做。关联的 issue 编号、用户反馈、回归现象 -->

- 关联 issue / ISS: <!-- 例：ISS-216 / 无 -->
- 触发场景:

## What Changed

<!-- 列出关键改动点；保持 scope tight -->

-

## Linked Issue

Fixes #

## Visual Proof

<!-- 工作台 UI / CLI 输出变更附 BEFORE/AFTER；纯代码/逻辑变更写 N/A 加理由 -->

`N/A`（理由：...）

## Test Plan

<!-- 实际跑过的命令和结果。不接受 "Not run in this step" -->

```text
$ pnpm typecheck
$ NODE_OPTIONS=--max-old-space-size=2048 pnpm test
```

## AI Disclosure

<!-- 若使用了 AI 工具请声明 -->

## Notes

<!-- 跨平台 / 性能 / 安全 / 业务规则影响；无则 N/A -->

## Checklist

- [ ] PR 小且聚焦
- [ ] ELI5 / Summary / Why / What Changed / Test Plan 都填了
- [ ] UI/CLI 变更附 BEFORE/AFTER，或 N/A
- [ ] 自审正确性 / 安全 / 业务规则
- [ ] 业务规则变更已与杨律师同步（或 N/A）
- [ ] `pnpm typecheck / test` 本地通过（或说明等 CI）
