import { TIER_COLORS, type TicketTier, type TierColor } from './ticket-tiers'

export type LayoutRect = { x: number; y: number; width: number; height: number }
export type LayoutStage = LayoutRect & { label: string }
export type LayoutZone = LayoutRect & { tierCode: string; color: TierColor; aisle: boolean }
export type SeatLayout = { stage: LayoutStage; zones: LayoutZone[] }
export type LayoutTarget = { kind: 'stage' } | { kind: 'zone'; index: number }
export type LayoutTemplate = 'auditorium' | 'side-stage' | 'center-stage'
export const LAYOUT_TEMPLATES = [
  {
    value: 'auditorium' as const,
    label: 'Hội trường',
    description: 'Sân khấu phía trước, các khu vé theo hàng.',
  },
  {
    value: 'side-stage' as const,
    label: 'Sân khấu bên trái',
    description: 'Các khu vé nằm về phía phải sân khấu.',
  },
  {
    value: 'center-stage' as const,
    label: 'Sân khấu trung tâm',
    description: 'Bố trí các khu xung quanh sân khấu.',
  },
]

export class SeatLayoutError extends Error {
  constructor(public issues: string[]) {
    super(issues[0] ?? 'Sơ đồ chưa hợp lệ.')
    this.name = 'SeatLayoutError'
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)
export const overlaps = (a: LayoutRect, b: LayoutRect) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

export function hasSeatLayout(value: unknown): boolean {
  if (!isObject(value)) return false
  if (Array.isArray(value.zones) && value.zones.length > 0) return true
  return (
    isObject(value.stage) &&
    Object.values(value.stage).some((item) => item !== null && item !== undefined && item !== '')
  )
}

export function getSeatLayoutIssues(
  layout: SeatLayout,
  tiers: Pick<TicketTier, 'code' | 'name'>[],
) {
  const issues: string[] = []
  const checkRect = (rect: LayoutRect, name: string, stage = false) => {
    if (![rect.x, rect.y, rect.width, rect.height].every(finite)) {
      issues.push(`${name}: tọa độ và kích thước phải là số hữu hạn.`)
      return
    }
    if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > 100 || rect.y + rect.height > 100)
      issues.push(`${name} phải nằm hoàn toàn trong mặt bằng (0–100%).`)
    if (
      rect.width < (stage ? 15 : 20) ||
      rect.height < (stage ? 6 : 20) ||
      rect.width > 100 ||
      rect.height > 100
    )
      issues.push(`${name}: kích thước tối thiểu ${stage ? '15% × 6%' : '20% × 20%'}.`)
  }
  if (!layout.stage.label.trim() || layout.stage.label.trim().length > 60)
    issues.push('Tên sân khấu cần từ 1 đến 60 ký tự.')
  checkRect(layout.stage, 'Sân khấu', true)
  if (layout.zones.length !== tiers.length || layout.zones.length < 1 || layout.zones.length > 4)
    issues.push('Mỗi hạng vé cần đúng một khu trên sơ đồ (tối đa 4 khu).')
  if (new Set(layout.zones.map((zone) => zone.tierCode)).size !== layout.zones.length)
    issues.push('Mã khu trên sơ đồ không được trùng nhau.')
  if (new Set(layout.zones.map((zone) => zone.color)).size !== layout.zones.length)
    issues.push('Mỗi khu vé cần một màu riêng để khách dễ phân biệt.')
  for (const [index, zone] of layout.zones.entries()) {
    const tier = tiers.find((tier) => tier.code === zone.tierCode)
    const name = `Khu ${tier?.name || zone.tierCode || index + 1}`
    if (!tier) issues.push(`${name} không thuộc hạng vé của sự kiện.`)
    if (!TIER_COLORS.includes(zone.color)) issues.push(`${name} cần màu hợp lệ.`)
    if (typeof zone.aisle !== 'boolean') issues.push(`${name} cần cấu hình lối đi hợp lệ.`)
    checkRect(zone, name)
    if (overlaps(zone, layout.stage)) issues.push(`${name} đang chồng lên sân khấu.`)
    for (const other of layout.zones.slice(0, index)) {
      if (overlaps(zone, other)) issues.push(`${name} đang chồng lên khu ${other.tierCode}.`)
    }
  }
  return issues
}

