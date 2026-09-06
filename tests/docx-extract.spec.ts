/**
 * extractDocxParts 集成测试：真实 python3 + 真实 DOCX（fixture 复用 docx-fixture）。
 * 回归背景：该函数曾在 ESM 构建里残留内联 require('node:fs')，
 * 运行时 ReferenceError（单测只覆盖纯渲染函数时漏网）。
 *
 * 隔离契约（TASK-2026-09-06-orca-gov-02）：抽取的临时脚本以 TMPDIR 为根，
 * 本文件在 beforeEach 把进程级 TMPDIR 重定向进独占 mkdtemp 目录——残留
 * 断言因此完全确定，且不受历史运行（进程被杀后来不及清理）留在系统临时
 * 目录的陈旧 cc-docx-* 条目影响；afterEach 先还原环境再做零残留断言。
 * fixture 生成不再依赖 python-docx（旧 makeDocx 的 `|| true ||` 回退分支
 * 实际永远不会执行，python-docx 缺失时会静默产出缺失文件）。
 */

import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { extractDocxParts } from '../src/docx-view.ts'
import { writeContractDocx } from './docx-fixture.ts'

const realTmp = tmpdir()
let dir: string

beforeEach(() => {
  dir = mkdtempSync(path.join(realTmp, 'cc-docx-extract-'))
  process.env.TMPDIR = dir
})

afterEach(() => {
  const leftovers = readdirSync(dir).filter((name) => name.startsWith('cc-docx-'))
  process.env.TMPDIR = realTmp
  rmSync(dir, { recursive: true, force: true })
  expect(leftovers).toEqual([])
})

describe('extractDocxParts', () => {
  // 真实 python3 spawn 在高负载（后台优先级）下可能远超 vitest 默认 5s
  // 测试超时——真实子进程用例统一 30s 上限（与 CC-V5-004 R4 的
  // REAL_PYTHON_TIMEOUT 约定对齐；上限断言，不是 sleep 依赖）。
  it('用 python3 抽出 document.xml（不抛 ReferenceError）', () => {
    const file = path.join(dir, 'fixture.docx')
    writeContractDocx(file, ['甲方：测试主体'])
    const { documentXml } = extractDocxParts(file, 'python3')
    expect(documentXml.length).toBeGreaterThan(0)
  }, 30_000)

  it('不存在的文件 → 抛错（python zipfile 失败）', () => {
    expect(() => extractDocxParts(path.join(dir, 'no-such.docx'), 'python3')).toThrow()
  }, 30_000)
})
