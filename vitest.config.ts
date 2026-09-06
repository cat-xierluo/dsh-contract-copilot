import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // 2026-09-05/06 崩溃循环期间的真实失败形态：agent-coordinator 等在
    // beforeEach 里派生真实 python3（writeContractDocx）的 spec，在系统
    // 高负载（后台优先级 + 多 worktree 并发全量跑）下超过 vitest 默认
    // 10s hook 上限而整文件连败。30s 与真实子进程用例的 testTimeout
    // 对齐（TASK-2026-09-06-orca-gov-02；不改 pool/worker 数）。
    hookTimeout: 30_000,
  },
})
