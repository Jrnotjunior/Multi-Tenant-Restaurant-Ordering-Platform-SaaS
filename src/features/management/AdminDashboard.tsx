import { useCallback,useEffect,useState,type FormEvent } from 'react';
import { adminTenants,listDeactivatedStaff,provisionRestaurant,removeDeactivatedStaff,sendOwnerInvitation,type DeactivatedStaff,type Tenant } from './menuService';
import './management.css';

export function AdminDashboard(){
  const [tenants,setTenants]=useState<Tenant[]>([]);
  const [deactivatedStaff,setDeactivatedStaff]=useState<DeactivatedStaff[]>([]);
  const [paymentEntitlements,setPaymentEntitlements]=useState<Record<string,boolean>>({});
  const [paymentEntitlementsLoaded,setPaymentEntitlementsLoaded]=useState(false);
  const [restaurantName,setRestaurantName]=useState('');
  const [slug,setSlug]=useState('');
  const [branchName,setBranchName]=useState('');
  const [branchSlug,setBranchSlug]=useState('main');
  const [inviteTenant,setInviteTenant]=useState('');
  const [inviteEmail,setInviteEmail]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');

  const refresh=useCallback(async()=>{
    const [rows,staff,entitlements]=await Promise.all([adminTenants(),listDeactivatedStaff(),listOnlinePaymentEntitlements()]);
    setTenants(rows);
    setDeactivatedStaff(staff);
    setPaymentEntitlements(Object.fromEntries((entitlements as OnlinePaymentEntitlement[]).map(item=>[item.tenant_id,item.enabled])));
    setPaymentEntitlementsLoaded(true);
    setInviteTenant((previous)=>rows.some(x=>x.id===previous)?previous:rows[0]?.id??'');
  },[]);
  useEffect(()=>{let live=true;void refresh().catch(e=>{if(live)setError(e instanceof Error?e.message:'Could not load system administration data');});
    return()=>{live=false;};
  },[refresh]);

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
  const deleteDisabledStaff=(staff:DeactivatedStaff)=>{
    const confirmed=window.confirm(`Delete ${staff.display_name} from ${staff.tenant_name}? This removes their access to this restaurant. Their login and historical records will be kept.`);
    if(!confirmed)return;
    void run(()=>removeDeactivatedStaff(staff.tenant_id,staff.user_id),()=>`${staff.display_name} was removed from ${staff.tenant_name}.`);
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
    <section className="mg-card">
      <div className="mg-card-title"><div><h2>Online payment access</h2><p>Grant or revoke the restaurant's access to online payments. When enabled, the restaurant owner can choose the payment methods they accept.</p></div></div>
      <div className="mg-list">
        {tenants.map(t=><div className="mg-payment-entitlement-row" key={t.id}>
          <div><strong>{t.name}</strong><span>/{t.slug}</span></div>
          <div className="mg-payment-entitlement-control">
            <span className={paymentEntitlements[t.id]?'mg-pill mg-live':'mg-pill'}>{paymentEntitlements[t.id]?'Enabled':'Not enabled'}</span>
            <button type="button" className={paymentEntitlements[t.id]?'mg-secondary':'mg-payment-enable'} disabled={busy||!paymentEntitlementsLoaded} onClick={()=>void run(()=>setOnlinePaymentEntitlement(t.id,!paymentEntitlements[t.id]),()=>paymentEntitlements[t.id]?'Online payments disabled for '+t.name+'.':'Online payments enabled for '+t.name+'. The restaurant can now select its accepted methods.')}>{paymentEntitlements[t.id]?'Turn off':'Enable online payments'}</button>
          </div>
        </div>)}
        {!tenants.length&&<p className="mg-muted">No restaurant records yet.</p>}
      </div>
    </section>
    <section className="mg-card"><div className="mg-card-title"><div><h2>Deactivated staff</h2><p>Remove deactivated staff memberships from their restaurant. Their login and historical records are retained.</p></div><span className="mg-pill">{deactivatedStaff.length} awaiting removal</span></div>
      {!deactivatedStaff.length?<p className="mg-muted">No deactivated staff are waiting for administrator review.</p>:
          <div className="mg-list">{deactivatedStaff.map(staff=><div className="mg-staff-removal-row" key={`${staff.tenant_id}:${staff.user_id}`}>
            <div className="mg-staff-removal-person"><strong>{staff.display_name}</strong><span>{staff.email}{staff.phone?` · ${staff.phone}`:''} · {staff.role} · {staff.tenant_name}</span><small>{staff.branches.length?staff.branches.join(', '):'No branch access'}{staff.disabled_at?` · Deactivated ${new Intl.DateTimeFormat('en-PH',{dateStyle:'medium'}).format(new Date(staff.disabled_at))}`:''}</small></div>
          <button className="mg-danger" type="button" disabled={busy} onClick={()=>deleteDisabledStaff(staff)}>Delete from restaurant</button>
        </div>)}</div>}
    </section>
  </main>;
}
