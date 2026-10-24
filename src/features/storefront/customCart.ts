import type { MenuItem, ModifierGroup } from './demoCatalog';

export type Selection = Readonly<Record<string,readonly string[]>>;
export type CustomLine = Readonly<{
 key:string;itemId:string;optionIds:readonly string[];quantity:number;
}>;
export type CustomCart = Readonly<Record<string,CustomLine>>;

export function selectedOptions(groups:readonly ModifierGroup[],selection:Selection) {
  return groups.flatMap(group=>group.options.filter(o=>selection[group.id]?.includes(o.id)));
}
export function validateSelection(groups:readonly ModifierGroup[],selection:Selection):boolean {
  const validGroupIds=new Set(groups.map(g=>g.id));
  if(Object.keys(selection).some(k=>!validGroupIds.has(k)))return false;
  return groups.every(group=>{
    const selected=selection[group.id]??[];
    const permitted=new Set(group.options.map(o=>o.id));
    return selected.length>=group.minSelect && selected.length<=group.maxSelect &&
      new Set(selected).size===selected.length && selected.every(id=>permitted.has(id));
  });
}
export function customKey(itemId:string,optionIds:readonly string[]):string {
  return JSON.stringify([itemId,...[...optionIds].sort()]);
}
export function addCustom(cart:CustomCart,item:MenuItem,selection:Selection):CustomCart {
  if(!validateSelection(item.modifierGroups??[],selection))return cart;
  const ids=selectedOptions(item.modifierGroups??[],selection).map(o=>o.id).sort();
  const key=customKey(item.id,ids);
  const prior=cart[key]?.quantity??0;
  return {...cart,[key]:{key,itemId:item.id,optionIds:ids,quantity:Math.min(20,prior+1)}};
}
export function changeCustom(cart:CustomCart,key:string,delta:number):CustomCart {
  const existing=cart[key];
  if(!existing||!Number.isInteger(delta))return cart;
  const q=Math.max(0,Math.min(20,existing.quantity+delta));
  const next={...cart};
  if(q===0)delete next[key];else next[key]={...existing,quantity:q};
  return next;
}
export function customLines(cart:CustomCart,menu:readonly MenuItem[]) {
  return Object.values(cart).flatMap(line=>{
    const item=menu.find(i=>i.id===line.itemId);
    if(!item||line.quantity<1||!Number.isInteger(line.quantity)||line.quantity>20)return [];
    const groups=item.modifierGroups??[];
    const allOptions=groups.flatMap(g=>g.options);
    const opts=line.optionIds.map(id=>allOptions.find(o=>o.id===id));
    if(opts.some(o=>!o))return [];
    const reconstructed:Record<string,string[]>={};
    for(const group of groups) reconstructed[group.id]=line.optionIds.filter(id=>group.options.some(o=>o.id===id));
    if(!validateSelection(groups,reconstructed))return [];
    const options=opts.filter((o):o is NonNullable<typeof o>=>!!o);
    const unit=item.priceCentavos+options.reduce((n,o)=>n+o.priceCentavos,0);
    return [{...line,item,options,unitPriceCentavos:unit,totalCentavos:unit*line.quantity}];
  });
}
export function customCount(cart:CustomCart,menu:readonly MenuItem[]) {
  return customLines(cart,menu).reduce((n,l)=>n+l.quantity,0);
}
export function customSubtotal(cart:CustomCart,menu:readonly MenuItem[]) {
  return customLines(cart,menu).reduce((n,l)=>n+l.totalCentavos,0);
}
