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
}

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
  return {
    skillRoot,
    pythonExecutable: raw.pythonExecutable || 'python3',
    sessionsDir: expandHome(raw.sessionsDir || '~/.dsh/contract-copilot/sessions'),
    injectProgress: raw.injectProgress !== false,
    workbench: {
      enabled: raw.workbench?.enabled !== false,
    },
  }
}
