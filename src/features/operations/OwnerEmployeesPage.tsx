import { Fragment, useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import './owner-employees.css';

type Branch={id:string;name:string;slug:string;is_active:boolean};
type Staff={user_id:string;email:string;display_name:string;role:string;status:string;branches:{id:string;name:string}[]};
type Invitation={id:string;email:string;role:string;branch_id:string;branch_name:string|null;status:string;expires_at:string};
type Directory={branches:Branch[];staff:Staff[];invitations:Invitation[]};
const roles=[['cashier','Cashier'],['kitchen','Kitchen'],['dispatcher','Dispatcher'],['rider','Rider']];
const pretty=(value:string)=>value.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());

export function OwnerEmployeesPage({tenantId}:{tenantId:string}){
 const [directory,setDirectory]=useState<Directory>({branches:[],staff:[],invitations:[]});
 const [email,setEmail]=useState('');const [firstName,setFirstName]=useState('');const [lastName,setLastName]=useState('');const [role,setRole]=useState('cashier');const [branchId,setBranchId]=useState('');
 const [editingUser,setEditingUser]=useState<string|null>(null);const [editingRole,setEditingRole]=useState('cashier');const [editingBranchIds,setEditingBranchIds]=useState<string[]>([]);const [staffBusy,setStaffBusy]=useState<string|null>(null);
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
  try{const {data,error:invokeError}=await supabase.functions.invoke('restaurant-invite-staff',{body:{tenant_id:tenantId,email:email.trim(),first_name:firstName.trim(),last_name:lastName.trim(),role,branch_id:branchId}});
   if(invokeError)throw invokeError;const response=data as {success?:boolean;message?:string;error?:string};if(!response?.success)throw new Error(response?.error??'The invitation could not be sent.');
   setNotice('Invitation sent to '+email.trim()+'.');setEmail('');setFirstName('');setLastName('');await load();
  }catch(reason){setError(reason instanceof Error?reason.message:'Unable to send staff invitation.');}finally{setSending(false);}
 }
 function beginEdit(member:Staff){setEditingUser(member.user_id);setEditingRole(member.role);setEditingBranchIds(member.branches.map(branch=>branch.id).filter(id=>directory.branches.some(branch=>branch.id===id&&branch.is_active)));setError('');setNotice('');}
 async function saveStaffAccess(event:React.FormEvent<HTMLFormElement>,member:Staff){event.preventDefault();if(!supabase)return;setError('');setNotice('');
  const validBranchIds=editingBranchIds.filter(id=>directory.branches.some(branch=>branch.id===id&&branch.is_active));
  if(!validBranchIds.length){setError('Select at least one active branch for this team member.');return;}
  setStaffBusy(member.user_id);
  try{const {error:saveError}=await supabase.rpc('owner_update_tenant_staff',{p_tenant_id:tenantId,p_user_id:member.user_id,p_role:editingRole,p_branch_ids:validBranchIds});if(saveError)throw saveError;
   setEditingUser(null);setNotice(`Access updated for ${member.display_name||pretty(member.role)}.`);await load();
  }catch(reason){setError(reason instanceof Error?reason.message:'Unable to update staff access.');}finally{setStaffBusy(null);}
 }
 async function setStaffStatus(member:Staff){if(!supabase)return;const nextStatus=member.status==='active'?'disabled':'active';
  const prompt=nextStatus==='disabled'?`Deactivate ${member.display_name||pretty(member.role)}? They will lose access and remain in the System Administrator's removal queue.`:`Reactivate ${member.display_name||pretty(member.role)}? They will regain access to their assigned branches.`;
  if(!window.confirm(prompt))return;setError('');setNotice('');setStaffBusy(member.user_id);
  try{const {error:statusError}=await supabase.rpc('owner_set_tenant_staff_status',{p_tenant_id:tenantId,p_user_id:member.user_id,p_status:nextStatus});if(statusError)throw statusError;
   setNotice(nextStatus==='disabled'?'Employee deactivated. Their access is removed and they are queued for System Administrator review.':'Employee reactivated.');await load();
  }catch(reason){setError(reason instanceof Error?reason.message:'Unable to change employee status.');}finally{setStaffBusy(null);}
 }
 return <main className="owner-content owner-employees">
  <div className="employees-page-actions"><button className="employees-secondary" type="button" onClick={()=>void load()} disabled={loading}>Refresh</button></div>
  {(error||notice)&&<div className={'employees-alert '+(error?'is-error':'is-success')} role={error?'alert':'status'}>{error||notice}</div>}
  <section className="employees-panel"><div className="employees-panel-heading"><div><h2>Invite a team member</h2><p>They receive an email to finish setting up their account.</p></div><span className="employees-pill">MFA protected</span></div>
   <form className="employees-form" onSubmit={event=>void invite(event)}>
    <label>First name<input value={firstName} onChange={event=>setFirstName(event.target.value)} required maxLength={60} autoComplete="given-name" placeholder="First name"/></label>
    <label>Last name<input value={lastName} onChange={event=>setLastName(event.target.value)} required maxLength={60} autoComplete="family-name" placeholder="Last name"/></label>
    <label>Email address<input type="email" value={email} onChange={event=>setEmail(event.target.value)} required maxLength={254} autoComplete="email" placeholder="teammate@example.com"/></label>
    <label>Role<select value={role} onChange={event=>setRole(event.target.value)}>{roles.map(([value,text])=><option key={value} value={value}>{text}</option>)}</select></label>
    <label>Branch<select value={branchId} onChange={event=>setBranchId(event.target.value)} required><option value="">Choose branch</option>{directory.branches.filter(branch=>branch.is_active).map(branch=><option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
    <div className="employees-form-actions"><button className="employees-primary" type="submit" disabled={sending||loading||!directory.branches.some(branch=>branch.id===branchId&&branch.is_active)}>{sending?'Sending invitation…':'Send invitation'}</button>{!directory.branches.some(branch=>branch.is_active)&&<span>No active branch is available for staff assignment.</span>}</div>
   </form>
  </section>
  <section className="employees-panel"><div className="employees-panel-heading"><div><h2>Current team</h2><p>Manage staff role and branch access. Deactivated accounts remain for System Administrator review.</p></div><span className="employees-count">{directory.staff.filter(member=>member.status==='active').length} active · {directory.staff.filter(member=>member.status==='disabled').length} deactivated</span></div>
   {loading?<p className="employees-empty">Loading team…</p>:directory.staff.length===0?<p className="employees-empty">No staff members yet. Invite a team member above.</p>:
    <div className="employees-table-wrap"><table className="employees-table"><thead><tr><th>Team member</th><th>Role</th><th>Branch access</th><th>Status</th><th>Actions</th></tr></thead><tbody>{directory.staff.map(member=><Fragment key={member.user_id}>
      <tr key={member.user_id}><td><strong>{member.display_name||pretty(member.role)}</strong><small>{member.email}</small></td><td>{pretty(member.role)}</td><td>{member.branches.map(branch=>branch.name).join(', ')||'No branch assigned'}</td><td><span className={'employees-status '+(member.status==='active'?'is-active':'is-disabled')}>{member.status==='disabled'?'Deactivated · awaiting admin':pretty(member.status)}</span></td><td><div className="employees-row-actions"><button className="employees-text-button" type="button" onClick={()=>editingUser===member.user_id?setEditingUser(null):beginEdit(member)} disabled={staffBusy!==null}>{editingUser===member.user_id?'Cancel':'Edit access'}</button><button className={member.status==='active'?'employees-danger-button':'employees-text-button'} type="button" onClick={()=>void setStaffStatus(member)} disabled={staffBusy!==null}>{staffBusy===member.user_id?'Saving…':member.status==='active'?'Deactivate':'Reactivate'}</button></div></td></tr>
      {editingUser===member.user_id&&<tr key={`${member.user_id}:edit`}><td colSpan={5}><form className="employees-edit-form" onSubmit={event=>void saveStaffAccess(event,member)}>
        <label>Role<select value={editingRole} onChange={event=>setEditingRole(event.target.value)}>{roles.map(([value,text])=><option key={value} value={value}>{text}</option>)}</select></label>
        <fieldset className="employees-edit-branches"><legend>Branch access</legend>{directory.branches.filter(branch=>branch.is_active).map(branch=><label key={branch.id}><input type="checkbox" checked={editingBranchIds.includes(branch.id)} onChange={event=>setEditingBranchIds(current=>event.target.checked?[...new Set([...current,branch.id])]:current.filter(id=>id!==branch.id))}/><span>{branch.name}</span></label>)}<small>Choose one or more active branches.</small></fieldset>
        <div className="employees-edit-actions"><button className="employees-primary" type="submit" disabled={staffBusy!==null}>{staffBusy===member.user_id?'Saving…':'Save changes'}</button></div>
      </form></td></tr>}
    </Fragment>)}</tbody></table></div>}
  </section>
  <section className="employees-panel"><div className="employees-panel-heading"><div><h2>Pending invitations</h2><p>Invitations expire after seven days.</p></div><span className="employees-count">{directory.invitations.length} pending</span></div>
   {loading?<p className="employees-empty">Loading invitations…</p>:directory.invitations.length===0?<p className="employees-empty">No pending invitations.</p>:
    <div className="employees-table-wrap"><table className="employees-table"><thead><tr><th>Email</th><th>Role</th><th>Branch</th><th>Status</th><th>Expires</th></tr></thead><tbody>{directory.invitations.map(item=><tr key={item.id}><td><strong>{item.email}</strong></td><td>{pretty(item.role)}</td><td>{item.branch_name??'—'}</td><td><span className="employees-status">{pretty(item.status)}</span></td><td>{new Intl.DateTimeFormat('en-PH',{dateStyle:'medium'}).format(new Date(item.expires_at))}</td></tr>)}</tbody></table></div>}
  </section>
 </main>;
}
