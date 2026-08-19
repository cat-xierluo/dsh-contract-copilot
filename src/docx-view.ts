/**
 * 把 OOXML 渲染成可视化 HTML：合同段落 + 修订批注高亮 + 批注气泡。
 *
 * 设计取舍：plugin 已硬依赖 python3（apply_review_plan.py），所以用 python3
 * 的 zipfile 模块抽取 word/document.xml 和 word/comments.xml——避免再拉
 * JS 的 unzip/zip 依赖。抽取本身用 spawnSync（仅启动一次 cost）。
 *
 * 渲染器是纯函数（输入 XML 字符串 → 输出 HTML），便于单测；实际 DOCX
 * 抽取在 extractDocxParts 里，纯渲染逻辑分离。
 *
 * 范围限定：支持段落、w:pPr 标题样式、w:r/w:t 文本、w:ins 修订插入、
 * w:del 修订删除（用 delText）、w:commentRangeStart/End/Reference 批注、
 * comments.xml 批注正文。表格、嵌入对象、图片、域代码、复杂样式按
 * 不支持处理（线性化为段落）。
 */

import { spawnSync } from 'node:child_process'
import type { SpawnSyncReturns } from 'node:child_process'

export type DocxComment = {
  author: string
  date: string
  text: string
}

/**
 * 用 python3 zipfile 抽取 document.xml + comments.xml；stderr 抛错。
 * pythonExecutable 可通过 Config.workbench.pythonExecutable 覆盖（默认 python3）。
 *
 * 实现：把脚本写进临时文件后用 `python3 <tmpfile> <docx>` 调用——避免
 * -c 在多行结构里 `;` 分隔造成的语法坑。返回时删临时文件。
 */
export function extractDocxParts(docxPath: string, pythonExecutable: string): { documentXml: string; commentsXml: string } {
  const script = [
    'import sys, zipfile',
    'z = zipfile.ZipFile(sys.argv[1])',
    'def safe(name):',
    '    try:',
    '        return z.read(name).decode("utf-8")',
    '    except KeyError:',
    '        return ""',
    'sys.stdout.write("===DOC===\\n" + safe("word/document.xml"))',
    'sys.stdout.write("\\n===COM===\\n" + safe("word/comments.xml"))',
  ].join('\n')
  const tmpScript = `${process.env.TMPDIR ?? '/tmp'}/cc-docx-${process.pid}-${Date.now()}.py`
  require('node:fs').writeFileSync(tmpScript, script, 'utf8')
  let child: SpawnSyncReturns<string>
  try {
    child = spawnSync(pythonExecutable, [tmpScript, docxPath], {
      encoding: 'utf-8',
      maxBuffer: 32 * 1024 * 1024,
    })
  } finally {
    try { require('node:fs').unlinkSync(tmpScript) } catch { /* 清理失败不影响 */ }
  }
  if (child.status !== 0) {
    throw new Error(`contract-copilot workbench: python 抽取 DOCX 失败（exit ${child.status ?? 'null'}）: ${child.stderr?.slice(0, 200) ?? ''}`)
  }
  const out = child.stdout
  const docIdx = out.indexOf('===DOC===')
  const comIdx = out.indexOf('===COM===')
  if (docIdx < 0 || comIdx < 0) {
    throw new Error('contract-copilot workbench: DOCX 抽取输出格式异常')
  }
  return {
    documentXml: out.slice(docIdx + '===DOC==='.length, comIdx).replace(/^\n/, ''),
    commentsXml: out.slice(comIdx + '===COM==='.length).replace(/^\n/, ''),
  }
}

