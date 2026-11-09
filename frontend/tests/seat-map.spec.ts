import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { getTicketTierViews, type TicketTier } from '../src/lib/ticket-tiers'

type Account = { email: string; password: string; role: string }
const accounts: Account[] = process.env.TICKETNOW_TEST_ACCOUNTS_FILE
  ? JSON.parse(readFileSync(process.env.TICKETNOW_TEST_ACCOUNTS_FILE, 'utf8'))
  : []
const origin = process.env.TICKETNOW_TEST_URL || `http://localhost:${process.env.PORT || 3000}`
const headers = { Origin: origin }
const priceText = (value: number) => new Intl.NumberFormat('vi-VN').format(value) + 'đ'

async function openMap(page: Page, context: BrowserContext) {
  const account = accounts.find((account) => account.role === 'customer')
  test.skip(!account, 'Provide temporary Customer credentials for map verification.')
  const login = await context.request.post('/api/ticketnow/session', {
    headers,
    data: { mode: 'login', email: account!.email, password: account!.password },
  })
  expect(login.status()).toBe(200)
  await page.goto('/events/creative-meetup')
  await page.getByRole('button', { name: 'Đặt vé ngay', exact: true }).click()
  return page.getByRole('dialog', { name: 'Chọn ghế', exact: true })
}

test('Tier presentation preserves source geometry and gives each tier a distinct color', () => {
  const tiers: TicketTier[] = [
    { name: 'Standard', code: 'A', price: 100000, rows: 4, seatsPerRow: 10 },
    { name: 'VIP', code: 'V', price: 300000, rows: 3, seatsPerRow: 8 },
    { name: 'Balcony', code: 'B', price: 200000, rows: 2, seatsPerRow: 6 },
    { name: 'Circle', code: 'C', price: 250000, rows: 1, seatsPerRow: 12 },
  ]
  const before = JSON.stringify(tiers)
  Object.freeze(tiers)
  const views = getTicketTierViews(tiers)
  expect(views.map((view) => view.tier.code)).toEqual(['V', 'C', 'B', 'A'])
  expect(new Set(views.map((view) => view.theme.dot)).size).toBe(4)
  expect(new Set(views.map((view) => view.theme.selectedSeat)).size).toBe(4)
  expect(JSON.stringify(tiers)).toBe(before)
  expect(views.find((view) => view.tier.code === 'A')!.tier.rows).toBe(4)
  expect(views.find((view) => view.tier.code === 'V')!.tier.seatsPerRow).toBe(8)
})

test('Single-tier and equal-price events keep valid section identities', () => {
  const tier: TicketTier = { name: 'General', code: 'G', price: 0, rows: 1, seatsPerRow: 1 }
  expect(getTicketTierViews([tier])[0].tier).toBe(tier)
  expect(getTicketTierViews([tier, { ...tier, code: 'H' }]).map((view) => view.tier.code)).toEqual([
    'G',
    'H',
  ])
  expect(getTicketTierViews([])).toEqual([])
})

