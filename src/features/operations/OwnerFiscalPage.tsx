import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { readPublicConfig } from '../../lib/config';

type TaxRegime = 'vat_registered' | 'non_vat' | 'other_requires_review';
type FiscalProfile = {
  id: string; branch_id: string; taxpayer_registered_name: string; trade_name: string | null;
  taxpayer_tin: string; tin_branch_code: string; registered_address: string; tax_regime: TaxRegime;
  invoice_series_prefix: string; fiscal_status: 'draft' | 'pending_review' | 'authorized' | 'suspended';
  software_name: string; software_version: string; machine_or_terminal_identifier: string | null;
};
type Draft = {
  branchId: string; taxpayerRegisteredName: string; tradeName: string; taxpayerTin: string;
  tinBranchCode: string; registeredAddress: string; taxRegime: TaxRegime; invoiceDocumentType: 'invoice';
  invoiceSeriesPrefix: string; softwareName: string; softwareVersion: string; machineOrTerminalIdentifier: string;
};
type ApiEnvelope<T> = { data: T; error?: { message?: string } };
const blankDraft = (branchId = ''): Draft => ({
  branchId, taxpayerRegisteredName: '', tradeName: '', taxpayerTin: '', tinBranchCode: '000',
  registeredAddress: '', taxRegime: 'other_requires_review', invoiceDocumentType: 'invoice',
  invoiceSeriesPrefix: '', softwareName: 'Web2table POS', softwareVersion: '0.1.0', machineOrTerminalIdentifier: '',
});
function fromProfile(p: FiscalProfile): Draft {
  return { branchId: p.branch_id, taxpayerRegisteredName: p.taxpayer_registered_name, tradeName: p.trade_name ?? '',
    taxpayerTin: p.taxpayer_tin, tinBranchCode: p.tin_branch_code, registeredAddress: p.registered_address,
    taxRegime: p.tax_regime, invoiceDocumentType: 'invoice', invoiceSeriesPrefix: p.invoice_series_prefix,
    softwareName: p.software_name, softwareVersion: p.software_version, machineOrTerminalIdentifier: p.machine_or_terminal_identifier ?? '' };
}
function isRecord(v: unknown): v is Record<string, unknown> { return typeof v === 'object' && v !== null && !Array.isArray(v); }

