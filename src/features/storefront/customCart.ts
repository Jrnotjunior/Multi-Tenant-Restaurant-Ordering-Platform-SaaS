import type { MenuItem, ModifierGroup } from './demoCatalog';

export type Selection = Readonly<Record<string,readonly string[]>>;
export type CustomLine = Readonly<{
 key:string;itemId:string;optionIds:readonly string[];quantity:number;instructions:string;
}>;
export type CustomCart = Readonly<Record<string,CustomLine>>;

export function selectedOptions(groups:readonly ModifierGroup[],selection:Selection) {
  return groups.flatMap(group=>group.options.filter(o=>selection[group.id]?.includes(o.id)));
}
export function selectionFromOptionIds(groups:readonly ModifierGroup[],optionIds:readonly string[]):Selection {
 const selected=new Set(optionIds);
 return Object.fromEntries(groups.map(group=>[group.id,group.options.filter(option=>selected.has(option.id)).map(option=>option.id)]));
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
export function customKey(itemId:string,optionIds:readonly string[],instructions=''):string {
 const note=instructions.trim();
 return JSON.stringify([itemId,...[...optionIds].sort(),...(note?['note:'+note]:[])]);
}
export function addCustom(cart:CustomCart,item:MenuItem,selection:Selection,quantity=1,instructions=''):CustomCart {
  if(!validateSelection(item.modifierGroups??[],selection))return cart;
  if(!Number.isInteger(quantity)||quantity<1||quantity>20)return cart;
  const ids=selectedOptions(item.modifierGroups??[],selection).map(o=>o.id).sort();
  const cleanInstructions=instructions.trim();
  if(cleanInstructions.length>300)return cart;
  const key=customKey(item.id,ids,cleanInstructions);
  const prior=cart[key]?.quantity??0;
  return {...cart,[key]:{key,itemId:item.id,optionIds:ids,quantity:Math.min(20,prior+quantity),instructions:cleanInstructions}};
}
export function editCustom(cart:CustomCart,oldKey:string,item:MenuItem,selection:Selection,quantity:number,instructions:string):CustomCart {
  const next={...cart};
  delete next[oldKey];
  return addCustom(next,item,selection,quantity,instructions);
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
    return [{...line,instructions:line.instructions??'',item,options,unitPriceCentavos:unit,totalCentavos:unit*line.quantity}];
  });
}
export function customCount(cart:CustomCart,menu:readonly MenuItem[]) {
  return customLines(cart,menu).reduce((n,l)=>n+l.quantity,0);
}
export function customSubtotal(cart:CustomCart,menu:readonly MenuItem[]) {
  return customLines(cart,menu).reduce((n,l)=>n+l.totalCentavos,0);
}
