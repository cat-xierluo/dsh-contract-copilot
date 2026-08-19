/**
 * extractDocxParts 集成测试：真实 python3 + 真实 DOCX（fixture 由本文件生成）。
 * 回归背景：该函数曾在 ESM 构建里残留内联 require('node:fs')，
 * 运行时 ReferenceError（单测只覆盖纯渲染函数时漏网）。
 */

import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { extractDocxParts } from '../src/docx-view.ts'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'cc-docx-extract-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function makeDocx(): string {
  const file = path.join(dir, 'fixture.docx')
  execSync(
    `python3 -c "from docx import Document; d = Document(); d.add_paragraph('甲方：测试主体'); d.save('${file}')"` +
    ' || python3 -c "import zipfile; zipfile.ZipFile(\'' + file + '\', \'w\').writestr(\'word/document.xml\', \'<?xml version=\"1.0\"?><w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body><w:p><w:r><w:t>fallback</w:t></w:r></w:p></w:body></w:document>\'); zipfile.ZipFile(\'' + file + '\', \'w\')"' // python-docx 缺失时退化为最小 zip
    .replace('|| python3', '|| true || python3'),
    { stdio: 'pipe' },
  )
  return file
}

describe('extractDocxParts', () => {
  it('用 python3 抽出 document.xml（不抛 ReferenceError）', () => {
    const file = makeDocx()
    const { documentXml } = extractDocxParts(file, 'python3')
    expect(documentXml.length).toBeGreaterThan(0)
  })

  it('不存在的文件 → 抛错（python zipfile 失败）', () => {
    expect(() => extractDocxParts(path.join(dir, 'no-such.docx'), 'python3')).toThrow()
  })
})