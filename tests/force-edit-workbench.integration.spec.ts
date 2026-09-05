/**
 * CC-V5-003 force_edit 修订产物可重复验收：真实 Python CLI + 工作台 document RPC。
 *
 * 验收链路（TASKS.md CC-V5-003）：
 *   脱敏合成 DOCX + force_edit:true plan
 *   → runApplyCli 调真实 apply_review_plan.py（当前配置）
 *   → 修订 DOCX 的 word/document.xml 同时含 w:ins 与 w:del
 *   → handleWorkbenchRpc('document')（生产入口，走 session.outputs.reviewedDocx
 *     → extractDocxParts → renderDocumentWithAnchors）的 HTML 同时含 cc-ins 与 cc-del。
 *
 * 依赖缺失时整组具名 skip（缺什么打印什么），核心断言绝不假绿：
 * CLI 能跑但断言不满足 = 测试失败，与 skip 不同。
 */

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { decodeEntities, extractDocxParts } from '../src/docx-view.ts'
import { handleWorkbenchRpc } from '../src/host-api.ts'
import { runApplyCli } from '../src/python-bridge.ts'
import type { BridgeResult } from '../src/python-bridge.ts'
import type { PluginConfig } from '../src/config.ts'
import { SessionStore } from '../src/session.ts'
import type { ContractSession } from '../src/session-types.ts'
import type { DocumentView } from '../src/workbench-protocol.ts'
import {
  CONTRACT_NAME,
  FORCE_EDIT_SKILL_ROOT,
  INSERTED_DIFF_SNIPPET,
  TARGET_TEXT,
  buildForceEditPlan,
  probeForceEditDeps,
  writeSyntheticContractDocx,
} from './force-edit-fixture.ts'

const deps = probeForceEditDeps()
if (deps.missing.length > 0) {
  // 具名 skip 原因：vitest 报告显示 skipped，原因在 stdout 可检索。
  console.warn(`[force-edit-acceptance] SKIP：真实 CLI 链路依赖缺失 → ${deps.missing.join('；')}`)
}

