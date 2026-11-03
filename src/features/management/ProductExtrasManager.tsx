import {useState,type FormEvent,type SyntheticEvent} from 'react';
import {centavosToPesoInput,pesoInputToCentavos} from './pricing';
import {
 createModifierGroup,changeModifierGroup,createModifierOption,changeModifierOption,
 updateModifierGroup,updateModifierOption,uploadMenuPhoto,publicMenuPhoto,type OwnerData,
} from './menuService';

type Run=(label:string,work:()=>Promise<unknown>)=>Promise<OwnerData|null|undefined>;

export function ProductExtrasManager({data,busy,run,showPhotos=true}:{data:OwnerData;busy:boolean;run:Run;showPhotos?:boolean}) {
  const [selectedItem,setSelectedItem]=useState('');
  const [showGroupForm,setShowGroupForm]=useState(false);
  const [groupName,setGroupName]=useState('');
  const [groupRequired,setGroupRequired]=useState(true);
  const [allowMultiple,setAllowMultiple]=useState(false);
  const [selectedGroup,setSelectedGroup]=useState('');
  const [optionName,setOptionName]=useState('');
  const [optionPrice,setOptionPrice]=useState('0');
  const [editingGroup,setEditingGroup]=useState('');
  const [editingGroupName,setEditingGroupName]=useState('');
  const [editingMinimum,setEditingMinimum]=useState('0');
  const [editingMaximum,setEditingMaximum]=useState('1');
  const [editingOption,setEditingOption]=useState('');
  const [editingOptionName,setEditingOptionName]=useState('');
  const [editingOptionPrice,setEditingOptionPrice]=useState('0');
  const [uploads,setUploads]=useState<Record<string,File|undefined>>({});
  const itemId=data.items.some(item=>item.id===selectedItem)?selectedItem:data.items[0]?.id??'';
  const groups=data.groups.filter(group=>group.item_id===itemId);

  function addGroup(event:FormEvent) {
    event.preventDefault();
    if(!itemId)return;
    const min=groupRequired?1:0,max=allowMultiple?20:1;
    const existingIds=new Set(groups.map(group=>group.id));
    void run('Customization group',()=>createModifierGroup(data.tenant.id,itemId,groupName,min,max))
      .then(next=>{if(!next)return;const created=next.groups.find(group=>group.item_id===itemId&&!existingIds.has(group.id));
        if(created)setSelectedGroup(created.id);setGroupName('');setShowGroupForm(false);setGroupRequired(true);setAllowMultiple(false);});
  }

  function addOption(event:FormEvent,targetGroupId:string) {
    event.preventDefault();
    if(!itemId||!targetGroupId)return;
    const cents=pesoInputToCentavos(optionPrice);
    if(cents===null)return;
    void run('Customization choice',()=>createModifierOption(data.tenant.id,itemId,targetGroupId,optionName,cents))
      .then(next=>{if(next){setOptionName('');setOptionPrice('0');}});
  }

  function onGroupToggle(event:SyntheticEvent<HTMLDetailsElement>,id:string) {
    if(event.currentTarget.open)setSelectedGroup(id);
    else if(selectedGroup===id)setSelectedGroup('');
  }

  if(!data.items.length)return <section className="mg-card"><h2>Menu customizations</h2>
    <p className="mg-muted">Add a menu item first, then set up its choices and add-ons here.</p></section>;

  return <section className="mg-card owner-customizations-card">
    <div className="mg-card-title"><div><h2>Menu customizations</h2>
      <p>Add choices like rice or drinks to a menu item.</p></div></div>
    {showPhotos&&<div className="mg-list">
      {data.items.map(item=><div className="mg-photo-row" key={item.id}>
        <div className="mg-photo-thumb">{publicMenuPhoto(item.image_path)?
          <img src={publicMenuPhoto(item.image_path)!} alt={item.name} loading="lazy"/>:
          <span role="img" aria-label="Image placeholder">🍽️</span>}</div>
        <div className="mg-photo-fields"><strong>{item.name}</strong>
          <label className="mg-field">Menu photo<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
            onChange={event=>setUploads(previous=>({...previous,[item.id]:event.target.files?.[0]}))}/></label></div>
        <button type="button" className="mg-secondary" disabled={busy||!uploads[item.id]}
          onClick={()=>{const file=uploads[item.id];if(!file)return;void run('Photo',()=>uploadMenuPhoto(data.tenant.id,item.id,file))
            .then(next=>{if(next)setUploads(previous=>({...previous,[item.id]:undefined}));});}}>Upload</button>
      </div>)}
    </div>}

    <label className="mg-field mg-selector">Menu item
      <select value={itemId} onChange={event=>{setSelectedItem(event.target.value);setSelectedGroup('');setShowGroupForm(false);}}>
        {data.items.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>

    <div className="mg-customization-list">
      {groups.map(group=>{
        const options=data.options.filter(option=>option.group_id===group.id);
        const activeCount=options.filter(option=>option.is_active).length;
        const canPublish=activeCount>=group.min_select&&activeCount>0;
        const summary=group.min_select===1&&group.max_select===1?'Required · choose 1':group.min_select===0?'Optional · up to '+group.max_select+' choices':'Required · '+group.min_select+'–'+group.max_select+' choices';
        return <article className="mg-customization-group" key={group.id}>
          <div className="mg-customization-group-heading">
            <details open={selectedGroup===group.id} onToggle={event=>onGroupToggle(event,group.id)}>
              <summary><strong>{group.name}</strong><span>{summary} · {options.length} {options.length===1?'choice':'choices'}</span></summary>
            </details>
            <label className="mg-toggle"><input type="checkbox" checked={group.is_active}
              disabled={busy||(!group.is_active&&!canPublish)}
              onChange={event=>void run('Customization visibility',()=>changeModifierGroup(data.tenant.id,group.id,event.target.checked))}/>
              Show to customers</label>
          </div>
          {selectedGroup===group.id&&<div className="mg-customization-group-body">
            {editingGroup===group.id?<form className="mg-form" onSubmit={event=>{event.preventDefault();const min=Number(editingMinimum),max=Number(editingMaximum);if(!Number.isInteger(min)||!Number.isInteger(max)||min<0||max<1||min>max||max>20)return;void run('Customization group',()=>updateModifierGroup(data.tenant.id,group.id,editingGroupName,min,max)).then(next=>{if(next)setEditingGroup('');});}}>
              <label className="mg-field">Group name<input required minLength={2} maxLength={100} value={editingGroupName} onChange={event=>setEditingGroupName(event.target.value)}/></label>
              <div className="mg-fields-two"><label className="mg-field">Minimum choices<input type="number" min={0} max={20} value={editingMinimum} onChange={event=>setEditingMinimum(event.target.value)}/></label><label className="mg-field">Maximum choices<input type="number" min={1} max={20} value={editingMaximum} onChange={event=>setEditingMaximum(event.target.value)}/></label></div>
              <div className="mg-actions"><button type="submit" disabled={busy||(group.is_active&&(activeCount===0||activeCount<Number(editingMinimum)))}>Save</button><button type="button" className="mg-secondary" onClick={()=>setEditingGroup('')}>Cancel</button></div>
            </form>:<div className="mg-customization-options">
              {options.map(option=><div className="mg-customization-option" key={option.id}>
                {editingOption===option.id?<form className="mg-form" onSubmit={event=>{event.preventDefault();const cents=pesoInputToCentavos(editingOptionPrice);if(cents===null)return;void run('Customization choice',()=>updateModifierOption(data.tenant.id,option.id,editingOptionName,cents)).then(next=>{if(next)setEditingOption('');});}}>
                  <label className="mg-field">Choice<input required minLength={2} maxLength={100} value={editingOptionName} onChange={event=>setEditingOptionName(event.target.value)}/></label>
                  <label className="mg-field">Extra price (PHP)<input required inputMode="decimal" value={editingOptionPrice} onChange={event=>setEditingOptionPrice(event.target.value)}/></label>
                  <div className="mg-actions"><button type="submit" disabled={busy}>Save</button><button type="button" className="mg-secondary" onClick={()=>setEditingOption('')}>Cancel</button></div>
                </form>:<><div><strong>{option.name}</strong><span>{option.price_centavos===0?'Included':'+'+centavosToPesoInput(option.price_centavos)+' PHP'}</span></div>
                  <button type="button" className="mg-secondary" onClick={()=>{setEditingOption(option.id);setEditingOptionName(option.name);setEditingOptionPrice(centavosToPesoInput(option.price_centavos));}}>Edit</button>
                  <label className="mg-toggle"><input type="checkbox" checked={option.is_active} disabled={busy||(option.is_active&&group.min_select>options.filter(candidate=>candidate.is_active).length-1)}
                    onChange={event=>void run('Choice availability',()=>changeModifierOption(data.tenant.id,option.id,event.target.checked))}/>Available</label>
                </>}
              </div>)}
              {!options.length&&<p className="mg-muted">No choices yet. Add the first one below.</p>}
              <form className="mg-customization-add-choice" onSubmit={event=>addOption(event,group.id)}>
                <label className="mg-field">Choice<input required minLength={2} maxLength={100} value={selectedGroup===group.id?optionName:''}
                  onChange={event=>setOptionName(event.target.value)} placeholder="e.g. Garlic rice"/></label>
                <label className="mg-field">Extra price (PHP)<input required inputMode="decimal" value={selectedGroup===group.id?optionPrice:'0'}
                  onChange={event=>setOptionPrice(event.target.value)} placeholder="0.00"/></label>
                <button type="submit" disabled={busy||options.length>=20}>Add choice</button>
              </form>
            </div>}
            <button type="button" className="mg-secondary mg-edit-group" onClick={()=>{setEditingGroup(group.id);setEditingGroupName(group.name);setEditingMinimum(String(group.min_select));setEditingMaximum(String(group.max_select));}}>Edit group rules</button>
          </div>}
        </article>;
      })}
      {!groups.length&&!showGroupForm&&<p className="mg-muted mg-customization-empty">No choices set up for this item yet.</p>}
    </div>

    {showGroupForm?<form className="mg-customization-create-form" onSubmit={addGroup}>
      <label className="mg-field">Group name<input required minLength={2} maxLength={100} value={groupName} onChange={event=>setGroupName(event.target.value)} placeholder="e.g. Choose your rice"/></label>
      <fieldset className="mg-choice-mode"><legend>Customer selection</legend>
        <label><input type="radio" name="customization-required" checked={groupRequired} onChange={()=>setGroupRequired(true)}/><span><strong>Required</strong><small>They must choose at least one.</small></span></label>
        <label><input type="radio" name="customization-required" checked={!groupRequired} onChange={()=>setGroupRequired(false)}/><span><strong>Optional</strong><small>They can skip it.</small></span></label>
      </fieldset>
      <label className="mg-multiple-choice"><input type="checkbox" checked={allowMultiple} onChange={event=>setAllowMultiple(event.target.checked)}/><span>Allow more than one choice</span></label>
      <div className="mg-actions"><button type="submit" disabled={busy||groups.length>=8}>Create group</button><button type="button" className="mg-secondary" onClick={()=>setShowGroupForm(false)}>Cancel</button></div>
    </form>:<button type="button" className="mg-secondary mg-add-customization" disabled={busy||groups.length>=8} onClick={()=>setShowGroupForm(true)}>+ Add choices</button>}
  </section>;
}
