import { supabase } from '../../lib/supabase';

export type Tenant = {id:string;name:string;slug:string};
export type Branch = {id:string;tenant_id:string;slug:string;name:string;is_active:boolean};
export type Brand = {
  tenant_id:string;default_branch_id:string;display_name:string;tagline:string;
  hero_heading:string;hero_emphasis:string;primary_color:string;
  status:'draft'|'published'|'disabled';
};
export type Category = {id:string;tenant_id:string;name:string;is_published:boolean;sort_order:number};
export type Product = {
  id:string;tenant_id:string;category_id:string;name:string;description:string;
  image_path:string|null;
  price_centavos:number;status:'draft'|'published'|'archived';is_popular:boolean;sort_order:number;
};
export type BranchProduct = {
  tenant_id:string;branch_id:string;item_id:string;is_available:boolean;
  price_override_centavos:number|null;
};
export type ModifierGroupRow = {
  id:string;tenant_id:string;item_id:string;name:string;
  min_select:number;max_select:number;is_active:boolean;sort_order:number;
};
export type ModifierOptionRow = {
  id:string;tenant_id:string;item_id:string;group_id:string;
  name:string;price_centavos:number;is_active:boolean;sort_order:number;
};
export type OwnerData = {
  tenant:Tenant;branches:Branch[];brand:Brand;categories:Category[];items:Product[];
  assignments:BranchProduct[];groups:ModifierGroupRow[];options:ModifierOptionRow[];
};
function requireClient() {
  if (!supabase) throw new Error('Supabase client is not configured.');
  return supabase;
}
function check(error: {message:string}|null):void {
  if(error) throw new Error(error.message);
}
export async function ownerTenantChoices():Promise<Tenant[]> {
  const db=requireClient();
  const memberships=await db.from('tenant_memberships').select('tenant_id')
    .eq('role','restaurant_owner').eq('status','active');
  check(memberships.error);
  const ids=[...new Set((memberships.data??[]).map(row=>row.tenant_id))];
  if(!ids.length) return [];
  const result=await db.from('tenants').select('id,name,slug').in('id',ids).eq('status','active');
  check(result.error);
  return (result.data??[]) as Tenant[];
}
export async function loadOwnerData(tenant:Tenant):Promise<OwnerData> {
  const db=requireClient();
  const [branches,brand,categories,items,assignments,groups,options]=await Promise.all([
    db.from('branches').select('id,tenant_id,slug,name,is_active').eq('tenant_id',tenant.id),
    db.from('tenant_storefronts').select('tenant_id,default_branch_id,display_name,tagline,hero_heading,hero_emphasis,primary_color,status')
      .eq('tenant_id',tenant.id).single(),
    db.from('menu_categories').select('id,tenant_id,name,is_published,sort_order').eq('tenant_id',tenant.id)
      .order('sort_order').order('name'),
    db.from('menu_items').select('id,tenant_id,category_id,name,description,image_path,price_centavos,status,is_popular,sort_order')
      .eq('tenant_id',tenant.id).order('sort_order').order('name'),
    db.from('branch_menu_items').select('tenant_id,branch_id,item_id,is_available,price_override_centavos')
      .eq('tenant_id',tenant.id),
    db.from('menu_modifier_groups').select('id,tenant_id,item_id,name,min_select,max_select,is_active,sort_order')
      .eq('tenant_id',tenant.id).order('sort_order').order('name'),
    db.from('menu_modifier_options').select('id,tenant_id,item_id,group_id,name,price_centavos,is_active,sort_order')
      .eq('tenant_id',tenant.id).order('sort_order').order('name'),
  ]);
  for(const res of [branches,brand,categories,items,assignments,groups,options]) check(res.error);
  if(!brand.data) throw new Error('Storefront configuration is missing.');
  return {
    tenant,branches:branches.data??[],brand:brand.data as Brand,
    categories:categories.data??[],items:items.data??[],assignments:assignments.data??[],
    groups:groups.data??[],options:options.data??[],
  };
}

