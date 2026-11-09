import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

type Account = { email: string; password: string; role: string; name: string }
const accounts: Account[] = process.env.TICKETNOW_TEST_ACCOUNTS_FILE
  ? JSON.parse(readFileSync(process.env.TICKETNOW_TEST_ACCOUNTS_FILE, 'utf8'))
  : []
const origin = process.env.TICKETNOW_TEST_URL || `http://localhost:${process.env.PORT || 3000}`
const headers = { Origin: origin }
const workspaces = {
  customer: { href: '/customer/tickets', label: 'Vé của tôi' },
  organizer: { href: '/organizer', label: 'Không gian Organizer' },
  admin: { href: '/dashboard/admin', label: 'Quản trị Admin' },
}
const privateLinks =
  'a[href^="/customer/"], a[href^="/checkout/"], a[href^="/organizer"], a[href^="/dashboard/admin"], a[href="/admin"]'

async function expectNoForeignLinks(page: Page, role?: keyof typeof workspaces) {
  for (const [key, workspace] of Object.entries(workspaces)) {
    if (key !== role) await expect(page.locator(`a[href^="${workspace.href}"]`)).toHaveCount(0)
  }
  await expect(page.locator('a[href="/admin"]')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Tạo sự kiện', exact: true })).toHaveCount(0)
}

test('Guest navigation and footer contain no personal or staff entry points', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Đăng nhập', exact: true })).toBeVisible()
  await expect(page.locator(privateLinks)).toHaveCount(0)
  await expect(page.getByText('Trở thành nhà tổ chức', { exact: true })).toHaveCount(0)
  await expect(page.getByText('DÀNH CHO NHÀ TỔ CHỨC', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Tổ chức sự kiện ngay', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Tạo sự kiện mới', exact: true })).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Mở điều hướng', exact: true }).click()
  const mobile = page.getByRole('navigation', { name: 'Điều hướng di động' })
  await expect(mobile.getByRole('link', { name: 'Khám phá sự kiện', exact: true })).toBeVisible()
  await expect(mobile.getByRole('button', { name: 'Trung tâm hỗ trợ', exact: true })).toBeVisible()
  await expect(page.locator(privateLinks)).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await page.getByRole('button', { name: 'Đăng ký ngay', exact: true }).click()
  const form = page.getByRole('dialog')
  await expect(form.getByRole('combobox')).toHaveCount(0)
  await expect(form).toContainText('Đăng ký công khai chỉ dành cho Customer.')
  await expect(form).toContainText('được quản trị viên cấp riêng')
  for (const endpoint of ['manage', 'upload', 'scan']) {
    const response = await context.request.post(`/api/ticketnow/${endpoint}`, {
      headers,
      data: { action: 'create' },
    })
    expect(response.status()).toBe(403)
  }
  expect(
    (
      await context.request.post('/api/ticketnow/bookings', { headers, data: { action: 'hold' } })
    ).status(),
  ).toBe(401)
})

