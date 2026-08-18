/**
 * plugin session：审查流程的持久化状态机。
 *
 * session 文件落盘为 <sessionsDir>/<id>.json，每次 tool 调用尾部原子写；
 * 产物（review-plan.json / 输出 DOCX / 报告 DOCX）落 <sessionsDir>/<id>/ 目录。
 * 状态机与转换规则见设计稿 §5.2。
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { normalizeContractKey } from './paths.ts'

export type SessionState =
  | 'created'
  | 'intake_done'
  | 'plan_ready'
  | 'applying'
  | 'applied'
  | 'partial'
  | 'rejected'
  | 'failed'
  | 'delivered'

export type ReviewerIdentity = {
  readonly author: string
  readonly organization: string
  readonly department?: string
}

export type IntakeData = {
  clientName: string
  /** 甲方 / 乙方 / 中立 / 其他 */
  partyRole: string
  /** 签约前把关 / 谈判修订 / 其他（plugin 层阻塞项，CLI 不消费） */
  reviewPurpose: string
  /** 克制 / 常规 / 强势 */
  reviewIntensity: string
  deadline?: string
  priority?: string
  allowRestructure?: boolean
  /** revise-first / balanced / comment-first */
  editPolicy: string
  /** 用户授权"按默认口径处理"时的授权来源记录（对齐 SKILL.md §3.2.1） */
  authorization?: string
  reviewer: ReviewerIdentity
}

export type ApplyStats = {
  applied: number
  failed: number
  skipped: number
  reportOnly: number
}

export type ApplyOutputs = {
  reviewedDocx?: string
  reportDocx?: string
  archiveDir?: string
  stats?: ApplyStats
}

export type HistoryEntry = {
  at: string
  tool: string
  from: SessionState
  to: SessionState
}

export type ContractSession = {
  version: 1
  id: string
  contractPath: string
  contractKey: string
  contractName: string
  state: SessionState
  intake?: IntakeData
  planPath?: string
  outputs: ApplyOutputs
  /** 单调递增；pre-step 注入用它做幂等判断 */
  progressCounter: number
  /** 上一次进度注入时的 counter 值（内存态 + 随 session 持久化） */
  lastInjectedCounter: number
  history: HistoryEntry[]
  createdAt: string
  updatedAt: string
}

/** session 状态跃迁 + 落盘。所有 tool handler 通过它改状态。 */
export class SessionStore {
  private readonly sessions = new Map<string, ContractSession>()
  private currentId: string | undefined

  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true })
  }

  /** 新建 session（state=created）并设为当前。 */
  create(contractPath: string, contractName: string): ContractSession {
    const now = new Date().toISOString()
    const id = this.composeId(contractName, now)
    const session: ContractSession = {
      version: 1,
      id,
      contractPath,
      contractKey: normalizeContractKey(contractName),
      contractName,
      state: 'created',
      outputs: {},
      progressCounter: 0,
      lastInjectedCounter: 0,
      history: [],
      createdAt: now,
      updatedAt: now,
    }
    this.sessions.set(id, session)
    this.currentId = id
    this.persist(session)
    return session
  }

  get(id: string): ContractSession | undefined {
    return this.sessions.get(id) ?? this.loadFromDisk(id)
  }

  /** 当前活跃 session（pre-step 进度注入读取）。 */
  current(): ContractSession | undefined {
    return this.currentId === undefined ? undefined : this.get(this.currentId)
  }

  setCurrent(id: string): void {
    this.currentId = id
  }

  /** 状态跃迁 + 历史记录 + 原子落盘；progressCounter 递增。 */
  transition(id: string, tool: string, to: SessionState, mutate?: (session: ContractSession) => void): ContractSession {
    const session = this.get(id)
    if (session === undefined) throw new Error(`contract-copilot: session 不存在: ${id}`)
    const from = session.state
    session.state = to
    session.progressCounter += 1
    session.updatedAt = new Date().toISOString()
    session.history.push({ at: session.updatedAt, tool, from, to })
    mutate?.(session)
    this.sessions.set(id, session)
    this.persist(session)
    return session
  }

  /** 只改数据不动状态（如 lastInjectedCounter 回写）。 */
  save(session: ContractSession): void {
    session.updatedAt = new Date().toISOString()
    this.sessions.set(session.id, session)
    this.persist(session)
  }

  /** 产物目录：<sessionsDir>/<id>/（plan、输出 DOCX、报告 DOCX 都在这里）。 */
  artifactsDir(id: string): string {
    const dir = path.join(this.dir, id)
    mkdirSync(dir, { recursive: true })
    return dir
  }

  sessionFile(id: string): string {
    return path.join(this.dir, `${id}.json`)
  }

  /** 最近 N 个 session 摘要（inspect 无参时用）。 */
  listRecent(limit = 10): Array<Pick<ContractSession, 'id' | 'contractName' | 'state' | 'updatedAt'>> {
    const entries: Array<Pick<ContractSession, 'id' | 'contractName' | 'state' | 'updatedAt'>> = []
    for (const name of readdirSync(this.dir)) {
      if (!name.endsWith('.json')) continue
      try {
        const raw = JSON.parse(readFileSync(path.join(this.dir, name), 'utf8')) as ContractSession
        if (raw?.id && raw?.contractName && raw?.state) {
          entries.push({ id: raw.id, contractName: raw.contractName, state: raw.state, updatedAt: raw.updatedAt })
        }
      } catch {
        // 损坏文件在 inspect 单查时处理（§6.4）；列表扫描跳过即可
      }
    }
    return entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit)
  }

  /** 按合同 key 找最近 session（resume 按合同名索引的回退路径）。 */
  latestByContractKey(contractKey: string): ContractSession | undefined {
    const hit = this.listRecent(200).find((entry) => entry.id.split('-')[0] === contractKey.slice(0, 40))
    return hit === undefined ? undefined : this.get(hit.id)
  }

  private composeId(contractName: string, now: string): string {
    const stamp = now.replace(/[-:TZ.]/g, '').slice(0, 14)
    const key = normalizeContractKey(contractName).slice(0, 40) || 'contract'
    const id = `${key}-${stamp}`
    return this.sessions.has(id) || existsSync(this.sessionFile(id)) ? `${id}-2` : id
  }

  private loadFromDisk(id: string): ContractSession | undefined {
    const file = this.sessionFile(id)
    if (!existsSync(file)) return undefined
    let session: ContractSession
    try {
      session = JSON.parse(readFileSync(file, 'utf8')) as ContractSession
    } catch (error) {
      // §6.4：改名留证，按 created 空态重建，调用方明示发生过损坏重建
      const corrupt = `${file}.corrupt-${Date.now()}`
      renameSync(file, corrupt)
      throw new Error(
        `contract-copilot: session 文件损坏（${id}），已移至 ${path.basename(corrupt)} 留证；请重新 intake`,
        { cause: error },
      )
    }
    if (session.version !== 1) {
      throw new Error(`contract-copilot: session 版本不支持（${id}, version=${String(session.version)}）`)
    }
    this.sessions.set(id, session)
    return session
  }

  /** 原子写：临时文件 + rename，避免半写状态被下一次加载读到。 */
  private persist(session: ContractSession): void {
    const file = this.sessionFile(session.id)
    const tmp = `${file}.tmp`
    writeFileSync(tmp, `${JSON.stringify(session, null, 2)}\n`, 'utf8')
    try {
      renameSync(tmp, file)
    } catch (error) {
      unlinkSync(tmp)
      throw error
    }
  }
}
