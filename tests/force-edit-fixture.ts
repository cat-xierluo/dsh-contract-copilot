/**
 * CC-V5-003 force_edit 验收资产：脱敏合成合同 fixture 与 force_edit plan。
 *
 * 全部内容为合成数据（虚构主体、虚构金额、通用条款），不含真实当事人或
 * 受版权保护的命名（AGENTS.md 安全边界）。plan 形状与
 * tests/python-bridge.integration.spec.ts 已验证可通过 integrity 复核的
 * 最小 schema 一致：meta + 完整 summary + 带 force_edit:true 的 replace finding。
 */

import { execSync } from 'node:child_process'
import { accessSync, constants as fsConstants, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/** 真实 skill 根目录；环境变量可覆盖（CI / 其他机器可重复）。 */
export const FORCE_EDIT_SKILL_ROOT = process.env.CONTRACT_COPILOT_SKILL_ROOT
  ?? '/Users/maoking/Library/Application Support/maoscripts/skills/legal-skills/skills/contract-copilot'

/** 真实 CLI 入口（apply_review_plan.py）；probe 必须确认可读，否则整组具名 skip。 */
export const FORCE_EDIT_CLI_ENTRY = path.join(FORCE_EDIT_SKILL_ROOT, 'scripts', 'review', 'apply_review_plan.py')

/** 合同名与输出文件名（同时是 SessionStore 里的 contractName）。 */
export const CONTRACT_NAME = '合成验收采购合同'

/** 脱敏合成合同正文（每项一个段落；heading 0 = Title）。 */
export const CONTRACT_PARAGRAPHS: readonly string[] = [
  '甲方：测试甲公司（合成数据）',
  '乙方：测试乙公司（合成数据）',
  '本合同为插件工程验收专用的合成样例，不构成任何真实交易安排。',
  '任何一方违约应赔偿对方全部损失。',
  '第二条 争议解决：因本合同引起的争议，双方应先友好协商解决。',
]

/** force_edit replace 的目标与替换文本（与上文第 4 段一致，保证可定位）。 */
export const TARGET_TEXT = '任何一方违约应赔偿对方全部损失。'
export const REPLACEMENT_TEXT = '违约赔偿以合同总价款的百分之二十为限。'
/**
 * CLI 落的是最小差异修订（只标删差异词，不整句替换），所以合并可见文本里
 * 能稳定在场的"新增实质内容"是替换文本的尾部片段；断言用它而非整句。
 */
export const INSERTED_DIFF_SNIPPET = '以合同总价款的百分之二十为限'

/** 带 force_edit:true 的最小 plan（镜像既有集成测试已通过 integrity 的形状）。 */
export function buildForceEditPlan(): Record<string, unknown> {
  return {
    meta: {
      contract_name: CONTRACT_NAME,
      client_name: '测试甲公司',
      party_role: '甲方',
      review_intensity: '常规',
      edit_policy: 'revise-first',
    },
    summary: {
      contract_type: '采购合同（合成验收样例）',
      parties: { party_a: '测试甲公司', party_b: '测试乙公司' },
      business_overview: '用于插件工程验收的合成采购安排',
      contract_amount: '人民币一元（合成数据）',
      payment_terms: '验收一次性付清（合成数据）',
      rights_obligations: '双方权利义务由合成条款约定',
      overall_risk: '低',
      core_conclusion: '按建议修订后可签（合成数据）',
      key_recommendations: ['为违约赔偿设置上限（合成数据）'],
    },
    findings: [
      {
        id: 'R001',
        risk: '违约赔偿上限缺失（合成验收）',
        severity: 'P1',
        target_text: TARGET_TEXT,
        replacement_text: REPLACEMENT_TEXT,
        action: 'replace',
        force_edit: true,
        legal_basis: '《民法典》第五百八十五条',
      },
    ],
  }
}

export type ForceEditDeps = {
  readonly missing: readonly string[]
  readonly python3: boolean
  readonly defusedxml: boolean
  readonly pythonDocx: boolean
  readonly skillRootReadable: boolean
  readonly cliEntryReadable: boolean
}

function canRun(command: string): boolean {
  try {
    execSync(command, { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function isReadableFile(target: string): boolean {
  try {
    return statSync(target).isFile() && (accessSync(target, fsConstants.R_OK), true)
  } catch {
    return false
  }
}

function isReadableDir(target: string): boolean {
  try {
    return statSync(target).isDirectory() && (accessSync(target, fsConstants.R_OK), true)
  } catch {
    return false
  }
}

/**
 * 逐项探测 CLI 链路依赖：python3 可执行、defusedxml / python-docx 可导入、
 * skill root 与 apply_review_plan.py 入口可读。缺哪项都给具名结论（skip 不假绿）。
 */
export function probeForceEditDeps(): ForceEditDeps {
  const python3 = canRun('python3 -c "pass"')
  const defusedxml = python3 && canRun('python3 -c "import defusedxml"')
  const pythonDocx = python3 && canRun('python3 -c "import docx"')
  const skillRootReadable = isReadableDir(FORCE_EDIT_SKILL_ROOT)
  const cliEntryReadable = skillRootReadable && isReadableFile(FORCE_EDIT_CLI_ENTRY)
  const missing: string[] = []
  if (!python3) missing.push('python3（可执行文件不存在）')
  if (python3 && !defusedxml) missing.push('defusedxml（pip install -r scripts/requirements.txt）')
  if (python3 && !pythonDocx) missing.push('python-docx（fixture 生成与 CLI 读写 DOCX 必需）')
  if (!skillRootReadable) {
    missing.push(`skill root 不可读：${FORCE_EDIT_SKILL_ROOT}（可用 CONTRACT_COPILOT_SKILL_ROOT 覆盖）`)
  } else if (!cliEntryReadable) {
    missing.push(`CLI 入口不可读：${FORCE_EDIT_CLI_ENTRY}`)
  }
  return { missing, python3, defusedxml, pythonDocx, skillRootReadable, cliEntryReadable }
}

/**
 * 用 python-docx 生成脱敏合成合同 DOCX；返回路径。
 * 仅在 probeForceEditDeps().pythonDocx 为 true 时调用。
 */
export function writeSyntheticContractDocx(dir: string): string {
  const docxPath = path.join(dir, `${CONTRACT_NAME}.docx`)
  const genScript = path.join(dir, 'gen-force-edit-fixture.py')
  const paragraphs = CONTRACT_PARAGRAPHS
    .map((text) => `d.add_paragraph(${JSON.stringify(text)})`)
    .join('\n')
  writeFileSync(genScript, [
    'from docx import Document',
    'd = Document()',
    `d.add_heading(${JSON.stringify(CONTRACT_NAME)}, 0)`,
    paragraphs,
    `d.save(${JSON.stringify(docxPath)})`,
  ].join('\n'), 'utf8')
  execSync(`python3 ${JSON.stringify(genScript)}`, { stdio: 'pipe' })
  return docxPath
}
