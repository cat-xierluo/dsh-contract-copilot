/**
 * extractDocxParts 集成测试：真实 python3 + 真实 DOCX（fixture 由本文件生成）。
 * 异步化契约（DECISIONS.md Q44）：
 * - Promise API，显式接收 pythonExecutable / timeoutMs / 可选 AbortSignal；
 * - 成功路径输出的 documentXml/commentsXml 与同步版本逐字节一致；
 * - 失败可区分 aborted / timeout / nonzero-exit / output-too-large /
 *   malformed-output；超时与取消都会 SIGKILL 子进程并等待其退出；
 * - 抽取进行中事件循环仍可调度（setImmediate 可先完成）；
 * - 临时脚本在任何路径上都被清理（用进程级 TMPDIR 重定向做确定性断言）。
 */

import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DocxExtractionError, extractDocxParts } from '../src/docx-view.ts'

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

const DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W_NS}"><w:body>`
  + '<w:p><w:r><w:t>甲方：测试主体</w:t></w:r></w:p>'
  + '<w:p><w:r><w:t>第二条 付款条款</w:t></w:r></w:p>'
  + '</w:body></w:document>'

const COMMENTS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:comments xmlns:w="${W_NS}">`
  + '<w:comment w:id="0" w:author="杨卫薪｜示例律所" w:date="2026-09-05"><w:p><w:r><w:t>付款期限过短</w:t></w:r></w:p></w:comment>'
  + '</w:comments>'

const ZIP_PACK = [
  'import sys, json, zipfile',
  'path, entries = sys.argv[1], json.loads(sys.argv[2])',
  'with zipfile.ZipFile(path, "w") as z:',
  '    for name, content in entries.items():',
  '        z.writestr(name, content)',
].join('\n')

/** 用 python3 stdlib 打包确定性 DOCX（内容可逐字节断言）。 */
function writeDocxZip(filePath: string, entries: Record<string, string>): void {
  execFileSync('python3', ['-c', ZIP_PACK, filePath, JSON.stringify(entries)], { stdio: 'pipe' })
}

/** 写一个可直接执行的 fixture 解释器（shebang 脚本，忽略所有参数）。 */
function writeExecutable(filePath: string, lines: string[]): string {
  writeFileSync(filePath, `#!/bin/sh\n${lines.join('\n')}\n`, 'utf8')
  chmodSync(filePath, 0o755)
  return filePath
}

/** 挂住不退出的假 python：exec 让 sh 自我替换，SIGKILL 必然命中唯一子进程。 */
function hangingPython(dir: string): string {
  return writeExecutable(path.join(dir, 'hanging-python'), ['exec sleep 30'])
}

const realTmp = tmpdir()
let root: string

beforeEach(() => {
  root = mkdtempSync(path.join(realTmp, 'cc-docx-extract-'))
  // 抽取的临时脚本以 TMPDIR 为根；本文件独占进程，重定向后残留断言完全确定
  process.env.TMPDIR = root
})

afterEach(() => {
  const leftovers = readdirSync(root).filter((name) => name.startsWith('cc-docx-'))
  process.env.TMPDIR = realTmp
  rmSync(root, { recursive: true, force: true })
  expect(leftovers).toEqual([])
})

async function extractionError(promise: Promise<unknown>): Promise<DocxExtractionError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(DocxExtractionError)
    return error as DocxExtractionError
  }
  throw new Error('expected extraction to reject')
}

