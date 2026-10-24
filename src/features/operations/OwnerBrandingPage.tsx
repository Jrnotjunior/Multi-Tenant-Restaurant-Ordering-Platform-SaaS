import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { publicStorefrontLogo, type Brand } from '../management/menuService';
import { supabase } from '../../lib/supabase';

type Tab = 'identity' | 'social' | 'colors';
type SocialLinks = { facebook: string; instagram: string; tiktok: string };
type WebsiteColors = {
  pageBackground:string; headerColor:string; footerBackground:string; footerFont:string;
  heroColor:string; productCard:string; fontColor:string; headerIcon:string;
  primaryButton:string; primaryButtonFont:string; secondaryButton:string; secondaryButtonFont:string;
};
const colorLabels: {key:keyof WebsiteColors;label:string}[] = [
  {key:'pageBackground',label:'Page background'},{key:'headerColor',label:'Header color'},
  {key:'footerBackground',label:'Footer background color'},{key:'footerFont',label:'Footer font color'},
  {key:'heroColor',label:'Hero section color'},{key:'productCard',label:'Product card color'},
  {key:'fontColor',label:'Font color'},{key:'headerIcon',label:'Header icon color'},
  {key:'primaryButton',label:'Primary button color'},{key:'primaryButtonFont',label:'Primary button font color'},
  {key:'secondaryButton',label:'Secondary button color'},{key:'secondaryButtonFont',label:'Secondary button font color'},
];
type Props = { tenantId:string; restaurantName:string|null };
export function OwnerBrandingPage({tenantId,restaurantName}:Props) {
  const [tab,setTab]=useState<Tab>('identity');
  const [brand,setBrand]=useState<Brand|null>(null);
  const [social,setSocial]=useState<SocialLinks>({facebook:'',instagram:'',tiktok:''});
  const [defaults,setDefaults]=useState<WebsiteColors|null>(null);
  const [colors,setColors]=useState<WebsiteColors|null>(null);
  const [favicon,setFavicon]=useState<string|null>(null);
  const [logo,setLogo]=useState<string|null>(null);
  const [displayName,setDisplayName]=useState(restaurantName??'');
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState('');
  const faviconInput=useRef<HTMLInputElement>(null);
  const logoInput=useRef<HTMLInputElement>(null);

  useEffect(()=>{
    let active=true;
    async function load(){
      try {
        if(!supabase) throw new Error('Store settings are not configured.');
        const {data:themeData,error:themeError}=await supabase.from('platform_theme_defaults')
          .select('website_colors').eq('id',1).single();
        if(themeError) throw themeError;
        const theme = themeData?.website_colors;
        if (!theme || typeof theme !== 'object' || Array.isArray(theme)) throw new Error('Platform theme defaults are not available.');
        const themeColors = theme as WebsiteColors;
        const themeKeys: Array<keyof WebsiteColors> = ['pageBackground','headerColor','footerBackground','footerFont','heroColor','productCard','fontColor','headerIcon','primaryButton','primaryButtonFont','secondaryButton','secondaryButtonFont'];
        if (!themeKeys.every(key => typeof themeColors[key] === 'string' && /^#[0-9a-fA-F]{6}$/.test(themeColors[key]))) {
          throw new Error('Platform theme defaults are invalid.');
        }
        const {data,error}=await supabase.from('tenant_storefronts')
          .select('tenant_id,default_branch_id,display_name,tagline,hero_heading,hero_emphasis,primary_color,logo_path,favicon_path,font_family,status,social_links,website_colors')
          .eq('tenant_id',tenantId).single();
        if(error) throw error;
        if(!active)return;
        const row=data as Brand & {favicon_path:string|null;social_links:SocialLinks;website_colors:Partial<WebsiteColors>};
        setDefaults(themeColors);
        setBrand(row);setDisplayName(row.display_name??restaurantName??'');
        setSocial({...{facebook:'',instagram:'',tiktok:''},...(row.social_links??{})});
        setColors({...themeColors,...(row.website_colors??{})});
        setLogo(publicStorefrontLogo(row.logo_path));
        setFavicon(row.favicon_path ? supabase.storage.from('storefront-logos').getPublicUrl(row.favicon_path).data.publicUrl : null);
      } catch(e){if(active)setMessage(e instanceof Error?e.message:'Could not load branding settings.');}
      finally{if(active)setLoading(false);}
    }
    void load();return()=>{active=false;};
  },[tenantId,restaurantName]);

  async function uploadImage(event:ChangeEvent<HTMLInputElement>,kind:'logo'|'favicon'){
    const file=event.target.files?.[0];event.target.value='';
    if(!file)return;
    if(!supabase){setMessage('Supabase is not configured.');return;}
    const ext:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/x-icon':'ico','image/vnd.microsoft.icon':'ico'};
    if(!ext[file.type]||file.size<=0||file.size>2*1024*1024){setMessage('Choose a PNG, JPEG, WebP or ICO image up to 2 MB.');return;}
    setSaving(true);setMessage('');
    try{
      const path=tenantId+'/'+crypto.randomUUID()+'.'+ext[file.type];
      const {error:uploadError}=await supabase.storage.from('storefront-logos').upload(path,file,{contentType:file.type,upsert:false,cacheControl:'3600'});
      if(uploadError)throw uploadError;
      const column=kind==='logo'?'logo_path':'favicon_path';
      const {error}=await supabase.from('tenant_storefronts').update({[column]:path,updated_at:new Date().toISOString()}).eq('tenant_id',tenantId);
      if(error)throw error;
      const url=supabase.storage.from('storefront-logos').getPublicUrl(path).data.publicUrl;
      if(kind==='logo')setLogo(url);else setFavicon(url);
      setMessage(kind==='logo'?'Restaurant logo uploaded.':'Browser tab icon uploaded.');
    }catch(e){setMessage(e instanceof Error?e.message:'Image upload failed.');}
    finally{setSaving(false);}
  }

  async function save(event:FormEvent){
    event.preventDefault();if(!supabase||!colors)return;
    setSaving(true);setMessage('');
    try{
      const {error}=await supabase.from('tenant_storefronts').update({
        display_name:displayName.trim(),social_links:social,website_colors:colors,
        updated_at:new Date().toISOString()
      }).eq('tenant_id',tenantId);
      if(error)throw error;
      setMessage('Website and branding settings saved.');
    }catch(e){setMessage(e instanceof Error?e.message:'Settings could not be saved.');}
    finally{setSaving(false);}
  }
  if(loading)return <main className="owner-content"><section className="owner-orders-empty"><h1>Website &amp; Branding</h1><p>Loading your restaurant branding…</p></section></main>;
  if(!brand||!defaults||!colors)return <main className="owner-content"><section className="owner-orders-empty"><h1>Website &amp; Branding</h1><p role="alert">{message||'Branding settings could not be loaded.'}</p></section></main>;

  return <main className="owner-content owner-branding-page">
    <nav className="owner-branding-tabs" aria-label="Website and branding sections">
      <button type="button" className={tab==='identity'?'active':''} onClick={()=>setTab('identity')}>Branding &amp; Identity</button>
      <button type="button" className={tab==='social'?'active':''} onClick={()=>setTab('social')}>Social media links</button>
      <button type="button" className={tab==='colors'?'active':''} onClick={()=>setTab('colors')}>Website colors</button>
    </nav>
    <form onSubmit={save}>
      {tab==='identity'&&<section className="owner-branding-panel">
        <div className="owner-branding-field"><h2>Browser tab icon</h2><p>Choose the small icon customers see in their browser tab.</p>
          <div className="owner-branding-upload">{favicon?<img src={favicon} alt="Current browser tab icon"/>:<span className="owner-branding-placeholder">W2T</span>}
            <button type="button" onClick={()=>faviconInput.current?.click()}>Choose favicon</button><input ref={faviconInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void uploadImage(e,'favicon')}/></div>
        </div>
        <div className="owner-branding-field"><h2>Restaurant logo</h2><p>Choose the logo customers see on your restaurant website.</p>
          <div className="owner-branding-upload">{logo?<img src={logo} alt="Current restaurant logo"/>:<span className="owner-branding-placeholder">{displayName.slice(0,3)||'LOGO'}</span>}
            <button type="button" onClick={()=>logoInput.current?.click()}>Choose logo</button><input ref={logoInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void uploadImage(e,'logo')}/></div>
        </div>
        <label className="owner-branding-input">Restaurant display name<input value={displayName} maxLength={160} required onChange={e=>setDisplayName(e.target.value)}/></label>
      </section>}
      {tab==='social'&&<section className="owner-branding-panel owner-branding-social">
        {(['facebook','instagram','tiktok'] as const).map(key=><label key={key}>{key[0].toUpperCase()+key.slice(1)+' URL'}<input type="url" placeholder={'https://www.'+key+'.com/yourrestaurant'} value={social[key]} onChange={e=>setSocial({...social,[key]:e.target.value})}/></label>)}
      </section>}
      {tab==='colors'&&<section className="owner-branding-panel">
        <div className="owner-branding-toolbar"><button type="button" onClick={()=>window.open('/?preview=branding','_blank','noopener,noreferrer')}>See Live Preview</button></div>
        <div className="owner-branding-colors">{colorLabels.map(({key,label})=><label key={key}>{label}<span className="owner-branding-color-control"><input aria-label={label} type="color" value={colors[key]} onChange={e=>setColors({...colors,[key]:e.target.value})}/><input aria-label={label+' hex value'} value={colors[key]} maxLength={7} pattern="^#[0-9a-fA-F]{6}$" onChange={e=>setColors({...colors,[key]:e.target.value})}/></span></label>)}</div>
        <div className="owner-branding-actions"><button type="button" onClick={()=>{if(defaults)setColors({...defaults});}}>Back to Default</button><button type="submit" disabled={saving}>{saving?'Saving…':'Save'}</button></div>
      </section>}
      {tab!=='colors'&&<div className="owner-branding-actions"><button type="submit" disabled={saving}>{saving?'Saving…':'Save'}</button></div>}
      {message&&<p className="owner-branding-message" role="status">{message}</p>}
    </form>
  </main>;
}
