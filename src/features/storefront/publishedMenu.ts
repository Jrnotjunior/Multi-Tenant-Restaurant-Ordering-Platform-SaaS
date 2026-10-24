import { demoMenu, demoRestaurant, type MenuItem } from './demoCatalog';
import { supabase } from '../../lib/supabase';

export type BranchChoice = Readonly<{slug:string;name:string}>;
export type StorefrontCatalog = Readonly<{
  branches: readonly BranchChoice[];
  restaurant: {
    slug: string;
    name: string;
    initials: string;
    tagline: string;
    heroHeading: string;
    heroEmphasis: string;
    primaryColor: string;
    branchName: string;
    branchSlug: string;
  };
  categories: readonly string[];
  menu: readonly MenuItem[];
  sample: boolean;
}>;

export const sampleCatalog: StorefrontCatalog = {
  branches: [
    {slug:'main',name:'Sample Main'},
    {slug:'makati',name:'Sample Makati'},
  ],
  restaurant: {
    branchSlug: 'main',
    slug: demoRestaurant.slug,
    name: demoRestaurant.name,
    initials: demoRestaurant.initials,
    tagline: demoRestaurant.tagline,
    heroHeading: 'Good food.',
    heroEmphasis: 'Great cravings.',
    primaryColor: '#ad2935',
    branchName: 'Sample Main',
  },
  categories: ['All', 'Rice Meals', 'Burgers', 'Sides', 'Drinks', 'Desserts'],
  menu: demoMenu,
  sample: true,
};

/** Distinct sample branch menu for testing touch UI. Never persisted or charged. */
export function getSampleCatalog(branchSlug:string|null):StorefrontCatalog|null {
  if(branchSlug === null || branchSlug === 'main') return sampleCatalog;
  if(branchSlug !== 'makati') return null;
  return {
    ...sampleCatalog,
    restaurant:{...sampleCatalog.restaurant,branchName:'Sample Makati',branchSlug:'makati'},
    menu:demoMenu.filter(item=>item.id!=='sisig' && item.id!=='halo')
      .map(item=>({...item,priceCentavos:item.priceCentavos+1500})),
  };
}

/** Null means default branch, empty string means malformed requested branch. */
export function branchSlugFromSearch(search:string):string|null {
  const p=new URLSearchParams(search);
  if(!p.has('branch')) return null;
  const slugs=p.getAll('branch');
  if(slugs.length!==1) return '';
  const slug=slugs[0];
  return slug.length>=2 && slug.length<=64 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : '';
}

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
  const {slug,name,tagline,heroHeading,heroEmphasis,primaryColor,branchName,branchSlug,branches,categories,items} = value;
  if (!validText(slug,64) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
    || !validText(name,160) || !validText(heroHeading,90)
    || !validText(heroEmphasis,90) || !validText(branchName,160)
    || typeof tagline !== 'string' || tagline.length > 300
    || typeof primaryColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(primaryColor)
    || (branchSlug !== undefined && (!validText(branchSlug,64) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(branchSlug)))
    || (branches !== undefined && (!Array.isArray(branches) || branches.length > 20))
    || !Array.isArray(categories) || categories.length > 40
    || !Array.isArray(items) || items.length > 200) {
    throw new Error('Invalid published storefront data');
  }
  const branchChoices: BranchChoice[]=[];
  if(Array.isArray(branches)) {
    const usedSlugs=new Set<string>();
    for(const branch of branches) {
      if(!record(branch) || !validText(branch.name,160) || !validText(branch.slug,64)
        || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(branch.slug) || usedSlugs.has(branch.slug)) {
        throw new Error('Invalid published branch list');
      }
      branchChoices.push({slug:branch.slug,name:branch.name});
      usedSlugs.add(branch.slug);
    }
    if(typeof branchSlug==='string' && !usedSlugs.has(branchSlug)) throw new Error('Selected branch unavailable');
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
    restaurant: {slug,name,tagline,heroHeading,heroEmphasis,primaryColor,branchName,branchSlug:typeof branchSlug==='string'?branchSlug:'',initials},
    branches:branchChoices,
    categories:['All',...categories.map((entry:Row) => entry.name as string)],
    menu,
    sample:false,
  };
}

export async function loadPublishedMenu(slug:string,branchSlug:string|null=null):Promise<StorefrontCatalog|null> {
  if (!supabase) throw new Error('Menu service is not configured');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  if(branchSlug!==null && (branchSlug.length<2 || branchSlug.length>64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(branchSlug))) return null;
  const {data,error} = await supabase.rpc('get_branch_storefront',{p_slug:slug,p_branch_slug:branchSlug});
  if (error) throw new Error('Published menu service unavailable');
  return parsePublishedMenu(data);
}
