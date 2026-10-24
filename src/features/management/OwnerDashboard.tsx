import { useEffect, useState, type FormEvent } from 'react';
import { restaurantMenuPath } from '../../app/routes';
import { centavosToPesoInput,pesoInputToCentavos } from './pricing';
import {
  createCategory,loadOwnerData,ownerTenantChoices,saveBrand,saveItem,setBranchItem,
  setPublication,toggleCategory,type Brand,type OwnerData,type Product,type Tenant,
} from './menuService';
import './management.css';

type ItemDraft = {id:string|null;name:string;description:string;category_id:string;price:string;is_popular:boolean;status:Product['status']};
const blankItem = (category_id=''):ItemDraft =>
  ({id:null,name:'',description:'',category_id,price:'',is_popular:false,status:'draft'});
type BrandDraft = Pick<Brand,'display_name'|'tagline'|'hero_heading'|'hero_emphasis'|'primary_color'>;

export function OwnerDashboard({baseUrl}:{baseUrl:string}) {
  const [tenants,setTenants]=useState<Tenant[]>([]);
  const [tenantId,setTenantId]=useState('');
  const [data,setData]=useState<OwnerData|null>(null);
  const [brand,setBrand]=useState<BrandDraft|null>(null);
  const [categoryName,setCategoryName]=useState('');
  const [draft,setDraft]=useState<ItemDraft>(blankItem());
  const [branchId,setBranchId]=useState('');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');

  useEffect(()=>{
    let active=true;
    void ownerTenantChoices().then((rows)=>{
      if(!active)return;
      setTenants(rows);
      setTenantId((previous)=>rows.some(t=>t.id===previous)?previous:(rows[0]?.id??''));
    }).catch(e=>{if(active)setError(e instanceof Error?e.message:'Could not load restaurants');})
      .finally(()=>{if(active)setLoading(false)});
    return()=>{active=false;};
  },[]);

  async function refresh(tenant:Tenant) {
    const next=await loadOwnerData(tenant);
    setData(next);
    setBrand({
      display_name:next.brand.display_name,tagline:next.brand.tagline,
      hero_heading:next.brand.hero_heading,hero_emphasis:next.brand.hero_emphasis,
      primary_color:next.brand.primary_color,
    });
    setBranchId((previous)=>next.branches.some(b=>b.id===previous)
      ?previous:next.brand.default_branch_id);
    return next;
  }

  useEffect(()=>{
    if(!tenantId)return;
    const tenant=tenants.find(t=>t.id===tenantId);
    if(!tenant)return;
    let active=true;
    setLoading(true);setError('');setData(null);setDraft(blankItem());
    void loadOwnerData(tenant).then((next)=>{
      if(!active)return;
      setData(next);
      setBrand({display_name:next.brand.display_name,tagline:next.brand.tagline,
        hero_heading:next.brand.hero_heading,hero_emphasis:next.brand.hero_emphasis,
        primary_color:next.brand.primary_color});
      setBranchId(next.brand.default_branch_id);
      setDraft(blankItem(next.categories[0]?.id??''));
    }).catch(e=>{if(active)setError(e instanceof Error?e.message:'Unable to load menu');})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[tenantId,tenants]);

  const run=async(label:string,work:()=>Promise<unknown>)=>{
    if(!data||busy)return;
    setBusy(true);setMessage('');setError('');
    try{
      await work();
      const updated=await refresh(data.tenant);
      setMessage(label+' saved.');
      return updated;
    }catch(e){setError(e instanceof Error?e.message:'Unable to save changes');}
    finally{setBusy(false);}
    return null;
  };

  function submitBrand(event:FormEvent) {
    event.preventDefault();
    if(!data||!brand)return;
    void run('Branding',()=>saveBrand(data.tenant.id,brand));
  }
  function submitCategory(event:FormEvent) {
    event.preventDefault();
    if(!data||categoryName.trim().length<2)return;
    void run('Category',()=>createCategory(data.tenant.id,categoryName)).then(result=>{
      if(result)setCategoryName('');
    });
  }
  function submitItem(event:FormEvent) {
    event.preventDefault();
    if(!data)return;
    const cents=pesoInputToCentavos(draft.price);
    if(cents===null){setError('Enter a valid PHP price with up to two decimal places.');return;}
    if(!data.categories.some(c=>c.id===draft.category_id)){
      setError('Choose a category belonging to this restaurant.');return;
    }
    void run('Menu item',()=>saveItem(data.tenant.id,draft.id,{
      category_id:draft.category_id,name:draft.name.trim(),
      description:draft.description.trim(),price_centavos:cents,
      is_popular:draft.is_popular,status:draft.status,
    })).then(result=>{if(result)setDraft(blankItem(result.categories[0]?.id??''));});
  }

  if(loading&&!data)return <main className="mg-shell"><p className="mg-muted">Loading restaurant workspace…</p></main>;
  if(!tenants.length)return <main className="mg-shell">
    <h1>Restaurant workspace</h1>
    <p className="mg-muted">No restaurant-owner membership was found for this account. Restaurant creation and owner invitation must be completed by a System Administrator.</p>
    {error&&<p role="alert" className="mg-error">{error}</p>}
  </main>;
  return <main className="mg-shell">
    <div className="mg-heading">
      <div><span className="mg-eyebrow">WEB2TABLE · RESTAURANT</span>
        <h1>Menu management</h1><p>Manage your restaurant's published mobile ordering menu.</p></div>
      {data&&<a className="mg-action-link" target="_blank" rel="noreferrer"
        href={restaurantMenuPath(data.tenant.slug,baseUrl)}>View customer menu ↗</a>}
    </div>
    <div className="mg-notice">Delivery-only storefront. Checkout and payments are not enabled yet. Changes to a published menu can become public immediately.</div>
    <label className="mg-field mg-selector">Restaurant
      <select value={tenantId} onChange={e=>setTenantId(e.target.value)} disabled={busy}>
        {tenants.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </label>
    {message&&<p className="mg-success" role="status">{message}</p>}
    {error&&<p className="mg-error" role="alert">{error}</p>}
    {!data?<p className="mg-muted">Loading menu configuration…</p>:<>
      <section className="mg-card">
        <div className="mg-card-title"><div><h2>Storefront branding</h2><p>Choose how your restaurant appears on a customer's phone.</p></div>
          <span className={'mg-pill '+(data.brand.status==='published'?'mg-live':'')}>{data.brand.status}</span>
        </div>
        {brand&&<form onSubmit={submitBrand} className="mg-form">
          <div className="mg-fields-two">
            <label className="mg-field">Restaurant name<input required minLength={2} maxLength={160} value={brand.display_name}
              onChange={e=>setBrand({...brand,display_name:e.target.value})}/></label>
            <label className="mg-field">Brand color <input aria-label="Brand color" type="color" value={brand.primary_color}
              onChange={e=>setBrand({...brand,primary_color:e.target.value})}/></label>
          </div>
          <label className="mg-field">Short restaurant description<textarea rows={2} maxLength={300} value={brand.tagline}
            onChange={e=>setBrand({...brand,tagline:e.target.value})}/></label>
          <div className="mg-fields-two">
            <label className="mg-field">Hero headline<input required maxLength={90} value={brand.hero_heading}
              onChange={e=>setBrand({...brand,hero_heading:e.target.value})}/></label>
            <label className="mg-field">Highlighted headline<input required maxLength={90} value={brand.hero_emphasis}
              onChange={e=>setBrand({...brand,hero_emphasis:e.target.value})}/></label>
          </div>
          <div className="mg-actions">
            <button disabled={busy} type="submit">Save branding</button>
            <button type="button" disabled={busy} className="mg-secondary"
              onClick={()=>void run(data.brand.status==='published'?'Unpublish storefront':'Publish storefront',
                ()=>setPublication(data.tenant.id,data.brand.status!=='published'))}>
              {data.brand.status==='published'?'Unpublish menu':'Publish menu'}
            </button>
          </div>
        </form>}
        <p className="mg-hint">The published storefront uses the initial branch. Creating or switching fulfillment branches will be added in a later milestone.</p>
      </section>

      <section className="mg-card">
        <div className="mg-card-title"><div><h2>Menu categories</h2><p>Organize dishes and control visibility.</p></div>
          <span className="mg-pill">{data.categories.length} categories</span></div>
        <form className="mg-inline-form" onSubmit={submitCategory}>
          <label className="mg-field">New category<input required minLength={2} maxLength={100} placeholder="e.g. Rice Meals"
            value={categoryName} onChange={e=>setCategoryName(e.target.value)} /></label>
          <button type="submit" disabled={busy||!categoryName.trim()}>Add category</button>
        </form>
        <div className="mg-list">
          {data.categories.map(c=><div className="mg-list-row" key={c.id}>
            <strong>{c.name}</strong>
            <label className="mg-toggle"><input type="checkbox" checked={c.is_published}
              disabled={busy} onChange={e=>void run('Category visibility',()=>toggleCategory(data.tenant.id,c.id,e.target.checked))}/>
              <span>Visible</span></label>
          </div>)}
          {!data.categories.length&&<p className="mg-muted">Create your first category to start adding products.</p>}
        </div>
      </section>

      <section className="mg-card">
        <div className="mg-card-title"><div><h2>Products and pricing</h2><p>Draft new items or edit existing dishes.</p></div>
          <span className="mg-pill">{data.items.length} products</span></div>
        <form onSubmit={submitItem} className="mg-form">
          <h3>{draft.id?'Edit product':'Add a product'}</h3>
          <div className="mg-fields-two">
            <label className="mg-field">Product name<input required minLength={2} maxLength={160} value={draft.name}
              onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
            <label className="mg-field">Category<select required value={draft.category_id}
              onChange={e=>setDraft({...draft,category_id:e.target.value})}>
                <option value="">Select a category</option>
                {data.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select></label>
          </div>
          <label className="mg-field">Description<textarea maxLength={600} rows={2} value={draft.description}
            onChange={e=>setDraft({...draft,description:e.target.value})}/></label>
          <div className="mg-fields-two">
            <label className="mg-field">Price (PHP)<input inputMode="decimal" required placeholder="199.00"
              value={draft.price} onChange={e=>setDraft({...draft,price:e.target.value})}/></label>
            <label className="mg-field">Publishing status<select value={draft.status}
              onChange={e=>setDraft({...draft,status:e.target.value as Product['status']})}>
                <option value="draft">Draft</option><option value="published">Published</option>
                <option value="archived">Archived</option>
              </select></label>
          </div>
          <label className="mg-toggle"><input type="checkbox" checked={draft.is_popular}
            onChange={e=>setDraft({...draft,is_popular:e.target.checked})}/> Mark as popular</label>
          <div className="mg-actions"><button disabled={busy||!data.categories.length} type="submit">
            {draft.id?'Save product changes':'Create product'}</button>
            {draft.id&&<button type="button" className="mg-secondary"
              onClick={()=>setDraft(blankItem(data.categories[0]?.id??''))}>Cancel editing</button>}
          </div>
        </form>
        <div className="mg-list">
          {data.items.map(item=><div className="mg-list-row mg-product-row" key={item.id}>
            <div><strong>{item.name}</strong><span>{data.categories.find(c=>c.id===item.category_id)?.name??'Category'} · ₱{centavosToPesoInput(item.price_centavos)} · {item.status}</span></div>
            <button className="mg-secondary" type="button" onClick={()=>setDraft({
              id:item.id,name:item.name,description:item.description,category_id:item.category_id,
              price:centavosToPesoInput(item.price_centavos),status:item.status,is_popular:item.is_popular,
            })}>Edit</button>
          </div>)}
          {!data.items.length&&<p className="mg-muted">No products yet. Use the form above to add your first dish.</p>}
        </div>
      </section>

      <section className="mg-card">
        <div className="mg-card-title"><div><h2>Branch availability</h2><p>Mark which published products are available from each location.</p></div></div>
        <label className="mg-field mg-selector">Branch<select value={branchId}
          onChange={e=>setBranchId(e.target.value)}>
            {data.branches.map(branch=><option key={branch.id} value={branch.id}>{branch.name}{!branch.is_active?' (inactive)':''}</option>)}
          </select></label>
        <div className="mg-list">
          {data.items.filter(item=>item.status!=='archived').map(item=>{
            const assigned=data.assignments.find(a=>a.branch_id===branchId&&a.item_id===item.id);
            return <div className="mg-list-row" key={item.id}>
              <div><strong>{item.name}</strong><span>{item.status}</span></div>
              <label className="mg-toggle"><input type="checkbox" checked={assigned?.is_available??false}
                disabled={busy||!data.branches.find(b=>b.id===branchId)?.is_active}
                onChange={e=>void run('Branch availability',()=>setBranchItem(
                  data.tenant.id,branchId,item.id,e.target.checked,assigned?.price_override_centavos??null))}/>
                Available</label>
            </div>;
          })}
        </div>
        <p className="mg-hint">Branch-specific price overrides remain supported in the database; an editing control will be added with expanded branch management.</p>
      </section>
    </>}
  </main>;
}
