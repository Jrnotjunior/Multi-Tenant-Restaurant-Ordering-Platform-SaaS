import { describe, expect, it } from 'vitest';
import { parsePublishedMenu } from '../src/features/storefront/publishedMenu';
import { filterMenu } from '../src/features/storefront/demoCatalog';
import { cartCount, cartSubtotal, updateCart } from '../src/features/storefront/cart';

const published = {
  slug:'restaurant-alpha',name:'Restaurant Alpha',
  tagline:'Fresh food from Restaurant Alpha.',
  heroHeading:'Hungry?',heroEmphasis:'Order your favorites.',
  primaryColor:'#336699',branchName:'Makati',
  categories:[{id:'cat-01',name:'Mains'},{id:'cat-02',name:'Drinks'}],
  items:[
    {id:'item-01',categoryId:'cat-01',name:'Chicken Rice',description:'With garlic rice',priceCentavos:21900,popular:true},
    {id:'item-02',categoryId:'cat-02',name:'Iced Tea',description:'Fresh iced tea',priceCentavos:7900,popular:false},
  ],
};

describe('tenant-specific published menu adapter', () => {

  it('accepts safe public modifier groups and prices',()=>{
    const payload={...published,items:[{...published.items[0],imagePath:null,
      modifierGroups:[{id:'grp-a',name:'Choose size',minSelect:1,maxSelect:1,
        options:[{id:'op-large',name:'Large',priceCentavos:4900}]}]}]};
    const result=parsePublishedMenu(payload)!;
    expect(result.menu[0].modifierGroups?.[0].minSelect).toBe(1);
    expect(result.menu[0].modifierGroups?.[0].options[0].priceCentavos).toBe(4900);
  });
  it('rejects unsafe image paths and malformed modifier price data',()=>{
    expect(()=>parsePublishedMenu({...published,items:[{...published.items[0],
      imagePath:'https://example.com/private.png'}]})).toThrow();
    expect(()=>parsePublishedMenu({...published,items:[{...published.items[0],
      modifierGroups:[{id:'bad',name:'Group',minSelect:0,maxSelect:1,
        options:[{id:'bad-2',name:'Extra',priceCentavos:-200}]}]}]})).toThrow();
  });

  it('parses restaurant branding and the branch-specific menu', () => {
    const menu=parsePublishedMenu(published);
    expect(menu?.restaurant.name).toBe('Restaurant Alpha');
    expect(menu?.restaurant.primaryColor).toBe('#336699');
    expect(menu?.restaurant.branchName).toBe('Makati');
    expect(menu?.categories).toEqual(['All','Mains','Drinks']);
    expect(menu?.menu[0].priceCentavos).toBe(21900);
  });
  it('supports category search and cart totals against real catalog items', () => {
    const menu=parsePublishedMenu(published)!;
    expect(filterMenu(menu.menu,'Drinks','tea')).toHaveLength(1);
    const cart=updateCart({},'item-01',2,menu.menu);
    expect(cartCount(cart,menu.menu)).toBe(2);
    expect(cartSubtotal(cart,menu.menu)).toBe(43800);
    expect(updateCart(cart,'not-in-this-tenant',1,menu.menu)).toEqual(cart);
  });
  it('treats unpublished or unavailable RPC results as missing, not a demo fallback', () => {
    expect(parsePublishedMenu(null)).toBeNull();
    expect(()=>parsePublishedMenu({slug:'fake'})).toThrow();
  });
  it('rejects unsupported prices, unknown categories and unsafe brand colors', () => {
    expect(()=>parsePublishedMenu({...published,primaryColor:'red; background:url(https://evil)'})).toThrow();
    expect(()=>parsePublishedMenu({...published,items:[{...published.items[0],categoryId:'foreign-tenant'}]})).toThrow();
    expect(()=>parsePublishedMenu({...published,items:[{...published.items[0],priceCentavos:-1}]})).toThrow();
  });
  it('avoids accidentally accepting another tenant item already in the cart', () => {
    const cart={'previous-tenant-item':5};
    const menu=parsePublishedMenu(published)!;
    expect(cartCount(cart,menu.menu)).toBe(0);
    expect(cartSubtotal(cart,menu.menu)).toBe(0);
  });
});
