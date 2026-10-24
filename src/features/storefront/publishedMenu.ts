import { type MenuItem, type ModifierGroup } from './demoCatalog';
import { supabase } from '../../lib/supabase';

export type BranchChoice = Readonly<{slug:string;name:string}>;
export type WebsiteColors = Readonly<{pageBackground:string;headerColor:string;footerBackground:string;footerFont:string;heroColor:string;productCard:string;fontColor:string;headerIcon:string;primaryButton:string;primaryButtonFont:string;secondaryButton:string;secondaryButtonFont:string}>;
const WEBSITE_COLOR_KEYS: Array<keyof WebsiteColors> = ['pageBackground','headerColor','footerBackground','footerFont','heroColor','productCard','fontColor','headerIcon','primaryButton','primaryButtonFont','secondaryButton','secondaryButtonFont'];
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
    websiteColors: WebsiteColors;
    logoUrl: string | null;
    fontFamily: 'modern' | 'rounded' | 'classic';
    branchName: string;
    branchSlug: string;
  };
  categories: readonly string[];
  menu: readonly MenuItem[];
}>;

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


function validateModifiers(value:unknown):ModifierGroup[] {
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>8)throw new Error('Invalid modifier groups');
  return value.map((g:unknown)=>{
    if(!record(g) || !validText(g.id,64) || !validText(g.name,100) ||
       !Number.isInteger(g.minSelect)||!Number.isInteger(g.maxSelect) ||
       (g.minSelect as number)<0 || (g.maxSelect as number)>20 ||
       (g.maxSelect as number)<1 || (g.minSelect as number)>(g.maxSelect as number) ||
       !Array.isArray(g.options)||g.options.length>20) throw new Error('Invalid modifier group');
    const optionIds=new Set<string>();
    const options=g.options.map((o:unknown)=>{
      if(!record(o)||!validText(o.id,64)||!validText(o.name,100)||
         !Number.isInteger(o.priceCentavos)||(o.priceCentavos as number)<0||
         (o.priceCentavos as number)>100000000||optionIds.has(o.id)) {
        throw new Error('Invalid modifier option');
      }
      optionIds.add(o.id);
      return {id:o.id,name:o.name,priceCentavos:o.priceCentavos as number};
    });
    return {id:g.id as string,name:g.name as string,
      minSelect:g.minSelect as number,maxSelect:g.maxSelect as number,options};
  });
}

function getImageUrl(path:unknown):string|undefined {
  if(path==null)return undefined;
  if(typeof path!=='string' ||
    !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:jpg|jpeg|png|webp)$/.test(path))
    throw new Error('Invalid published image path');
  if(!supabase) return undefined;
  return supabase.storage.from('menu-images').getPublicUrl(path).data.publicUrl;
}


function getLogoUrl(path:unknown):string|null {
  if(path==null)return null;
  if(typeof path!=='string' || !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:jpg|jpeg|png|webp)$/.test(path))
    throw new Error('Invalid published restaurant logo path');
  if(!supabase)return null;
  return supabase.storage.from('storefront-logos').getPublicUrl(path).data.publicUrl;
}

/** Parse and whitelist RPC output; never substitute preview items for a live tenant. */
export function parsePublishedMenu(value: unknown): StorefrontCatalog | null {
  if (value === null) return null;
  if (!record(value)) throw new Error('Invalid published storefront response');
  const {slug,name,tagline,heroHeading,heroEmphasis,primaryColor,websiteColors,logoPath,fontFamily,branchName,branchSlug,branches,categories,items} = value;
  if (!validText(slug,64) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
    || !validText(name,160) || !validText(heroHeading,90)
    || !validText(heroEmphasis,90) || !validText(branchName,160)
    || typeof tagline !== 'string' || tagline.length > 300
    || typeof primaryColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(primaryColor)
    || !record(websiteColors) || !WEBSITE_COLOR_KEYS.every(key => typeof websiteColors[key] === 'string' && /^#[0-9a-fA-F]{6}$/.test(websiteColors[key] as string))
    || (logoPath!==null && logoPath!==undefined && typeof logoPath!=='string')
    || (fontFamily!==undefined && !['modern','rounded','classic'].includes(String(fontFamily)))
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
      imageUrl:getImageUrl(item.imagePath),
      modifierGroups:validateModifiers(item.modifierGroups),
    };
  });
  const initials = name.split(/\s+/).slice(0,2).map((word) => word.charAt(0)).join('').toUpperCase();
  const normalizedWebsiteColors = Object.fromEntries(WEBSITE_COLOR_KEYS.map(key => [key, websiteColors[key] as string])) as WebsiteColors;
  return {
    restaurant: {slug,name,tagline,heroHeading,heroEmphasis,primaryColor,websiteColors:normalizedWebsiteColors,logoUrl:getLogoUrl(logoPath),fontFamily:(fontFamily==='rounded'||fontFamily==='classic'?fontFamily:'modern'),branchName,branchSlug:typeof branchSlug==='string'?branchSlug:'',initials},
    branches:branchChoices,
    categories:['All',...categories.map((entry:Row) => entry.name as string)],
    menu,
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
