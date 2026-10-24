-- W2T-004: Published restaurant storefront and tenant/branch-safe menu catalog.
-- Publication is controlled by trusted service-side operations (no browser writes).
BEGIN;

CREATE TABLE public.tenant_storefronts (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE RESTRICT,
  default_branch_id uuid NOT NULL,
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 2 AND 160),
  tagline text NOT NULL DEFAULT '' CHECK (char_length(tagline) <= 300),
  hero_heading text NOT NULL DEFAULT 'Good food.' CHECK (char_length(hero_heading) BETWEEN 1 AND 90),
  hero_emphasis text NOT NULL DEFAULT 'Great cravings.' CHECK (char_length(hero_emphasis) BETWEEN 1 AND 90),
  primary_color text NOT NULL DEFAULT '#ad2935' CHECK (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_storefronts_branch_fk FOREIGN KEY (tenant_id,default_branch_id)
    REFERENCES public.branches(tenant_id,id) ON DELETE RESTRICT
);

CREATE TABLE public.menu_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 100),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 100000),
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT menu_categories_tenant_id_id_key UNIQUE (tenant_id,id),
  CONSTRAINT menu_categories_tenant_name_key UNIQUE (tenant_id,name)
);

CREATE TABLE public.menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  category_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 160),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 600),
  price_centavos integer NOT NULL CHECK (price_centavos BETWEEN 0 AND 100000000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  is_popular boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 100000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT menu_items_tenant_id_id_key UNIQUE (tenant_id,id),
  CONSTRAINT menu_items_matching_category_fk FOREIGN KEY (tenant_id,category_id)
    REFERENCES public.menu_categories(tenant_id,id) ON DELETE RESTRICT
);

CREATE TABLE public.branch_menu_items (
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  item_id uuid NOT NULL,
  is_available boolean NOT NULL DEFAULT false,
  price_override_centavos integer CHECK (
    price_override_centavos IS NULL OR price_override_centavos BETWEEN 0 AND 100000000
  ),
  CONSTRAINT branch_menu_items_pk PRIMARY KEY (tenant_id,branch_id,item_id),
  CONSTRAINT branch_menu_items_branch_fk FOREIGN KEY (tenant_id,branch_id)
    REFERENCES public.branches(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT branch_menu_items_item_fk FOREIGN KEY (tenant_id,item_id)
    REFERENCES public.menu_items(tenant_id,id) ON DELETE RESTRICT
);

CREATE INDEX menu_categories_tenant_published_idx
  ON public.menu_categories (tenant_id,is_published,sort_order);
CREATE INDEX menu_items_tenant_category_published_idx
  ON public.menu_items (tenant_id,category_id,status,sort_order);
CREATE INDEX branch_menu_items_item_fk_idx
  ON public.branch_menu_items (tenant_id,item_id);
CREATE INDEX branch_menu_items_available_idx
  ON public.branch_menu_items (tenant_id,branch_id,is_available);

ALTER TABLE public.tenant_storefronts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_menu_items ENABLE ROW LEVEL SECURITY;

-- No direct browser SELECT or mutations. The only publicly readable data is
-- the expressly curated JSON returned by get_published_storefront().
REVOKE ALL ON TABLE public.tenant_storefronts, public.menu_categories,
  public.menu_items, public.branch_menu_items FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.get_published_storefront(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v_tenant uuid;
DECLARE v_branch uuid;
DECLARE v_result jsonb;
BEGIN
  IF p_slug IS NULL OR length(p_slug) NOT BETWEEN 3 AND 64
     OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RETURN NULL;
  END IF;

  SELECT t.id,s.default_branch_id
    INTO v_tenant,v_branch
  FROM public.tenants t
  JOIN public.tenant_storefronts s ON s.tenant_id=t.id
  JOIN public.branches b ON b.id=s.default_branch_id AND b.tenant_id=t.id
  WHERE t.slug=p_slug AND t.status='active'
    AND s.status='published' AND b.is_active=true;

  IF v_tenant IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'slug', t.slug,
    'name', s.display_name,
    'tagline', s.tagline,
    'heroHeading', s.hero_heading,
    'heroEmphasis', s.hero_emphasis,
    'primaryColor', s.primary_color,
    'branchName', b.name,
    'categories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id',cat.id,'name',cat.name)
        ORDER BY cat.sort_order,cat.name,cat.id)
      FROM (
        SELECT c.id,c.name,c.sort_order FROM public.menu_categories c
        WHERE c.tenant_id=v_tenant AND c.is_published=true
        ORDER BY c.sort_order,c.name,c.id LIMIT 40
      ) cat
    ),'[]'::jsonb),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',mi.id,
        'categoryId',mi.category_id,
        'name',mi.name,
        'description',mi.description,
        'priceCentavos',coalesce(bmi.price_override_centavos,mi.price_centavos),
        'popular',mi.is_popular
      ) ORDER BY mi.category_sort,mi.sort_order,mi.name,mi.id)
      FROM (
        SELECT i.id,i.category_id,i.name,i.description,i.price_centavos,
          i.is_popular,i.sort_order,c.sort_order AS category_sort
        FROM public.menu_items i
        JOIN public.menu_categories c ON c.id=i.category_id AND c.tenant_id=i.tenant_id
        JOIN public.branch_menu_items bm ON bm.item_id=i.id
          AND bm.tenant_id=i.tenant_id AND bm.branch_id=v_branch
        WHERE i.tenant_id=v_tenant AND i.status='published'
          AND c.is_published=true AND bm.is_available=true
        ORDER BY c.sort_order,i.sort_order,i.name,i.id
        LIMIT 200
      ) mi
      JOIN public.branch_menu_items bmi ON bmi.tenant_id=v_tenant
        AND bmi.branch_id=v_branch AND bmi.item_id=mi.id
    ),'[]'::jsonb)
  ) INTO v_result
  FROM public.tenants t
  JOIN public.tenant_storefronts s ON s.tenant_id=t.id
  JOIN public.branches b ON b.tenant_id=t.id AND b.id=v_branch
  WHERE t.id=v_tenant;

  RETURN v_result;
END;
$fn$;

-- Private implementation, public invoker endpoint. Supabase REST exposes
-- only the invoker; the sensitive joins and output whitelisting run privately.
CREATE FUNCTION public.get_published_storefront(p_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $fn$
  SELECT private.get_published_storefront(p_slug);
$fn$;

REVOKE ALL ON FUNCTION private.get_published_storefront(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_published_storefront(text)
  FROM PUBLIC, anon, authenticated;
-- The private schema is NOT included among PostgREST exposed schemas.
GRANT USAGE ON SCHEMA private TO anon;
GRANT EXECUTE ON FUNCTION private.get_published_storefront(text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_published_storefront(text) TO anon,authenticated;

COMMIT;

