import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // 2026-09-05/06 崩溃循环期间的真实失败形态：agent-coordinator 等在
    // beforeEach 里派生真实 python3（writeContractDocx）的 spec，在系统
    // 高负载（后台优先级 + 多 worktree 并发全量跑）下超过 vitest 默认
    // 10s hook 上限而整文件连败。30s 与真实子进程用例的 testTimeout
    // 对齐（TASK-2026-09-06-orca-gov-02；不改 pool/worker 数）。
    hookTimeout: 30_000,
    // 2026-09-09 注销风暴中 ORCA 会话恢复拉起的全量 vitest 绕过了
    // `pnpm test` 入口的 NODE_OPTIONS 堆顶（裸 vitest 的 fork worker
    // 默认可到 ~4GB），两个 worker 相继 V8 OOM 加速全机内存耗尽。
    // 把合约级 2048MiB 护栏下沉到 worker 启动参数：任何入口跑 vitest
    // （ORCA 恢复路径、裸 npx vitest、agent 会话），每个 worker 都带
    // 2048 顶，单 worker 爆只死自己、vitest 报失败，不再拖垮全机。
    // 不改 pool 类型与 worker 数（Q45 边界内，详见 Q46）。
    poolOptions: {
      forks: {
        execArgv: ['--max-old-space-size=2048'],
      },
    },
  },
})
