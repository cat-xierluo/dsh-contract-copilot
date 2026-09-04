/**
 * 测试用最小 DOCX fixture：python3 zipfile 打包给定段落的 word/document.xml。
 * 只包含 extractDocxParts 需要的条目；comments.xml 缺省走 safe() 空串路径。
 */

import { execFileSync } from 'node:child_process'

const PYTHON_PACK = [
  'import sys, zipfile',
  'path, xml = sys.argv[1], sys.argv[2]',
  'with zipfile.ZipFile(path, "w") as z:',
  '    z.writestr("word/document.xml", xml)',
].join('\n')

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** 由段落文本拼出最小 document.xml（一个段落一个 <w:p>）。传 [] 即"无可见正文"。 */
export function documentXmlFor(paragraphs: string[]): string {
  const body = paragraphs
    .map((text) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`)
    .join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W_NS}"><w:body>${body}</w:body></w:document>`
}

/** 把给定段落写成真实 DOCX 文件（python3 stdlib，无第三方依赖）。 */
export function writeContractDocx(filePath: string, paragraphs: string[]): void {
  execFileSync('python3', ['-c', PYTHON_PACK, filePath, documentXmlFor(paragraphs)], { stdio: 'pipe' })
}
