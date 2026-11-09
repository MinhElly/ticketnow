/**
 * Seat normalization helpers to bridge frontend seat codes (e.g. "A-1-1", "VIP-1-2")
 * with backend seat IDs (e.g. "A-01-01", "VIP-01-02", "VIP-A-01-01").
 */

export function normalizeToBackendSeatId(code: string, availableBackendSeatIds?: string[]): string {
  if (!code) return code
  if (availableBackendSeatIds && availableBackendSeatIds.includes(code)) {
    return code
  }

  const parts = code.split('-')
  if (parts.length >= 3) {
    const section = parts.slice(0, parts.length - 2).join('-')
    const row = parseInt(parts[parts.length - 2], 10)
    const col = parseInt(parts[parts.length - 1], 10)

    if (!isNaN(row) && !isNaN(col)) {
      // 1. Try standard 2-digit zero-padded: "A-01-01"
      const padded = `${section}-${String(row).padStart(2, '0')}-${String(col).padStart(2, '0')}`
      if (!availableBackendSeatIds || availableBackendSeatIds.includes(padded)) {
        return padded
      }

      // 2. Try prefix matching if section in backend has sub-section: e.g. "VIP-A-01-01"
      if (availableBackendSeatIds) {
        const found = availableBackendSeatIds.find((id) => {
          const p = id.split('-')
          if (p.length >= 3) {
            const r = parseInt(p[p.length - 2], 10)
            const c = parseInt(p[p.length - 1], 10)
            const secPrefix = p.slice(0, p.length - 2).join('-')
            return r === row && c === col && (secPrefix.startsWith(section) || section.startsWith(secPrefix))
          }
          return false
        })
        if (found) return found
      }

      return padded
    }
  }

  return code
}

export function normalizeToFrontendSeatCode(id: string): string {
  if (!id) return id
  const parts = id.split('-')
  if (parts.length >= 3) {
    const section = parts.slice(0, parts.length - 2).join('-')
    const row = parseInt(parts[parts.length - 2], 10)
    const col = parseInt(parts[parts.length - 1], 10)

    if (!isNaN(row) && !isNaN(col)) {
      return `${section}-${row}-${col}`
    }
  }
  return id
}
