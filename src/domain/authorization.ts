export type Role = 'platform_admin' | 'restaurant_owner' | 'kitchen' | 'dispatcher' | 'rider' | 'customer';
export type Permission = 'tenants.manage' | 'restaurant.manage' | 'orders.read' | 'kitchen.update' | 'dispatch.assign' | 'delivery.update' | 'customer.order';
const grants: Readonly<Record<Role, readonly Permission[]>> = {
  platform_admin: ['tenants.manage'],
  restaurant_owner: ['restaurant.manage', 'orders.read', 'kitchen.update', 'dispatch.assign'],
  kitchen: ['orders.read', 'kitchen.update'],
  dispatcher: ['orders.read', 'dispatch.assign'],
  rider: ['delivery.update'],
  customer: ['customer.order'],
};
/** UI hint only. Backend authorization must verify current identity, tenant, branch, role and MFA. */
export function isGranted(role: Role, permission: Permission): boolean {
  return grants[role].includes(permission);
}
export function mustUseMfa(role: Role): boolean {
  return role !== 'customer';
}
