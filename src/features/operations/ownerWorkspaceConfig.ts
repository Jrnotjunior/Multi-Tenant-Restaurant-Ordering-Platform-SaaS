export type OwnerPage = 'dashboard' | 'orders' | 'menu' | 'employees' | 'sales' | 'reports' | 'loyalty' | 'settings' | 'branding' | 'fiscal' | 'support';

export type OwnerNavItem = { key: OwnerPage; label: string; icon: string };
export type OwnerNavGroup = { label: string; items: OwnerNavItem[] };

export const ownerNavGroups: OwnerNavGroup[] = [
  { label: 'OVERVIEW', items: [{ key: 'dashboard', label: 'Dashboard', icon: 'dashboard' }] },
  { label: 'OPERATIONS', items: [
    { key: 'orders', label: 'Orders', icon: 'orders' }, { key: 'menu', label: 'Menu', icon: 'menu' },
  ] },
  { label: 'PEOPLE', items: [{ key: 'employees', label: 'Employees', icon: 'employees' }] },
  { label: 'BUSINESS', items: [
    { key: 'sales', label: 'Sales', icon: 'sales' }, { key: 'reports', label: 'Business Reports', icon: 'reports' },
    { key: 'loyalty', label: 'Loyalty', icon: 'loyalty' },
  ] },
  { label: 'POS & COMPLIANCE', items: [{ key: 'fiscal', label: 'Fiscal & POS', icon: 'pos' }] },
  { label: 'STORE', items: [
    { key: 'settings', label: 'Store Settings', icon: 'settings' }, { key: 'branding', label: 'Website & Branding', icon: 'website' },
  ] },
];

export const ownerPageTitles: Record<OwnerPage, string> = {
  dashboard: 'Dashboard', orders: 'Orders', menu: 'Menu',
  employees: 'Employees', sales: 'Sales', reports: 'Business Reports', loyalty: 'Loyalty',
  settings: 'Store Settings', branding: 'Website & Branding', fiscal: 'Fiscal & POS',
  support: 'Customer Support',
};
