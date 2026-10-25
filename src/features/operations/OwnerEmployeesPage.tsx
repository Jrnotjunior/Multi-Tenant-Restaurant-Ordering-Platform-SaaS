import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import './owner-employees.css';

type Branch={id:string;name:string;slug:string;is_active:boolean};
type Staff={user_id:string;email:string;display_name:string;role:string;status:string;branches:{id:string;name:string}[]};
type Invitation={id:string;email:string;role:string;branch_id:string;branch_name:string|null;status:string;expires_at:string};
type Directory={branches:Branch[];staff:Staff[];invitations:Invitation[]};
const roles=[['cashier','Cashier'],['kitchen','Kitchen'],['dispatcher','Dispatcher'],['rider','Rider']];
const pretty=(value:string)=>value.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());

export function OwnerEmployeesPage({tenantId,restaurantName}:{tenantId:string;restaurantName:string|null}){
 const [directory,setDirectory]=useState<Directory>({branches:[],staff:[],invitations:[]});
 const [email,setEmail]=useState('');const [name,setName]=useState('');const [role,setRole]=useState('cashier');const [branchId,setBranchId]=useState('');
 const [loading,setLoading]=useState(true);const [sending,setSending]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
 const load=useCallback(async()=>{if(!supabase){setError('Restaurant services are not configured.');setLoading(false);return;}setLoading(true);setError('');
  try{const {data,error:queryError}=await supabase.rpc('list_tenant_staff',{p_tenant_id:tenantId});if(queryError)throw queryError;
   const result=(data??{}) as Directory;setDirectory({branches:result.branches??[],staff:result.staff??[],invitations:result.invitations??[]});
   const first=(result.branches??[]).find(branch=>branch.is_active);if(first)setBranchId(current=>current||first.id);
  }catch(reason){setError(reason instanceof Error?reason.message:'Unable to load staff directory.');}finally{setLoading(false);}
 },[tenantId]);
 useEffect(()=>{void load();},[load]);
 async function invite(event:React.FormEvent<HTMLFormElement>){event.preventDefault();if(!supabase)return;setError('');setNotice('');
  if(!branchId){setError('Create or activate a branch before inviting staff.');return;}setSending(true);
  try{const {data,error:invokeError}=await supabase.functions.invoke('restaurant-invite-staff',{body:{tenant_id:tenantId,email:email.trim(),name:name.trim(),role,branch_id:branchId}});
   if(invokeError)throw invokeError;const response=data as {success?:boolean;message?:string;error?:string};if(!response?.success)throw new Error(response?.error??'The invitation could not be sent.');
   setNotice('Invitation sent to '+email.trim()+'.');setEmail('');setName('');await load();
  }catch(reason){setError(reason instanceof Error?reason.message:'Unable to send staff invitation.');}finally{setSending(false);}
 }
 return <main className="owner-content owner-employees">
  <header className="employees-heading"><div><p className="employees-eyebrow">PEOPLE & PERMISSIONS</p><h1>Employees</h1><p>Invite your team to {restaurantName??'your restaurant'}, assign their role, and restrict their access to a branch.</p></div><button className="employees-secondary" type="button" onClick={()=>void load()} disabled={loading}>Refresh</button></header>
  {(error||notice)&&<div className={'employees-alert '+(error?'is-error':'is-success')} role={error?'alert':'status'}>{error||notice}</div>}
  <section className="employees-panel"><div className="employees-panel-heading"><div><h2>Invite a team member</h2><p>They receive an email to finish setting up their account.</p></div><span className="employees-pill">MFA protected</span></div>
   <form className="employees-form" onSubmit={event=>void invite(event)}>
    <label>Full name<input value={name} onChange={event=>setName(event.target.value)} required maxLength={120} autoComplete="name" placeholder="Team member name"/></label>
    <label>Email address<input type="email" value={email} onChange={event=>setEmail(event.target.value)} required maxLength={254} autoComplete="email" placeholder="teammate@example.com"/></label>
    <label>Role<select value={role} onChange={event=>setRole(event.target.value)}>{roles.map(([value,text])=><option key={value} value={value}>{text}</option>)}</select></label>
    <label>Branch<select value={branchId} onChange={event=>setBranchId(event.target.value)} required><option value="">Choose branch</option>{directory.branches.filter(branch=>branch.is_active).map(branch=><option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
    <div className="employees-form-actions"><button className="employees-primary" type="submit" disabled={sending||loading||!directory.branches.some(branch=>branch.id===branchId&&branch.is_active)}>{sending?'Sending invitation…':'Send invitation'}</button>{!directory.branches.some(branch=>branch.is_active)&&<span>No active branch is available for staff assignment.</span>}</div>
   </form>
  </section>
  <section className="employees-panel"><div className="employees-panel-heading"><div><h2>Current team</h2><p>Staff accounts and branch access.</p></div><span className="employees-count">{directory.staff.length} members</span></div>
   {loading?<p className="employees-empty">Loading team…</p>:directory.staff.length===0?<p className="employees-empty">No staff members yet. Invite a team member above.</p>:
    <div className="employees-table-wrap"><table className="employees-table"><thead><tr><th>Team member</th><th>Role</th><th>Branch access</th><th>Status</th></tr></thead><tbody>{directory.staff.map(member=><tr key={member.user_id}><td><strong>{member.display_name||member.email}</strong><small>{member.email}</small></td><td>{pretty(member.role)}</td><td>{member.branches.map(branch=>branch.name).join(', ')||'No branch assigned'}</td><td><span className={'employees-status '+(member.status==='active'?'is-active':'')}>{pretty(member.status)}</span></td></tr>)}</tbody></table></div>}
  </section>
  <section className="employees-panel"><div className="employees-panel-heading"><div><h2>Pending invitations</h2><p>Invitations expire after seven days.</p></div><span className="employees-count">{directory.invitations.length} pending</span></div>
   {loading?<p className="employees-empty">Loading invitations…</p>:directory.invitations.length===0?<p className="employees-empty">No pending invitations.</p>:
    <div className="employees-table-wrap"><table className="employees-table"><thead><tr><th>Email</th><th>Role</th><th>Branch</th><th>Status</th><th>Expires</th></tr></thead><tbody>{directory.invitations.map(item=><tr key={item.id}><td><strong>{item.email}</strong></td><td>{pretty(item.role)}</td><td>{item.branch_name??'—'}</td><td><span className="employees-status">{pretty(item.status)}</span></td><td>{new Intl.DateTimeFormat('en-PH',{dateStyle:'medium'}).format(new Date(item.expires_at))}</td></tr>)}</tbody></table></div>}
  </section>
 </main>;
}