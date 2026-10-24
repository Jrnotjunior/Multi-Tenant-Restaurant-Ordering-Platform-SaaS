export type OwnerPage = 'dashboard' | 'orders' | 'menu' | 'inventory' | 'recipes' | 'employees' | 'sales' | 'reports' | 'loyalty' | 'settings' | 'branding';

export type OwnerNavItem = { key: OwnerPage; label: string; icon: string };
export type OwnerNavGroup = { label: string; items: OwnerNavItem[] };

export const ownerNavGroups: OwnerNavGroup[] = [
  { label: 'OVERVIEW', items: [{ key: 'dashboard', label: 'Dashboard', icon: '▦' }] },
  { label: 'OPERATIONS', items: [
    { key: 'orders', label: 'Orders', icon: '▤' }, { key: 'menu', label: 'Menu', icon: '⚒' },
    { key: 'inventory', label: 'Inventory', icon: '⬡' }, { key: 'recipes', label: 'Recipes', icon: '▣' },
  ] },
  { label: 'PEOPLE', items: [{ key: 'employees', label: 'Employees', icon: '♙' }] },
  { label: 'BUSINESS', items: [
    { key: 'sales', label: 'Sales', icon: '⌁' }, { key: 'reports', label: 'Business Reports', icon: '▥' },
    { key: 'loyalty', label: 'Loyalty', icon: '⚙' },
  ] },
  { label: 'STORE', items: [
    { key: 'settings', label: 'Store Settings', icon: '☼' }, { key: 'branding', label: 'Website & Branding', icon: '☷' },
  ] },
];

export const ownerPageTitles: Record<OwnerPage, string> = {
  dashboard: 'Dashboard', orders: 'Orders', menu: 'Menu', inventory: 'Inventory', recipes: 'Recipes',
  employees: 'Employees', sales: 'Sales', reports: 'Business Reports', loyalty: 'Loyalty',
  settings: 'Store Settings', branding: 'Website & Branding',
};