describe.skipIf(deps.missing.length > 0)('force_edit 修订产物验收（真实 CLI + document RPC）', () => {
  let dir: string
  let sourceDocx: string
  let planPath: string
  let result: BridgeResult
  let revisedDocx: string
  let store: SessionStore
  let config: PluginConfig
  let session: ContractSession
  let view: DocumentView

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'cc-force-edit-'))
    const configDir = path.join(dir, 'config')
    mkdirSync(configDir, { recursive: true })

    sourceDocx = writeSyntheticContractDocx(dir)
    planPath = path.join(dir, 'review-plan.json')
    writeFileSync(planPath, `${JSON.stringify(buildForceEditPlan(), null, 2)}\n`, 'utf8')

    const outputDocx = path.join(dir, 'output', `${CONTRACT_NAME}_reviewed.docx`)
    mkdirSync(path.dirname(outputDocx), { recursive: true })
    const reportDocx = path.join(dir, 'output', `${CONTRACT_NAME}_审查报告.docx`)

    return runApplyCli({
      skillRoot: FORCE_EDIT_SKILL_ROOT,
      pythonExecutable: 'python3',
      inputDocx: sourceDocx,
      planPath,
      outputDocx,
      reportDocx,
      clientName: '测试甲公司',
      partyRole: '甲方',
      reviewIntensity: '常规',
      editPolicy: 'revise-first',
      author: '验收测试律师',
      organization: '合成验收律所',
      archiveDir: path.join(dir, 'archive'),
      environment: { CONTRACT_COPILOT_CONFIG_DIR: configDir },
    }).then((cliResult) => {
      result = cliResult
      revisedDocx = cliResult.parsed.reviewedDocx ?? outputDocx

      // 工作台生产路径：apply 成功后 session.outputs.reviewedDocx 指向修订 DOCX
      //（与 src/tools/apply.ts 的 applied 迁移写法一致），document RPC 投影 HTML。
      store = new SessionStore(path.join(dir, 'sessions'))
      config = {
        skillRoot: FORCE_EDIT_SKILL_ROOT,
        pythonExecutable: 'python3',
        sessionsDir: path.join(dir, 'sessions'),
        injectProgress: true,
        workbench: { enabled: true },
      }
      session = store.create(sourceDocx, CONTRACT_NAME)
      store.transition(session.id, 'contract_copilot_apply', 'applied', (target) => {
        target.outputs = {
          reviewedDocx: cliResult.parsed.reviewedDocx ?? outputDocx,
          reportDocx: cliResult.parsed.reportDocx ?? reportDocx,
          archiveDir: cliResult.parsed.archiveDir,
          stats: cliResult.parsed.stats,
        }
      })
      return handleWorkbenchRpc(config, store, 'document', { sessionId: session.id }).then((rpc) => {
        if (!rpc.ok) throw new Error(`document RPC 失败: ${JSON.stringify(rpc.error)}`)
        view = rpc.value as unknown as DocumentView
      })
    })
  }, 180_000)

  afterAll(() => {
    // 临时目录与子进程由本测试全权清理：runApplyCli 的子进程已 await close，
    // extractDocxParts 的临时脚本自清理，这里只负责目录。
    rmSync(dir, { recursive: true, force: true })
  })

  it('真实 CLI success：exit 0 且 force_edit finding 落为 applied', () => {
    expect(result.kind).toBe('success')
    expect(result.exitCode).toBe(0)
    expect(result.parsed.stats).toEqual({ applied: 1, failed: 0, skipped: 0, reportOnly: 0 })
    expect(result.parsed.reviewedDocx).toBeTruthy()
    expect(result.parsed.reportDocx).toBeTruthy()
  })

  it('修订 DOCX 的 word/document.xml 同时含 w:ins 与 w:del', () => {
    const { documentXml } = extractDocxParts(revisedDocx, 'python3')
    expect(documentXml).toContain('<w:ins ')
    expect(documentXml).toContain('<w:del ')
  })

  it('document RPC HTML 同时含 cc-ins 与 cc-del，且插入实质内容可见', () => {
    expect(view.label).toBe('审核修订版 DOCX')
    expect(view.html).toContain('class="cc-ins"')
    expect(view.html).toContain('class="cc-del"')
    // 两个标记都携带非空差异文本（空壳标签不算可见修订）
    expect(view.html).toMatch(/<ins class="cc-ins">[^<]+<\/ins>/)
    expect(view.html).toMatch(/<del class="cc-del">[^<]+<\/del>/)
    // CLI 落的是最小差异修订（只标删差异词），新增实质内容以片段形式在场
    //（对齐设计稿 §7 e2e 口径："合并 w:t 后验证替换文本完整在场"）。
    const visibleText = decodeEntities(view.html.replace(/<[^>]+>/g, ''))
    expect(visibleText).toContain(INSERTED_DIFF_SNIPPET)
    // 原句合并后不再整句在场（差异词被标删）
    expect(visibleText).not.toContain(TARGET_TEXT)
    // 原合同源文件本身无修订标记：防止把"渲染了源文件"误当通过
    const sourceParts = extractDocxParts(sourceDocx, 'python3')
    expect(sourceParts.documentXml).not.toContain('<w:ins')
  })

  it('document RPC 数据可无损过 JSON（浏览器传输路径）', () => {
    expect(JSON.parse(JSON.stringify(view.comments))).toEqual(view.comments)
  })

  it('sanity：合成 fixture 确实可被 python3 抽取（防 fixture 自身损坏）', () => {
    // target_text 必须真实存在于源 DOCX，否则 w:ins/w:del 断言无意义
    const { documentXml } = extractDocxParts(sourceDocx, 'python3')
    expect(documentXml).toContain(TARGET_TEXT)
  })

  it('独立验收脚本端到端 exit 0（scripts/acceptance/force-edit-acceptance.mjs）', { timeout: 120_000 }, () => {
    // 让 vitest 进程代跑脚本（相同 node），覆盖其独立 CLI spawn 与断言链路；
    // 脚本内部依赖 src/lib 渲染入口退化顺序，BLOCKED(2)/FAIL(1) 都不允许假绿。
    const scriptPath = path.resolve(import.meta.dirname, '../scripts/acceptance/force-edit-acceptance.mjs')
    const run = spawnSync(process.execPath, [scriptPath], { encoding: 'utf-8', timeout: 110_000 })
    expect(run.error ?? null).toBeNull()
    expect(run.status, `stdout: ${run.stdout}\nstderr: ${run.stderr}`).toBe(0)
    expect(run.stdout).toContain('[force-edit-acceptance] PASS')
  })
})
