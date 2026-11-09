import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import {
  createSeatLayout,
  getSeatLayoutIssues,
  hasSeatLayout,
  LAYOUT_TEMPLATES,
  parseSeatLayout,
  readSeatLayout,
  SeatLayoutError,
} from '../src/lib/seat-layout'
import { getTicketTierViews, type TicketTier } from '../src/lib/ticket-tiers'

type Account = { name: string; email: string; password: string; role: string }
const accounts: Account[] = process.env.TICKETNOW_TEST_ACCOUNTS_FILE
  ? JSON.parse(readFileSync(process.env.TICKETNOW_TEST_ACCOUNTS_FILE, 'utf8'))
  : []
const origin = process.env.TICKETNOW_TEST_URL || `http://localhost:${process.env.PORT || 3000}`
const headers = { Origin: origin }
const tiers: TicketTier[] = [
  { name: 'VIP', code: 'V', price: 1000000, rows: 3, seatsPerRow: 8 },
  { name: 'Standard', code: 'A', price: 500000, rows: 4, seatsPerRow: 10 },
  { name: 'Circle', code: 'C', price: 250000, rows: 2, seatsPerRow: 6 },
  { name: 'Balcony', code: 'B', price: 150000, rows: 2, seatsPerRow: 10 },
]

async function signIn(context: BrowserContext, role: string) {
  const account = accounts.find((account) => account.role === role)
  test.skip(!account, 'Provide temporary app credentials for integration verification.')
  expect(
    (
      await context.request.post('/api/ticketnow/session', {
        headers,
        data: { mode: 'login', email: account!.email, password: account!.password },
      })
    ).status(),
  ).toBe(200)
}
async function openBuilder(page: Page, context: BrowserContext) {
  await signIn(context, 'organizer')
  await page.goto('/organizer')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Chào')
  await page.getByRole('button', { name: 'Tạo sự kiện mới', exact: true }).first().click()
  return page.getByRole('dialog', { name: 'Tạo sự kiện', exact: true })
}
async function fillInfo(page: Page, title: string) {
  const dialog = page.getByRole('dialog', { name: 'Tạo sự kiện', exact: true })
  await dialog.getByLabel('Tên sự kiện', { exact: true }).fill(title)
  await dialog.getByLabel('Địa điểm', { exact: true }).fill('Mộc Music Space')
  await dialog.getByLabel('Ngày & Giờ diễn ra', { exact: true }).fill('2027-03-20T19:30')
  await dialog
    .getByLabel('Mô tả sự kiện', { exact: true })
    .fill(
      'Một đêm nhạc mộc mạc trong không gian gần gũi, kết nối những người yêu âm nhạc và những câu chuyện chân thành qua từng giai điệu.',
    )
}

test('Every floorplan template fits one to four real tier grids without collisions', () => {
  const original = JSON.stringify(tiers)
  for (const template of LAYOUT_TEMPLATES) {
    for (let count = 1; count <= 4; count++) {
      const subset = tiers.slice(0, count)
      const layout = createSeatLayout(subset, template.value)
      expect(getSeatLayoutIssues(layout, subset)).toEqual([])
      expect(parseSeatLayout(layout, subset)).toEqual(layout)
      expect(layout.zones.map((zone) => zone.tierCode)).toEqual(subset.map((tier) => tier.code))
    }
  }
  expect(JSON.stringify(tiers)).toBe(original)
})

