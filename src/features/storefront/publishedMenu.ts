import { demoMenu, demoRestaurant, type MenuItem } from './demoCatalog';
import { supabase } from '../../lib/supabase';

export type StorefrontCatalog = Readonly<{
  restaurant: {
    slug: string;
    name: string;
    initials: string;
    tagline: string;
    heroHeading: string;
    heroEmphasis: string;
    primaryColor: string;
    branchName: string;
  };
  categories: readonly string[];
  menu: readonly MenuItem[];
  sample: boolean;
}>;

export const sampleCatalog: StorefrontCatalog = {
  restaurant: {
    slug: demoRestaurant.slug,
    name: demoRestaurant.name,
    initials: demoRestaurant.initials,
    tagline: demoRestaurant.tagline,
    heroHeading: 'Good food.',
    heroEmphasis: 'Great cravings.',
    primaryColor: '#ad2935',
    branchName: 'Sample branch',
  },
  categories: ['All', 'Rice Meals', 'Burgers', 'Sides', 'Drinks', 'Desserts'],
  menu: demoMenu,
  sample: true,
};

const backgrounds = [
  'linear-gradient(140deg,#f9deb0,#eaa968)',
  'linear-gradient(140deg,#f8d7a9,#c98d59)',
  'linear-gradient(140deg,#dcedae,#aecf8c)',
  'linear-gradient(140deg,#e1d3f1,#c8a6e5)',
] as const;

type Row = Record<string, unknown>;
const record = (value: unknown): value is Row =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const validText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;

/** Parse and whitelist RPC output; never substitute preview items for a live tenant. */
export function parsePublishedMenu(value: unknown): StorefrontCatalog | null {
  if (value === null) return null;
  if (!record(value)) throw new Error('Invalid published storefront response');
  const {slug,name,tagline,heroHeading,heroEmphasis,primaryColor,branchName,categories,items} = value;
  if (!validText(slug,64) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
    || !validText(name,160) || !validText(heroHeading,90)
    || !validText(heroEmphasis,90) || !validText(branchName,160)
    || typeof tagline !== 'string' || tagline.length > 300
    || typeof primaryColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(primaryColor)
    || !Array.isArray(categories) || categories.length > 40
    || !Array.isArray(items) || items.length > 200) {
    throw new Error('Invalid published storefront data');
  }
  const namesById = new Map<string,string>();
  for (const category of categories) {
    if (!record(category) || !validText(category.id,64) || !validText(category.name,100)) {
      throw new Error('Invalid published category');
    }
    namesById.set(category.id,category.name);
  }
  const menu: MenuItem[] = items.map((item:unknown,index:number) => {
    if (!record(item) || !validText(item.id,64) || !validText(item.name,160)
      || !validText(item.categoryId,64) || !namesById.has(item.categoryId)
      || typeof item.description !== 'string' || item.description.length > 600
      || !Number.isInteger(item.priceCentavos) || (item.priceCentavos as number) < 0
      || (item.priceCentavos as number) > 100000000
      || typeof item.popular !== 'boolean') throw new Error('Invalid published menu item');
    return {
      id:item.id,
      name:item.name,
      description:item.description,
      category:namesById.get(item.categoryId)!,
      priceCentavos:item.priceCentavos as number,
      popular:item.popular,
      emoji:'🍽️',
      background:backgrounds[index % backgrounds.length],
    };
  });
  const initials = name.split(/\s+/).slice(0,2).map((word) => word.charAt(0)).join('').toUpperCase();
  return {
    restaurant: {slug,name,tagline,heroHeading,heroEmphasis,primaryColor,branchName,initials},
    categories:['All',...categories.map((entry:Row) => entry.name as string)],
    menu,
    sample:false,
  };
}

export async function loadPublishedMenu(slug:string):Promise<StorefrontCatalog|null> {
  if (!supabase) throw new Error('Menu service is not configured');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  const {data,error} = await supabase.rpc('get_published_storefront',{p_slug:slug});
  if (error) throw new Error('Published menu service unavailable');
  return parsePublishedMenu(data);
}