/** XML 实体解码：数值（&#NNN; /&#xNNNN;）+ 5 个命名实体。 */
export function decodeEntities(xml: string): string {
  return xml
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/**
 * 解析 word/comments.xml → id → {author, date, text}。
 * 批注正文是多段（多个 <w:p>），合并所有 <w:t> 文本。
 */
export function parseCommentsXml(xml: string): Map<string, DocxComment> {
  const map = new Map<string, DocxComment>()
  if (xml === '') return map
  const blockRe = /<w:comment\s+([^>]*?)>([\s\S]*?)<\/w:comment>/g
  const idAttr = /\bw:id="([^"]+)"/
  const authorAttr = /\bw:author="([^"]+)"/
  const dateAttr = /\bw:date="([^"]+)"/
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(xml)) !== null) {
    const attrs = m[1] ?? ''
    const body = m[2] ?? ''
    const id = idAttr.exec(attrs)?.[1]
    if (id === undefined) continue
    const author = authorAttr.exec(attrs)?.[1] ?? '?'
    const date = dateAttr.exec(attrs)?.[1] ?? ''
    const text = decodeEntities((body.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? []).join('')).replace(/<w:t[^>]*>|<\/w:t>/g, '')
    // 上面的 replace 是冗余保险（match 已剥），但保留对 XML 嵌套鲁棒
    map.set(id, { author, date, text })
  }
  return map
}

/** 段落级 HTML 转义（保留文本，但禁用 HTML）。 */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * 把 word/document.xml 渲染成 HTML。
 *
 * 状态机走一遍：按 <w:p> 切段，每段内：
 *   - 提取 pStyle（标题级别 1-2 单独呈现）
 *   - 收集 run 文本：w:r 内的 w:t 是普通文本、w:delText 是已删除文本
 *     （保留可视化，但用 <del> 包裹）；w:ins 内嵌 run 同理（<ins> 包裹）
 *   - commentRangeStart/End 维护当前未结束的批注范围，commentReference 输出气泡
 *
 * 异常段落（缺少闭合）→ 落回纯文本提取，不抛错。
 */
export function renderDocumentHtml(documentXml: string, comments: Map<string, DocxComment>): string {
  const paragraphs: string[] = []
  // 按 </w:p> 切（非贪婪到下一个 <w:p 起始或文档结束）。简单起见用 split
  const paraBlocks = documentXml.split(/(?=<w:p(?:\s|>|\/>))/).filter((block) => block.includes('<w:p') && block.includes('</w:p>') || block.includes('<w:p/>'))

  for (const block of paraBlocks) {
    if (block.trim() === '' || block === '<w:p/>') continue
    const closingIdx = block.indexOf('</w:p>')
    if (closingIdx < 0) {
      // 自闭合或异常段落，跳过
      continue
    }
    const inner = block.slice(0, closingIdx)
    paragraphs.push(renderParagraph(inner, comments))
  }
  return paragraphs.join('')

  function renderParagraph(inner: string, commentsMap: Map<string, DocxComment>): string {
    const pStyleMatch = /<w:pStyle\s+w:val="(Heading\d|Title)"\s*\/>/.exec(inner)
    const isHeading2 = pStyleMatch?.[1] === 'Heading2'
    const isHeading1 = pStyleMatch?.[1] === 'Heading1'
    const isTitle = pStyleMatch?.[1] === 'Title'

    let html = ''
    const openComments: string[] = []
    // 按重要标签位置顺序遍历（不嵌套，w:ins/w:del 内嵌 w:r）
    // 用统一的 token 流：每段在 inner 内按出现顺序扫一遍
    let pos = 0
    while (pos < inner.length) {
      // 找下一个重要标签
      const rest = inner.slice(pos)
      const next = /<\/?w:(ins|del|commentRangeStart|commentRangeEnd|commentReference|r)\b/.exec(rest)
      if (next === null) {
        // 文本尾部（含 w:t 等）
        const trailingText = extractAllText(rest)
        if (trailingText !== '') html += escapeHtml(decodeEntities(trailingText))
        break
      }
      const beforeText = rest.slice(0, next.index)
      if (beforeText !== '') {
        html += escapeHtml(decodeEntities(extractAllText(beforeText)))
      }
      const tagName = next[1] // ins/del/commentRangeStart/.../r
      const isClose = next[0].startsWith('</')
      // 自闭合结束位置
      if (tagName === 'commentRangeStart') {
        const id = /w:id="([^"]+)"/.exec(next[0])?.[1]
        if (id !== undefined) openComments.push(id)
        pos += next.index + next[0].length
        continue
      }
      if (tagName === 'commentRangeEnd') {
        const id = /w:id="([^"]+)"/.exec(next[0])?.[1]
        if (id !== undefined) {
          const idx = openComments.lastIndexOf(id)
          if (idx >= 0) openComments.splice(idx, 1)
        }
        pos += next.index + next[0].length
        continue
      }
      if (tagName === 'commentReference') {
        const id = /w:id="([^"]+)"/.exec(next[0])?.[1]
        if (id !== undefined) {
          const c = commentsMap.get(id)
          if (c !== undefined) {
            const label = escapeHtml(`${c.author.split('｜')[0] ?? c.author}：${c.text}`)
            html += `<sup class="cc-comment" title="${label}">💬</sup>`
          }
        }
        pos += next.index + next[0].length
        continue
      }
      if (tagName === 'ins' || tagName === 'del') {
        // 包裹一段 run 块：找匹配的闭合标签
        const closeTag = `</w:${tagName}>`
        const closeIdx = inner.indexOf(closeTag, pos + next.index + next[0].length)
        if (closeIdx < 0) break
        const runText = extractAllText(inner.slice(pos + next.index + next[0].length, closeIdx))
        const cls = tagName === 'ins' ? 'cc-ins' : 'cc-del'
        const tag = tagName === 'ins' ? 'ins' : 'del'
        html += `<${tag} class="${cls}">${escapeHtml(decodeEntities(runText))}</${tag}>`
        pos = closeIdx + closeTag.length
        continue
      }
      if (tagName === 'r' && !isClose) {
        // 单个 <w:r> ... </w:r>：里面可能有 <w:t>（输出文本）、
        // <w:commentReference>（输出气泡）等子标签
        const closeTag = '</w:r>'
        const closeIdx = inner.indexOf(closeTag, pos + next.index + next[0].length)
        if (closeIdx < 0) break
        const runBody = inner.slice(pos + next.index + next[0].length, closeIdx)
        html += renderRunBody(runBody, commentsMap)
        pos = closeIdx + closeTag.length
        continue
      }
      // 跳过其他开始/结束标签
      pos += next.index + next[0].length
    }
    void openComments
    if (html === '') return ''
    if (isHeading1 || isTitle) return `<h1>${html}</h1>`
    if (isHeading2) return `<h2>${html}</h2>`
    return `<p>${html}</p>`
  }
}

