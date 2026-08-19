/**
 * docx-view 单测：decodeEntities / parseCommentsXml / renderDocumentHtml。
 * 用合成 XML 串覆盖 ins/del/comment/heading/pStyle 路径。
 */

import { describe, expect, it } from 'vitest'
import { decodeEntities, parseCommentsXml, renderDocumentHtml } from '../src/docx-view.ts'

describe('decodeEntities', () => {
  it('数字字符引用 + 5 个命名实体', () => {
    expect(decodeEntities('&#30002;&#26041; &amp; &lt;ok&gt; &#x0041;')).toBe('甲方 & <ok> A')
  })

  it('&amp; 必须最后解码（防止双重解码）', () => {
    expect(decodeEntities('a &amp; b &amp; c')).toBe('a & b & c')
  })
})

describe('parseCommentsXml', () => {
  it('解析 author/date/text', () => {
    const xml = `<w:comment w:id="0" w:author="杨卫薪｜示例律所" w:date="2026-08-19">
      <w:p><w:t>建议改成分期</w:t></w:p>
    </w:comment>`
    const map = parseCommentsXml(xml)
    expect(map.get('0')).toEqual({ author: '杨卫薪｜示例律所', date: '2026-08-19', text: '建议改成分期' })
  })

  it('多个段落合并文本', () => {
    const xml = `<w:comment w:id="1" w:author="A">
      <w:p><w:t>第一段</w:t></w:p>
      <w:p><w:t>第二段</w:t></w:p>
    </w:comment>`
    expect(parseCommentsXml(xml).get('1')?.text).toBe('第一段第二段')
  })

  it('空文档返回空 map', () => {
    expect(parseCommentsXml('').size).toBe(0)
  })
})

describe('renderDocumentHtml', () => {
  it('基本段落渲染', () => {
    const xml = `<w:p><w:r><w:t>hello</w:t></w:r></w:p>
<w:p><w:r><w:t>world</w:t></w:r></w:p>`
    expect(renderDocumentHtml(xml, new Map())).toBe('<p>hello</p><p>world</p>')
  })

  it('w:ins 用 <ins> 包裹并加 cc-ins 类', () => {
    const xml = `<w:p><w:r><w:t>原</w:t></w:r><w:ins><w:r><w:t>新</w:t></w:r></w:ins></w:p>`
    expect(renderDocumentHtml(xml, new Map())).toBe('<p>原<ins class="cc-ins">新</ins></p>')
  })

  it('w:del/w:delText 用 <del> 包裹', () => {
    const xml = `<w:p><w:del><w:r><w:delText>被删</w:delText></w:r></w:del><w:r><w:t>剩余</w:t></w:r></w:p>`
    expect(renderDocumentHtml(xml, new Map())).toBe('<p><del class="cc-del">被删</del>剩余</p>')
  })

  it('Heading2 段落渲染为 h2', () => {
    const xml = `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>第一条</w:t></w:r></w:p>`
    expect(renderDocumentHtml(xml, new Map())).toBe('<h2>第一条</h2>')
  })

  it('commentReference 渲染为批注气泡（超链接的 title 用 author+text）', () => {
    const xml = `<w:p><w:r><w:t>锚点</w:t></w:r><w:commentRangeStart w:id="0"/><w:r><w:t>被批注</w:t></w:r><w:commentRangeEnd w:id="0"/><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="0"/></w:r></w:p>`
    const comments = new Map([['0', { author: '杨卫薪', date: '', text: '建议改成分期' }]])
    const html = renderDocumentHtml(xml, comments)
    expect(html).toContain('cc-comment')
    expect(html).toContain('杨卫薪')
    expect(html).toContain('建议改成分期')
    expect(html).toContain('被批注')
  })

  it('批注作者 "A｜B" 取前半段作标签', () => {
    const xml = `<w:p><w:r><w:t>x</w:t><w:commentReference w:id="0"/></w:r></w:p>`
    const comments = new Map([['0', { author: '杨卫薪｜示例律所', date: '', text: '建议' }]])
    expect(renderDocumentHtml(xml, comments)).toContain('杨卫薪')
    expect(renderDocumentHtml(xml, comments)).not.toContain('｜示例律所')
  })

  it('XML 实体在文本中解码', () => {
    const xml = `<w:p><w:r><w:t>&#30002;&#26041;</w:t></w:r></w:p>`
    expect(renderDocumentHtml(xml, new Map())).toBe('<p>甲方</p>')
  })

  it('文本内 HTML 特殊字符转义', () => {
    const xml = `<w:p><w:r><w:t>&lt;script&gt;alert(1)&lt;/script&gt;</w:t></w:r></w:p>`
    const html = renderDocumentXmlWithScripts(xml)
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })
})

// 辅助：re-export 防止测试里别处 import 名字冲突
function renderDocumentXmlWithScripts(xml: string): string {
  return renderDocumentHtml(xml, new Map())
}