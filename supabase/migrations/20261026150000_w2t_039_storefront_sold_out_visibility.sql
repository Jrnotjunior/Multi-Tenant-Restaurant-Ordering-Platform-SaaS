-- Keep published branch menu items visible when kitchen staff mark them unavailable.
-- Availability is exposed as a boolean; unpublished/archived products remain hidden.
CREATE OR REPLACE FUNCTION private.get_branch_storefront(
 p_slug text, p_branch_slug text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_tenant uuid;
 v_branch uuid;
 v_base jsonb;
 v_items jsonb;
 v_branches jsonb;
 v_branch_name text;
 v_branch_slug text;
 v_website_colors jsonb;
BEGIN
 IF p_slug IS NULL OR length(p_slug) NOT BETWEEN 3 AND 64
    OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    OR (p_branch_slug IS NOT NULL AND
      (length(p_branch_slug) NOT BETWEEN 2 AND 64
       OR p_branch_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$')) THEN
  RETURN NULL;
 END IF;
 v_base := private.get_published_storefront(p_slug);
 IF v_base IS NULL THEN RETURN NULL; END IF;

 SELECT t.id,b.id,b.name,b.slug,s.website_colors
 INTO v_tenant,v_branch,v_branch_name,v_branch_slug,v_website_colors
 FROM public.tenants t
 JOIN public.tenant_storefronts s ON s.tenant_id=t.id
 JOIN public.branches b ON b.tenant_id=t.id AND b.is_active
 WHERE t.slug=p_slug AND t.status='active' AND s.status='published'
 AND ((p_branch_slug IS NULL AND b.id=s.default_branch_id)
      OR (p_branch_slug IS NOT NULL AND b.slug=p_branch_slug));
 IF v_branch IS NULL THEN RETURN NULL; END IF;

 SELECT COALESCE(jsonb_agg(jsonb_build_object('slug',listed.slug,'name',listed.name)
    ORDER BY listed.name,listed.slug),'[]'::jsonb) INTO v_branches
 FROM (
   SELECT b.slug,b.name FROM public.branches b
   WHERE b.tenant_id=v_tenant AND b.is_active
   ORDER BY b.name,b.slug LIMIT 20
 ) listed;

 SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'id',i.id,'categoryId',i.category_id,'name',i.name,
   'description',i.description,
   'priceCentavos',coalesce(bm.price_override_centavos,i.price_centavos),
   'popular',i.is_popular,
   'isAvailable',coalesce(bm.is_available,false),
   'imagePath',i.image_path,
   'modifierGroups',COALESCE((
     SELECT jsonb_agg(jsonb_build_object(
       'id',mg.id,'name',mg.name,'minSelect',mg.min_select,'maxSelect',mg.max_select,
       'options',COALESCE((
         SELECT jsonb_agg(jsonb_build_object(
           'id',mo.id,'name',mo.name,'priceCentavos',mo.price_centavos
         ) ORDER BY mo.sort_order,mo.name,mo.id)
         FROM public.menu_modifier_options mo
         WHERE mo.tenant_id=i.tenant_id AND mo.item_id=i.id
           AND mo.group_id=mg.id AND mo.is_active
       ),'[]'::jsonb)
     ) ORDER BY mg.sort_order,mg.name,mg.id)
     FROM public.menu_modifier_groups mg
     WHERE mg.tenant_id=i.tenant_id AND mg.item_id=i.id AND mg.is_active
   ),'[]'::jsonb)
 ) ORDER BY c.sort_order,i.sort_order,i.name,i.id),'[]'::jsonb)
 INTO v_items
 FROM (
   SELECT mi.* FROM public.menu_items mi
   JOIN public.menu_categories mc ON mc.id=mi.category_id AND mc.tenant_id=mi.tenant_id
   JOIN public.branch_menu_items bi ON bi.item_id=mi.id AND bi.tenant_id=mi.tenant_id
      AND bi.branch_id=v_branch
   WHERE mi.tenant_id=v_tenant AND mi.status='published' AND mc.is_published
   ORDER BY mc.sort_order,mi.sort_order,mi.name,mi.id LIMIT 200
 ) i
 JOIN public.menu_categories c ON c.id=i.category_id AND c.tenant_id=i.tenant_id
 JOIN public.branch_menu_items bm ON bm.tenant_id=v_tenant
    AND bm.branch_id=v_branch AND bm.item_id=i.id;

 RETURN v_base || jsonb_build_object(
   'branchSlug',v_branch_slug,
   'branchName',v_branch_name,
   'branches',v_branches,
   'items',v_items,
   'websiteColors',COALESCE(v_website_colors,'{}'::jsonb)
 );
END;
$fn$;
