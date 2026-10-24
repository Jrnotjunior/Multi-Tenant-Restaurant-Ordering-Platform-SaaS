// Shared storefront menu types and utilities. Restaurant data is loaded from the published tenant catalog.
export type Category = string;
export type ModifierOption = Readonly<{id:string;name:string;priceCentavos:number}>;
export type ModifierGroup = Readonly<{
  id:string;name:string;minSelect:number;maxSelect:number;options:readonly ModifierOption[];
}>;
export type MenuItem = Readonly<{
  id: string;
  category: string;
  name: string;
  description: string;
  priceCentavos: number;
  emoji: string;
  background: string;
  popular?: boolean;
  imageUrl?: string;
  modifierGroups?: readonly ModifierGroup[];
}>;

export function filterMenu(menu: readonly MenuItem[], category: Category, query: string): MenuItem[] {
  const needle = query.trim().toLocaleLowerCase();
  return menu.filter((item) => (
    (category === 'All' || item.category === category) &&
    (!needle || (item.name + ' ' + item.description + ' ' + item.category).toLocaleLowerCase().includes(needle))
  ));
}

export function peso(centavos: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency', currency: 'PHP', minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(centavos / 100);
}

