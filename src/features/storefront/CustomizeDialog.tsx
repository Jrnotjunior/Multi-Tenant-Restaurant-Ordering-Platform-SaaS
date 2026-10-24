import { useEffect,useRef,useState,type FormEvent } from 'react';
import { peso,type MenuItem } from './demoCatalog';
import { selectedOptions,validateSelection,type Selection } from './customCart';

export function CustomizeDialog({item,onAdd,onClose}:{
  item:MenuItem|null;onAdd:(item:MenuItem,selection:Selection)=>void;onClose:()=>void;
}) {
  const ref=useRef<HTMLDialogElement>(null);
  const [choices,setChoices]=useState<Selection>({});
  useEffect(()=>{
    const dialog=ref.current;
    if(item) {
      const defaults:Record<string,string[]>={};
      // A required single-option group can be selected immediately.
      for(const group of item.modifierGroups??[])
        defaults[group.id]=group.minSelect===1 && group.options.length===1?[group.options[0].id]:[];
      setChoices(defaults);
      if(dialog&&!dialog.open)dialog.showModal();
    } else if(dialog?.open)dialog.close();
  },[item]);

  function toggle(groupId:string,optionId:string,limit:number) {
    setChoices(previous=>{
      const chosen=previous[groupId]??[];
      const next=chosen.includes(optionId)?chosen.filter(id=>id!==optionId)
        :(limit===1?[optionId]:chosen.length<limit?[...chosen,optionId]:chosen);
      return {...previous,[groupId]:next};
    });
  }
  function submit(event:FormEvent) {
    event.preventDefault();
    if(!item||!validateSelection(item.modifierGroups??[],choices))return;
    onAdd(item,choices);onClose();
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
            <p>{group.minSelect>0?'Choose at least '+group.minSelect:'Optional'} · Up to {group.maxSelect}</p>
            {group.options.map(option=>{
              const selected=(choices[group.id]??[]).includes(option.id);
              return <label className={'sf-custom-choice'+(selected?' sf-custom-selected':'')} key={option.id}>
                <input type={group.maxSelect===1?'radio':'checkbox'}
                  name={'modifier-'+group.id} checked={selected}
                  onChange={()=>toggle(group.id,option.id,group.maxSelect)}/>
                <span>{option.name}</span><strong>{option.priceCentavos===0?'Included':'+'+peso(option.priceCentavos)}</strong>
              </label>;
            })}
          </fieldset>)}
        </div>
        <div className="sf-custom-footer">
          {!ready&&<p role="status">Complete the required choices to add this item.</p>}
          <button type="submit" disabled={!ready}>Add to basket · {peso(unit)}</button>
        </div>
      </form>
    </>}
  </dialog>;
}
