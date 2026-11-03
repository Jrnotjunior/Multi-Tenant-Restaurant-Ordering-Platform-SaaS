import {useState,type FormEvent} from 'react';
import {centavosToPesoInput,pesoInputToCentavos} from './pricing';
import {
 createModifierGroup,changeModifierGroup,createModifierOption,changeModifierOption,
 updateModifierGroup,updateModifierOption,uploadMenuPhoto,publicMenuPhoto,type OwnerData,
} from './menuService';

type Run=(label:string,work:()=>Promise<unknown>)=>Promise<OwnerData|null|undefined>;

export function ProductExtrasManager({data,busy,run,showPhotos=true}:{data:OwnerData;busy:boolean;run:Run;showPhotos?:boolean}) {
  const [selectedItem,setSelectedItem]=useState('');
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
  const groups=data.groups.filter(g=>g.item_id===itemId);
  const groupId=groups.some(g=>g.id===selectedGroup)?selectedGroup:groups[0]?.id??'';
  const options=data.options.filter(o=>o.group_id===groupId);

  function addGroup(event:FormEvent) {
    event.preventDefault();
    if(!itemId)return;
    const min=groupRequired?1:0,max=allowMultiple?20:1;
    const existingIds=new Set(groups.map(group=>group.id));
    void run('Modifier group',()=>createModifierGroup(data.tenant.id,itemId,groupName,min,max))
      .then(next=>{if(next){setGroupName('');const created=next.groups.find(group=>group.item_id===itemId&&!existingIds.has(group.id));if(created)setSelectedGroup(created.id);}});
  }
  function addOption(event:FormEvent) {
    event.preventDefault();
    if(!itemId||!groupId)return;
    const cents=pesoInputToCentavos(optionPrice);
    if(cents===null)return;
    void run('Modifier option',()=>createModifierOption(data.tenant.id,itemId,groupId,optionName,cents))
      .then(next=>{if(next){setOptionName('');setOptionPrice('0');}});
  }

  if(!data.items.length)return <section className="mg-card"><h2>Menu customizations</h2>
    <p className="mg-muted">Add a menu item first, then configure its choices, add-ons and special instructions here.</p></section>;

  return <section className="mg-card">
    <div className="mg-card-title"><div><h2>Menu customizations</h2>
      <p>Set choices and priced add-ons for each menu item. Customers can add special instructions when ordering.</p></div></div>
    {showPhotos&&<div className="mg-list">
      {data.items.map(item=><div className="mg-photo-row" key={item.id}>
        <div className="mg-photo-thumb">{publicMenuPhoto(item.image_path)?
          <img src={publicMenuPhoto(item.image_path)!} alt={item.name} loading="lazy"/>:
          <span role="img" aria-label="Image placeholder">🍽️</span>}</div>
        <div className="mg-photo-fields">
          <strong>{item.name}</strong>
          <label className="mg-field">Menu photo
            <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
              onChange={event=>setUploads(previous=>({...previous,[item.id]:event.target.files?.[0]}))}/>
          </label>
        </div>
        <button type="button" className="mg-secondary"
          disabled={busy||!uploads[item.id]}
          onClick={()=>{const file=uploads[item.id];if(!file)return;
            void run('Photo',()=>uploadMenuPhoto(data.tenant.id,item.id,file))
              .then(next=>{if(next)setUploads(previous=>({...previous,[item.id]:undefined}));});
          }}>Upload</button>
      </div>)}
    </div>}

    <h3>Set up choices for a menu item</h3>
    <p className="mg-muted">For example, create “Choose your rice” for Chicken Teriyaki Rice Bowl, then add Regular rice, Extra rice, and Garlic rice.</p>
    <label className="mg-field mg-selector">Menu item
      <select value={itemId} onChange={event=>{setSelectedItem(event.target.value);setSelectedGroup('');}}>
        {data.items.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
    <form className="mg-form" onSubmit={addGroup}>
      <label className="mg-field">What should customers choose?
        <input required minLength={2} maxLength={100} value={groupName}
          onChange={e=>setGroupName(e.target.value)} placeholder="e.g. Choose your rice"/></label>
      <fieldset className="mg-choice-mode">
        <legend>Is a choice required?</legend>
        <label><input type="radio" name="customization-required" checked={groupRequired} onChange={()=>setGroupRequired(true)}/><span><strong>Yes, required</strong><small>Customers must choose at least one.</small></span></label>
        <label><input type="radio" name="customization-required" checked={!groupRequired} onChange={()=>setGroupRequired(false)}/><span><strong>No, optional</strong><small>Customers can skip this section.</small></span></label>
      </fieldset>
      <label className="mg-multiple-choice"><input type="checkbox" checked={allowMultiple} onChange={event=>setAllowMultiple(event.target.checked)}/><span>Allow customers to choose more than one</span></label>
      <div className="mg-actions"><button type="submit" disabled={busy||!itemId||data.groups.filter(g=>g.item_id===itemId).length>=8}>Next: add choices</button></div>
    </form>
    <div className="mg-list">
      {groups.map(group=>{
        const activeCount=data.options.filter(o=>o.group_id===group.id&&o.is_active).length;
        const canPublish=activeCount>=group.min_select && activeCount>0;
        return <div className="mg-list-row" key={group.id}>
          {editingGroup===group.id?<form className="mg-form" onSubmit={event=>{event.preventDefault();const min=Number(editingMinimum),max=Number(editingMaximum);if(!Number.isInteger(min)||!Number.isInteger(max)||min<0||max<1||min>max||max>20)return;void run('Edit customization group',()=>updateModifierGroup(data.tenant.id,group.id,editingGroupName,min,max)).then(next=>{if(next)setEditingGroup('');});}}>
            <label className="mg-field">Group name<input required minLength={2} maxLength={100} value={editingGroupName} onChange={e=>setEditingGroupName(e.target.value)}/></label>
            <div className="mg-fields-two"><label className="mg-field">Minimum<input type="number" min={0} max={20} value={editingMinimum} onChange={e=>setEditingMinimum(e.target.value)}/></label><label className="mg-field">Maximum<input type="number" min={1} max={20} value={editingMaximum} onChange={e=>setEditingMaximum(e.target.value)}/></label></div>
            <div className="mg-actions"><button type="submit" disabled={busy||(group.is_active&&(activeCount===0||activeCount<Number(editingMinimum)))}>Save</button><button type="button" className="mg-secondary" onClick={()=>setEditingGroup('')}>Cancel</button></div>
          </form>:<div><strong>{group.name}</strong><span>{group.min_select===1&&group.max_select===1?'Required · choose 1':group.min_select===0?'Optional · choose up to '+group.max_select:'Required · choose '+group.min_select+' to '+group.max_select} · {activeCount} available choices</span></div>}
          {editingGroup!==group.id&&<><button type="button" className="mg-secondary" onClick={()=>{setEditingGroup(group.id);setEditingGroupName(group.name);setEditingMinimum(String(group.min_select));setEditingMaximum(String(group.max_select));}}>Edit</button><label className="mg-toggle"><input type="checkbox" checked={group.is_active}
            disabled={busy||(!group.is_active&&!canPublish)}
            onChange={e=>void run('Group visibility',()=>changeModifierGroup(data.tenant.id,group.id,e.target.checked))}/>
            Show to customers</label></>}
        </div>;
      })}
      {!groups.length&&<p className="mg-muted">No modifier groups yet. Add one above.</p>}
    </div>

    {groups.length>0&&<>
      <h3>Add choices and prices</h3>
      <p className="mg-muted">Add choices like “Regular rice” or “Extra rice.” Enter 0 for an included choice. New choices are available immediately; the group stays hidden until you show it to customers.</p>
      <label className="mg-field mg-selector">Editing choices for
        <select value={groupId} onChange={e=>setSelectedGroup(e.target.value)}>
          {groups.map(group=><option value={group.id} key={group.id}>{group.name}</option>)}
        </select></label>
      <form className="mg-form" onSubmit={addOption}>
        <div className="mg-fields-two">
          <label className="mg-field">Option name
            <input required minLength={2} maxLength={100} value={optionName}
              onChange={e=>setOptionName(e.target.value)} placeholder="e.g. Large or Extra Cheese"/></label>
          <label className="mg-field">Additional price (PHP)
            <input required inputMode="decimal" value={optionPrice}
              onChange={e=>setOptionPrice(e.target.value)} placeholder="0.00"/></label>
        </div>
        <div className="mg-actions"><button type="submit" disabled={busy||options.length>=20||!groupId}>Add choice</button></div>
      </form>
      <div className="mg-list">
        {options.map(option=><div className="mg-list-row" key={option.id}>
          {editingOption===option.id?<form className="mg-form" onSubmit={event=>{event.preventDefault();const cents=pesoInputToCentavos(editingOptionPrice);if(cents===null)return;void run('Edit customization option',()=>updateModifierOption(data.tenant.id,option.id,editingOptionName,cents)).then(next=>{if(next)setEditingOption('');});}}>
            <label className="mg-field">Option name<input required minLength={2} maxLength={100} value={editingOptionName} onChange={e=>setEditingOptionName(e.target.value)}/></label>
            <label className="mg-field">Additional price (PHP)<input required inputMode="decimal" value={editingOptionPrice} onChange={e=>setEditingOptionPrice(e.target.value)}/></label>
            <div className="mg-actions"><button type="submit" disabled={busy}>Save</button><button type="button" className="mg-secondary" onClick={()=>setEditingOption('')}>Cancel</button></div>
          </form>:<div><strong>{option.name}</strong><span>+₱{centavosToPesoInput(option.price_centavos)}</span></div>}
          {editingOption!==option.id&&<><button type="button" className="mg-secondary" onClick={()=>{setEditingOption(option.id);setEditingOptionName(option.name);setEditingOptionPrice(centavosToPesoInput(option.price_centavos));}}>Edit</button><label className="mg-toggle"><input type="checkbox" checked={option.is_active} disabled={busy||(option.is_active&&(groups.find(group=>group.id===groupId)?.min_select??0)>options.filter(candidate=>candidate.is_active).length-1)}
            onChange={e=>void run('Option visibility',()=>changeModifierOption(
              data.tenant.id,option.id,e.target.checked))}/>Available</label></>}
        </div>)}
      </div>
    </>}
    <p className="mg-hint">After adding your choices, turn on Show to customers for the group. Then check the item in your customer menu.</p>
  </section>;
}
