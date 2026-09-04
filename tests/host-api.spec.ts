/** Host workbench tests: validation, persistence, routes, SSE, and downloads. */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PluginConfig } from '../src/config.ts'
import type { ContractAgentCoordinator } from '../src/agent-coordinator.ts'
import { AgentCoordinatorError } from '../src/agent-coordinator.ts'
import { beginPlanReview } from '../src/plan-review.ts'
import {
  handleWorkbenchRpc,
  registerHostApi,
  workbenchDownloadResponse,
  workbenchEventsResponse,
} from '../src/host-api.ts'
import { SessionStore } from '../src/session.ts'
import type { DocumentView } from '../src/workbench-protocol.ts'
import { WORKBENCH_DOWNLOAD_PATH, WORKBENCH_EVENTS_PATH, WORKBENCH_RPC_CHANNEL } from '../src/workbench-protocol.ts'

let root: string
let store: SessionStore
let config: PluginConfig

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'cc-workbench-'))
  store = new SessionStore(path.join(root, 'sessions'))
  config = {
    skillRoot: path.join(root, 'skill'),
    pythonExecutable: 'python3',
    sessionsDir: path.join(root, 'sessions'),
    injectProgress: true,
    workbench: { enabled: true },
  }
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const COMMENTED_DOCUMENT_XML = '<?xml version="1.0"?>'
  + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
  + '<w:p><w:r><w:t>付款条款：</w:t></w:r>'
  + '<w:commentRangeStart w:id="0"/><w:r><w:t>三十日内</w:t></w:r><w:commentRangeEnd w:id="0"/>'
  + '<w:r><w:commentReference w:id="0"/></w:r></w:p>'
  + '<w:p><w:r><w:t>其他正文</w:t></w:r></w:p>'
  + '</w:body></w:document>'

const COMMENTED_COMMENTS_XML = '<?xml version="1.0"?>'
  + '<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
  + '<w:comment w:id="0" w:author="杨卫薪｜示例律所" w:date="2026-09-04"><w:p><w:t>付款期限过短</w:t></w:p></w:comment>'
  + '<w:comment w:id="9" w:author="杨卫薪｜示例律所" w:date="2026-09-04"><w:p><w:t>孤儿批注</w:t></w:p></w:comment>'
  + '</w:comments>'

/** 用 python3 zipfile 造一个带批注范围与孤儿批注的最小 DOCX。 */
function writeCommentedDocx(filePath: string): void {
  const script = [
    'import sys, zipfile',
    "z = zipfile.ZipFile(sys.argv[1], 'w')",
    "z.writestr('word/document.xml', sys.argv[2])",
    "z.writestr('word/comments.xml', sys.argv[3])",
    'z.close()',
  ].join('\n')
  const result = spawnSync('python3', ['-c', script, filePath, COMMENTED_DOCUMENT_XML, COMMENTED_COMMENTS_XML], { encoding: 'utf-8' })
  if (result.status !== 0) throw new Error(`fixture 生成失败: ${result.stderr}`)
}

