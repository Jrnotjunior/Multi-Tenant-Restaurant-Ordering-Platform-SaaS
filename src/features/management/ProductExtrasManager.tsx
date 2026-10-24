import {useState,type FormEvent} from 'react';
import {centavosToPesoInput,pesoInputToCentavos} from './pricing';
import {
 createModifierGroup,changeModifierGroup,createModifierOption,changeModifierOption,
 uploadMenuPhoto,publicMenuPhoto,type OwnerData,
} from './menuService';

type Run=(label:string,work:()=>Promise<unknown>)=>Promise<OwnerData|null|undefined>;

export function ProductExtrasManager({data,busy,run}:{data:OwnerData;busy:boolean;run:Run}) {
  const [selectedItem,setSelectedItem]=useState('');
  const [groupName,setGroupName]=useState('');
  const [minimum,setMinimum]=useState('0');
  const [maximum,setMaximum]=useState('1');
  const [selectedGroup,setSelectedGroup]=useState('');
  const [optionName,setOptionName]=useState('');
  const [optionPrice,setOptionPrice]=useState('0');
  const [uploads,setUploads]=useState<Record<string,File|undefined>>({});
  const itemId=data.items.some(item=>item.id===selectedItem)?selectedItem:data.items[0]?.id??'';
  const groups=data.groups.filter(g=>g.item_id===itemId);
  const groupId=groups.some(g=>g.id===selectedGroup)?selectedGroup:groups[0]?.id??'';
  const options=data.options.filter(o=>o.group_id===groupId);

  function addGroup(event:FormEvent) {
    event.preventDefault();
    if(!itemId)return;
    const min=Number(minimum),max=Number(maximum);
    if(!Number.isInteger(min)||!Number.isInteger(max)||min<0||min>max||max>20||max<1)return;
    void run('Modifier group',()=>createModifierGroup(data.tenant.id,itemId,groupName,min,max))
      .then(next=>{if(next)setGroupName('');});
  }
  function addOption(event:FormEvent) {
    event.preventDefault();
    if(!itemId||!groupId)return;
    const cents=pesoInputToCentavos(optionPrice);
    if(cents===null)return;
    void run('Modifier option',()=>createModifierOption(data.tenant.id,itemId,groupId,optionName,cents))
      .then(next=>{if(next){setOptionName('');setOptionPrice('0');}});
  }

  if(!data.items.length)return <section className="mg-card"><h2>Photos and customizations</h2>
    <p className="mg-muted">Add your first product to manage photos, sizes and add-ons.</p></section>;

  return <section className="mg-card">
    <div className="mg-card-title"><div><h2>Product photos and customizations</h2>
      <p>Upload public menu photos, add size choices and configure optional extras.</p></div></div>
    <div className="mg-notice">Images are public restaurant marketing assets. Do not upload IDs, employee details or private documents. Accepted: JPEG, PNG or WebP, up to 3 MB.</div>
    <div className="mg-list">
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
    </div>

    <h3>Sizes and add-on groups</h3>
    <p className="mg-muted">A group sets the minimum and maximum choices. For example, Size: choose 1, or Extra toppings: choose up to 3.</p>
    <label className="mg-field mg-selector">Product
      <select value={itemId} onChange={event=>{setSelectedItem(event.target.value);setSelectedGroup('');}}>
        {data.items.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
    <form className="mg-form" onSubmit={addGroup}>
      <div className="mg-fields-two">
        <label className="mg-field">New modifier group
          <input required minLength={2} maxLength={100} value={groupName}
            onChange={e=>setGroupName(e.target.value)} placeholder="e.g. Choose your size"/></label>
        <div className="mg-fields-two">
          <label className="mg-field">Minimum
            <input type="number" min={0} max={20} required value={minimum}
              onChange={e=>setMinimum(e.target.value)}/></label>
          <label className="mg-field">Maximum
            <input type="number" min={1} max={20} required value={maximum}
              onChange={e=>setMaximum(e.target.value)}/></label>
        </div>
      </div>
      <div className="mg-actions"><button type="submit" disabled={busy||!itemId||data.groups.filter(g=>g.item_id===itemId).length>=8}>Create inactive group</button></div>
    </form>
    <div className="mg-list">
      {groups.map(group=>{
        const activeCount=data.options.filter(o=>o.group_id===group.id&&o.is_active).length;
        const canPublish=activeCount>=group.min_select && activeCount>0;
        return <div className="mg-list-row" key={group.id}>
          <div><strong>{group.name}</strong><span>Choose {group.min_select}–{group.max_select} · {activeCount} enabled options</span></div>
          <label className="mg-toggle"><input type="checkbox" checked={group.is_active}
            disabled={busy||(!group.is_active&&!canPublish)}
            onChange={e=>void run('Group visibility',()=>changeModifierGroup(data.tenant.id,group.id,e.target.checked))}/>
            Visible</label>
        </div>;
      })}
      {!groups.length&&<p className="mg-muted">No modifier groups yet. Add one above.</p>}
    </div>

    {groups.length>0&&<>
      <h3>Modifier options</h3>
      <label className="mg-field mg-selector">Group
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
        <div className="mg-actions"><button type="submit" disabled={busy||options.length>=20||!groupId}>Create inactive option</button></div>
      </form>
      <div className="mg-list">
        {options.map(option=><div className="mg-list-row" key={option.id}>
          <div><strong>{option.name}</strong><span>+₱{centavosToPesoInput(option.price_centavos)}</span></div>
          <label className="mg-toggle"><input type="checkbox" checked={option.is_active} disabled={busy}
            onChange={e=>void run('Option visibility',()=>changeModifierOption(
              data.tenant.id,option.id,e.target.checked))}/>Visible</label>
        </div>)}
      </div>
    </>}
    <p className="mg-hint">Groups and options start hidden. Activate options first, then enable the group. Disabling required options may make a published item uncustomizable; verify the storefront after changes. Checkout remains disabled.</p>
  </section>;
}