export async function saveBrand(tenantId:string,values:Pick<Brand,'display_name'|'tagline'|'hero_heading'|'hero_emphasis'|'primary_color'>) {
  const db=requireClient();
  const {data,error}=await db.from('tenant_storefronts').update({...values,updated_at:new Date().toISOString()})
    .eq('tenant_id',tenantId).select('tenant_id').single();
  check(error);
  if(!data) throw new Error('No storefront was updated.');
}
export async function setPublication(tenantId:string,publish:boolean) {
  const db=requireClient();
  const {data,error}=await db.from('tenant_storefronts')
    .update({status:publish?'published':'draft',updated_at:new Date().toISOString()})
    .eq('tenant_id',tenantId).select('tenant_id').single();
  check(error);
  if(!data) throw new Error('Publication update was not applied.');
}
export async function createCategory(tenantId:string,name:string) {
  const db=requireClient();
  const {data,error}=await db.from('menu_categories')
    .insert({tenant_id:tenantId,name:name.trim(),is_published:false})
    .select('id').single();
  check(error);
  if(!data) throw new Error('Category was not saved.');
}
export async function toggleCategory(tenantId:string,id:string,visible:boolean) {
  const db=requireClient();
  const {data,error}=await db.from('menu_categories')
    .update({is_published:visible}).eq('tenant_id',tenantId).eq('id',id).select('id').single();
  check(error);
  if(!data) throw new Error('Category change was not applied.');
}
export async function saveItem(
  tenantId:string,
  id:string|null,
  value:Pick<Product,'name'|'description'|'category_id'|'price_centavos'|'is_popular'|'status'>
):Promise<string> {
  const db=requireClient();
  if(id) {
    const {data,error}=await db.from('menu_items').update(value)
      .eq('tenant_id',tenantId).eq('id',id).select('id').single();
    check(error);
    if(!data) throw new Error('Item change was not applied.');
    return data.id;
  }
  const {data,error}=await db.from('menu_items').insert({...value,tenant_id:tenantId})
    .select('id').single();
  check(error);
  if(!data) throw new Error('Item could not be created.');
  return data.id;
}
export async function setBranchItem(
  tenantId:string,branchId:string,itemId:string,available:boolean,
  override:number|null=null
) {
  const db=requireClient();
  const {data,error}=await db.from('branch_menu_items').upsert({
    tenant_id:tenantId,branch_id:branchId,item_id:itemId,
    is_available:available,price_override_centavos:override,
  },{onConflict:'tenant_id,branch_id,item_id'}).select('item_id').single();
  check(error);
  if(!data) throw new Error('Branch availability was not saved.');
}
export async function adminTenants():Promise<Tenant[]> {
  const db=requireClient();
  const {data,error}=await db.from('tenants').select('id,name,slug').order('created_at',{ascending:false}).limit(100);
  check(error);
  return (data??[]) as Tenant[];
}
export async function provisionRestaurant(slug:string,name:string,branchSlug:string,branchName:string):Promise<string> {
  const db=requireClient();
  const {data,error}=await db.rpc('admin_create_restaurant',{
    p_slug:slug.trim().toLowerCase(),p_name:name.trim(),
    p_branch_slug:branchSlug.trim().toLowerCase(),p_branch_name:branchName.trim(),
  });
  check(error);
  if(typeof data!=='string') throw new Error('Provisioning did not return a tenant ID.');
  return data;
}
export async function queueOwnerInvitation(tenantId:string,email:string):Promise<string> {
  const db=requireClient();
  const {data,error}=await db.rpc('request_privileged_invitation',{
    p_tenant_id:tenantId,p_email:email.trim().toLowerCase(),
    p_role:'restaurant_owner',p_branch_id:null,
  });
  check(error);
  if(typeof data!=='string') throw new Error('Invitation was not recorded.');
  return data;
}


/** Server RPCs enforce verified MFA, active owner membership, and tenant isolation. */
export async function createOwnerBranch(tenantId:string,slug:string,name:string):Promise<string> {
  const db=requireClient();
  const {data,error}=await db.rpc('create_owner_branch',{
    p_tenant_id:tenantId,p_slug:slug.trim().toLowerCase(),p_name:name.trim(),
  });
  check(error);
  if(typeof data!=='string')throw new Error('Branch could not be created.');
  return data;
}

export async function updateOwnerBranch(
  tenantId:string,branchId:string,name:string,active:boolean
):Promise<void> {
  const db=requireClient();
  const {data,error}=await db.rpc('update_owner_branch',{
    p_tenant_id:tenantId,p_branch_id:branchId,p_name:name.trim(),p_active:active,
  });
  check(error);
  if(data!==true)throw new Error('Branch change was not applied.');
}


export async function createModifierGroup(tenantId:string,itemId:string,name:string,min:number,max:number) {
 const db=requireClient();
 const {data,error}=await db.from('menu_modifier_groups').insert({
   tenant_id:tenantId,item_id:itemId,name:name.trim(),
   min_select:min,max_select:max,is_active:false,
 }).select('id').single();
 check(error);
 if(!data)throw Error('Modifier group was not created.');
}
export async function changeModifierGroup(tenantId:string,id:string,active:boolean) {
 const db=requireClient();
 const {data,error}=await db.from('menu_modifier_groups')
   .update({is_active:active}).eq('tenant_id',tenantId).eq('id',id).select('id').single();
 check(error);
 if(!data)throw Error('Modifier group was not updated.');
}
export async function createModifierOption(tenantId:string,itemId:string,groupId:string,name:string,price:number) {
 const db=requireClient();
 const {data,error}=await db.from('menu_modifier_options').insert({
  tenant_id:tenantId,item_id:itemId,group_id:groupId,name:name.trim(),
  price_centavos:price,is_active:false,
 }).select('id').single();
 check(error);
 if(!data)throw Error('Modifier option was not created.');
}
export async function changeModifierOption(tenantId:string,id:string,active:boolean) {
 const db=requireClient();
 const {data,error}=await db.from('menu_modifier_options')
  .update({is_active:active}).eq('tenant_id',tenantId).eq('id',id).select('id').single();
 check(error);
 if(!data)throw Error('Modifier option was not updated.');
}

/** Public images are individually named; no overwrite/delete permission is granted. */
export async function uploadMenuPhoto(tenantId:string,itemId:string,file:File) {
 const db=requireClient();
 const mimeExtension:{[key:string]:string}={
  'image/jpeg':'jpg','image/png':'png','image/webp':'webp',
 };
 if(!mimeExtension[file.type]||file.size<=0||file.size>3*1024*1024) {
  throw new Error('Select a JPEG, PNG or WebP image up to 3 MB.');
 }
 const path=tenantId+'/'+itemId+'/'+crypto.randomUUID()+'.'+mimeExtension[file.type];
 const {error:uploadError}=await db.storage.from('menu-images').upload(path,file,{
  contentType:file.type,upsert:false,cacheControl:'3600',
 });
 check(uploadError);
 const {data,error}=await db.from('menu_items').update({image_path:path})
  .eq('tenant_id',tenantId).eq('id',itemId).select('id').single();
 check(error);
 if(!data)throw Error('Image uploaded but could not be attached. Contact support to clean up the unused file.');
}
export function publicMenuPhoto(path:string|null):string|null {
 if(!path||!supabase)return null;
 if(!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:jpg|jpeg|png|webp)$/.test(path))return null;
 return supabase.storage.from('menu-images').getPublicUrl(path).data.publicUrl;
}
