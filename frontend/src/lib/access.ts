import type { Access, FieldAccess, PayloadRequest } from 'payload'

export const cms = (user: PayloadRequest['user']) => user?.collection === 'admins'
export const app = (user: PayloadRequest['user']) => user?.collection === 'users'
export const admin = (user: PayloadRequest['user']) =>
  app(user) && 'role' in user! && user.role === 'admin'
export const organizer = (user: PayloadRequest['user']) =>
  app(user) && 'role' in user! && user.role === 'organizer'
export const staff: Access = ({ req }) => cms(req.user) || admin(req.user)
export const roleField: FieldAccess = ({ req }) => cms(req.user) || admin(req.user)
export const workflow: FieldAccess = ({ req }) => Boolean(req.context.ticketWorkflow)
export const eventWrite: Access = ({ req }) => {
  if (cms(req.user) || admin(req.user)) return true
  return organizer(req.user) ? { organizer: { equals: req.user!.id } } : false
}
