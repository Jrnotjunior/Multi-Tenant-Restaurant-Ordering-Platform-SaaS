import {describe,it,expect} from 'vitest';
import type { MenuItem } from '../src/features/storefront/demoCatalog';
import {addCustom,changeCustom,customCount,customSubtotal,customLines,validateSelection} from '../src/features/storefront/customCart';
const item: MenuItem = {id:'inasal',category:'Rice Meals',name:'Chicken Inasal',description:'Grilled chicken',priceCentavos:18900,emoji:'🍗',background:'#eee',modifierGroups:[{id:'size',name:'Size',minSelect:1,maxSelect:1,options:[{id:'large',name:'Large',priceCentavos:4900},{id:'regular',name:'Regular',priceCentavos:0}]},{id:'extras',name:'Extras',minSelect:0,maxSelect:2,options:[{id:'egg',name:'Egg',priceCentavos:2500},{id:'rice',name:'Extra rice',priceCentavos:3500}]}]};
describe('customized storefront basket',()=>{
 const valid={'size':['large'],'extras':['egg','rice']};
 it('requires size choice and refuses extra options',()=>{
  const groups=item.modifierGroups!;
  expect(validateSelection(groups,{})).toBe(false);
  expect(validateSelection(groups,valid)).toBe(true);
  expect(validateSelection(groups,{'size':['large','regular']})).toBe(false);
  expect(validateSelection(groups,{'size':['fake-option']})).toBe(false);
 });
 it('calculates whole-centavo prices by customized variant',()=>{
  const cart=addCustom({},item,valid);
  expect(customCount(cart,[item])).toBe(1);
  expect(customSubtotal(cart,[item])).toBe(item.priceCentavos+4900+2500+3500);
  const line=customLines(cart,[item])[0];
  expect(line.options.map(x=>x.name)).toContain('Large');
  const twice=addCustom(cart,item,valid);
  expect(customCount(twice,[item])).toBe(2);
  expect(customSubtotal(twice,[item])).toBe(2*(item.priceCentavos+4900+2500+3500));
  expect(customCount(changeCustom(twice,line.key,-2),[item])).toBe(0);
 });
 it('does not count invalid options or other tenant items',()=>{
  const line=addCustom({},item,valid);
  expect(customCount(line,[])).toBe(0);
  const changed=[item].map(x=>x.id===item.id?{...x,modifierGroups:[]}:x);
  expect(customCount(line,changed)).toBe(0);
 });
});
