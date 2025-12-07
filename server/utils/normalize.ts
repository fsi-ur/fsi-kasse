export function normalizeBigInt(obj: any): any {
  if (obj === null || obj === undefined) return obj

  if (typeof obj === 'bigint') return Number(obj)

  if (Array.isArray(obj)) return obj.map(normalizeBigInt)

  if (typeof obj === 'object') {
    const result: any = {}
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'bigint') {
        result[key] = Number(value)
      } else {
        result[key] = value
      }
    }
    return result
  }

  return obj
}