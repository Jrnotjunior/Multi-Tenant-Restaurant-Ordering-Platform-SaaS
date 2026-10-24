-- W2T-007: owner-managed product images and modifier groups.
BEGIN;
ALTER TABLE public.menu_items ADD COLUMN image_path text;
ALTER TABLE public.menu_items ADD CONSTRAINT menu_item_image_path_scoped CHECK (
 image_path IS NULL OR
 (image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
 AND split_part(image_path,'/',1)=tenant_id::text
 AND split_part(image_path,'/',2)=id::text)
);

CREATE TABLE public.menu_modifier_groups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 item_id uuid NOT NULL,
 name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 100),
 min_select integer NOT NULL DEFAULT 0 CHECK (min_select BETWEEN 0 AND 20),
 max_select integer NOT NULL DEFAULT 1 CHECK (max_select BETWEEN 1 AND 20),
 sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 100000),
 is_active boolean NOT NULL DEFAULT false,
 CONSTRAINT modifier_group_limits CHECK(min_select<=max_select),
 CONSTRAINT modifier_group_item_fk FOREIGN KEY (tenant_id,item_id)
 REFERENCES public.menu_items(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT modifier_group_tenant_item_id_unique UNIQUE (tenant_id,item_id,id)
);
CREATE INDEX modifier_groups_item_idx ON public.menu_modifier_groups(tenant_id,item_id,is_active,sort_order);

CREATE TABLE public.menu_modifier_options (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 item_id uuid NOT NULL,
 group_id uuid NOT NULL,
 name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 100),
 price_centavos integer NOT NULL DEFAULT 0 CHECK (price_centavos BETWEEN 0 AND 100000000),
 sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 100000),
 is_active boolean NOT NULL DEFAULT false,
 CONSTRAINT modifier_option_group_fk FOREIGN KEY (tenant_id,item_id,group_id)
 REFERENCES public.menu_modifier_groups(tenant_id,item_id,id) ON DELETE RESTRICT
);
CREATE INDEX modifier_options_group_idx ON public.menu_modifier_options(tenant_id,item_id,group_id,is_active,sort_order);

ALTER TABLE public.menu_modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_modifier_options ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.menu_modifier_groups,public.menu_modifier_options FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.menu_modifier_groups,public.menu_modifier_options TO authenticated;

CREATE POLICY modifier_groups_owner_select ON public.menu_modifier_groups
 FOR SELECT TO authenticated USING(private.is_active_owner(tenant_id));
CREATE POLICY modifier_groups_owner_insert ON public.menu_modifier_groups
 FOR INSERT TO authenticated WITH CHECK(private.is_active_owner(tenant_id));
CREATE POLICY modifier_groups_owner_update ON public.menu_modifier_groups
 FOR UPDATE TO authenticated USING(private.is_active_owner(tenant_id))
 WITH CHECK(private.is_active_owner(tenant_id));

CREATE POLICY modifier_options_owner_select ON public.menu_modifier_options
 FOR SELECT TO authenticated USING(private.is_active_owner(tenant_id));
CREATE POLICY modifier_options_owner_insert ON public.menu_modifier_options
 FOR INSERT TO authenticated WITH CHECK(private.is_active_owner(tenant_id));
CREATE POLICY modifier_options_owner_update ON public.menu_modifier_options
 FOR UPDATE TO authenticated USING(private.is_active_owner(tenant_id))
 WITH CHECK(private.is_active_owner(tenant_id));

CREATE TRIGGER modifier_groups_identity BEFORE UPDATE ON public.menu_modifier_groups
 FOR EACH ROW EXECUTE FUNCTION private.reject_catalog_identity_change();
CREATE TRIGGER modifier_options_identity BEFORE UPDATE ON public.menu_modifier_options
 FOR EACH ROW EXECUTE FUNCTION private.reject_catalog_identity_change();

-- Public product images are intended for public storefronts. Never put private
-- customer, staff or restaurant documents in this bucket.
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
 VALUES('menu-images','menu-images',true,3145728,ARRAY['image/jpeg','image/png','image/webp'])
 ON CONFLICT (id) DO NOTHING;

CREATE POLICY w2t_menu_images_owner_insert ON storage.objects
 FOR INSERT TO authenticated WITH CHECK (
 bucket_id='menu-images' AND
 CASE WHEN name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$' THEN
  private.is_active_owner(split_part(name,'/',1)::uuid)
  AND EXISTS (SELECT 1 FROM public.menu_items mi
    WHERE mi.tenant_id=split_part(name,'/',1)::uuid
     AND mi.id=split_part(name,'/',2)::uuid)
 ELSE false END
 );

