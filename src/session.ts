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
import type { ContractSession, SessionState } from './session-types.ts'

export type {
  ApplyOutputs,
  ApplyStats,
  AutomationState,
  AutomationStatus,
  ContractSession,
  DecisionAnswers,
  DecisionOption,
  HistoryEntry,
  IntakeData,
  FindingDecision,
  FindingDisposition,
  PlanReview,
  PlanReviewHistoryEntry,
  ReviewerIdentity,
  SessionState,
} from './session-types.ts'

/** session 状态跃迁 + 落盘。所有 tool handler 通过它改状态。 */
export class SessionStore {
  private readonly sessions = new Map<string, ContractSession>()
  private readonly listeners = new Set<(session: ContractSession) => void>()
  private currentId: string | undefined

  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true })
  }

  /** 订阅状态变更（transition/save/create）。返回 disposer。 */
  subscribe(listener: (session: ContractSession) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(session: ContractSession): void {
    for (const listener of this.listeners) {
      try { listener(session) } catch (error) { /* listener 异常不冒泡；不阻塞他人 */ }
    }
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
    this.emit(session)
    return session
  }

  /** 只改数据不动状态（如 lastInjectedCounter 回写）。 */
  save(session: ContractSession): void {
    session.updatedAt = new Date().toISOString()
    this.sessions.set(session.id, session)
    this.persist(session)
    this.emit(session)
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
    const trimmed = contractKey.trim()
    if (trimmed === '') return undefined
    const hit = this.listRecent(200).find((entry) => entry.id.startsWith(`${trimmed}-`))
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
