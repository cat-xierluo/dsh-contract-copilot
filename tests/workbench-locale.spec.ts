/** Typed-locale dictionary contract: key parity, complete translations, deterministic fallback. */

import { describe, expect, it, vi } from 'vitest'
import {
  browserLocale,
  COMMENT_MISS_REASON_KEYS,
  createTranslator,
  DEFAULT_LOCALE,
  LOCALES,
  MESSAGES,
  resolveLocale,
  t,
  type Locale,
  type MessageKey,
} from '../src/client/locale.ts'
import type { CommentMissReason } from '../src/client/comment-navigation.ts'

function valueOf(locale: Locale, key: MessageKey): string | ((params: never) => string) {
  return (MESSAGES[locale] as Record<string, string | ((params: never) => string)>)[key]
}

describe('workbench locale 字典', () => {
  it('两种 locale 的键集合与值类型逐键一致，翻译均非空', () => {
    const zhKeys = Object.keys(MESSAGES.zh).sort()

    expect(Object.keys(MESSAGES.en).sort()).toEqual(zhKeys)
    expect(zhKeys.length).toBeGreaterThan(80)

    for (const key of zhKeys) {
      const zhValue = valueOf('zh', key as MessageKey)
      const enValue = valueOf('en', key as MessageKey)
      expect(typeof enValue, `值类型不一致：${key}`).toBe(typeof zhValue)
      if (typeof zhValue === 'string') {
        expect((zhValue as string).trim().length, `zh 空翻译：${key}`).toBeGreaterThan(0)
        expect((enValue as string).trim().length, `en 空翻译：${key}`).toBeGreaterThan(0)
        expect(zhValue as string, `zh 含首尾空白：${key}`).toBe((zhValue as string).trim())
        expect(enValue as string, `en 含首尾空白：${key}`).toBe((enValue as string).trim())
      } else {
        expect(zhValue.length, `zh 参数个数异常：${key}`).toBe(1)
        expect(enValue.length, `en 参数个数异常：${key}`).toBe(1)
      }
    }
  })

  it('全部参数化文案在两种 locale 下输出完整插值', () => {
    // 表必须与字典中的函数值消息一一对应（railTitleWithState 的 state 参数由调用方先翻译，单独断言）；
    // 参数在编译期由 t() 逐键强制，此处验证运行时输出。
    const cases: Array<{ key: MessageKey; params: Record<string, string | number>; zh: string; en: string }> = [
      { key: 'decision.progress', params: { decided: 2, total: 5 }, zh: '已决定 2/5', en: 'Decided 2/5' },
      { key: 'decision.originalText', params: { text: '甲方应在30日内付款' }, zh: '原文：甲方应在30日内付款', en: 'Original: 甲方应在30日内付款' },
      { key: 'decision.suggestion', params: { text: '改为15日内' }, zh: '建议：改为15日内', en: 'Suggestion: 改为15日内' },
      { key: 'decision.legalBasis', params: { text: '民法典第511条' }, zh: '依据：民法典第511条', en: 'Basis: 民法典第511条' },
      { key: 'decision.dispositionAria', params: { findingId: 'R001' }, zh: 'R001 处理方式', en: 'R001 disposition' },
      { key: 'decision.severityAria', params: { findingId: 'R001' }, zh: 'R001 风险等级', en: 'R001 severity' },
      { key: 'decision.noteAria', params: { findingId: 'R001' }, zh: 'R001 律师备注', en: 'R001 lawyer note' },
      { key: 'status.stats', params: { applied: 3, failed: 1, reportOnly: 2 }, zh: '成功 3 · 失败 1 · 仅意见书 2', en: 'Applied 3 · Failed 1 · Report-only 2' },
      { key: 'intake.requiredTitle', params: { count: 2 }, zh: '需要你确认（2）', en: 'Needs your confirmation (2)' },
      { key: 'comments.title', params: { count: 7 }, zh: '💬 批注（7）', en: '💬 Comments (7)' },
      { key: 'notice.analysisStartFailed', params: { message: '会话超时' }, zh: '启动失败：会话超时', en: 'Failed to start: 会话超时' },
      { key: 'notice.planLocked', params: { approved: 4, omitted: 1 }, zh: '律师方案已锁定：执行 4 项，忽略 1 项；Agent 正在生成交付物。', en: 'Plan locked by the lawyer: applying 4 findings and omitting 1; the agent is generating deliverables.' },
      { key: 'notice.approveFailed', params: { message: '计划已失效' }, zh: '批准或派发失败：计划已失效', en: 'Approval or dispatch failed: 计划已失效' },
      { key: 'notice.stopFailed', params: { message: 'Agent 未在运行' }, zh: '停止失败：Agent 未在运行', en: 'Failed to stop: Agent 未在运行' },
      { key: 'notice.retryFailed', params: { message: '磁盘已满' }, zh: '重试失败：磁盘已满', en: 'Retry failed: 磁盘已满' },
      { key: 'notice.createFailed', params: { message: '路径不存在' }, zh: '创建失败：路径不存在', en: 'Creation failed: 路径不存在' },
      { key: 'notice.recheckFailed', params: { message: '会话已结束' }, zh: '提交失败：会话已结束', en: 'Submit failed: 会话已结束' },
      { key: 'notice.connectionFailed', params: { message: 'ECONNREFUSED' }, zh: '工作台连接失败：ECONNREFUSED', en: 'Workbench connection failed: ECONNREFUSED' },
      { key: 'notice.detailFailed', params: { message: 'HTTP 404' }, zh: '读取审查详情失败：HTTP 404', en: 'Failed to load review details: HTTP 404' },
    ]

    for (const entry of cases) {
      // 表为运行时数据，key 泛型下的参数类型由模块自身 typecheck 保证，此处统一收窄。
      expect(t('zh', entry.key, entry.params as never), `zh 插值错误：${entry.key}`).toBe(entry.zh)
      expect(t('en', entry.key, entry.params as never), `en 插值错误：${entry.key}`).toBe(entry.en)
    }

    const functionKeys = Object.keys(MESSAGES.zh)
      .filter(key => typeof valueOf('zh', key as MessageKey) === 'function')
      .sort()
    expect(functionKeys)
      .toEqual(['workbench.railTitleWithState', ...cases.map(entry => entry.key as string)].sort())
  })

  it('状态、自动化与处理方式标签覆盖全部枚举值', () => {
    const states = ['created', 'intake_done', 'plan_ready', 'applying', 'applied', 'partial', 'rejected', 'failed', 'delivered']
    const automations = ['idle', 'running-analysis', 'waiting-decisions', 'running-delivery', 'failed', 'delivered']
    const dispositions = ['accept', 'comment-only', 'report-only', 'omit']
    const keys = Object.keys(MESSAGES.zh)

    expect(keys.filter(key => key.startsWith('state.')).sort())
      .toEqual(states.map(state => `state.${state}`).sort())
    expect(keys.filter(key => key.startsWith('automation.')).sort())
      .toEqual(automations.map(status => `automation.${status}`).sort())
    expect(keys.filter(key => key.startsWith('disposition.')).sort())
      .toEqual(dispositions.map(disposition => `disposition.${disposition}`).sort())
  })

  it('阶段与工具标签与工作台现有清单一致', () => {
    expect(['phase.intake', 'phase.analysis', 'phase.decisions', 'phase.delivery', 'phase.done']
      .every(key => key in MESSAGES.zh)).toBe(true)
    expect(['contract_copilot_intake', 'contract_copilot_analyze', 'contract_copilot_apply',
      'contract_copilot_finalize', 'contract_copilot_resume', 'contract_copilot_recheck']
      .every(tool => `tool.${tool}` in MESSAGES.zh)).toBe(true)
  })

  it('t 对固定文案按 locale 取值', () => {
    expect(t('zh', 'workbench.title')).toBe('📋 Contract Copilot · 审查工作台')
    expect(t('en', 'workbench.title')).toBe('📋 Contract Copilot · Review Workbench')
    expect(t('zh', 'decision.approvedBadge')).toBe('✓ 本计划已经律师批准并锁定')
    expect(t('en', 'decision.dispositionPlaceholder')).toBe('Choose')
    expect(t('zh', 'doc.commentMarker')).toBe('查看这条批注')
    expect(t('en', 'doc.commentMarker')).toBe('View this comment')
    expect(t('zh', 'list.empty')).toBe('尚无审查任务。可在上方输入合同路径，或直接让 Agent 审查合同。')
  })

  it('railTitleWithState 组合调用方已翻译的状态标签', () => {
    expect(t('zh', 'workbench.railTitleWithState', { contractName: '收购协议', state: t('zh', 'state.plan_ready') }))
      .toBe('收购协议 · 审查计划就绪')
    expect(t('en', 'workbench.railTitleWithState', { contractName: '收购协议', state: t('en', 'state.plan_ready') }))
      .toBe('收购协议 · Review plan ready')
  })

  it('locale 变体归一化，未知 locale 确定性回退 zh', () => {
    expect(DEFAULT_LOCALE).toBe('zh')
    expect(LOCALES).toEqual(['zh', 'en'])

    expect(resolveLocale('zh')).toBe('zh')
    expect(resolveLocale('ZH_cn')).toBe('zh')
    expect(resolveLocale('zh-TW')).toBe('zh')
    expect(resolveLocale('en')).toBe('en')
    expect(resolveLocale(' EN ')).toBe('en')
    expect(resolveLocale('en_US')).toBe('en')

    for (const candidate of ['fr', 'jp', 'english', '', '   ', undefined, null, 42, {}, ['en']]) {
      expect(resolveLocale(candidate), `未知 locale 未回退：${String(candidate)}`).toBe('zh')
    }

    expect(t('en-GB', 'state.delivered')).toBe('Delivered')
    expect(t('zh-TW', 'state.delivered')).toBe('已交付')
    expect(t('fr-FR', 'state.delivered')).toBe('已交付')
    expect(t(undefined, 'state.delivered')).toBe('已交付')
  })

  it('未知键确定性回显键名而不抛错', () => {
    expect(t('zh', 'unknown.key' as MessageKey)).toBe('unknown.key')
    expect(t('en', 'unknown.key' as MessageKey)).toBe('unknown.key')
  })

  it('browserLocale 跟随 navigator 语言，未知或缺失时确定性回退 zh', () => {
    vi.stubGlobal('navigator', { language: 'en-GB' })
    expect(browserLocale()).toBe('en')
    vi.stubGlobal('navigator', { language: 'zh-CN' })
    expect(browserLocale()).toBe('zh')
    vi.stubGlobal('navigator', { language: 'fr-FR' })
    expect(browserLocale()).toBe('zh')
    vi.stubGlobal('navigator', { language: undefined })
    expect(browserLocale()).toBe('zh')
    vi.unstubAllGlobals()
  })

  it('createTranslator 绑定 locale 并保留逐键参数契约（含窄屏 pane 键）', () => {
    const label = createTranslator('zh')
    expect(label('decision.progress', { decided: 2, total: 5 })).toBe('已决定 2/5')
    expect(label('pane.group')).toBe('工作台区域')
    expect(label('pane.tasks')).toBe('任务')
    expect(label('pane.document')).toBe('文档')
    expect(label('pane.operations')).toBe('操作')

    const en = createTranslator('en-GB')
    expect(en('workbench.title')).toBe('📋 Contract Copilot · Review Workbench')
    expect(en('pane.operations')).toBe('Operations')
  })

  describe('批注导航未命中文案（CommentMissReason 全集）', () => {
    const reasons: readonly CommentMissReason[] = [
      'invalid-anchor',
      'root-empty',
      'comments-not-rendered',
      'id-not-found',
      'ordinal-out-of-range',
      'text-not-found',
    ]

    it('映射覆盖全部枚举值，键一律为 nav.<reason>', () => {
      expect(Object.keys(COMMENT_MISS_REASON_KEYS).sort()).toEqual([...reasons].sort())
      for (const reason of reasons) {
        expect(COMMENT_MISS_REASON_KEYS[reason]).toBe(`nav.${reason}`)
      }
    })

    it('映射键与字典 nav.* 键双向一致，中英文提示均非空', () => {
      const navKeys = Object.keys(MESSAGES.zh).filter((key) => key.startsWith('nav.')).sort()
      expect(navKeys).toEqual(Object.values(COMMENT_MISS_REASON_KEYS).map((key) => key as string).sort())

      for (const key of Object.values(COMMENT_MISS_REASON_KEYS)) {
        expect(t('zh', key).trim().length, `zh 空提示：${key}`).toBeGreaterThan(0)
        expect(t('en', key).trim().length, `en 空提示：${key}`).toBeGreaterThan(0)
      }
      expect(t('zh', 'nav.id-not-found')).toBe('文档中没有找到这条批注的标记。')
      expect(t('en', 'nav.id-not-found')).toBe('No marker for this comment was found in the document.')
    })
  })
})
