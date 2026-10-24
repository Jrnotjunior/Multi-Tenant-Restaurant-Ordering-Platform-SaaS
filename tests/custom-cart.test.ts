import {describe,it,expect} from 'vitest';
import {enrichSampleMenu,demoMenu} from '../src/features/storefront/demoCatalog';
import {addCustom,changeCustom,customCount,customSubtotal,customLines,validateSelection} from '../src/features/storefront/customCart';
const item=enrichSampleMenu(demoMenu).find(x=>x.id==='inasal')!;
describe('customized storefront basket',()=>{
 const valid={'sample-size':['sample-large'],'sample-extras':['sample-egg','sample-rice']};
 it('requires size choice and refuses extra options',()=>{
  const groups=item.modifierGroups!;
  expect(validateSelection(groups,{})).toBe(false);
  expect(validateSelection(groups,valid)).toBe(true);
  expect(validateSelection(groups,{'sample-size':['sample-large','sample-regular']})).toBe(false);
  expect(validateSelection(groups,{'sample-size':['fake-option']})).toBe(false);
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
  const changed=enrichSampleMenu(demoMenu).map(x=>x.id===item.id?{...x,modifierGroups:[]}:x);
  expect(customCount(line,changed)).toBe(0);
 });
});