test('Stored geometry rejects overlaps, invalid references, nonfinite coordinates and duplicate colors', () => {
  const layout = createSeatLayout(tiers.slice(0, 2))
  const bad = structuredClone(layout)
  bad.zones[0].y = bad.stage.y
  expect(() => parseSeatLayout(bad, tiers.slice(0, 2))).toThrow(SeatLayoutError)
  bad.zones[0].x = Number.POSITIVE_INFINITY
  expect(() => parseSeatLayout(bad, tiers.slice(0, 2))).toThrow(SeatLayoutError)
  const colors = structuredClone(layout)
  colors.zones[1].color = colors.zones[0].color
  expect(() => parseSeatLayout(colors, tiers.slice(0, 2))).toThrow('màu riêng')
  const outside = structuredClone(layout)
  outside.zones[0].x = 99
  expect(() => parseSeatLayout(outside, tiers.slice(0, 2))).toThrow('nằm hoàn toàn')
  const foreign = structuredClone(layout)
  foreign.zones[0].tierCode = 'FAKE'
  expect(() => parseSeatLayout(foreign, tiers.slice(0, 2))).toThrow('không thuộc')
  const normalized = parseSeatLayout(
    { ...layout, owner: 'forged', stage: { ...layout.stage, secret: 'not-a-field' } },
    tiers.slice(0, 2),
  )
  expect(normalized).not.toHaveProperty('owner')
  expect(normalized.stage).not.toHaveProperty('secret')
})

test('Legacy events stay unconfigured and tier colors follow saved assignments rather than price rank', () => {
  const empty = { stage: { label: null, x: null, y: null, width: null, height: null }, zones: [] }
  expect(hasSeatLayout(empty)).toBe(false)
  expect(readSeatLayout(empty, tiers)).toBeNull()
  expect(readSeatLayout(undefined, tiers)).toBeNull()
  const layout = createSeatLayout(tiers.slice(0, 2))
  layout.zones[0].color = 'blue'
  const views = getTicketTierViews(
    [
      { ...tiers[0], price: 100 },
      { ...tiers[1], price: 200 },
    ],
    layout.zones,
  )
  expect(views.find((view) => view.tier.code === 'V')!.theme.color).toBe('blue')
  expect(layout.zones[0].y).toBe(23)
})

