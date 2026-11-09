import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

type Account = { email: string; password: string; role: string; name: string }
const accounts: Account[] = process.env.TICKETNOW_TEST_ACCOUNTS_FILE
  ? JSON.parse(readFileSync(process.env.TICKETNOW_TEST_ACCOUNTS_FILE, 'utf8'))
  : []
const origin = process.env.TICKETNOW_TEST_URL || `http://localhost:${process.env.PORT || 3000}`
const headers = { Origin: origin }

async function login(context: BrowserContext, account: Account) {
  const response = await context.request.post('/api/ticketnow/session', {
    headers,
    data: { mode: 'login', email: account.email, password: account.password },
  })
  expect(response.status()).toBe(200)
  const session = await context.request.get('/api/ticketnow/session')
  expect((await session.json()).user.role).toBe(account.role)
}
async function post(context: BrowserContext, path: string, data: Record<string, unknown>) {
  return context.request.post(`/api/ticketnow/${path}`, { headers, data })
}

test('Public discovery, filters, images, details and responsive navigation', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Đi tìm khoảnh khắc')
  await expect(page.locator('article')).not.toHaveCount(0)
  const image = page.locator('img').first()
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Sự kiện nổi bật tiếp theo' }).click()
  await expect(page.getByRole('region', { name: 'Sự kiện nổi bật', exact: true })).toContainText(
    '02',
  )
  await page.getByRole('button', { name: 'Workshop', exact: true }).click()
  await expect(page.locator('article')).toHaveCount(1)
  await page.getByRole('button', { name: 'Tất cả sự kiện', exact: true }).click()
  await page.getByRole('textbox', { name: 'Tìm kiếm sự kiện' }).fill('GENfest')
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click()
  await expect(page.locator('article')).toHaveCount(1)
  await page
    .locator('article')
    .getByRole('link', { name: 'GENfest 2026 – Cổng thanh âm mới', exact: true })
    .first()
    .click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('GENfest')
  await page.getByRole('button', { name: 'Thông tin vé', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Chọn trải nghiệm dành cho bạn' })).toBeVisible()
  await page.getByRole('button', { name: 'Đặt vé ngay' }).click()
  await expect(page.getByRole('dialog', { name: 'Chào mừng bạn trở lại!' })).toBeVisible()
  await page.getByRole('button', { name: 'Đóng', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const mobileHero = page.getByRole('region', { name: 'Sự kiện nổi bật', exact: true })
  await expect(mobileHero.getByRole('link', { name: 'Khám phá ngay' })).toBeVisible()
  const ctaBox = await mobileHero.getByRole('link', { name: 'Khám phá ngay' }).boundingBox()
  const previousBox = await mobileHero
    .getByRole('button', { name: 'Sự kiện nổi bật trước' })
    .boundingBox()
  expect(ctaBox!.x + ctaBox!.width).toBeLessThanOrEqual(previousBox!.x)
  await page.getByRole('button', { name: 'Mở điều hướng' }).click()
  await expect(
    page
      .getByRole('navigation', { name: 'Điều hướng di động' })
      .getByRole('link', { name: 'Khám phá sự kiện', exact: true }),
  ).toBeVisible()
  await expect(
    page.locator('a[href^="/organizer"], a[href^="/dashboard/admin"], a[href^="/customer/"]'),
  ).toHaveCount(0)
  expect(errors).toEqual([])
})

test('Customer UI login, server role gates and independent logout', async ({ page, context }) => {
  test.skip(!accounts.length, 'Provide a temporary accounts file for authenticated tests.')
  const customer = accounts.find((a) => a.role === 'customer')!
  await page.goto('/')
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await page.getByLabel('Email', { exact: true }).fill(customer.email)
  await page.getByLabel('Mật khẩu', { exact: true }).fill(customer.password)
  await page.getByRole('dialog').getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page).toHaveURL('/customer/tickets')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Tấm vé')
  await page.goto('/organizer')
  await expect(page.getByRole('heading', { name: 'Khu vực được phân quyền' })).toBeVisible()
  await page.goto('/dashboard/admin')
  await expect(page.getByRole('heading', { name: 'Khu vực được phân quyền' })).toBeVisible()
  const forbidden = await post(context, 'manage', { action: 'role', id: 'other', role: 'admin' })
  expect(forbidden.status()).toBe(403)
  await page.goto('/customer/tickets')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Tấm vé')
  await page.getByRole('button', { name: 'Mở menu tài khoản', exact: true }).click()
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click()
  await expect
    .poll(async () => (await (await context.request.get('/api/ticketnow/session')).json()).user)
    .toBeNull()
  await page.goto('/admin')
  await expect(page.locator('body')).not.toContainText('Application error')
})

test('Signup stays Customer, favorites persist, and logout revokes the native session', async ({
  request,
}) => {
  const password = randomUUID() + randomUUID()
  const response = await request.post('/api/ticketnow/session', {
    headers,
    data: {
      mode: 'signup',
      name: 'Khách trải nghiệm',
      email: `guest-${randomUUID().slice(0, 8)}@ticketnow.example`,
      password,
      role: 'admin',
    },
  })
  expect(response.status()).toBe(200)
  expect((await response.json()).user.role).toBe('customer')
  const originalCookie = response.headers()['set-cookie'].split(';')[0]
  const favorite = await request.post('/api/ticketnow/favorites', {
    headers,
    data: { event: '53ab8201-e7bf-44c2-be0d-38b83df8ca12' },
  })
  expect(favorite.status()).toBe(200)
  const session = await (await request.get('/api/ticketnow/session')).json()
  expect(session.user.favorites).toContain('53ab8201-e7bf-44c2-be0d-38b83df8ca12')
  expect((await request.delete('/api/ticketnow/session', { headers })).status()).toBe(200)
  expect(
    (
      await (
        await request.get('/api/ticketnow/session', { headers: { Cookie: originalCookie } })
      ).json()
    ).user,
  ).toBeNull()
})

test('Organizer creation, durable seat exclusion, payment, refund, scans and Admin RBAC', async ({
  browser,
}) => {
  test.skip(!accounts.length, 'Provide a temporary accounts file for authenticated tests.')
  const [adminAccount, organizerAccount, customerAccount, otherAccount] = accounts
  const contexts = await Promise.all(accounts.map(() => browser.newContext({ baseURL: origin })))
  const [admin, organizer, customer, other] = contexts
  let createdEvent: string | undefined
  try {
    for (let i = 0; i < accounts.length; i++) await login(contexts[i], accounts[i])
    for (const context of [customer, other]) {
      const cleanup = await context.newPage()
      await cleanup.goto('/customer/tickets')
      await expect(cleanup.getByRole('heading', { level: 1 })).toContainText('Tấm vé')
      const pending = cleanup.getByRole('link', { name: 'Thanh toán', exact: true })
      if (await pending.count()) {
        await pending.first().click()
        await expect(cleanup).toHaveURL(/\/checkout\//)
        await expect(cleanup.locator('main')).not.toContainText('Tấm vé đến những kỷ niệm.')
        const cancel = cleanup.getByRole('button', { name: 'Hủy đơn và nhả ghế', exact: true })
        if (await cancel.count()) {
          await cancel.click()
          await expect(cleanup.getByRole('heading', { level: 1 })).toHaveText('Đã hủy')
        }
      }
      await cleanup.close()
    }
    const op = await organizer.newPage()
    await op.goto('/organizer')
    await expect(op.getByRole('heading', { level: 1 })).toContainText('Chào Studio')
    await op.getByRole('button', { name: 'Tạo sự kiện mới' }).first().click()
    const dialog = op.getByRole('dialog', { name: 'Tạo sự kiện' })
    const title = `Acoustic Garden – Những giai điệu bên hiên ${randomUUID().slice(0, 4)}`
    await dialog.getByLabel('Tên sự kiện', { exact: true }).fill(title)
    await dialog.getByLabel('Địa điểm', { exact: true }).fill('Hiên Music Space')
    await dialog.getByLabel('Ngày & Giờ diễn ra', { exact: true }).fill('2027-02-20T19:00')
    await dialog
      .getByLabel('Mô tả sự kiện', { exact: true })
      .fill(
        'Một đêm acoustic gần gũi giữa không gian xanh, nơi những giai điệu mộc mạc kết nối bạn bè và những tâm hồn đồng điệu.',
      )
    for (let step = 0; step < 3; step++) {
      await dialog.getByRole('button', { name: 'Tiếp theo', exact: true }).click()
    }
    await dialog.getByRole('button', { name: 'Lưu bản nháp' }).click()
    await expect(dialog).toHaveCount(0)
    const row = op.getByRole('row').filter({ hasText: title })
    await expect(row).toBeVisible()
    await row.getByRole('combobox').selectOption('on_sale')
    await op
      .getByRole('dialog', { name: 'Xác nhận thay đổi' })
      .getByRole('button', { name: 'Xác nhận', exact: true })
      .click()
    await expect(op.getByRole('dialog')).toHaveCount(0)
    const link = row.getByRole('link', { name: `Mở ${title}` })
    await expect(link).toBeVisible()
    const url = await link.getAttribute('href')
    const ep = await customer.newPage()
    await ep.goto(url!)
    await expect(ep.getByRole('heading', { level: 1 })).toHaveText(title)
    const availabilityPromise = ep.waitForResponse((r) =>
      r.url().includes('/api/ticketnow/availability'),
    )
    await ep.getByRole('button', { name: 'Đặt vé ngay', exact: true }).click()
    const availability = await availabilityPromise
    const id = new URL(availability.url()).searchParams.get('event')!
    createdEvent = id
    await ep.getByRole('button', { name: 'Ghế A-1-1', exact: true }).click()
    await ep.getByRole('button', { name: 'Tiếp tục thanh toán', exact: true }).click()
    await expect(ep).toHaveURL(/\/checkout\//)
    const bookingId = ep.url().split('/').pop()!
    await expect(ep.getByRole('heading', { level: 1 })).toHaveText('Chỉ một bước nữa thôi.')
    const clash = await post(other, 'bookings', {
      action: 'hold',
      event: id,
      seats: ['A-1-1'],
      key: randomUUID(),
    })
    expect(clash.status()).toBe(400)
    expect((await clash.json()).error).toContain('Ghế')
    const privatePage = await other.request.get(`/checkout/${bookingId}`)
    expect(await privatePage.text()).not.toContain('Chỉ một bước nữa thôi.')
    const tooMany = await post(other, 'bookings', {
      action: 'hold',
      event: id,
      seats: Array.from({ length: 7 }, (_, i) => `A-2-${i + 1}`),
      key: randomUUID(),
    })
    expect(tooMany.status()).toBe(400)
    await ep.getByRole('checkbox').check()
    await ep.getByRole('button', { name: 'Thanh toán mô phỏng', exact: true }).click()
    await expect(ep.getByRole('heading', { level: 1 })).toContainText('Bạn đã sẵn sàng')
    const repeat = await post(customer, 'bookings', {
      action: 'pay',
      id: bookingId,
      method: 'bank',
    })
    expect(repeat.status()).toBe(200)
    await ep.getByRole('link', { name: 'Xem vé QR của tôi' }).click()
    await ep.getByRole('button', { name: 'Xem vé QR', exact: true }).first().click()
    await expect(
      ep.getByRole('dialog', { name: 'Vé điện tử' }).locator('svg').first(),
    ).toBeVisible()
    await ep.getByRole('button', { name: 'Đóng vé' }).click()
    // Read only through the authenticated application session.
    // Retrieve the token from a server-rendered ticket page's serialized booking props.
    const html = await (await customer.request.get('/customer/tickets')).text()
    const tokenMatch = html.match(/ticketToken[\\]*":(?:[\\]*")([a-f0-9-]{36})/)
    expect(tokenMatch).not.toBeNull()
    const token = `TN:${tokenMatch![1]}:A-1-1`
    const scan = await post(organizer, 'scan', { token })
    expect(scan.status()).toBe(200)
    const scannedAgain = await post(organizer, 'scan', { token })
    expect(scannedAgain.status()).toBe(400)
    const usedRefund = await post(customer, 'bookings', { id: bookingId, action: 'refund' })
    expect(usedRefund.status()).toBe(400)
    const holdResponse = await post(other, 'bookings', {
      action: 'hold',
      event: id,
      seats: ['A-1-2'],
      key: randomUUID(),
    })
    expect(holdResponse.status()).toBe(200)
    const otherId = (await holdResponse.json()).id
    expect(
      (await post(other, 'bookings', { action: 'pay', id: otherId, method: 'wallet' })).status(),
    ).toBe(200)
    expect((await post(other, 'bookings', { action: 'refund', id: otherId })).status()).toBe(200)
    const freshAvailability = await (
      await customer.request.get(`/api/ticketnow/availability?event=${id}`)
    ).json()
    expect(freshAvailability.claims.some((c: { code: string }) => c.code === 'A-1-2')).toBe(false)
    const racing = await Promise.all(
      [customer, other].map((context) =>
        post(context, 'bookings', {
          action: 'hold',
          event: id,
          seats: ['A-2-1', 'A-2-2'],
          key: randomUUID(),
        }),
      ),
    )
    expect(racing.map((r) => r.status()).sort()).toEqual([200, 400])
    const winnerIndex = racing.findIndex((r) => r.status() === 200)
    const winnerId = (await racing[winnerIndex].json()).id
    expect(
      (
        await post([customer, other][winnerIndex], 'bookings', { action: 'cancel', id: winnerId })
      ).status(),
    ).toBe(200)
    const afterCancel = await (
      await customer.request.get(`/api/ticketnow/availability?event=${id}`)
    ).json()
    expect(
      afterCancel.claims.some((c: { code: string }) => ['A-2-1', 'A-2-2'].includes(c.code)),
    ).toBe(false)
    const adminSession = (await (await admin.request.get('/api/ticketnow/session')).json()).user
    const otherSession = (await (await other.request.get('/api/ticketnow/session')).json()).user
    expect(
      (
        await post(organizer, 'manage', { action: 'role', id: otherSession.id, role: 'admin' })
      ).status(),
    ).toBe(403)
    expect(
      (
        await post(admin, 'manage', { action: 'role', id: adminSession.id, role: 'customer' })
      ).status(),
    ).toBe(400)
    expect(
      (
        await post(admin, 'manage', { action: 'role', id: otherSession.id, role: 'organizer' })
      ).status(),
    ).toBe(200)
    expect((await (await other.request.get('/api/ticketnow/session')).json()).user.role).toBe(
      'organizer',
    )
    expect(
      (
        await post(admin, 'manage', { action: 'role', id: otherSession.id, role: 'customer' })
      ).status(),
    ).toBe(200)
    const ap = await admin.newPage()
    await ap.goto('/dashboard/admin')
    await expect(ap.getByRole('heading', { level: 1 })).toContainText('Chào Operations')
    await ap.getByRole('button', { name: 'Tài khoản & Phân quyền', exact: true }).first().click()
    await expect(ap.getByRole('combobox', { name: 'Phân quyền TicketNow Studio' })).toBeVisible()
  } finally {
    if (createdEvent)
      await post(organizer, 'manage', { action: 'status', id: createdEvent, status: 'closed' })
    await Promise.all(contexts.map((c) => c.close()))
  }
})
