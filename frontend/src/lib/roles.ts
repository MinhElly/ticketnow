import type { User } from '@/payload-types'

export type AppRole = User['role']

export const ROLE_WORKSPACES = {
  customer: {
    href: '/customer/tickets',
    label: 'Vé của tôi',
    menuLabel: 'Vé & Đơn hàng của tôi',
    roleLabel: 'Customer · Khách hàng',
    description: 'Quản lý vé, đơn hàng và những trải nghiệm của riêng bạn.',
  },
  organizer: {
    href: '/organizer',
    label: 'Không gian Organizer',
    menuLabel: 'Quản lý sự kiện của tôi',
    roleLabel: 'Organizer · Ban tổ chức',
    description: 'Quản lý sự kiện và soát vé trong không gian nhà tổ chức.',
  },
  admin: {
    href: '/dashboard/admin',
    label: 'Quản trị Admin',
    menuLabel: 'Trung tâm quản trị',
    roleLabel: 'Admin · Quản trị hệ thống',
    description: 'Giám sát sự kiện, giao dịch và quản lý tài khoản ứng dụng.',
  },
} satisfies Record<
  AppRole,
  {
    href: string
    label: string
    menuLabel: string
    roleLabel: string
    description: string
  }
>
