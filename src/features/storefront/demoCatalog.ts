// Illustrative restaurant data for the UI preview only.
// Future tenant websites must load a verified, published menu from a trusted backend.
export type Category = string;
export type MenuItem = Readonly<{
  id: string;
  category: string;
  name: string;
  description: string;
  priceCentavos: number;
  emoji: string;
  background: string;
  popular?: boolean;
}>;

export const demoRestaurant = Object.freeze({
  slug: 'baryo-kitchen',
  name: 'Baryo Kitchen',
  initials: 'BK',
  tagline: 'Comfort food made for your cravings.',
  location: 'Sample restaurant · Demo branch',
});

export const categories: readonly Category[] = [
  'All', 'Rice Meals', 'Burgers', 'Sides', 'Drinks', 'Desserts',
];

export const demoMenu: readonly MenuItem[] = [
  { id: 'inasal', category: 'Rice Meals', name: 'Chicken Inasal', description: 'Grilled chicken, garlic rice & house dip.', priceCentavos: 18900, emoji: '🍗', background: 'linear-gradient(140deg,#f9deb0,#eaa968)', popular: true },
  { id: 'sisig', category: 'Rice Meals', name: 'Sizzling Pork Sisig', description: 'Crispy pork, onions, chili & calamansi.', priceCentavos: 22900, emoji: '🍳', background: 'linear-gradient(140deg,#ffe5af,#eba56e)', popular: true },
  { id: 'tapa', category: 'Rice Meals', name: 'Beef Tapa Bowl', description: 'Tender tapa, egg & fluffy garlic rice.', priceCentavos: 21500, emoji: '🍚', background: 'linear-gradient(140deg,#f8d7a9,#c98d59)' },
  { id: 'burger', category: 'Burgers', name: 'Baryo Classic Burger', description: 'Juicy beef patty, lettuce & house sauce.', priceCentavos: 19500, emoji: '🍔', background: 'linear-gradient(140deg,#f8dbad,#d7a06a)', popular: true },
  { id: 'cheeseburger', category: 'Burgers', name: 'Double Cheeseburger', description: 'Two patties, melted cheese & pickles.', priceCentavos: 25900, emoji: '🍔', background: 'linear-gradient(140deg,#fde1b4,#edb475)' },
  { id: 'fries', category: 'Sides', name: 'Crispy Fries', description: 'Golden fries with a creamy house dip.', priceCentavos: 9900, emoji: '🍟', background: 'linear-gradient(140deg,#ffe6af,#f4c976)' },
  { id: 'rice', category: 'Sides', name: 'Extra Garlic Rice', description: 'Warm rice tossed with toasted garlic.', priceCentavos: 5900, emoji: '🍚', background: 'linear-gradient(140deg,#f5e8c5,#ddc79e)' },
  { id: 'icedtea', category: 'Drinks', name: 'Calamansi Iced Tea', description: 'Bright, citrusy and made fresh.', priceCentavos: 7900, emoji: '🍹', background: 'linear-gradient(140deg,#dcedae,#aecf8c)' },
  { id: 'mango', category: 'Drinks', name: 'Mango Shake', description: 'Creamy ripe mango refreshment.', priceCentavos: 12900, emoji: '🥭', background: 'linear-gradient(140deg,#ffe3a7,#ffc36d)', popular: true },
  { id: 'halo', category: 'Desserts', name: 'Halo-Halo Special', description: 'A colorful Filipino dessert favorite.', priceCentavos: 14900, emoji: '🍨', background: 'linear-gradient(140deg,#e1d3f1,#c8a6e5)' },
];

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
