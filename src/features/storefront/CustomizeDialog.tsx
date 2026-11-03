import { useEffect,useRef,useState,type FormEvent } from 'react';
import { peso,type MenuItem } from './demoCatalog';
import { selectedOptions,selectionFromOptionIds,validateSelection,type Selection } from './customCart';

export function CustomizeDialog({item,onSave,onClose,initialOptionIds=[],initialInstructions='',initialQuantity=1,editing=false}:{
  item:MenuItem|null;onSave:(item:MenuItem,selection:Selection,quantity:number,instructions:string)=>boolean|void|Promise<boolean|void>;onClose:()=>void;
  initialOptionIds?:readonly string[];initialInstructions?:string;initialQuantity?:number;editing?:boolean;
}) {
  const ref=useRef<HTMLDialogElement>(null);
  const [choices,setChoices]=useState<Selection>({});
  const [quantity,setQuantity]=useState(1);
  const [instructions,setInstructions]=useState('');
  const optionIdsKey=initialOptionIds.join('|');
  useEffect(()=>{
    const dialog=ref.current;
    if(item) {
      const defaults:Record<string,readonly string[]>={...selectionFromOptionIds(item.modifierGroups??[],optionIdsKey?optionIdsKey.split('|'):[])};
      // A required single-option group can be selected immediately.
      for(const group of item.modifierGroups??[])
        if(!defaults[group.id]?.length)defaults[group.id]=group.minSelect===1 && group.options.length===1?[group.options[0].id]:[];
      setChoices(defaults);
      setQuantity(Math.max(1,Math.min(20,initialQuantity)));
      setInstructions(initialInstructions);
      if(dialog&&!dialog.open)dialog.showModal();
    } else if(dialog?.open)dialog.close();
  },[item,optionIdsKey,initialInstructions,initialQuantity]);

  function toggle(groupId:string,optionId:string,limit:number) {
    setChoices(previous=>{
      const chosen=previous[groupId]??[];
      const next=chosen.includes(optionId)?chosen.filter(id=>id!==optionId)
        :(limit===1?[optionId]:chosen.length<limit?[...chosen,optionId]:chosen);
      return {...previous,[groupId]:next};
    });
  }
  async function submit(event:FormEvent) {
    event.preventDefault();
    if(!item||!validateSelection(item.modifierGroups??[],choices))return;
    const saved = await onSave(item,choices,quantity,instructions.trim());
    if (saved !== false) onClose();
  }
  const groups=item?.modifierGroups??[];
  const options=selectedOptions(groups,choices);
  const unit=(item?.priceCentavos??0)+options.reduce((sum,o)=>sum+o.priceCentavos,0);
  const ready=!!item&&validateSelection(groups,choices);
  return <dialog ref={ref} className="sf-customize-dialog" aria-labelledby="sf-customize-title"
    onClose={onClose}>
    {item&&<>
      <div className="sf-dialog-top">
        <div><span className="sf-section-kicker">MAKE IT YOURS</span><h2 id="sf-customize-title">{item.name}</h2>
          <p>{item.description}</p></div>
        <button type="button" className="sf-close" onClick={onClose} aria-label="Close customization">×</button>
      </div>
      <form onSubmit={submit}>
        <div className="sf-custom-groups">
          {groups.map(group=><fieldset key={group.id} className="sf-custom-group">
            <legend>{group.name}</legend>
            <p>{group.minSelect>0?'Required · choose '+group.minSelect+(group.maxSelect>group.minSelect?'–'+group.maxSelect:''):'Optional · choose up to '+group.maxSelect}</p>
            {group.options.map(option=>{
              const selected=(choices[group.id]??[]).includes(option.id);
              return <label className={'sf-custom-choice'+(selected?' sf-custom-selected':'')} key={option.id}>
                <input type={group.maxSelect===1&&group.minSelect>0?'radio':'checkbox'}
                  name={'modifier-'+group.id} checked={selected}
                  onChange={()=>toggle(group.id,option.id,group.maxSelect)}/>
                <span>{option.name}</span><strong>{option.priceCentavos===0?'Included':'+'+peso(option.priceCentavos)}</strong>
              </label>;
            })}
          </fieldset>)}
          <label className="sf-custom-instructions">Special instructions <span>Optional</span>
            <textarea value={instructions} maxLength={300} rows={3} onChange={event=>setInstructions(event.target.value)} placeholder="e.g. No onions, sauce on the side…" />
            <small>{instructions.length}/300</small>
          </label>
        </div>
        <div className="sf-custom-footer">
          {!ready&&<p role="status">Complete the required choices to add this item.</p>}
          <div className="sf-custom-quantity" aria-label="Quantity">
            <span>Quantity</span>
            <div><button type="button" aria-label="Decrease quantity" disabled={quantity<=1} onClick={()=>setQuantity(value=>Math.max(1,value-1))}>−</button><strong>{quantity}</strong><button type="button" aria-label="Increase quantity" disabled={quantity>=20} onClick={()=>setQuantity(value=>Math.min(20,value+1))}>+</button></div>
          </div>
          <button type="submit" disabled={!ready}>{editing?'Save changes':'Add to cart'} · {peso(unit*quantity)}</button>
        </div>
      </form>
    </>}
  </dialog>;
}