export function OwnerFiscalPage() {
  const [draft, setDraft] = useState<Draft>(() => blankDraft());
  const [profile, setProfile] = useState<FiscalProfile | null>(null);
  const [branchName, setBranchName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true); setError(''); setNotice('');
      try {
        if (!supabase) throw new Error('Restaurant workspace services are not configured.');
        const config = readPublicConfig(import.meta.env);
        if (!config) throw new Error('POS service configuration is unavailable.');
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const token = sessionData.session?.access_token;
        if (!token) throw new Error('Sign in again to manage fiscal settings.');
        const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
        const sessionResponse = await fetch(`${config.url.replace(/\\/+$/, '')}/functions/v1/pos-api/api/pos/v1/session`, { headers, credentials: 'omit' });
        const sessionPayload: unknown = await sessionResponse.json();
        if (!sessionResponse.ok) throw new Error(isRecord(sessionPayload) && isRecord(sessionPayload.error) && typeof sessionPayload.error.message === 'string' ? sessionPayload.error.message : 'Unable to verify your POS branch access.');
        const session = isRecord(sessionPayload) && isRecord(sessionPayload.data) ? sessionPayload.data : null;
        if (!session || session.role !== 'restaurant_owner' || typeof session.branchId !== 'string' || !session.branchId) {
          throw new Error('Only an authorized restaurant owner with an active branch can manage fiscal settings.');
        }
        const response = await fetch(`${config.url.replace(/\\/+$/, '')}/functions/v1/pos-api/api/pos/v1/fiscal-profile?branchId=${encodeURIComponent(session.branchId)}`, { headers, credentials: 'omit' });
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error(isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === 'string' ? payload.error.message : 'Unable to load taxpayer configuration.');
        const value = isRecord(payload) && 'data' in payload ? payload.data : null;
        if (!active) return;
        setBranchName(typeof session.branchName === 'string' ? session.branchName : 'Authorized branch');
        if (isRecord(value) && typeof value.id === 'string') {
          const saved = value as unknown as FiscalProfile; setProfile(saved); setDraft(fromProfile(saved));
        } else { setProfile(null); setDraft(blankDraft(session.branchId)); }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to load fiscal settings.');
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, []);

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(current => ({ ...current, [key]: value }));
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('');
    if (!draft.branchId || draft.taxpayerRegisteredName.trim().length < 2 || !/^[0-9]{9,12}$/.test(draft.taxpayerTin)
      || !/^[0-9]{3}$/.test(draft.tinBranchCode) || draft.registeredAddress.trim().length < 5
      || !/^[A-Z0-9-]{1,20}$/.test(draft.invoiceSeriesPrefix) || draft.softwareName.trim().length < 2 || !draft.softwareVersion.trim()) {
      setError('Check the required taxpayer, TIN, address, invoice series, and software identity fields.'); return;
    }
    setSaving(true);
    try {
      if (!supabase) throw new Error('Restaurant workspace services are not configured.');
      const config = readPublicConfig(import.meta.env);
      if (!config) throw new Error('POS service configuration is unavailable.');
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const token = data.session?.access_token;
      if (!token) throw new Error('Sign in again to save fiscal settings.');
      const response = await fetch(`${config.url.replace(/\\/+$/, '')}/functions/v1/pos-api/api/pos/v1/fiscal-profile`, {
        method: 'POST', credentials: 'omit',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === 'string' ? payload.error.message : 'Unable to save taxpayer configuration.');
      const value = isRecord(payload) && isRecord(payload.data) ? payload.data : null;
      if (!value || typeof value.id !== 'string') throw new Error('POS service returned an invalid fiscal profile.');
      const saved = value as unknown as FiscalProfile; setProfile(saved); setDraft(fromProfile(saved));
      setNotice('Taxpayer configuration saved as a draft. It does not authorize invoice issuance.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save fiscal settings.'); }
    finally { setSaving(false); }
  }

  return <main className="owner-content">
    <div className="owner-page-heading">
      <div><p className="owner-page-eyebrow">OWNER CONTROLS</p><h1>Fiscal &amp; POS</h1><p>Taxpayer configuration belongs here, separate from cashier workflows.</p></div>
      <span className="owner-page-status">{profile?.fiscal_status?.replaceAll('_', ' ') ?? (loading ? 'Loading' : 'Draft setup')}</span>
    </div>
    <section className="owner-fiscal-notice" role="note">
      <strong>Fiscal issuance is disabled.</strong>
      <p>Saving creates a draft only. It does not confirm BIR authorization or make operational receipt/X/Z previews fiscal documents. Have your tax adviser verify applicable tax treatment and authorization before production use.</p>
    </section>
    {error && <div className="owner-fiscal-notice" role="alert"><strong>Could not load or save settings.</strong><p>{error}</p></div>}
    {notice && <div className="owner-fiscal-notice" role="status"><strong>Saved.</strong><p>{notice}</p></div>}
    {loading ? <p role="status">Loading authorized branch configuration…</p> : <section className="owner-fiscal-card" aria-labelledby="owner-taxpayer-title">
      <div className="owner-page-heading"><div><h2 id="owner-taxpayer-title">Taxpayer configuration</h2><p>Branch: {branchName || 'Not available'}</p></div><span>{profile ? 'Profile saved' : 'Not set up'}</span></div>
      <form className="fiscal-profile-form" onSubmit={event => void save(event)}>
        <div className="fiscal-profile-grid">
          <label>Registered taxpayer name<input required maxLength={200} value={draft.taxpayerRegisteredName} onChange={e => update('taxpayerRegisteredName', e.target.value)} autoComplete="organization" /></label>
          <label>Trade name (optional)<input maxLength={200} value={draft.tradeName} onChange={e => update('tradeName', e.target.value)} /></label>
          <label>TIN (digits only)<input required inputMode="numeric" maxLength={12} value={draft.taxpayerTin} onChange={e => update('taxpayerTin', e.target.value.replace(/\D/g, '').slice(0, 12))} /></label>
          <label>TIN branch code<input required inputMode="numeric" maxLength={3} value={draft.tinBranchCode} onChange={e => update('tinBranchCode', e.target.value.replace(/\D/g, '').slice(0, 3))} /></label>
          <label className="fiscal-profile-wide">Registered business address<textarea required maxLength={500} rows={3} value={draft.registeredAddress} onChange={e => update('registeredAddress', e.target.value)} /></label>
          <label>Tax regime<select value={draft.taxRegime} onChange={e => update('taxRegime', e.target.value as TaxRegime)}><option value="other_requires_review">Needs tax review</option><option value="vat_registered">VAT registered</option><option value="non_vat">Non-VAT</option></select></label>
          <label>Invoice series prefix<input required maxLength={20} value={draft.invoiceSeriesPrefix} onChange={e => update('invoiceSeriesPrefix', e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20))} /></label>
          <label>Software name<input required maxLength={160} value={draft.softwareName} onChange={e => update('softwareName', e.target.value)} /></label>
          <label>Software version<input required maxLength={80} value={draft.softwareVersion} onChange={e => update('softwareVersion', e.target.value)} /></label>
          <label className="fiscal-profile-wide">Machine / terminal identifier (if applicable)<input maxLength={160} value={draft.machineOrTerminalIdentifier} onChange={e => update('machineOrTerminalIdentifier', e.target.value)} /></label>
        </div>
        <div className="fiscal-profile-actions"><button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save taxpayer configuration'} <span aria-hidden="true">→</span></button></div>
      </form>
    </section>}
  </main>;
}
