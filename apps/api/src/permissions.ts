export const PERMISSIONS = [
  'tenant.read',
  'tenant.manage',
  'organization.read',
  'organization.manage',
  'user.read',
  'user.manage',
  'rbac.read',
  'rbac.manage',
  'property.read',
  'property.manage',
  'partner.read',
  'partner.manage',
  'document.read',
  'document.manage',
  'task.read',
  'task.manage',
  'notification.read',
  'notification.manage',
  'contract.read',
  'contract.manage',
  'consent.read',
  'consent.manage',
  'audit.read',
  'integration.read',
  'integration.manage',
  'configuration.read',
  'configuration.manage'
] as const

export type PermissionCode = (typeof PERMISSIONS)[number]

const permissionSet = new Set<string>(PERMISSIONS)

export function isPermissionCode(value: string): value is PermissionCode {
  return permissionSet.has(value)
}