test('All zones stay on the same map; tier colors, prices, mixed selection and booking payload agree', async ({
  page,
  context,
}) => {
  await page.route('**/api/ticketnow/availability**', (route) =>
    route.fulfill({
      json: {
        claims: [
          { code: 'V-1-2', status: 'sold' },
          { code: 'A-1-2', status: 'held' },
        ],
      },
    }),
  )
  const dialog = await openMap(page, context)
  const vip = dialog.getByRole('region', { name: 'Khu VIP', exact: true })
  const standard = dialog.getByRole('region', { name: 'Khu Standard', exact: true })
  await expect(vip).toBeVisible()
  await expect(standard).toBeVisible()
  const vipPrice = Number(await vip.getAttribute('data-unit-price'))
  const standardPrice = Number(await standard.getAttribute('data-unit-price'))
  expect(vipPrice).toBeGreaterThan(standardPrice)
  expect((await vip.boundingBox())!.y).toBeLessThan((await standard.boundingBox())!.y)
  expect(await vip.evaluate((el) => getComputedStyle(el).borderColor)).not.toBe(
    await standard.evaluate((el) => getComputedStyle(el).borderColor),
  )
  await expect(dialog).toContainText('Bố trí minh họa theo giá vé')
  await expect(
    dialog.getByRole('button', { name: 'Ghế V-1-2 đã được đặt', exact: true }),
  ).toBeDisabled()
  await expect(
    dialog.getByRole('button', { name: 'Ghế A-1-2 đã được đặt', exact: true }),
  ).toBeDisabled()
  await dialog.getByRole('button', { name: 'Xem khu VIP', exact: true }).click()
  await expect(vip).toHaveAttribute('data-active', 'true')
  await expect(standard).toBeVisible()
  await dialog.getByRole('button', { name: 'Toàn bộ sơ đồ', exact: true }).click()
  await expect(vip).toHaveAttribute('data-active', 'false')
  for (const code of ['V-1-1', 'A-1-1']) {
    await dialog.getByRole('button', { name: `Ghế ${code}`, exact: true }).click()
  }
  await expect(dialog.getByRole('region', { name: 'Vé VIP', exact: true })).toContainText('V-1-1')
  await expect(dialog.getByRole('region', { name: 'Vé Standard', exact: true })).toContainText(
    'A-1-1',
  )
  await expect(dialog.getByLabel('Tổng tiền vé', { exact: true })).toHaveText(
    priceText(vipPrice + standardPrice),
  )
  for (const code of ['V-1-3', 'V-1-4', 'A-1-3', 'A-1-4']) {
    await dialog.getByRole('button', { name: `Ghế ${code}`, exact: true }).click()
  }
  await dialog.getByRole('button', { name: 'Ghế A-1-5', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('tối đa 6 ghế')
  await expect(dialog.getByLabel('Tổng tiền vé', { exact: true })).toHaveText(
    priceText(3 * vipPrice + 3 * standardPrice),
  )
  await dialog.getByRole('button', { name: 'Bỏ ghế V-1-1', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Ghế V-1-1', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await dialog.getByRole('button', { name: 'Ghế A-1-5', exact: true }).focus()
  await page.keyboard.press('Space')
  await expect(dialog.getByRole('button', { name: 'Ghế A-1-5', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(dialog.getByLabel('Tổng tiền vé', { exact: true })).toHaveText(
    priceText(2 * vipPrice + 4 * standardPrice),
  )

  let submitted: { seats: string[]; event: string; action: string; total?: number } | undefined
  await page.route('**/api/ticketnow/bookings', async (route) => {
    submitted = route.request().postDataJSON()
    await route.fulfill({
      status: 409,
      json: { ok: false, error: 'Ghế vừa được giữ. Vui lòng chọn lại.' },
    })
  })
  await dialog.getByRole('button', { name: 'Tiếp tục thanh toán', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Ghế vừa được giữ')
  expect(submitted!.action).toBe('hold')
  expect(submitted!.event).toBeTruthy()
  expect([...submitted!.seats].sort()).toEqual([
    'A-1-1',
    'A-1-3',
    'A-1-4',
    'A-1-5',
    'V-1-3',
    'V-1-4',
  ])
  expect(submitted!.total).toBeUndefined()
})

test('Mobile keeps both tiers, a visible checkout bar and a correctly updated total', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/api/ticketnow/availability**', (route) =>
    route.fulfill({ json: { claims: [] } }),
  )
  const dialog = await openMap(page, context)
  const vip = dialog.getByRole('region', { name: 'Khu VIP', exact: true })
  const standard = dialog.getByRole('region', { name: 'Khu Standard', exact: true })
  await expect(vip).toBeVisible()
  await expect(standard).toBeVisible()
  const expected =
    Number(await vip.getAttribute('data-unit-price')) +
    Number(await standard.getAttribute('data-unit-price'))
  await dialog.getByRole('button', { name: 'Ghế V-1-1', exact: true }).click()
  await dialog.getByRole('button', { name: 'Ghế A-1-1', exact: true }).click()
  await expect(dialog.getByLabel('Tổng tiền thanh toán', { exact: true })).toHaveText(
    priceText(expected),
  )
  await expect(
    dialog.getByRole('button', { name: 'Tiếp tục thanh toán', exact: true }),
  ).toBeInViewport()
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await dialog.getByRole('button', { name: 'Đóng sơ đồ ghế', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await page.getByRole('button', { name: 'Đặt vé ngay', exact: true }).click()
  await expect(dialog.getByLabel('Tổng tiền thanh toán', { exact: true })).toHaveText('0đ')
  await expect(
    dialog.getByRole('button', { name: 'Tiếp tục thanh toán', exact: true }),
  ).toBeDisabled()
})

test('Failed availability can be retried without inventing available seats', async ({
  page,
  context,
}) => {
  let attempts = 0
  await page.route('**/api/ticketnow/availability**', (route) => {
    attempts += 1
    return attempts === 1
      ? route.fulfill({ status: 503, json: { error: 'Temporarily unavailable' } })
      : route.fulfill({ json: { claims: [] } })
  })
  const dialog = await openMap(page, context)
  await expect(dialog.getByText('Chưa tải được tình trạng ghế.', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: /^Ghế / })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Thử lại', exact: true }).click()
  await expect(dialog.getByRole('region', { name: 'Khu VIP', exact: true })).toBeVisible()
  await expect(dialog.getByRole('region', { name: 'Khu Standard', exact: true })).toBeVisible()
})

test('A real mixed-tier hold reaches checkout with server prices, then releases its seats', async ({
  page,
  context,
}) => {
  const signup = await context.request.post('/api/ticketnow/session', {
    headers,
    data: {
      mode: 'signup',
      name: 'Khách kiểm tra sơ đồ',
      email: `seatmap-${randomUUID().slice(0, 8)}@ticketnow.example`,
      password: randomUUID() + randomUUID(),
    },
  })
  expect(signup.status()).toBe(200)
  let bookingId: string | undefined
  try {
    await page.goto('/events/creative-meetup')
    await page.getByRole('button', { name: 'Đặt vé ngay', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Chọn ghế' })
    let expected = 0
    const selectedCodes: string[] = []
    for (const name of ['VIP', 'Standard']) {
      const zone = dialog.getByRole('region', { name: `Khu ${name}`, exact: true })
      await expect(zone).toBeVisible()
      const seat = zone.locator('button[aria-label^="Ghế "]:not([disabled])').first()
      selectedCodes.push((await seat.getAttribute('aria-label'))!.slice('Ghế '.length))
      expected += Number(await zone.getAttribute('data-unit-price'))
      await seat.click()
    }
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/ticketnow/bookings') &&
        response.request().method() === 'POST',
    )
    await dialog.getByRole('button', { name: 'Tiếp tục thanh toán', exact: true }).click()
    const hold = await responsePromise
    expect(hold.status()).toBe(200)
    bookingId = (await hold.json()).id
    await expect(page).toHaveURL(`/checkout/${bookingId}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Chỉ một bước nữa thôi.')
    await expect(page.getByText(priceText(expected), { exact: true }).last()).toBeVisible()
    for (const code of selectedCodes)
      await expect(page.getByText(`Ghế ${code}`, { exact: true })).toBeVisible()
  } finally {
    if (bookingId) {
      const cancel = await context.request.post('/api/ticketnow/bookings', {
        headers,
        data: { action: 'cancel', id: bookingId },
      })
      expect(cancel.status()).toBe(200)
    }
    await context.request.delete('/api/ticketnow/session', { headers })
  }
})
