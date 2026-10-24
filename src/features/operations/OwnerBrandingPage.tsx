import { useEffect, useState, type FormEvent } from 'react';
import { saveBrand, type Brand } from '../management/menuService';

type Props = { tenantId: string; restaurantName: string | null };

export function OwnerBrandingPage({ tenantId, restaurantName }: Props) {
  const [brand, setBrand] = useState<Brand | null>(null);
  const [form, setForm] = useState({
    display_name: restaurantName ?? '',
    tagline: '',
    hero_heading: '',
    hero_emphasis: '',
    primary_color: '#c6283d',
    font_family: 'modern' as Brand['font_family'],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let current = true;
    async function load() {
      try {
        const { supabase } = await import('../../lib/supabase');
        if (!supabase) throw new Error('Store settings are not configured.');
        const { data, error } = await supabase.from('tenant_storefronts')
          .select('tenant_id,default_branch_id,display_name,tagline,hero_heading,hero_emphasis,primary_color,logo_path,font_family,status')
          .eq('tenant_id', tenantId).single();
        if (error) throw error;
        if (!current) return;
        const value = data as Brand;
        setBrand(value);
        setForm({
          display_name: value.display_name ?? '',
          tagline: value.tagline ?? '',
          hero_heading: value.hero_heading ?? '',
          hero_emphasis: value.hero_emphasis ?? '',
          primary_color: value.primary_color ?? '#c6283d',
          font_family: value.font_family ?? 'modern',
        });
      } catch (reason) {
        if (current) setMessage(reason instanceof Error ? reason.message : 'Could not load branding settings.');
      } finally {
        if (current) setLoading(false);
      }
    }
    void load();
    return () => { current = false; };
  }, [tenantId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await saveBrand(tenantId, form);
      setMessage('Branding settings saved.');
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Could not save branding settings.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="owner-content"><section className="owner-orders-empty"><h1>Website &amp; Branding</h1><p>Loading your restaurant branding…</p></section></main>;
  if (!brand) return <main className="owner-content"><section className="owner-orders-empty"><h1>Website &amp; Branding</h1><p role="alert">{message || 'Branding settings could not be loaded.'}</p></section></main>;

  return <main className="owner-content">
    <section className="owner-orders-empty">
      <h1>Website &amp; Branding</h1>
      <p>Edit the identity shown on your restaurant storefront. Changes are saved to this restaurant's tenant-scoped settings.</p>
      <form className="owner-settings-form" onSubmit={submit}>
        <label>Restaurant display name<input required maxLength={100} value={form.display_name} onChange={event => setForm({...form, display_name:event.target.value})} /></label>
        <label>Tagline<input maxLength={180} value={form.tagline} onChange={event => setForm({...form, tagline:event.target.value})} /></label>
        <label>Hero heading<input maxLength={100} value={form.hero_heading} onChange={event => setForm({...form, hero_heading:event.target.value})} /></label>
        <label>Hero emphasis<input maxLength={100} value={form.hero_emphasis} onChange={event => setForm({...form, hero_emphasis:event.target.value})} /></label>
        <label>Primary color<input type="color" value={form.primary_color} onChange={event => setForm({...form, primary_color:event.target.value})} /></label>
        <label>Typography<select value={form.font_family} onChange={event => setForm({...form, font_family:event.target.value as Brand['font_family']})}><option value="modern">Modern</option><option value="rounded">Rounded</option><option value="classic">Classic</option></select></label>
        <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save branding'}</button>
        {message && <p role="status">{message}</p>}
      </form>
    </section>
  </main>;
}
