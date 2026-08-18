/** tool 参数的 JSON 值收窄：defineTool 已做 schema 校验，这里只做类型收窄。 */

/** unknown → string | undefined（非字符串或空串归一为 undefined）。 */
export function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** unknown → boolean | undefined。 */
export function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

/** unknown → 对象数组（空/非数组抛错，消息由调用方语境决定）。 */
export function asObjectArray(value: unknown, what: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'object' || item === null)) {
    throw new Error(`contract-copilot: ${what} 必须是非空对象数组`)
  }
  return value as Array<Record<string, unknown>>
}

/**
 * 深度移除 undefined 值。DSH 的 lossless JSON 校验（packages/core/session/src/json.ts）
 * 拒绝任何属性值为 undefined——typeof undefined !== 'object' 即 reject，
 * 而且是递归的（嵌套对象的 undefined 字段同样被拒）。
 *
 * tool execute() 的返回值必须通过此函数后再返回，否则 ToolOutputError。
 * 同时支持数组、Date、null、标量的直通（只对普通对象递归）。
 */
export function compactUndefinedDeep<T>(value: T): T {
  if (value === null || value === undefined) return value
  if (value instanceof Date) return value
  if (Array.isArray(value)) {
    return value.map((item) => compactUndefinedDeep(item)) as unknown as T
  }
  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value)
    if (proto !== null && proto !== Object.prototype) return value
    const out: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (val === undefined) continue
      out[key] = compactUndefinedDeep(val)
    }
    return out as T
  }
  return value
}