describe('extractDocxParts', () => {
  // 慢盘环境下真实 python3 spawn 可能接近 vitest 默认 5s 测试超时；
  // 真实子进程用例统一放宽到 30s（上限断言，不是 sleep 依赖）。
  const REAL_PYTHON_TIMEOUT = 30_000

  it('成功路径：documentXml 与 commentsXml 与同步版本输出逐字节一致', async () => {
    const file = path.join(root, 'fixture.docx')
    writeDocxZip(file, { 'word/document.xml': DOCUMENT_XML, 'word/comments.xml': COMMENTS_XML })

    // document.xml 尾部的 \n 是 ===DOC===/===COM=== 线路格式的固定组成
    //（旧同步实现同样保留），逐字节回归锁定该输出契约。
    await expect(extractDocxParts(file, 'python3', 30_000)).resolves.toEqual({
      documentXml: `${DOCUMENT_XML}\n`,
      commentsXml: COMMENTS_XML,
    })
  }, REAL_PYTHON_TIMEOUT)

  it('缺 comments.xml 时走 safe() 空串路径，documentXml 不变', async () => {
    const file = path.join(root, 'no-comments.docx')
    writeDocxZip(file, { 'word/document.xml': DOCUMENT_XML })

    await expect(extractDocxParts(file, 'python3', 30_000)).resolves.toEqual({
      documentXml: `${DOCUMENT_XML}\n`,
      commentsXml: '',
    })
  }, REAL_PYTHON_TIMEOUT)

  it('timeoutMs 非法时 fail loud（正整数毫秒）', async () => {
    const file = path.join(root, 'fixture.docx')
    writeDocxZip(file, { 'word/document.xml': DOCUMENT_XML })

    await expect(extractDocxParts(file, 'python3', 0)).rejects.toThrow(/timeoutMs/)
    await expect(extractDocxParts(file, 'python3', 1.5)).rejects.toThrow(/timeoutMs/)
    await expect(extractDocxParts(file, 'python3', Number.NaN)).rejects.toThrow(/timeoutMs/)
  }, REAL_PYTHON_TIMEOUT)

  it('不存在的 DOCX → nonzero-exit，消息带退码与 stderr 尾部', async () => {
    const error = await extractionError(extractDocxParts(path.join(root, 'no-such.docx'), 'python3', 30_000))
    expect(error.kind).toBe('nonzero-exit')
    expect(error.message).toContain('exit 1')
    expect(error.exitCode).toBe(1)
    // stderr 尾部保留 200 字符，足以辨认 python 异常类型
    expect(error.message).toContain('Traceback')
  }, REAL_PYTHON_TIMEOUT)

  it('stdout 无 ===DOC===/===COM=== 标记且 exit 0 → malformed-output', async () => {
    const garbage = writeExecutable(path.join(root, 'garbage-python'), [
      'exec python3 -c "import sys; sys.stdout.write(\'no markers here\')"',
    ])

    const error = await extractionError(extractDocxParts(path.join(root, 'any.docx'), garbage, 30_000))
    expect(error.kind).toBe('malformed-output')
  }, REAL_PYTHON_TIMEOUT)

  it('stdout 超过 32 MiB 上限 → output-too-large，子进程被终止', async () => {
    const noisy = writeExecutable(path.join(root, 'noisy-python'), [
      'exec python3 -c "import sys; sys.stdout.write(\'a\' * (33 * 1024 * 1024))"',
    ])

    const error = await extractionError(extractDocxParts(path.join(root, 'any.docx'), noisy, 30_000))
    expect(error.kind).toBe('output-too-large')
  }, REAL_PYTHON_TIMEOUT)

  it('超时 → timeout，子进程被 SIGKILL 且等待其退出后才 reject', async () => {
    const slow = hangingPython(root)

    const error = await extractionError(extractDocxParts(path.join(root, 'any.docx'), slow, 200))
    expect(error.kind).toBe('timeout')
    // close 事件的 kill signal：证明子进程是被终止而非自然退出
    expect(error.exitSignal).toBe('SIGKILL')
  })

  it('AbortSignal 取消 → aborted，子进程被 SIGKILL', async () => {
    const slow = hangingPython(root)
    const controller = new AbortController()

    const pending = extractDocxParts(path.join(root, 'any.docx'), slow, 30_000, controller.signal)
    controller.abort()

    const error = await extractionError(pending)
    expect(error.kind).toBe('aborted')
    expect(error.exitSignal).toBe('SIGKILL')
  })

  it('已提前中止的 signal → 直接以 aborted 拒绝', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(extractDocxParts(path.join(root, 'any.docx'), 'python3', 30_000, controller.signal))
      .rejects.toMatchObject({ kind: 'aborted' })
  })

  it('抽取进行中事件循环仍可调度（setImmediate 先于抽取完成）', async () => {
    const slow = hangingPython(root)
    const controller = new AbortController()
    const pending = extractDocxParts(path.join(root, 'any.docx'), slow, 30_000, controller.signal)

    // 若回归为同步 spawn，这一行所在的 tick 会被冻结，测试将以超时失败
    await new Promise((resolve) => setImmediate(resolve))
    let loopRan = false
    setImmediate(() => { loopRan = true })
    controller.abort()

    await extractionError(pending)
    expect(loopRan).toBe(true)
  })
})
