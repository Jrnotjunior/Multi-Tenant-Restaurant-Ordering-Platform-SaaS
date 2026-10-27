import { useEffect,useState } from 'react';
import { supabase } from '../../lib/supabase';
import { normalizeAppBase } from '../../app/routes';
import { StorefrontFooter } from './StorefrontChrome';
import './storefront.css';
type Tx={id:string;tenant_id:string;points_change:number;transaction_type:string;description:string;created_at:string;restaurantName?:string};
const logo='https://wvibrchebfwirbgkcnbr.supabase.co/storage/v1/object/public/web2table-assets/web2table.png';
export function CustomerLoyaltyPage({baseUrl}:{baseUrl:string}){
 const base=normalizeAppBase(baseUrl),[points,setPoints]=useState(0),[earned,setEarned]=useState(0),[redeemed,setRedeemed]=useState(0),[transactions,setTransactions]=useState<Tx[]>([]),[loading,setLoading]=useState(true),[message,setMessage]=useState('');
 useEffect(()=>{let live=true;void(async()=>{if(!supabase){setMessage('Account services are not configured.');setLoading(false);return;}const {data,error}=await supabase.auth.getSession();const user=data.session?.user;if(error||!user){window.location.assign(base+'account/sign-in');return;}
 const [accounts,ledger]=await Promise.all([
  supabase.from('tenant_customer_loyalty_accounts').select('tenant_id,points_balance,lifetime_points_earned,lifetime_points_redeemed').eq('customer_user_id',user.id),
  supabase.from('tenant_customer_loyalty_transactions').select('id,tenant_id,points_change,transaction_type,description,created_at').eq('customer_user_id',user.id).order('created_at',{ascending:false}).limit(100)
 ]);
 if(!live)return;
 if(accounts.error||ledger.error){setMessage('Could not load your restaurant loyalty activity. Please try again.');setLoading(false);return;}
 const accountRows=accounts.data??[];
 const ledgerRows=(ledger.data??[]) as Tx[];
 const tenantIds=[...new Set([...accountRows.map(a=>a.tenant_id),...ledgerRows.map(t=>t.tenant_id)])];
 let names=new Map<string,string>();
 if(tenantIds.length){const {data:tenants}=await supabase.from('tenants').select('id,name').in('id',tenantIds);names=new Map((tenants??[]).map(t=>[t.id,t.name]));}
 if(!live)return;
 setPoints(accountRows.reduce((sum,a)=>sum+Number(a.points_balance??0),0));
 setEarned(accountRows.reduce((sum,a)=>sum+Number(a.lifetime_points_earned??0),0));
 setRedeemed(accountRows.reduce((sum,a)=>sum+Number(a.lifetime_points_redeemed??0),0));
 setTransactions(ledgerRows.map(t=>({...t,restaurantName:names.get(t.tenant_id)??'Restaurant rewards'})));
 setLoading(false);
 })();return()=>{live=false;};},[base]);
 return <div className="sf-storefront sf-account-page"><header className="sf-header"><div className="sf-header-inner"><a className="sf-logo" href={base} aria-label="Web2Table storefront"><img src={logo} alt="Web2Table" className="sf-account-logo"/></a><nav className="sf-header-actions"><a className="sf-account-header-link" href={base+'account'}>My Account</a><a className="sf-account-header-link" href={base}>Storefront</a></nav></div></header><main className="sf-main sf-account-main"><a className="sf-account-back-link" href={base+'account'}>‹ Back to account</a><section className="sf-account-hero"><span className="sf-tracking-eyebrow">CUSTOMER REWARDS</span><h1>Loyalty Points</h1><p className="sf-account-email">Your points balance and rewards activity.</p><div className="sf-loyalty-balance"><span>Available points</span><strong>{loading?'—':points.toLocaleString()}</strong><small>Points are managed securely by Web2Table.</small></div></section>{message&&<p role="status" className="sf-account-message">{message}</p>}<div className="sf-loyalty-stats"><article><span>Lifetime earned</span><strong>{loading?'—':earned.toLocaleString()}</strong></article><article><span>Lifetime redeemed</span><strong>{loading?'—':redeemed.toLocaleString()}</strong></article></div><section className="sf-address-list"><h2>Points activity</h2>{loading?<p>Loading activity…</p>:transactions.length===0?<p>No points activity yet. When you earn or redeem points, your activity will appear here.</p>:transactions.map(t=><article className="sf-loyalty-transaction" key={t.id}><div><strong>{t.description||t.transaction_type.replace('_',' ')}</strong><small>{t.restaurantName} · {new Date(t.created_at).toLocaleString()}</small></div><strong className={t.points_change>0?'sf-points-positive':'sf-points-negative'}>{t.points_change>0?'+':''}{t.points_change.toLocaleString()} pts</strong></article>)}</section></main><StorefrontFooter /></div>;
}