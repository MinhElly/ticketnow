import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

type Account = { email: string; password: string; role: string; name: string }
const accounts: Account[] = process.env.TICKETNOW_TEST_ACCOUNTS_FILE
  ? JSON.parse(readFileSync(process.env.TICKETNOW_TEST_ACCOUNTS_FILE, 'utf8'))
  : []

for (const scenario of [
  { role: 'customer', start: '/dashboard/admin', destination: '/customer/tickets' },
  { role: 'organizer', start: '/organizer', destination: '/organizer' },
  { role: 'admin', start: '/events/genfest-2026', destination: '/dashboard/admin' },
]) {
  test(`${scenario.role} login automatically opens its own workspace`, async ({
    page,
    context,
  }) => {
    const account = accounts.find((account) => account.role === scenario.role)
    test.skip(!account, 'Provide a temporary accounts file for authenticated tests.')
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(scenario.start)
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await page.getByLabel('Email', { exact: true }).fill(account!.email)
    await page.getByLabel('Mật khẩu', { exact: true }).fill(account!.password)
    await page.getByRole('dialog').getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page).toHaveURL(scenario.destination)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      scenario.role === 'customer' ? 'Tấm vé' : 'Chào',
    )
    await expect(page.getByRole('button', { name: 'Đăng nhập', exact: true })).toHaveCount(0)
    const session = await (await context.request.get('/api/ticketnow/session')).json()
    expect(session.user.role).toBe(scenario.role)
    expect(errors).toEqual([])
  })
}

test('Invalid credentials stay on the current page and display an error', async ({
  page,
  context,
}) => {
  await page.goto('/events/genfest-2026')
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await page.getByLabel('Email', { exact: true }).fill(`missing-${randomUUID()}@ticketnow.example`)
  await page.getByLabel('Mật khẩu', { exact: true }).fill('Invalid-login-attempt-only')
  await page.getByRole('dialog').getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'Email hoặc mật khẩu chưa đúng.',
  )
  await expect(page).toHaveURL('/events/genfest-2026')
  expect((await (await context.request.get('/api/ticketnow/session')).json()).user).toBeNull()
})
