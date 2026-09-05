/**
 * 插件配置：schemastery 声明 + 解析后的运行时形态。
 *
 * skillRoot 是唯一必填项——指向 contract-copilot skill 根目录
 * （含 scripts/review/apply_review_plan.py 与 config/）。
 */

import { existsSync } from 'node:fs'
import z from '@deepseek-ai/schemastery'
import { expandHome } from './paths.ts'

export interface PluginConfig {
  /** contract-copilot skill 根目录（绝对路径，已做 ~ 展开） */
  readonly skillRoot: string
  /** Python 解释器可执行名或路径 */
  readonly pythonExecutable: string
  /** plugin session 文件目录（绝对路径） */
  readonly sessionsDir: string
  /** 是否启用 agent/pre-step 进度注入（能力 C） */
  readonly injectProgress: boolean
  readonly workbench: WorkbenchConfig
}

export interface WorkbenchConfig {
  readonly enabled: boolean
  /** 分析回合注入提示的合同正文字符上限（部署相关；加载边界校验）。 */
  readonly analysisContractTextMaxChars: number
  /** 单次 DOCX 抽取子进程的超时上限（毫秒；加载边界校验）。 */
  readonly docxExtractionTimeoutMs: number
}

/** 分析回合合同正文注入上限的默认值（覆盖绝大多数中文合同全文）。 */
export const ANALYSIS_CONTRACT_TEXT_DEFAULT_CHARS = 40_000
/** 协议硬顶：配置不得超过（防止单回合提示被配置撑爆；协议安全常量）。 */
export const ANALYSIS_CONTRACT_TEXT_HARD_MAX_CHARS = 200_000
/** 下限：低于该值装不下有意义的合同片段。 */
const ANALYSIS_CONTRACT_TEXT_MIN_CHARS = 1_000

/** DOCX 抽取子进程超时默认值：覆盖慢盘/杀毒扫描下的真实大 DOCX。 */
export const DOCX_EXTRACTION_TIMEOUT_DEFAULT_MS = 30_000
/** 抽取超时协议下限：低于 1s 的超时对真实抽取没有意义。 */
export const DOCX_EXTRACTION_TIMEOUT_MIN_MS = 1_000
/** 抽取超时协议硬顶：超时必须能在一个可等待的窗口内失败。 */
export const DOCX_EXTRACTION_TIMEOUT_MAX_MS = 300_000

export const Config: z<PluginConfig> = z.object({
  skillRoot: z.string().required().description(
    'contract-copilot skill 根目录（含 scripts/ 与 config/），必填',
  ),
  pythonExecutable: z.string().default('python3').description('Python 解释器'),
  sessionsDir: z.string().default('~/.dsh/contract-copilot/sessions').description(
    'plugin session 文件目录',
  ),
  injectProgress: z.boolean().default(true).description('是否每步注入审查进度上下文'),
  workbench: z.object({
    enabled: z.boolean().default(true).description('是否在 DSH Web 界面启用内嵌合同审查工作台'),
    analysisContractTextMaxChars: z.number().default(ANALYSIS_CONTRACT_TEXT_DEFAULT_CHARS).description(
      `分析回合注入提示的合同正文字符上限（${ANALYSIS_CONTRACT_TEXT_MIN_CHARS}–${ANALYSIS_CONTRACT_TEXT_HARD_MAX_CHARS}）`,
    ),
    docxExtractionTimeoutMs: z.number().default(DOCX_EXTRACTION_TIMEOUT_DEFAULT_MS).description(
      `单次 DOCX 抽取子进程的超时上限，毫秒（${DOCX_EXTRACTION_TIMEOUT_MIN_MS}–${DOCX_EXTRACTION_TIMEOUT_MAX_MS}）`,
    ),
  }).description('复用 DSH Connection 鉴权、侧栏插槽与 Web 地址的内嵌工作台'),
})

/** 校验并固化为运行时配置；skillRoot 指向不存在的目录时立刻失败（misconfiguration fails loud）。 */
export function resolveConfig(raw: PluginConfig): PluginConfig {
  const skillRoot = expandHome(raw.skillRoot)
  const entry = `${skillRoot}/scripts/review/apply_review_plan.py`
  if (!existsSync(entry)) {
    throw new Error(
      `contract-copilot: skillRoot 配置无效，找不到 ${entry}；`
      + '请把 skillRoot 指向 contract-copilot skill 的根目录',
    )
  }
  const analysisContractTextMaxChars =
    raw.workbench?.analysisContractTextMaxChars ?? ANALYSIS_CONTRACT_TEXT_DEFAULT_CHARS
  if (!Number.isInteger(analysisContractTextMaxChars)
    || analysisContractTextMaxChars < ANALYSIS_CONTRACT_TEXT_MIN_CHARS
    || analysisContractTextMaxChars > ANALYSIS_CONTRACT_TEXT_HARD_MAX_CHARS) {
    throw new Error(
      `contract-copilot: workbench.analysisContractTextMaxChars 必须是 `
      + `${ANALYSIS_CONTRACT_TEXT_MIN_CHARS}–${ANALYSIS_CONTRACT_TEXT_HARD_MAX_CHARS} 之间的整数，收到 ${String(analysisContractTextMaxChars)}`,
    )
  }
  const docxExtractionTimeoutMs =
    raw.workbench?.docxExtractionTimeoutMs ?? DOCX_EXTRACTION_TIMEOUT_DEFAULT_MS
  if (!Number.isInteger(docxExtractionTimeoutMs)
    || docxExtractionTimeoutMs < DOCX_EXTRACTION_TIMEOUT_MIN_MS
    || docxExtractionTimeoutMs > DOCX_EXTRACTION_TIMEOUT_MAX_MS) {
    throw new Error(
      `contract-copilot: workbench.docxExtractionTimeoutMs 必须是 `
      + `${DOCX_EXTRACTION_TIMEOUT_MIN_MS}–${DOCX_EXTRACTION_TIMEOUT_MAX_MS} 之间的整数毫秒，收到 ${String(docxExtractionTimeoutMs)}`,
    )
  }
  return {
    skillRoot,
    pythonExecutable: raw.pythonExecutable || 'python3',
    sessionsDir: expandHome(raw.sessionsDir || '~/.dsh/contract-copilot/sessions'),
    injectProgress: raw.injectProgress !== false,
    workbench: {
      enabled: raw.workbench?.enabled !== false,
      analysisContractTextMaxChars,
      docxExtractionTimeoutMs,
    },
  }
}