export function parseSeatLayout(
  value: unknown,
  tiers: Pick<TicketTier, 'code' | 'name'>[],
): SeatLayout {
  if (
    !isObject(value) ||
    !isObject(value.stage) ||
    !Array.isArray(value.zones) ||
    value.zones.length > 4
  )
    throw new SeatLayoutError(['Sơ đồ cần có sân khấu và từ 1 đến 4 khu vé.'])
  const rect = (item: Record<string, unknown>): LayoutRect => ({
    x: item.x as number,
    y: item.y as number,
    width: item.width as number,
    height: item.height as number,
  })
  const stage = value.stage
  if (typeof stage.label !== 'string' || value.zones.some((zone) => !isObject(zone)))
    throw new SeatLayoutError(['Sơ đồ chứa thông tin sân khấu hoặc khu vé không hợp lệ.'])
  const layout: SeatLayout = {
    stage: { ...rect(stage), label: stage.label.trim() },
    zones: value.zones.map((zone: Record<string, unknown>) => ({
      ...rect(zone),
      tierCode: typeof zone.tierCode === 'string' ? zone.tierCode : '',
      color: zone.color as TierColor,
      aisle: zone.aisle as boolean,
    })),
  }
  const issues = getSeatLayoutIssues(layout, tiers)
  if (issues.length) throw new SeatLayoutError(issues)
  return layout
}

export function readSeatLayout(
  value: unknown,
  tiers?: Pick<TicketTier, 'code' | 'name'>[] | null,
): SeatLayout | null {
  if (!tiers || !Array.isArray(tiers) || !hasSeatLayout(value)) return null
  try {
    return parseSeatLayout(value, tiers)
  } catch {
    return null
  }
}

export function createSeatLayout(
  tiers?: Pick<TicketTier, 'code'>[] | null,
  template: LayoutTemplate = 'auditorium',
): SeatLayout {
  const safeTiers = tiers && tiers.length ? tiers : [{ code: 'A' }]
  const n = Math.max(1, Math.min(4, safeTiers.length))
  let stage: LayoutStage
  let rectangles: LayoutRect[]
  if (template === 'center-stage') {
    stage = { label: 'Sân khấu', x: 39, y: 40, width: 22, height: 20 }
    rectangles =
      n === 1
        ? [{ x: 10, y: 5, width: 80, height: 28 }]
        : n === 2
          ? [
              { x: 10, y: 4, width: 80, height: 28 },
              { x: 10, y: 68, width: 80, height: 28 },
            ]
          : n === 3
            ? [
                { x: 10, y: 4, width: 80, height: 28 },
                { x: 4, y: 68, width: 44, height: 28 },
                { x: 52, y: 68, width: 44, height: 28 },
              ]
            : [
                { x: 8, y: 3, width: 84, height: 28 },
                { x: 8, y: 69, width: 84, height: 28 },
                { x: 2, y: 36, width: 30, height: 28 },
                { x: 68, y: 36, width: 30, height: 28 },
              ]
  } else if (template === 'side-stage') {
    stage = { label: 'Sân khấu', x: 3, y: 20, width: 15, height: 60 }
    rectangles =
      n === 1
        ? [{ x: 25, y: 10, width: 70, height: 80 }]
        : n === 2
          ? [
              { x: 25, y: 6, width: 70, height: 40 },
              { x: 25, y: 54, width: 70, height: 40 },
            ]
          : n === 3
            ? [
                { x: 25, y: 5, width: 32, height: 90 },
                { x: 64, y: 5, width: 32, height: 40 },
                { x: 64, y: 55, width: 32, height: 40 },
              ]
            : [
                { x: 24, y: 5, width: 33, height: 40 },
                { x: 62, y: 5, width: 33, height: 40 },
                { x: 24, y: 55, width: 33, height: 40 },
                { x: 62, y: 55, width: 33, height: 40 },
              ]
  } else {
    stage = { label: 'Sân khấu', x: 20, y: 4, width: 60, height: 10 }
    rectangles =
      n === 1
        ? [{ x: 10, y: 24, width: 80, height: 65 }]
        : n === 2
          ? [
              { x: 12, y: 23, width: 76, height: 30 },
              { x: 6, y: 61, width: 88, height: 30 },
            ]
          : n === 3
            ? [
                { x: 12, y: 22, width: 76, height: 28 },
                { x: 4, y: 59, width: 43, height: 34 },
                { x: 53, y: 59, width: 43, height: 34 },
              ]
            : [
                { x: 4, y: 22, width: 43, height: 30 },
                { x: 53, y: 22, width: 43, height: 30 },
                { x: 4, y: 61, width: 43, height: 30 },
                { x: 53, y: 61, width: 43, height: 30 },
              ]
  }
  return {
    stage,
    zones: safeTiers.slice(0, n).map((tier, index) => ({
      ...rectangles[index],
      tierCode: tier.code,
      color: TIER_COLORS[index],
      aisle: true,
    })),
  }
}

export function clampLayoutRect(rect: LayoutRect, stage = false): LayoutRect {
  const safe = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback)
  const width = Math.max(stage ? 15 : 20, Math.min(100, safe(rect.width, 40)))
  const height = Math.max(stage ? 6 : 20, Math.min(100, safe(rect.height, 25)))
  return {
    x: Math.max(0, Math.min(100 - width, safe(rect.x, 0))),
    y: Math.max(0, Math.min(100 - height, safe(rect.y, 0))),
    width,
    height,
  }
}