describe('handleWorkbenchRpc', () => {
  it('新建审查只接受存在的 DOCX，并返回前置信息表单', async () => {
    const contract = path.join(root, '采购合同.docx')
    writeFileSync(contract, 'fixture')

    const result = await handleWorkbenchRpc(config, store, 'start', { contractPath: contract })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({ contractName: '采购合同' })
    expect((result.value as { missing: unknown[] }).missing.length).toBeGreaterThan(0)
    expect(store.listRecent()).toHaveLength(1)
  })

  it('拒绝非 DOCX 与畸形 session id', async () => {
    const text = path.join(root, 'contract.txt')
    writeFileSync(text, 'fixture')

    await expect(handleWorkbenchRpc(config, store, 'start', { contractPath: text }))
      .resolves.toMatchObject({ ok: false, error: { code: 'contract-copilot/bad-request' } })
    await expect(handleWorkbenchRpc(config, store, 'detail', { sessionId: '../escape' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'contract-copilot/bad-request' } })
  })

  it('确认答案写回对应 session', async () => {
    const session = store.create(path.join(root, 'contract.docx'), 'contract')

    await expect(handleWorkbenchRpc(config, store, 'answers', {
      sessionId: session.id,
      fields: { partyRole: '甲方' },
    })).resolves.toEqual({ ok: true, value: { ok: true } })
    expect(store.get(session.id)?.pendingAnswers).toEqual({ partyRole: '甲方' })
  })

  it('逐项批准计划并返回稳定的领域错误码', async () => {
    const session = store.create(path.join(root, 'contract.docx'), 'contract')
    const planPath = path.join(root, 'review-plan.json')
    writeFileSync(planPath, `${JSON.stringify({ findings: [{ id: 'R001', risk: '付款风险', action: 'auto' }] })}\n`)
    session.planPath = planPath
    session.planReview = beginPlanReview(planPath, undefined)
    store.save(session)

    await expect(handleWorkbenchRpc(config, store, 'approve', {
      sessionId: session.id,
      sourcePlanHash: session.planReview.sourcePlanHash,
      decisions: [],
    })).resolves.toMatchObject({
      ok: false,
      error: { code: 'contract-copilot/incomplete-decisions' },
    })

    const approved = await handleWorkbenchRpc(config, store, 'approve', {
      sessionId: session.id,
      sourcePlanHash: session.planReview.sourcePlanHash,
      decisions: [{ findingId: 'R001', disposition: 'accept' }],
    })
    expect(approved).toMatchObject({ ok: true, value: { ok: true, approvedFindings: 1, omittedFindings: 0 } })
    expect(store.get(session.id)?.planReview?.status).toBe('approved')
  })

  it('通过工作台命令启动专属 Agent 并保留控制器错误码', async () => {
    const session = store.create(path.join(root, 'contract.docx'), 'contract')
    store.transition(session.id, 'contract_copilot_intake', 'intake_done')
    const runAnalysis = vi.fn(async () => ({ accepted: true as const, dshSessionId: 'agent-1', phase: 'analysis' as const }))
    const coordinator = { runAnalysis } as unknown as ContractAgentCoordinator

    await expect(handleWorkbenchRpc(config, store, 'run-analysis', { sessionId: session.id }, coordinator))
      .resolves.toMatchObject({ ok: true, value: { accepted: true, phase: 'analysis' } })
    expect(runAnalysis).toHaveBeenCalledWith(session.id)

    const busy = {
      runAnalysis: vi.fn(async () => {
        throw new AgentCoordinatorError('contract-copilot/agent-busy', 'busy')
      }),
    } as unknown as ContractAgentCoordinator
    await expect(handleWorkbenchRpc(config, store, 'run-analysis', { sessionId: session.id }, busy))
      .resolves.toMatchObject({ ok: false, error: { code: 'contract-copilot/agent-busy' } })
  })

  it('document RPC 返回稳定锚点批注、正文标记与可解释降级', async () => {
    const contract = path.join(root, '审阅合同.docx')
    writeCommentedDocx(contract)
    const session = store.create(contract, '审阅合同')

    const result = await handleWorkbenchRpc(config, store, 'document', { sessionId: session.id })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const view = result.value as unknown as DocumentView
    expect(view.label).toBe('原合同')
    expect(view.comments).toHaveLength(2)

    const anchored = view.comments[0]
    expect(anchored).toMatchObject({ id: '0', author: '杨卫薪｜示例律所', text: '付款期限过短' })
    expect(anchored.anchorId).toMatch(/^ccm-[0-9a-f]{16}$/)
    expect(anchored.anchor).toEqual({ status: 'exact', paragraphIndex: 0, quote: '三十日内' })
    expect(view.html).toContain(`<span class="cc-comment-anchor" data-cc-anchor="${anchored.anchorId}">三十日内</span>`)
    expect(view.html).toContain(`data-cc-anchor="${anchored.anchorId}"`)

    const orphan = view.comments[1]
    expect(orphan.anchor).toEqual({ status: 'fallback', reason: 'orphan-comment' })
    expect(orphan.anchorId).not.toBe(anchored.anchorId)
    expect(view.html).not.toContain(`data-cc-anchor="${orphan.anchorId}"`)

    // 协议数据必须无损过 JSON（浏览器 RPC 传输路径）
    expect(JSON.parse(JSON.stringify(view.comments))).toEqual(view.comments)
  })
})

describe('Connection registration', () => {
  it('注册一个鉴权 RPC channel 和两个 /api 精确 Fetch 路由', () => {
    const handle = vi.fn(() => async () => {})
    const register = vi.fn(() => async () => {})
    const ctx = {
      inject: (_services: readonly string[], callback: (child: unknown) => void) => {
        callback({ connection: { rpc: { handle }, fetch: { register } } })
      },
    } as unknown as Context

    registerHostApi(ctx, config, store, {} as ContractAgentCoordinator)

    expect(handle).toHaveBeenCalledWith(WORKBENCH_RPC_CHANNEL, expect.any(Function))
    expect(register).toHaveBeenCalledTimes(2)
    expect(register.mock.calls.map(([route]) => route.path)).toEqual([
      WORKBENCH_EVENTS_PATH,
      WORKBENCH_DOWNLOAD_PATH,
    ])
  })

  it('workbench.enabled=false 时不等待 Connection', () => {
    const inject = vi.fn()
    registerHostApi({ inject } as unknown as Context, { ...config, workbench: { enabled: false } }, store)
    expect(inject).not.toHaveBeenCalled()
  })
})

describe('authenticated Fetch handlers', () => {
  it('SSE 连接首先发送完整 session 快照并可取消', async () => {
    store.create(path.join(root, 'contract.docx'), 'contract')
    const response = workbenchEventsResponse(new Request(`http://dsh.test${WORKBENCH_EVENTS_PATH}`), store)
    const reader = response.body?.getReader()

    const first = await reader?.read()
    expect(new TextDecoder().decode(first?.value)).toContain('event: snapshot')
    expect(new TextDecoder().decode(first?.value)).toContain('contract')
    await reader?.cancel()
  })

  it('GET 流式返回源 DOCX，HEAD 只返回头部', async () => {
    const contract = path.join(root, '合同 文件.docx')
    writeFileSync(contract, 'docx-bytes')
    const session = store.create(contract, '合同 文件')
    const url = new URL(`http://dsh.test${WORKBENCH_DOWNLOAD_PATH}`)
    url.searchParams.set('sessionId', session.id)
    url.searchParams.set('kind', 'source')

    const get = workbenchDownloadResponse(new Request(url), store)
    const head = workbenchDownloadResponse(new Request(url, { method: 'HEAD' }), store)

    expect(get.status).toBe(200)
    await expect(get.text()).resolves.toBe('docx-bytes')
    expect(get.headers.get('content-disposition')).toContain(encodeURIComponent('合同 文件.docx'))
    expect(head.status).toBe(200)
    expect(head.body).toBeNull()
  })
})
