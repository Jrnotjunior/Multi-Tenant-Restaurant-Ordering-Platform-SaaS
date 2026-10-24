import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';

type Tab = 'profile'|'hours'|'delivery'|'cash'|'rider'|'payments';
type StoreRecord = { tenant_id:string; display_name:string|null; status:string|null; accepting_orders:boolean|null; tagline:string|null };
const tabs:{key:Tab;label:string}[]=[
 {key:'profile',label:'Profile'},{key:'hours',label:'Store status & hours'},{key:'delivery',label:'Delivery pricing'},
 {key:'cash',label:'Cash Payment Options'},{key:'rider',label:'Rider assignment'},{key:'payments',label:'Online payments'}
];
type Props={tenantId:string;restaurantName:string|null};
export function OwnerStoreSettingsPage({tenantId,restaurantName}:Props){
 const [tab,setTab]=useState<Tab>('profile');
 const [store,setStore]=useState<StoreRecord|null>(null);
 const [displayName,setDisplayName]=useState(restaurantName??'');
 const [tagline,setTagline]=useState('');
 const [status,setStatus]=useState('active');
 const [acceptingOrders,setAcceptingOrders]=useState(true);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [message,setMessage]=useState('');
 useEffect(()=>{
  let active=true;
  async function load(){
   try{
    if(!supabase)throw new Error('Store settings service is not configured.');
    const {data,error}=await supabase.from('tenant_storefronts')
      .select('tenant_id,display_name,status,accepting_orders,tagline')
      .eq('tenant_id',tenantId).maybeSingle();
    if(error)throw error;
    if(!data)throw new Error('No storefront settings exist for this restaurant yet.');
    if(!active)return;
    const row=data as StoreRecord;setStore(row);setDisplayName(row.display_name??restaurantName??'');
    setTagline(row.tagline??'');setStatus(row.status??'active');setAcceptingOrders(row.accepting_orders??true);
   }catch(e){if(active)setMessage(e instanceof Error?e.message:'Unable to load store settings.');}
   finally{if(active)setLoading(false);}
  }
  void load();return()=>{active=false};
 },[tenantId,restaurantName]);
 async function save(e:FormEvent){
  e.preventDefault();if(!supabase)return;setSaving(true);setMessage('');
  try{
   const {error}=await supabase.from('tenant_storefronts').update({
    display_name:displayName.trim(),tagline:tagline.trim(),status,accepting_orders:acceptingOrders,updated_at:new Date().toISOString()
   }).eq('tenant_id',tenantId);
   if(error)throw error;
   setStore({...store!,display_name:displayName.trim(),tagline:tagline.trim(),status,accepting_orders:acceptingOrders});
   setMessage('Store settings saved.');
  }catch(e){setMessage(e instanceof Error?e.message:'Unable to save store settings.');}
  finally{setSaving(false);}
 }
 if(loading)return <main className="owner-content"><section className="owner-orders-empty"><h1>Store Settings</h1><p>Loading store settings…</p></section></main>;
 if(!store)return <main className="owner-content"><section className="owner-orders-empty"><h1>Store Settings</h1><p role="alert">{message||'Store settings could not be loaded.'}</p></section></main>;
 return <main className="owner-content owner-store-settings">
  <nav className="owner-branding-tabs" aria-label="Store settings sections">{tabs.map(item=><button type="button" key={item.key} className={tab===item.key?'active':''} onClick={()=>{setTab(item.key);setMessage('')}}>{item.label}</button>)}</nav>
  <form onSubmit={save}>
   {tab==='profile'&&<section className="owner-branding-panel"><h2>Restaurant profile</h2><p>Manage the basic information shown for your restaurant.</p>
    <label className="owner-branding-input">Restaurant name<input required maxLength={160} value={displayName} onChange={e=>setDisplayName(e.target.value)}/></label>
    <label className="owner-branding-input">Tagline<input maxLength={180} value={tagline} onChange={e=>setTagline(e.target.value)}/></label>
   </section>}
   {tab==='hours'&&<section className="owner-branding-panel"><h2>Store status &amp; hours</h2><p>Control whether your storefront accepts new orders. Opening-hour scheduling requires a persisted hours configuration.</p>
    <label className="owner-branding-input">Store status<select value={status} onChange={e=>setStatus(e.target.value)}><option value="active">Active</option><option value="paused">Paused</option><option value="inactive">Inactive</option></select></label>
    <label className="owner-settings-toggle"><input type="checkbox" checked={acceptingOrders} onChange={e=>setAcceptingOrders(e.target.checked)}/> Accepting new orders</label>
    <p className="owner-settings-note">Opening hours are not yet stored in the current database schema; no schedule is simulated here.</p>
   </section>}
   {tab==='delivery'&&<section className="owner-branding-panel"><h2>Delivery pricing</h2><p>Delivery fees and delivery zones need a tenant-scoped delivery configuration before they can be edited safely.</p><p className="owner-settings-note">Delivery pricing is not connected yet. No changes will be simulated or saved as if they were real.</p></section>}
   {tab==='cash'&&<section className="owner-branding-panel"><h2>Cash Payment Options</h2><p>Configure whether cash on delivery is offered and any cash collection rules.</p><p className="owner-settings-note">Cash payment options are not connected to a persisted tenant setting yet.</p></section>}
   {tab==='rider'&&<section className="owner-branding-panel"><h2>Rider assignment</h2><p>Manage how orders are assigned to delivery riders.</p><p className="owner-settings-note">Rider assignment settings are not connected to a persisted tenant setting yet.</p></section>}
   {tab==='payments'&&<section className="owner-branding-panel"><h2>Online payments</h2><p>Configure supported online payment methods for this restaurant.</p><p className="owner-settings-note">Online payment configuration is not connected to a persisted tenant setting yet.</p></section>}
   {(tab==='profile'||tab==='hours')&&<div className="owner-branding-actions"><button type="submit" disabled={saving}>{saving?'Saving…':'Save settings'}</button></div>}
   {message&&<p className="owner-branding-message" role="status">{message}</p>}
  </form>
 </main>;
}
