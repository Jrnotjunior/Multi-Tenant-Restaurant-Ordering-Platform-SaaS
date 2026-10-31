import { useEffect,useState,type FormEvent } from 'react';
import { adminTenants,provisionRestaurant,sendOwnerInvitation,type Tenant } from './menuService';
import './management.css';

export function AdminDashboard(){
  const [tenants,setTenants]=useState<Tenant[]>([]);
  const [restaurantName,setRestaurantName]=useState('');
  const [slug,setSlug]=useState('');
  const [branchName,setBranchName]=useState('');
  const [branchSlug,setBranchSlug]=useState('main');
  const [inviteTenant,setInviteTenant]=useState('');
  const [inviteEmail,setInviteEmail]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');

  async function refresh(){
    const rows=await adminTenants();
    setTenants(rows);
    setInviteTenant((previous)=>rows.some(x=>x.id===previous)?previous:rows[0]?.id??'');
  }
  useEffect(()=>{let live=true;void adminTenants().then(rows=>{
    if(!live)return;
    setTenants(rows);
    setInviteTenant(rows[0]?.id??'');
  }).catch(e=>{if(live)setError(e instanceof Error?e.message:'Could not load restaurants');});
    return()=>{live=false;};
  },[]);

  async function run(work:()=>Promise<string>,success:(value:string)=>string) {
    if(busy)return;
    setBusy(true);setMessage('');setError('');
    try{const result=await work();await refresh();setMessage(success(result));}
    catch(e){setError(e instanceof Error?e.message:'Request rejected');}
    finally{setBusy(false);}
  }
  const submitRestaurant=(event:FormEvent)=>{
    event.preventDefault();
    void run(()=>provisionRestaurant(slug,restaurantName,branchSlug,branchName),()=>{
      setRestaurantName('');setSlug('');setBranchName('');setBranchSlug('main');
      return 'Restaurant and initial branch created as an unpublished draft. Invite the restaurant owner separately.';
    });
  };
  const submitOwnerInvite=(event:FormEvent)=>{
    event.preventDefault();
    if(!inviteTenant)return;
    void run(()=>sendOwnerInvitation(inviteTenant,inviteEmail),()=>{
      setInviteEmail('');
      return 'Restaurant owner invitation email sent successfully.';
    });
  };
  return <main className="mg-shell">
    <div className="mg-heading"><div><span className="mg-eyebrow">WEB2TABLE · SYSTEM ADMIN</span>
      <h1>Restaurant onboarding</h1>
      <p>Create a restaurant's initial branch and send a role-specific owner invitation.</p></div></div>
    <div className="mg-notice">Only verified platform administrators with MFA can provision restaurants and send owner invitations. Invite emails use role-specific content and secure account-setup links.</div>
    {message&&<p className="mg-success" role="status">{message}</p>}
    {error&&<p className="mg-error" role="alert">{error}</p>}
    <section className="mg-card">
      <h2>New restaurant</h2>
      <form className="mg-form" onSubmit={submitRestaurant}>
        <div className="mg-fields-two">
          <label className="mg-field">Restaurant name<input required minLength={2} maxLength={160} value={restaurantName}
            onChange={e=>setRestaurantName(e.target.value)} placeholder="Restaurant name"/></label>
          <label className="mg-field">Restaurant URL slug<input required minLength={3} maxLength={64}
            pattern="[a-z0-9]+(-[a-z0-9]+)*" value={slug}
            onChange={e=>setSlug(e.target.value.toLowerCase())} placeholder="my-restaurant"/></label>
        </div>
        <div className="mg-fields-two">
          <label className="mg-field">Initial branch name<input required minLength={2} maxLength={160}
            value={branchName} onChange={e=>setBranchName(e.target.value)} placeholder="Main Branch"/></label>
          <label className="mg-field">Branch slug<input required minLength={2} maxLength={64}
            pattern="[a-z0-9]+(-[a-z0-9]+)*" value={branchSlug} onChange={e=>setBranchSlug(e.target.value.toLowerCase())}/></label>
        </div>
        <button disabled={busy} type="submit">Create restaurant draft</button>
      </form>
    </section>
    <section className="mg-card">
      <h2>Restaurant owner invitation</h2>
      <p className="mg-muted">Send the selected restaurant owner a secure invitation to complete account setup and restaurant onboarding.</p>
      <form className="mg-form" onSubmit={submitOwnerInvite}>
        <label className="mg-field">Restaurant<select required value={inviteTenant}
          onChange={e=>setInviteTenant(e.target.value)}>
          {tenants.map(t=><option value={t.id} key={t.id}>{t.name} ({t.slug})</option>)}
        </select></label>
        <label className="mg-field">Owner email<input required type="email" maxLength={254} value={inviteEmail}
          onChange={e=>setInviteEmail(e.target.value)} placeholder="owner@restaurant.com"/></label>
        <button disabled={busy||!inviteTenant} type="submit">{busy?'Sending invitation…':'Send owner invitation'}</button>
      </form>
    </section>
    <section className="mg-card"><h2>Registered restaurants</h2>
      <div className="mg-list">
        {tenants.map(t=><div className="mg-list-row" key={t.id}><strong>{t.name}</strong><span>/{t.slug}</span></div>)}
        {!tenants.length&&<p className="mg-muted">No restaurant records yet.</p>}
      </div>
    </section>
  </main>;
}
