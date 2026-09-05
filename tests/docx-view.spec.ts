/**
 * docx-view 单测：decodeEntities / parseCommentsXml / renderDocumentHtml /
 * 稳定批注锚点（assignCommentAnchorIds + renderDocumentWithAnchors）。
 * 用合成 XML 串覆盖 ins/del/comment/heading/pStyle 路径与锚点降级路径。
 */

import { describe, expect, it } from 'vitest'
import { assignCommentAnchorIds, decodeEntities, parseCommentsXml, renderDocumentHtml, renderDocumentWithAnchors } from '../src/docx-view.ts'
import type { DocxComment } from '../src/docx-view.ts'

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

function commentsOf(entries: Array<[string, DocxComment]>): Map<string, DocxComment> {
  return new Map(entries)
}

describe('assignCommentAnchorIds', () => {
  const comment: DocxComment = { author: '杨卫薪｜示例律所', date: '2026-09-04', text: '付款期限过短' }

  it('同一输入永远得到同一批 id（稳定且确定）', () => {
    const first = assignCommentAnchorIds(commentsOf([['0', comment]]))
    const second = assignCommentAnchorIds(commentsOf([['0', comment]]))
    expect(first.get('0')).toBe(second.get('0'))
    expect(first.get('0')).toMatch(/^ccm-[0-9a-f]{16}$/)
  })

  it('id 由内容派生，不依赖 OOXML w:id（Word 重存会重新编号）', () => {
    const before = assignCommentAnchorIds(commentsOf([['0', comment]])).get('0')
    const after = assignCommentAnchorIds(commentsOf([['7', comment]])).get('7')
    expect(after).toBe(before)
  })

  it('不同内容得到不同 id', () => {
    const ids = assignCommentAnchorIds(commentsOf([
      ['0', comment],
      ['1', { ...comment, text: '另一条意见' }],
    ]))
    expect(ids.get('0')).not.toBe(ids.get('1'))
  })

  it('内容完全相同的重复批注按出现顺序追加 -2 后缀', () => {
    const ids = assignCommentAnchorIds(commentsOf([
      ['0', comment],
      ['1', comment],
      ['2', { ...comment, text: '不同' }],
      ['3', comment],
    ]))
    expect(ids.get('1')).toBe(`${ids.get('0')}-2`)
    expect(ids.get('3')).toBe(`${ids.get('0')}-3`)
    expect(ids.get('2')).not.toBe(ids.get('0'))
  })
})