test('Private tabs never flash while the session is loading', async ({ page }) => {
  let releaseSession!: () => void
  const gate = new Promise<void>((resolve) => {
    releaseSession = resolve
  })
  await page.route('**/api/ticketnow/session', async (route) => {
    await gate
    await route.continue()
  })
  await page.goto('/')
  await expect(page.getByRole('status', { name: 'Đang kiểm tra phiên đăng nhập' })).toBeVisible()
  await expect(page.locator(privateLinks)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Đăng nhập', exact: true })).toHaveCount(0)
  releaseSession()
  await expect(page.getByRole('button', { name: 'Đăng nhập', exact: true })).toBeVisible()
  await expect(page.locator(privateLinks)).toHaveCount(0)
})

for (const role of ['customer', 'organizer', 'admin'] as const) {
  test(`${role} sees only its own navigation on desktop and mobile, including after reload`, async ({
    page,
    context,
  }) => {
    const account = accounts.find((account) => account.role === role)
    test.skip(!account, 'Provide temporary credentials for authenticated verification.')
    const workspace = workspaces[role]
    await page.goto('/')
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await page.getByLabel('Email', { exact: true }).fill(account!.email)
    await page.getByLabel('Mật khẩu', { exact: true }).fill(account!.password)
    await page.getByRole('dialog').getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await expect(page).toHaveURL(workspace.href)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      role === 'customer' ? 'Tấm vé' : 'Chào',
    )
    await expect(
      page
        .getByRole('navigation', { name: 'Điều hướng chính' })
        .getByRole('link', { name: workspace.label, exact: true }),
    ).toBeVisible()
    await expectNoForeignLinks(page, role)
    if (role === 'customer') {
      await expect(page.getByRole('button', { name: /^Vé của tôi/ })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Tạo sự kiện mới', exact: true })).toHaveCount(
        0,
      )
      await expect(
        page.getByRole('button', { name: 'Tài khoản & Phân quyền', exact: true }),
      ).toHaveCount(0)
    } else {
      await expect(
        page
          .getByRole('button', {
            name: role === 'admin' ? 'Tất cả sự kiện' : 'Sự kiện của tôi',
            exact: true,
          })
          .first(),
      ).toBeVisible()
      if (role === 'admin') {
        await expect(
          page.getByRole('button', { name: 'Tài khoản & Phân quyền', exact: true }).first(),
        ).toBeVisible()
      } else {
        await expect(
          page.getByRole('button', { name: 'Tài khoản & Phân quyền', exact: true }),
        ).toHaveCount(0)
      }
    }
    await page.getByRole('button', { name: 'Mở menu tài khoản', exact: true }).click()
    await expect(
      page
        .getByRole('navigation', { name: 'Menu tài khoản' })
        .locator(`a[href="${workspace.href}"]`),
    ).toHaveCount(1)
    await expectNoForeignLinks(page, role)
    await page.reload()
    await expect(page.getByRole('button', { name: 'Mở menu tài khoản', exact: true })).toBeVisible()
    await expectNoForeignLinks(page, role)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: 'Mở điều hướng', exact: true }).click()
    await expect(
      page
        .getByRole('navigation', { name: 'Điều hướng di động' })
        .getByRole('link', { name: workspace.label, exact: true }),
    ).toBeVisible()
    await expectNoForeignLinks(page, role)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('button', { name: 'Mở điều hướng', exact: true }).click()

    if (role !== 'customer') {
      await page.goto('/events/genfest-2026')
      await expect(
        page.getByRole('link', { name: 'Về không gian quản lý', exact: true }),
      ).toHaveAttribute('href', workspace.href)
      await expect(page.getByRole('button', { name: 'Đặt vé ngay', exact: true })).toHaveCount(0)
      expect(
        (
          await context.request.post('/api/ticketnow/bookings', {
            headers,
            data: { action: 'hold' },
          })
        ).status(),
      ).toBe(403)
    } else {
      for (const endpoint of ['manage', 'upload', 'scan']) {
        expect(
          (
            await context.request.post(`/api/ticketnow/${endpoint}`, {
              headers,
              data: { action: 'create' },
            })
          ).status(),
        ).toBe(403)
      }
    }
    if (role === 'organizer') {
      expect(
        (
          await context.request.post('/api/ticketnow/manage', {
            headers,
            data: { action: 'role', id: 'not-a-user', role: 'admin' },
          })
        ).status(),
      ).toBe(403)
    }
    for (const [otherRole, otherWorkspace] of Object.entries(workspaces)) {
      if (otherRole === role) continue
      await page.goto(otherWorkspace.href)
      await expect(
        page.getByRole('heading', { name: 'Khu vực được phân quyền', exact: true }),
      ).toBeVisible()
      await expect(
        page.getByRole('link', { name: 'Về không gian của tôi', exact: true }),
      ).toHaveAttribute('href', workspace.href)
      await expectNoForeignLinks(page, role)
    }
    await page.getByRole('button', { name: 'Mở menu tài khoản', exact: true }).click()
    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click()
    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Đi tìm khoảnh khắc')
    await expect(page.getByRole('button', { name: 'Đăng nhập', exact: true })).toBeVisible()
    await expect(page.locator(privateLinks)).toHaveCount(0)
  })
}