-- No replacement or deletion is enabled in the browser. Uploads have unique
-- object names, and attaching them to a product requires own-tenant RLS.
CREATE OR REPLACE FUNCTION private.get_branch_storefront(p_slug text, p_branch_slug text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_tenant uuid;
 v_branch uuid;
 v_base jsonb;
 v_items jsonb;
 v_branches jsonb;
 v_branch_name text;
 v_branch_slug text;
BEGIN
 IF p_slug IS NULL OR length(p_slug) NOT BETWEEN 3 AND 64
    OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    OR (p_branch_slug IS NOT NULL AND
      (length(p_branch_slug) NOT BETWEEN 2 AND 64
       OR p_branch_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$')) THEN
  RETURN NULL;
 END IF;
 -- Existing whitelisted RPC must succeed; it checks active tenant,
 -- published storefront and active default branch.
 v_base := private.get_published_storefront(p_slug);
 IF v_base IS NULL THEN RETURN NULL; END IF;

 SELECT t.id,b.id,b.name,b.slug INTO v_tenant,v_branch,v_branch_name,v_branch_slug
 FROM public.tenants t
 JOIN public.tenant_storefronts s ON s.tenant_id=t.id
 JOIN public.branches b ON b.tenant_id=t.id AND b.is_active
 WHERE t.slug=p_slug AND t.status='active' AND s.status='published'
 AND (p_branch_slug IS NULL AND b.id=s.default_branch_id
      OR p_branch_slug IS NOT NULL AND b.slug=p_branch_slug);
 IF v_branch IS NULL THEN RETURN NULL; END IF;

 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'slug',listed.slug,'name',listed.name
 ) ORDER BY listed.name,listed.slug),'[]'::jsonb) INTO v_branches
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
   'imagePath',i.image_path,
   'modifierGroups',COALESCE((
     SELECT jsonb_agg(jsonb_build_object(
       'id',mg.id,'name',mg.name,'minSelect',mg.min_select,'maxSelect',mg.max_select,
       'options',COALESCE((
         SELECT jsonb_agg(jsonb_build_object(
           'id',op.id,'name',op.name,'priceCentavos',op.price_centavos
         ) ORDER BY op.sort_order,op.name,op.id)
         FROM (SELECT o.id,o.name,o.price_centavos,o.sort_order
            FROM public.menu_modifier_options o
            WHERE o.tenant_id=i.tenant_id AND o.item_id=i.id AND o.group_id=mg.id
              AND o.is_active ORDER BY o.sort_order,o.name,o.id LIMIT 20) op
       ),'[]'::jsonb)
     ) ORDER BY mg.sort_order,mg.name,mg.id)
     FROM (SELECT g.id,g.name,g.min_select,g.max_select,g.sort_order
       FROM public.menu_modifier_groups g
       WHERE g.tenant_id=i.tenant_id AND g.item_id=i.id AND g.is_active
       ORDER BY g.sort_order,g.name,g.id LIMIT 8) mg
   ),'[]'::jsonb)
 ) ORDER BY c.sort_order,i.sort_order,i.name,i.id),'[]'::jsonb)
 INTO v_items
 FROM (
  SELECT mi.* FROM public.menu_items mi
  JOIN public.menu_categories mc ON mc.id=mi.category_id AND mc.tenant_id=mi.tenant_id
  JOIN public.branch_menu_items bi ON bi.item_id=mi.id AND bi.tenant_id=mi.tenant_id
     AND bi.branch_id=v_branch AND bi.is_available
  WHERE mi.tenant_id=v_tenant AND mi.status='published' AND mc.is_published
  ORDER BY mc.sort_order,mi.sort_order,mi.name,mi.id LIMIT 200
 ) i
 JOIN public.menu_categories c ON c.id=i.category_id AND c.tenant_id=i.tenant_id
 JOIN public.branch_menu_items bm ON bm.tenant_id=i.tenant_id
   AND bm.branch_id=v_branch AND bm.item_id=i.id;

 RETURN v_base || jsonb_build_object(
  'branchSlug',v_branch_slug,
  'branchName',v_branch_name,
  'branches',v_branches,
  'items',v_items
 );
END;
$function$
;
COMMIT;