describe('renderDocumentWithAnchors', () => {
  const comment: DocxComment = { author: '杨卫薪', date: '2026-09-04', text: '建议改成分期' }

  it('精确范围：正文包裹 data-cc-anchor 标记，气泡同 id，quote 为解码纯文本', () => {
    const xml = `<w:p><w:r><w:t>锚点</w:t></w:r><w:commentRangeStart w:id="0"/><w:r><w:t>被批注</w:t></w:r><w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r></w:p>`
    const { html, comments: projected } = renderDocumentWithAnchors(xml, commentsOf([['0', comment]]))
    expect(projected).toHaveLength(1)
    expect(projected[0].anchorId).toMatch(/^ccm-[0-9a-f]{16}$/)
    expect(projected[0].anchor).toEqual({ status: 'exact', paragraphIndex: 0, quote: '被批注' })
    expect(html).toContain(`<span class="cc-comment-anchor" data-cc-anchor="${projected[0].anchorId}">被批注</span>`)
    expect(html).toContain(`<sup class="cc-comment" data-cc-anchor="${projected[0].anchorId}"`)
  })

  it('同一输入渲染结果完全一致（确定性）', () => {
    const xml = `<w:p><w:commentRangeStart w:id="0"/><w:r><w:t>被批注</w:t></w:r><w:commentRangeEnd w:id="0"/></w:p>`
    const first = renderDocumentWithAnchors(xml, commentsOf([['0', comment]]))
    const second = renderDocumentWithAnchors(xml, commentsOf([['0', comment]]))
    expect(first).toEqual(second)
  })

  it('范围标记覆盖整个范围且 quote 为空串时仍是精确锚定', () => {
    const xml = `<w:p><w:commentRangeStart w:id="0"/><w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r></w:p>`
    const { comments: projected } = renderDocumentWithAnchors(xml, commentsOf([['0', comment]]))
    expect(projected[0].anchor).toEqual({ status: 'exact', paragraphIndex: 0, quote: '' })
  })

  it('paragraphIndex 按参与渲染的段落计数（空段落不占位）', () => {
    const xml = `<w:p><w:r><w:t>第一段</w:t></w:r></w:p>`
      + `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>标题段</w:t></w:r></w:p>`
      + `<w:p><w:commentRangeStart w:id="0"/><w:r><w:t>被批注</w:t></w:r><w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r></w:p>`
    const { comments: projected } = renderDocumentWithAnchors(xml, commentsOf([['0', comment]]))
    expect(projected[0].anchor).toMatchObject({ status: 'exact', paragraphIndex: 2 })
  })

  it('范围文本实体解码进 quote，但正文 HTML 保持转义', () => {
    const xml = `<w:p><w:commentRangeStart w:id="0"/><w:r><w:t>&lt;b&gt;甲方&amp;乙方&lt;/b&gt;</w:t></w:r><w:commentRangeEnd w:id="0"/></w:p>`
    const { html, comments: projected } = renderDocumentWithAnchors(xml, commentsOf([['0', comment]]))
    expect(projected[0].anchor).toEqual({ status: 'exact', paragraphIndex: 0, quote: '<b>甲方&乙方</b>' })
    expect(html).toContain('&lt;b&gt;甲方&amp;乙方&lt;/b&gt;')
    expect(html).not.toContain('<b>')
  })

  it('作者与正文中的 HTML 注入被转义，标记属性只含生成的安全 id', () => {
    const xml = `<w:p><w:commentRangeStart w:id="0"/><w:r><w:t>被批注</w:t></w:r><w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r></w:p>`
    const hostile: DocxComment = { author: 'E" onmouseover="x"><script>', date: '', text: '<img src=x onerror=alert(1)>' }
    const { html, comments: projected } = renderDocumentWithAnchors(xml, commentsOf([['0', hostile]]))
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('onmouseover="x"')
    expect(html).toContain(`data-cc-anchor="${projected[0].anchorId}"`)
  })

  it('重复内容批注：各自范围标记对应各自的 -2 后缀 id', () => {
    const xml = `<w:p><w:commentRangeStart w:id="0"/><w:r><w:t>甲</w:t></w:r><w:commentRangeEnd w:id="0"/>`
      + `<w:commentRangeStart w:id="1"/><w:r><w:t>乙</w:t></w:r><w:commentRangeEnd w:id="1"/></w:p>`
    const { html, comments: projected } = renderDocumentWithAnchors(xml, commentsOf([
      ['0', comment],
      ['1', comment],
    ]))
    expect(projected.map((entry) => entry.anchorId)).toEqual([projected[0].anchorId, `${projected[0].anchorId}-2`])
    expect(html).toContain(`data-cc-anchor="${projected[0].anchorId}">甲</span>`)
    expect(html).toContain(`data-cc-anchor="${projected[0].anchorId}-2">乙</span>`)
    expect(projected.map((entry) => entry.anchor)).toEqual([
      { status: 'exact', paragraphIndex: 0, quote: '甲' },
      { status: 'exact', paragraphIndex: 0, quote: '乙' },
    ])
  })

  it('同段嵌套范围：span 正确嵌套，两条都精确', () => {
    const xml = `<w:p><w:commentRangeStart w:id="0"/><w:r><w:t>外</w:t></w:r><w:commentRangeStart w:id="1"/><w:r><w:t>内</w:t></w:r><w:commentRangeEnd w:id="1"/><w:r><w:t>尾</w:t></w:r><w:commentRangeEnd w:id="0"/></w:p>`
    const { html, comments: projected } = renderDocumentWithAnchors(xml, commentsOf([
      ['0', comment],
      ['1', { ...comment, text: '内层意见' }],
    ]))
    expect(projected.map((entry) => entry.anchor)).toEqual([
      { status: 'exact', paragraphIndex: 0, quote: '外内尾' },
      { status: 'exact', paragraphIndex: 0, quote: '内' },
    ])
    expect(html).toContain(
      `<span class="cc-comment-anchor" data-cc-anchor="${projected[0].anchorId}">外`
      + `<span class="cc-comment-anchor" data-cc-anchor="${projected[1].anchorId}">内</span>尾</span>`,
    )
  })

  it('范围完全在单个 w:r 内部也能精确包裹', () => {
    const xml = `<w:p><w:r><w:t>a</w:t><w:commentRangeStart w:id="0"/><w:t>b</w:t><w:commentRangeEnd w:id="0"/><w:t>c</w:t></w:r></w:p>`
    const { html, comments: projected } = renderDocumentWithAnchors(xml, commentsOf([['0', comment]]))
    expect(projected[0].anchor).toEqual({ status: 'exact', paragraphIndex: 0, quote: 'b' })
    expect(html).toBe(`<p>a<span class="cc-comment-anchor" data-cc-anchor="${projected[0].anchorId}">b</span>c</p>`)
  })

  it('点批注（只有引用点）→ range-missing 降级 + 引用点段落', () => {
    const xml = `<w:p><w:r><w:t>x</w:t><w:commentReference w:id="0"/></w:r></w:p>`
    const { html, comments: projected } = renderDocumentWithAnchors(xml, commentsOf([['0', comment]]))
    expect(projected[0].anchor).toEqual({ status: 'fallback', reason: 'range-missing', paragraphIndex: 0 })
    expect(html).toContain(`data-cc-anchor="${projected[0].anchorId}"`)
    expect(html).not.toContain('cc-comment-anchor')
  })

  it('范围有 start 无 end → range-unclosed 降级，正文不产出 span', () => {
    const xml = `<w:p><w:commentRangeStart w:id="0"/><w:r><w:t>无终点</w:t></w:r><w:r><w:commentReference w:id="0"/></w:r></w:p>`
    const { html, comments: projected } = renderDocumentWithAnchors(xml, commentsOf([['0', comment]]))
    expect(projected[0].anchor).toEqual({ status: 'fallback', reason: 'range-unclosed', paragraphIndex: 0 })
    expect(html).not.toContain('cc-comment-anchor')
  })

  it('异常 OOXML 使渲染器在计划终点前停止 → 不产出 data-cc-anchor 元素，元数据稳定降级', () => {
    // </w:r> 缺失：计划起点已输出（openWrap），渲染器在 <w:r> 处提前 break，
    // 计划终点未被消费；正文不得为该锚点物化任何 data-cc-anchor 元素
    //（否则 Client 会把空壳范围当成功导航目标并高亮错误位置）。
    const xml = `<w:p><w:commentRangeStart w:id="0"/><w:r><w:t>被批注无闭合</w:t><w:commentRangeEnd w:id="0"/><w:commentReference w:id="0"/></w:p>`
    const { html, comments: projected } = renderDocumentWithAnchors(xml, commentsOf([['0', comment]]))
    expect(projected[0].anchor).toEqual({ status: 'fallback', reason: 'range-unclosed', paragraphIndex: 0 })
    expect(html).not.toContain('data-cc-anchor')
    expect(html).not.toContain('cc-comment-anchor')
    // 渲染器提前停止后本段无可见输出：该段既无锚点元素也无文本残留
    expect(html).toBe('')
  })

  it('计划终点被 run 内文本处理吞掉（未闭合 w:t）→ 不产出 data-cc-anchor 元素', () => {
    // <w:t> 未闭合：run 内的 w:t 文本处理会吞到下一个 </w:t>，把计划终点
    // 标记当字面文本转义输出——终点从未被消费，正文不得出现该锚点的
    // data-cc-anchor 元素。
    const xml = `<w:p><w:r><w:commentRangeStart w:id="0"/><w:t>范围文本未闭合<w:commentRangeEnd w:id="0"/><w:t>尾</w:t></w:r></w:p>`
    const { html, comments: projected } = renderDocumentWithAnchors(xml, commentsOf([['0', comment]]))
    expect(projected[0].anchor).toEqual({ status: 'fallback', reason: 'range-unclosed', paragraphIndex: 0 })
    expect(html).not.toContain('data-cc-anchor')
    expect(html).not.toContain('cc-comment-anchor')
    // 可见文本仍保留（含被转义的终点标记残片），只是不再有锚点元素
    expect(html).toContain('范围文本未闭合')
  })

  it('范围跨段 → range-crosses-paragraph，段落指向可见气泡所在段', () => {
    const xml = `<w:p><w:commentRangeStart w:id="0"/><w:r><w:t>前段</w:t></w:r></w:p>`
      + `<w:p><w:r><w:t>后段</w:t></w:r><w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r></w:p>`
    const { html, comments: projected } = renderDocumentWithAnchors(xml, commentsOf([['0', comment]]))
    expect(projected[0].anchor).toEqual({ status: 'fallback', reason: 'range-crosses-paragraph', paragraphIndex: 1 })
    expect(html).not.toContain('cc-comment-anchor')
    expect(html).toContain(`data-cc-anchor="${projected[0].anchorId}"`)
  })

  it('范围落在 w:del 修订块内 → range-in-tracked-change 降级', () => {
    const xml = `<w:p><w:del><w:commentRangeStart w:id="0"/><w:r><w:delText>删除文本</w:delText></w:r></w:del><w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r></w:p>`
    const { html, comments: projected } = renderDocumentWithAnchors(xml, commentsOf([['0', comment]]))
    expect(projected[0].anchor).toEqual({ status: 'fallback', reason: 'range-in-tracked-change', paragraphIndex: 0 })
    expect(html).toContain('<del class="cc-del">删除文本</del>')
    expect(html).not.toContain('cc-comment-anchor')
  })

  it('comments.xml 里有但正文从未引用 → orphan-comment 且无位置', () => {
    const xml = `<w:p><w:r><w:t>正文</w:t></w:r></w:p>`
    const { html, comments: projected } = renderDocumentWithAnchors(xml, commentsOf([['0', comment]]))
    expect(projected[0].anchor).toEqual({ status: 'fallback', reason: 'orphan-comment' })
    expect(html).toBe('<p>正文</p>')
  })

  it('renderDocumentHtml 与 renderDocumentWithAnchors 的 html 一致', () => {
    const xml = `<w:p><w:commentRangeStart w:id="0"/><w:r><w:t>被批注</w:t></w:r><w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r></w:p>`
    const comments = commentsOf([['0', comment]])
    expect(renderDocumentHtml(xml, comments)).toBe(renderDocumentWithAnchors(xml, comments).html)
    expect(renderDocumentHtml(xml, comments)).toContain('data-cc-anchor')
  })
})