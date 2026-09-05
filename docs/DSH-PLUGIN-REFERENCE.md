# DSH 插件开发参考（范式与索引）

> **维护说明**：通用审计入口在 [dsh-plugin-lint skill](../../../legal-skills/skills/dsh-plugin-lint/SKILL.md)（legal-skills 仓库）。其开发规范仍以 rc.7 为快照；本文件已按 DSH 0.1.2-rc.1 源码重新核对工作台相关事实。

本仓库是 **DeepSeek Harness（DSH）的 out-of-tree 插件**。本文件沉淀本仓库实测验证过的 DSH 插件技术范式，供开发其他 DSH 插件项目复用。DSH 主仓库位于 `参考项目/deepseek-harness/`（下称 harness 仓库）。

> 事实核对于 2026-09-04，对应 harness 版本 `0.1.2-rc.1`、commit `76fda72979`。升级 DSH 后请按“参考文件”逐条复核。

## 1. 插件形态与分发

- **function plugin**：`export const name / inject / Config / apply(ctx, config)`（命名导出，无 default export）
- **声明 bundle**：`package.json` 的 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`
- **patch 层**：`cordis.patch.yml` 里 `- insert: [{id, name}]` 插入插件 row；profile/用户层可用裸 `- id:` + `config:` 按 id 覆盖整行 config（**必须重述该 row 全部键**）
- **安装链**（publish.md 全部核实）：
  - `dsh plugin --profile <name> add ./<dir>` → pnpm link → `reconcilePlugins`（`apps/cli/src/plugin.ts:59`）把包追加进 `dsh.profile.bundles`
  - GitHub 安装：`dsh plugin --profile <name> add github:<owner>/<repo>`；需包自带自包含 `prepare` 脚本 + 用户侧 `pnpm-workspace.yaml` 加 `allowBuilds: { '<pkg-full-name>': true }`
  - tarball（`pnpm pack`）与 npm publish 是免 allowBuilds 的替代
- **配置**：schemastery `z.object({...})` 导出 `Config`；误配 fail loud（apply 里校验并 throw）

## 2. 工具（model-facing）

```ts
import { defineTool } from '@deepseek-ai/dsh-tools'
ctx.tools.register(defineTool({
  name: 'xxx_yyy',
  description: '…',
  parameters: { key: { type: 'string', required: true, description: '…' } },
  output: { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: … }] },
  async execute(args, exec) { return value },
}))
```

已实测的硬约束：
- **lossless JSON**：返回值任何属性值为 `undefined` 都会被拒（`walkJsonValue` 递归，`packages/core/session/src/json.ts`）——返回前深度剥离 undefined（本仓库 `src/json.ts compactUndefinedDeep`）
- **DSL 限制**：`parameters` 不支持对象嵌套对象——嵌套结构拍平为顶层字段
- `execute(args, exec)`：`exec.signal` 必须响应（长任务传给 spawn 的 AbortSignal）
- 长任务可前台 await（耦合 signal）；后台任务用 `ctx.jobs.start`（cookbook "Long-running work"）
- 独立 const 的 schema 字面量要加 `as const`（否则字面量类型被拓宽，DSL 判型失败）

## 3. 事件与上下文注入

- 事件表：`packages/core/agent/src/runtime-types.ts`（`agent/pre-step` 是 waterfall，payload `{agent, messages, turn, step, signal}`，返回 `PreStepDecision`；**没有 `agent/post-step`**）
- 参照实现：`packages/context/time-context/src/index.ts:170`（pre-step 注入 + `{prepend:true}` + `createUserMessage({content:[{type:'text',text}], source:{kind:'plugin',...}})`）
- 工具结果观察：`tools/post-execute`（waterfall，可替换 value——但失败路径拿不到 value）
- ask 用户：内置 `ask_user_question` tool（`packages/interaction/tool-ask-user`，消费 `ctx.userQuestions` seam）

## 4. 浏览器 UI（dsh.client 双面包）——v2 工作台的机制

这是把插件 UI 长进 DSH web app 的**官方路径**：

1. **声明**：`package.json` 加
   ```json
   "dsh": { "client": { "platform": "web", "inject": ["@deepseek-ai/dsh-client-connection", "@deepseek-ai/dsh-client-ui-renderer", "@deepseek-ai/dsh-client-ui-sidebar"] } }
   ```
   + `exports["./client"]` 指向 `./lib/client.js`
2. **扫描与服务**：`packages/client/modules`（`ClientModuleRegistry`）扫 loader 全部 entries（**out-of-tree link 的包同样命中**，`createRequire(ctx.baseUrl).resolve`），写入 `window.__DSH_BOOT__`，按 `/plugins/<id>/client.js` serve 磁盘路径
3. **client half**：`src/client/index.ts` 是浏览器端 cordis function plugin，`ctx.slots.inject('<slot>', () => ctx.slots.register({...}, ReactComponent))` 注册组件
4. **host↔client JSON**：Host 用 `ctx.inject(['connection'], …)` 等待 Web profile 的 Connection，再以 `connection.rpc.handle(channel, handler)` 注册独占 channel；Client 通过 `ctx.connection.rpc.call(...)` 调用。物理 HTTP 层统一执行 Host/Origin 校验和浏览器 Cookie 认证。
5. **流与文件**：SSE、下载等不能走 JSON RPC 的响应，用 `connection.fetch.register({path:'/api/...', methods:['GET','HEAD'], fetch})` 注册精确 Fetch 路由，同样位于认证 `/api` 数据面。
6. **headless 降级**：不要把 `connection` 写入 Host 插件的硬 `inject`。`ctx.inject(['connection'], callback)` 只在服务出现时注册 Web 接口，7 个 tool 可在没有 Connection 的 profile 正常激活。

### 本工作台使用的 slot（harness 0.1.2-rc.1）

| slot | 用途 | 先例 |
|---|---|---|
| `sidebar.footer.action` | 侧栏底部附加动作；owner prop 为 `{wide}`，支持展开行与折叠 rail | `packages/client/ui-sidebar/src/client/contract/slots.ts`、`packages/extensions/ui-cordis/src/client/index.ts` |

Slot 由 owner 插件声明后才存在，因此外部插件同时需要对应 client package 的 type-only 导入/devDependency，以及 `dsh.client.inject` 中的加载顺序声明。不得把组件直接追加到 owner 的 DOM。

### client bundle 构建契约（out-of-tree 必须复刻）

harness 的共享预设 `packages/client/tsdown.client.ts` 不对外发布，自行用 tsdown 复刻。`outputOptions.entryFileNames: 'client.js'` 固定 ESM 包内的 CJS 工件路径；banner/intro/footer共同构造 `window.__ModuleLoader__.load` factory 与 `module.exports`。**HMR 限制**：out-of-tree 插件更新后仍需重启 DSH Web。

- `format: 'cjs'`，`platform: 'browser'`，entry `src/client/index.ts` → 产物 `lib/client.js`
- **outputOptions**：banner `window.__ModuleLoader__.load(...)`，intro 构造 `module/exports`，footer 返回 `module.exports`
- **externals**（当前冻结模块表）：`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives`
- **依赖策略**：`deps.neverBundle` 保留上述模块，`deps.alwaysBundle` 内联其余依赖；旧 `external/noExternal` 配置已退出
- `define`：`process.env.NODE_ENV`、`import.meta.env(.MODE)` 替换
- `sourcemap: true`；`clean: false`（别清掉同目录的 node half 产物）
- 纯度规则：非平台表的 `@deepseek-ai/*` 值导入禁止（跨插件协作走 cordis 服务；type-only import 会被擦除不受限）

## 5. profile / 启动

- profile 目录 `$DSH_HOME/profiles/<name>/`：`package.json`（bundles 清单）+ `cordis.patch.yml`（用户覆盖层）
- 从源码跑：harness 仓库内 `pnpm dsh --profile <name> [task]`（headless 单任务）或 `pnpm dsh web --profile ...`
- LLM provider：`DEEPSEEK_BASE_URL` / `DEEPSEEK_API_KEY` 环境变量可指向任何 OpenAI 协议兼容网关（实测 127.0.0.1:8787 网关 + deepseek-v4-flash）
- 配置层顺序：bundles 依序 → profile patch → `$DSH_HOME/cordis.patch.yml` → `--patch` 覆盖

## 6. 参考文件索引（harness 仓库内）

| 主题 | 路径 |
|---|---|
| 插件教程（function plugin/工具/配置） | `docs/user/develop/basic/index.md`、`tool.md`、`config.md` |
| 打包与安装（bundle/profile/GitHub） | `docs/user/develop/basic/publish.md` |
| 插件 CLI（reconcilePlugins） | `apps/cli/src/plugin.ts` |
| 工具契约（execute/output/后台任务/Code Mode） | `docs/cookbook/adding-a-tool.md` |
| 工具运行时源码 | `packages/core/tools/src/index.ts` |
| agent 事件声明 | `packages/core/agent/src/runtime-types.ts` |
| pre-step 参照 | `packages/context/time-context/src/index.ts` |
| ask_user 工具 | `packages/interaction/tool-ask-user/src/index.ts` |
| client 模块扫描（dsh.client） | `packages/client/modules/src/index.ts` |
| slot 注册表（ui-slots） | `packages/client/ui-slots/`（README 含 register 契约） |
| 侧栏 slot 声明与先例 | `packages/client/ui-sidebar/src/client/contract/slots.ts`、`packages/extensions/ui-cordis/src/client/index.ts` |
| 认证 RPC/Fetch | `packages/client/connection/src/rpc.ts`、`rpc-host.ts`、`client/rpc.ts` |
| client 构建预设（契约蓝本） | `packages/client/tsdown.client.ts`、`packages/client/web/src/platform.ts`、`packages/client/web/src/seed.ts` |
| 动态插件运行器（进阶） | `packages/extensions/cordis-client-runner/` |
| base bundle（默认插件清单） | `packages/bundle/base/cordis.patch.yml` |
| web bundle | `packages/bundle/web-app/cordis.patch.yml` |

## 7. 本仓库的范式实例

- host half（工具 + 状态机 + 数据面路由）：`src/index.ts`、`src/tools/*`、`src/session.ts`
- client half：`src/client/`（v2）
- 双面包声明：`package.json` 的 `dsh.bundle` + `dsh.client` + `exports`
- 构建脚本：`package.json` scripts（tsc 出 node half + tsdown 出 client bundle）