test('The studio validates steps, supports dragging, resizing, keyboard movement and overlap repair', async ({
  page,
  context,
}) => {
  const dialog = await openBuilder(page, context)
  await dialog.getByRole('button', { name: 'Tiếp theo', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Tên sự kiện')
  await fillInfo(page, 'Mộc Live – Trải nghiệm thiết kế mặt bằng')
  await dialog.getByRole('button', { name: 'Tiếp theo', exact: true }).click()
  await expect(
    dialog.getByRole('heading', { name: 'Thiết kế lựa chọn cho khách tham dự' }),
  ).toBeVisible()
  await dialog.getByLabel('Màu khu hạng 1', { exact: true }).selectOption('blue')
  await dialog.getByRole('button', { name: 'Thêm hạng vé', exact: true }).click()
  await expect(dialog.getByLabel('Mã khu hạng 3', { exact: true })).toHaveValue('B')
  await dialog.getByRole('button', { name: 'Xóa hạng vé 3', exact: true }).click()
  await dialog.getByRole('button', { name: 'Tiếp theo', exact: true }).click()
  const canvas = dialog.getByRole('group', { name: 'Trình thiết kế mặt bằng', exact: true })
  await expect(canvas).toBeVisible()
  await dialog.getByLabel('Tên sân khấu', { exact: true }).fill('Sân khấu Studio')
  const stage = dialog.getByRole('button', { name: 'Chọn sân khấu', exact: true })
  const svgBox = (await canvas.boundingBox())!
  const stageBox = (await stage.boundingBox())!
  await page.mouse.move(stageBox.x + stageBox.width / 2, stageBox.y + stageBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(
    stageBox.x + stageBox.width / 2 + svgBox.width * 0.04,
    stageBox.y + stageBox.height / 2 + svgBox.height * 0.02,
    { steps: 5 },
  )
  await page.mouse.up()
  await expect(dialog.getByLabel('Vị trí X (%)', { exact: true })).toHaveValue('24')
  await expect(dialog.getByLabel('Vị trí Y (%)', { exact: true })).toHaveValue('6')
  const handle = dialog.getByRole('button', { name: 'Đổi kích thước sân khấu', exact: true })
  const handleBox = (await handle.boundingBox())!
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(
    handleBox.x + handleBox.width / 2 + svgBox.width * 0.05,
    handleBox.y + handleBox.height / 2 + svgBox.height * 0.02,
    { steps: 5 },
  )
  await page.mouse.up()
  await expect(dialog.getByLabel('Rộng (%)', { exact: true })).toHaveValue('65')
  await expect(dialog.getByLabel('Cao (%)', { exact: true })).toHaveValue('12')
  await stage.focus()
  await page.keyboard.press('Shift+ArrowRight')
  await expect(dialog.getByLabel('Vị trí X (%)', { exact: true })).toHaveValue('29')
  await dialog.getByLabel('Vị trí Y (%)', { exact: true }).fill('30')
  await expect(dialog.getByRole('alert').first()).toContainText('chồng lên sân khấu')
  await dialog.getByRole('button', { name: 'Tiếp theo', exact: true }).click()
  await expect(canvas).toBeVisible()
  await dialog.getByLabel('Mẫu bố trí', { exact: true }).selectOption('side-stage')
  await expect(dialog.getByText('Mặt bằng hợp lệ · Các khu không chồng lấn')).toBeVisible()
  await expect(dialog.getByLabel('Tên sân khấu', { exact: true })).toHaveValue('Sân khấu Studio')
  await dialog.getByRole('button', { name: 'VIP', exact: true }).click()
  await expect(canvas.locator('[data-tier-code="V"]')).toHaveAttribute('data-color', 'blue')
  await dialog.getByLabel('Chừa lối đi giữa khu').uncheck()
  await expect(canvas.locator('[data-tier-code="V"]')).toHaveAttribute('data-aisle', 'false')
  await dialog.getByRole('button', { name: 'Phóng to sơ đồ', exact: true }).click()
  await expect(dialog.getByText('150%', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Vừa khung sơ đồ', exact: true }).click()
  await expect(dialog.getByText('100%', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Đóng tạo sự kiện', exact: true }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Tiếp tục sửa', exact: true })
    .click()
  await expect(canvas).toBeVisible()
})

test('The creation studio keeps controls usable on a phone', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const dialog = await openBuilder(page, context)
  await fillInfo(page, 'Mộc Studio – Thiết kế trên điện thoại')
  await dialog.getByRole('button', { name: 'Tiếp theo', exact: true }).click()
  await dialog.getByRole('button', { name: 'Tiếp theo', exact: true }).click()
  await expect(dialog.getByRole('group', { name: 'Trình thiết kế mặt bằng' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await expect(dialog.getByRole('button', { name: 'Tiếp theo', exact: true })).toBeInViewport()
  await dialog.getByLabel('Mẫu bố trí', { exact: true }).selectOption('center-stage')
  await expect(dialog.getByText('Mặt bằng hợp lệ · Các khu không chồng lấn')).toBeVisible()
})

test('A saved and edited seat map is used by customers, keeps server prices and locks after publication', async ({
  page,
  context,
  browser,
}) => {
  const dialog = await openBuilder(page, context)
  const title = `Mộc Live – Không gian kết nối ${randomUUID().slice(0, 5)}`
  let eventId: string | undefined
  let eventSlug: string | undefined
  let bookingId: string | undefined
  const customer = await browser.newContext({
    baseURL: origin,
    viewport: { width: 1440, height: 1000 },
  })
  try {
    await fillInfo(page, title)
    const poster = await sharp({
      create: { width: 640, height: 360, channels: 3, background: '#173b30' },
    })
      .png()
      .toBuffer()
    await dialog
      .getByLabel('Ảnh bìa sự kiện')
      .setInputFiles({ name: 'moc-live-poster.png', mimeType: 'image/png', buffer: poster })
    await dialog.getByRole('button', { name: 'Tiếp theo', exact: true }).click()
    await dialog.getByLabel('Màu khu hạng 1', { exact: true }).selectOption('blue')
    await dialog.getByRole('button', { name: 'Tiếp theo', exact: true }).click()
    await dialog.getByLabel('Mẫu bố trí', { exact: true }).selectOption('side-stage')
    await dialog.getByLabel('Tên sân khấu', { exact: true }).fill('Sân khấu Mộc Live')
    await dialog.getByRole('button', { name: 'VIP', exact: true }).click()
    await dialog.getByLabel('Vị trí Y (%)', { exact: true }).fill('54')
    await dialog.getByLabel('Chừa lối đi giữa khu').uncheck()
    await dialog.getByRole('button', { name: 'Standard', exact: true }).click()
    await dialog.getByLabel('Vị trí Y (%)', { exact: true }).fill('6')
    await dialog.getByRole('button', { name: 'Tiếp theo', exact: true }).click()
    await expect(
      dialog.getByRole('heading', { name: 'Seat map khách hàng sẽ nhìn thấy' }),
    ).toBeVisible()
    const creation = page.waitForResponse(
      (response) =>
        response.url().includes('/api/ticketnow/manage') && response.request().method() === 'POST',
    )
    await dialog.getByRole('button', { name: 'Lưu bản nháp', exact: true }).click()
    const createResponse = await creation
    expect(createResponse.status()).toBe(200)
    const created = await createResponse.json()
    eventId = created.id
    eventSlug = created.slug
    await expect(dialog).toHaveCount(0)
    const row = page.getByRole('row').filter({ hasText: title })
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: `Sửa bản nháp ${title}`, exact: true }).click()
    const edit = page.getByRole('dialog', { name: 'Tạo sự kiện', exact: true })
    await expect(edit.getByLabel('Tên sự kiện', { exact: true })).toHaveValue(title)
    await edit.getByRole('button', { name: 'Tiếp theo', exact: true }).click()
    await edit.getByRole('button', { name: 'Tiếp theo', exact: true }).click()
    await expect(edit.locator('[data-tier-code="V"]')).toHaveAttribute('data-y', '54')
    await expect(edit.locator('[data-tier-code="A"]')).toHaveAttribute('data-y', '6')
    await expect(edit.locator('[data-tier-code="V"]')).toHaveAttribute('data-color', 'blue')
    await expect(edit.locator('[data-tier-code="V"]')).toHaveAttribute('data-aisle', 'false')
    await edit.getByLabel('Tên sân khấu', { exact: true }).fill('Sân khấu Mộc Live đã lưu')
    await edit.getByRole('button', { name: 'Tiếp theo', exact: true }).click()
    await edit.getByRole('button', { name: 'Lưu thay đổi bản nháp', exact: true }).click()
    await expect(edit).toHaveCount(0)
    await row.getByRole('button', { name: `Xem sơ đồ ${title}`, exact: true }).click()
    await expect(
      page.getByRole('dialog', { name: 'Xem sơ đồ sự kiện' }).locator('[data-stage-label]'),
    ).toHaveAttribute('data-stage-label', 'Sân khấu Mộc Live đã lưu')
    await page.getByRole('button', { name: 'Đóng xem sơ đồ', exact: true }).click()
    await row.getByRole('combobox').selectOption('on_sale')
    await page
      .getByRole('dialog', { name: 'Xác nhận thay đổi' })
      .getByRole('button', { name: 'Xác nhận', exact: true })
      .click()
    await expect(row.getByRole('combobox')).toHaveValue('on_sale')
    await expect(
      row.getByRole('button', { name: `Sửa bản nháp ${title}`, exact: true }),
    ).toHaveCount(0)
    const locked = await context.request.post('/api/ticketnow/manage', {
      headers,
      data: { action: 'update', id: eventId },
    })
    expect(locked.status()).toBe(400)

    const signup = await customer.request.post('/api/ticketnow/session', {
      headers,
      data: {
        mode: 'signup',
        name: 'Khách trải nghiệm mặt bằng',
        email: `floorplan-${randomUUID().slice(0, 7)}@ticketnow.example`,
        password: randomUUID() + randomUUID(),
      },
    })
    expect(signup.status()).toBe(200)
    const cp = await customer.newPage()
    await cp.goto(`/events/${eventSlug}`)
    await expect(cp.getByRole('heading', { level: 1 })).toHaveText(title)
    await expect
      .poll(() =>
        cp
          .locator('main img')
          .first()
          .evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0)
    await cp.getByRole('button', { name: 'Đặt vé ngay', exact: true }).click()
    const map = cp.getByRole('dialog', { name: 'Chọn ghế' })
    await expect(map.locator('[data-layout-source="organizer"]')).toBeVisible()
    await expect(map.locator('[data-stage-label]')).toHaveAttribute(
      'data-stage-label',
      'Sân khấu Mộc Live đã lưu',
    )
    const vip = map.getByRole('region', { name: 'Khu VIP', exact: true })
    const standard = map.getByRole('region', { name: 'Khu Standard', exact: true })
    await expect(vip).toHaveAttribute('data-y', '54')
    await expect(standard).toHaveAttribute('data-y', '6')
    await expect(vip).toHaveAttribute('data-color', 'blue')
    expect((await vip.boundingBox())!.y).toBeGreaterThan((await standard.boundingBox())!.y)
    await map.getByRole('button', { name: 'Ghế V-1-1', exact: true }).click()
    await map.getByRole('button', { name: 'Ghế A-1-1', exact: true }).focus()
    await cp.keyboard.press('Space')
    await expect(map.getByLabel('Tổng tiền vé', { exact: true })).toHaveText('1.500.000đ')
    const holdPromise = cp.waitForResponse(
      (response) =>
        response.url().includes('/api/ticketnow/bookings') &&
        response.request().method() === 'POST',
    )
    await map.getByRole('button', { name: 'Tiếp tục thanh toán', exact: true }).click()
    const hold = await holdPromise
    expect(hold.status()).toBe(200)
    bookingId = (await hold.json()).id
    await expect(cp).toHaveURL(`/checkout/${bookingId}`)
    await expect(cp.getByText('1.500.000đ', { exact: true }).last()).toBeVisible()
    writeFileSync(
      '/tmp/ticketnow-builder-proof.json',
      JSON.stringify({
        id: eventId,
        slug: eventSlug,
        title,
        stageLabel: 'Sân khấu Mộc Live đã lưu',
        vipY: 54,
        standardY: 6,
        priceVerified: true,
      }),
    )
  } finally {
    if (bookingId)
      expect(
        (
          await customer.request.post('/api/ticketnow/bookings', {
            headers,
            data: { action: 'cancel', id: bookingId },
          })
        ).status(),
      ).toBe(200)
    await customer.request.delete('/api/ticketnow/session', { headers })
    await customer.close()
    if (eventId)
      expect(
        (
          await context.request.post('/api/ticketnow/manage', {
            headers,
            data: { action: 'status', id: eventId, status: 'closed' },
          })
        ).status(),
      ).toBe(200)
  }
})

test('Malformed new layouts and cross-role creation are rejected at the server', async ({
  request,
}) => {
  const customer = accounts.find((account) => account.role === 'customer')
  const organizer = accounts.find((account) => account.role === 'organizer')
  test.skip(!customer || !organizer, 'Provide app credentials for authorization checks.')
  await request.post('/api/ticketnow/session', {
    headers,
    data: { mode: 'login', email: customer!.email, password: customer!.password },
  })
  expect(
    (await request.post('/api/ticketnow/manage', { headers, data: { action: 'create' } })).status(),
  ).toBe(403)
  await request.delete('/api/ticketnow/session', { headers })
  await request.post('/api/ticketnow/session', {
    headers,
    data: { mode: 'login', email: organizer!.email, password: organizer!.password },
  })
  const layout = createSeatLayout(tiers.slice(0, 2))
  layout.zones[0].x = 99
  const invalid = await request.post('/api/ticketnow/manage', {
    headers,
    data: {
      action: 'create',
      title: 'Mặt bằng không hợp lệ không được lưu',
      description: 'Kiểm tra từ chối tọa độ vượt khung trước khi tạo bất kỳ bản nháp nào.',
      venue: 'Mộc Music Space',
      city: 'TP. Hồ Chí Minh',
      category: 'Âm nhạc',
      date: '2027-03-20T12:30:00Z',
      tiers: tiers.slice(0, 2),
      seatLayout: layout,
    },
  })
  expect(invalid.status()).toBe(422)
  expect((await invalid.json()).errors.join(' ')).toContain('nằm hoàn toàn')
})
