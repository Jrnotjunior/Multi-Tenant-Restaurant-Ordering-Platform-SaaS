import {describe,expect,it} from 'vitest';
import {branchSlugFromSearch,parsePublishedMenu} from '../src/features/storefront/publishedMenu';
import {cartCount,cartSubtotal,updateCart} from '../src/features/storefront/cart';

const payload={
 slug:'kitchen-a',name:'Kitchen A',tagline:'Test only',
 heroHeading:'Fresh',heroEmphasis:'Always',
 branchSlug:'makati',branchName:'Makati',
 branches:[{slug:'main',name:'Main'},{slug:'makati',name:'Makati'}],
 primaryColor:'#ac2935',
 categories:[{id:'cat',name:'Rice'}],
 items:[{id:'item-a',categoryId:'cat',name:'Chicken',description:'',priceCentavos:23900,popular:false}],
};

describe('branch-specific customer menus',()=>{
 it('parses published branch list and selected branch details',()=>{
   const data=parsePublishedMenu(payload);
   expect(data?.restaurant.branchSlug).toBe('makati');
   expect(data?.branches.map(b=>b.slug)).toEqual(['main','makati']);
   expect(data?.restaurant.branchName).toBe('Makati');
   expect(data?.menu[0].priceCentavos).toBe(23900);
 });
 it('rejects malformed or spoofed branch results',()=>{
   expect(()=>parsePublishedMenu({...payload,branchSlug:'other'})).toThrow();
   expect(()=>parsePublishedMenu({...payload,branches:[payload.branches[0],payload.branches[0]]})).toThrow();
   expect(()=>parsePublishedMenu({...payload,branches:[{slug:'foo<script>',name:'Unsafe'}]})).toThrow();
 });
 it('uses only valid branch parameters',()=>{
   expect(branchSlugFromSearch('')).toBeNull();
   expect(branchSlugFromSearch('?branch=makati')).toBe('makati');
   expect(branchSlugFromSearch('?branch=../admin')).toBe('');
   expect(branchSlugFromSearch('?branch=main&branch=makati')).toBe('');
   expect(branchSlugFromSearch('?branch=')).toBe('');
 });
;
});
