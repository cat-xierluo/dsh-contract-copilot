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
