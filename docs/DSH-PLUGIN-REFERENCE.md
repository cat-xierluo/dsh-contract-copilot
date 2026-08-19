# DSH 插件开发参考（范式与索引）

本仓库是 **DeepSeek Harness（DSH）的 out-of-tree 插件**。本文件沉淀本仓库实测验证过的 DSH 插件技术范式，供开发其他 DSH 插件项目复用。DSH 主仓库位于 `参考项目/deepseek-harness/`（下称 harness 仓库）。

> 事实核对于 2026-08-19，对应 harness 版本 0.1.0-rc.7。升级 DSH 后请按"参考文件"逐条复核。

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
   "dsh": { "client": { "platform": "web", "inject": ["@deepseek-ai/dsh-client-runtime", …] } }
   ```
   + `exports["./client"]` 指向 `./lib/client.js`
2. **扫描与服务**：`packages/client/modules`（`ClientModuleRegistry`）扫 loader 全部 entries（**out-of-tree link 的包同样命中**，`createRequire(ctx.baseUrl).resolve`），写入 `window.__DSH_BOOT__`，按 `/plugins/<id>/client.js` serve 磁盘路径
3. **client half**：`src/client/index.ts` 是浏览器端 cordis function plugin，`ctx.slots.inject('<slot>', () => ctx.slots.register({...}, ReactComponent))` 注册组件
4. **host↔client 数据**：host half 用 `ctx.webServer.register({kind:'prefix', path, handler})` 注册同源路由，client 直接 fetch（session-log-export 的下载按钮就是这个模式）；可选服务取值用 `ctx.get('webServer')`（避免硬 inject 导致无 web 的 profile 不激活）

### 真实 slot 名（harness 0.1.0-rc.7 实测枚举）

| slot | 用途 | 先例 |
|---|---|---|
| `settings.general.item` / `settings.section` | 设置页行/区 | ui-theme、ui-agent-preset |
| `conversation.session.header.utilities` / `.actions` | 会话头部按钮区 | session-log-export |
| `conversation.input.dock` | 输入区 dock 面板 | TodoPanel、QueueDock、ui-goal |
| `conversation.chat.node` | 聊天消息节点渲染 | ui-conversation、ui-goal |
| `conversation.chat.turnTail` / `assistant-actions` | 消息尾部动作 | ui-conversation |
| `conversation.view` | 会话主视图（chain） | ui-conversation |
| `conversation.details.tool` | 详情面板 tool 区 | ui-conversation |
| `sidebar` / `sidebar.workspaces.directoryFlow` | 侧栏 | ui-layout、directory-picker |
| `conversation.hero.workspace` / `.agentPreset` | 空态 hero | ConversationRoot |

### client bundle 构建契约（out-of-tree 必须复刻）

harness 的共享预设 `packages/client/tsdown.client.ts` 不对外发布，自行用 tsdown 复刻。**两处实测坑**：(a) banner 必须构造 `var module = { exports: {} }; var exports = module.exports;`（否则浏览器端 `exports is not defined`）；(b) `"type":"module"` 包内 cjs 产物默认 `.cjs` 后缀，需 `outExtensions: () => ({ js: '.js' })` 强制（registry 只认 `exports["./client"]` 指向的路径）。**HMR 限制**：out-of-tree 插件重建 bundle 后 `__DSH_BOOT__` rev 不变（`rebuilt()` 只被 harness 仓库 `dev:web` watcher 触发）——插件更新需重启 dsh web。

- `format: 'cjs'`，`platform: 'browser'`，entry `src/client/index.ts` → 产物 `lib/client.js`
- **banner**：`window.__ModuleLoader__.load({ id: <JSON包名>, factory: (require) => {`
- **footer**：`return module.exports; } });`
- **externals**（由冻结模块表提供，不打包）：`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-web-react`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-attachment`、`@deepseek-ai/dsh-client-schema-form`、`@deepseek-ai/dsh-client-runtime/client`；**其余依赖全部 inline**
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
| slot 注入先例 | `packages/client/ui-theme/src/client/index.ts:406`、`packages/session-query/session-log-export/src/client/index.ts` |
| client 构建预设（契约蓝本） | `packages/client/tsdown.client.ts`、`packages/client/web/src/platform.ts`、`packages/client/web/src/seed.ts` |
| 动态插件运行器（进阶） | `packages/extensions/cordis-client-runner/` |
| base bundle（默认插件清单） | `packages/bundle/base/cordis.patch.yml` |
| web bundle | `packages/bundle/web-app/cordis.patch.yml` |

## 7. 本仓库的范式实例

- host half（工具 + 状态机 + 数据面路由）：`src/index.ts`、`src/tools/*`、`src/session.ts`
- client half：`src/client/`（v2）
- 双面包声明：`package.json` 的 `dsh.bundle` + `dsh.client` + `exports`
- 构建脚本：`package.json` scripts（tsc 出 node half + tsdown 出 client bundle）