/** 从 inner 提取所有 <w:t>/<w:delText> 文本（拼接；处理自闭合）。 */
function extractAllText(inner: string): string {
  let text = ''
  const re = /<(w:t|w:delText)(?:\s[^>]*)?>([^<]*)<\/\1>|<(w:t|w:delText)\s*\/>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(inner)) !== null) {
    text += m[2] ?? ''
  }
  return text
}

/** 渲染 <w:r> 内的内容：w:t → 文本、w:commentReference → 气泡、w:tab → 缩进。 */
function renderRunBody(body: string, comments: Map<string, DocxComment>): string {
  let out = ''
  let pos = 0
  while (pos < body.length) {
    const rest = body.slice(pos)
    const m = /<w:(t|tab|commentReference|br)(?:\s[^>]*)?(\/?)>?/.exec(rest)
    if (m === null) {
      // 剩余里可能是 w:t 文本（未带属性）
      const tail = extractAllText(rest)
      if (tail !== '') out += escapeHtml(decodeEntities(tail))
      break
    }
    const tag = m[1]
    const tagEnd = pos + m.index + m[0].length
    if (tag === 't') {
      const close = body.indexOf('</w:t>', tagEnd)
      if (close < 0) break
      out += escapeHtml(decodeEntities(body.slice(tagEnd, close)))
      pos = close + '</w:t>'.length
      continue
    }
    if (tag === 'commentReference') {
      const id = /\bw:id="([^"]+)"/.exec(m[0])?.[1]
      if (id !== undefined) {
        const c = comments.get(id)
        if (c !== undefined) {
          const label = escapeHtml(`${c.author.split('｜')[0] ?? c.author}：${c.text}`)
          out += `<sup class="cc-comment" title="${label}">💬</sup>`
        }
      }
      pos = tagEnd
      continue
    }
    if (tag === 'tab') {
      out += '&nbsp;&nbsp;&nbsp;&nbsp;'
      pos = tagEnd
      continue
    }
    if (tag === 'br') {
      out += '<br/>'
      pos = tagEnd
      continue
    }
    pos = tagEnd
  }
  return out
}