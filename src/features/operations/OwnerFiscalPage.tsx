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
type AuthorizedBranch = { id: string; name: string; slug?: string; timezone?: string };
type Draft = {
  branchId: string; taxpayerRegisteredName: string; tradeName: string; taxpayerTin: string;
  tinBranchCode: string; registeredAddress: string; taxRegime: TaxRegime; invoiceDocumentType: 'invoice';
  invoiceSeriesPrefix: string; softwareName: string; softwareVersion: string; machineOrTerminalIdentifier: string;
};
type ApiEnvelope<T> = { data: T; error?: { message?: string } };
type TaxTreatment = 'taxable' | 'zero_rated' | 'exempt' | 'out_of_scope' | 'requires_review';
type TaxRuleDraft = { code: string; label: string; treatment: TaxTreatment; ratePercent: string; priceIncludesTax: boolean };
type TaxPolicy = { id: string; branch_id: string; policy_name: string; policy_version: number; status: string; effective_from: string; effective_until: string | null; currency_code: string; rounding_mode: string; rules: Array<{ code: string; label: string; treatment: TaxTreatment; rateBasisPoints: number; priceIncludesTax: boolean }> };
const blankRule = (): TaxRuleDraft => ({ code: '', label: '', treatment: 'requires_review', ratePercent: '0', priceIncludesTax: false });

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
  const [branches, setBranches] = useState<AuthorizedBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
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
        const sessionResponse = await fetch(`${config.url.replace(/\/+$/, '')}/functions/v1/pos-api/api/pos/v1/session`, { headers, credentials: 'omit' });
        const sessionPayload: unknown = await sessionResponse.json();
        if (!sessionResponse.ok) throw new Error(isRecord(sessionPayload) && isRecord(sessionPayload.error) && typeof sessionPayload.error.message === 'string' ? sessionPayload.error.message : 'Unable to verify your POS branch access.');
        const session = isRecord(sessionPayload) && isRecord(sessionPayload.data) ? sessionPayload.data : null;
        if (!session || session.role !== 'restaurant_owner' || typeof session.branchId !== 'string' || !session.branchId) {
          throw new Error('Only an authorized restaurant owner with an active branch can manage fiscal settings.');
        }
        const authorized = Array.isArray(session.branches) ? session.branches.filter((item): item is AuthorizedBranch =>
          isRecord(item) && typeof item.id === 'string' && typeof item.name === 'string') : [];
        const safeBranches = [...authorized];
        if (!safeBranches.some(item => item.id === session.branchId)) {
          safeBranches.unshift({ id: session.branchId, name: typeof session.branchName === 'string' ? session.branchName : 'Authorized branch' });
        }
        if (!active) return;
        setBranches(safeBranches);
        setSelectedBranchId(current => safeBranches.some(item => item.id === current) ? current : session.branchId);
        setBranchName(safeBranches.find(item => item.id === session.branchId)?.name ?? 'Authorized branch');
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to load fiscal settings.');
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedBranchId) return;
    let active = true;
    async function loadBranchProfile() {
      setLoading(true); setError(''); setNotice(''); setProfile(null); setDraft(blankDraft(selectedBranchId));
      setBranchName(branches.find(branch => branch.id === selectedBranchId)?.name ?? 'Authorized branch');
      try {
        if (!supabase) throw new Error('Restaurant workspace services are not configured.');
        const config = readPublicConfig(import.meta.env);
        if (!config) throw new Error('POS service configuration is unavailable.');
        const { data: authData, error: authError } = await supabase.auth.getSession();
        if (authError) throw authError;
        const token = authData.session?.access_token;
        if (!token) throw new Error('Sign in again to manage fiscal settings.');
        const response = await fetch(`${config.url.replace(/\\/+$/, '')}/functions/v1/pos-api/api/pos/v1/fiscal-profile?branchId=${encodeURIComponent(selectedBranchId)}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, credentials: 'omit',
        });
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error(isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === 'string' ? payload.error.message : 'Unable to load taxpayer configuration.');
        const value = isRecord(payload) && 'data' in payload ? payload.data : null;
        if (!active) return;
        if (isRecord(value) && typeof value.id === 'string') {
          const saved = value as unknown as FiscalProfile;
          if (saved.branch_id !== selectedBranchId) throw new Error('The POS service returned a profile for a different branch.');
          setProfile(saved); setDraft(fromProfile(saved));
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to load fiscal settings.');
      } finally { if (active) setLoading(false); }
    }
    void loadBranchProfile();
    return () => { active = false; };
  }, [selectedBranchId, branches]);


  const [policies, setPolicies] = useState<TaxPolicy[]>([]);
  const [policyName, setPolicyName] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveUntil, setEffectiveUntil] = useState('');
  const [taxRules, setTaxRules] = useState<TaxRuleDraft[]>([blankRule()]);
  const [policiesLoading, setPoliciesLoading] = useState(false);
  const [policySaving, setPolicySaving] = useState(false);
  const [policyError, setPolicyError] = useState('');
  const [policyNotice, setPolicyNotice] = useState('');


  useEffect(() => {
    if (!selectedBranchId || !profile) { setPolicies([]); return; }
    let active = true;
    async function loadPolicies() {
      setPoliciesLoading(true); setPolicyError('');
      try {
        if (!supabase) throw new Error('Restaurant workspace services are not configured.');
        const config = readPublicConfig(import.meta.env);
        if (!config) throw new Error('POS service configuration is unavailable.');
        const { data, error: authError } = await supabase.auth.getSession();
        if (authError) throw authError;
        const token = data.session?.access_token;
        if (!token) throw new Error('Sign in again to manage tax policies.');
        const response = await fetch(`${config.url.replace(/\\/+$/, '')}/functions/v1/pos-api/api/pos/v1/fiscal-tax-policies?branchId=${encodeURIComponent(selectedBranchId)}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, credentials: 'omit',
        });
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error(isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === 'string' ? payload.error.message : 'Unable to load tax policies.');
        const rows = isRecord(payload) && Array.isArray(payload.data) ? payload.data as TaxPolicy[] : [];
        if (!active) return;
        if (rows.some(row => row.branch_id !== selectedBranchId)) throw new Error('The POS service returned a policy for a different branch.');
        setPolicies(rows);
      } catch (reason) { if (active) setPolicyError(reason instanceof Error ? reason.message : 'Unable to load tax policies.'); }
      finally { if (active) setPoliciesLoading(false); }
    }
    void loadPolicies();
    return () => { active = false; };
  }, [selectedBranchId, profile]);

  function updateTaxRule(index: number, key: keyof TaxRuleDraft, value: string | boolean) {
    setTaxRules(current => current.map((rule, i) => i === index ? { ...rule, [key]: value } : rule));
  }
  async function saveTaxPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPolicyError(''); setPolicyNotice('');
    const normalized = taxRules.map(rule => ({ ...rule, code: rule.code.trim().toUpperCase(), label: rule.label.trim(), rate: Number(rule.ratePercent) }));
    if (!selectedBranchId || policyName.trim().length < 2 || !effectiveFrom || normalized.length < 1
      || normalized.some(rule => !/^[A-Z0-9_-]{2,40}$/.test(rule.code) || rule.label.length < 2 || !Number.isFinite(rule.rate) || rule.rate < 0 || rule.rate > 1000 || !/^\\d+(?:\\.\\d{1,2})?$/.test(rule.ratePercent.trim()))
      || normalized.some(rule => rule.treatment !== 'taxable' && rule.rate !== 0)
      || new Set(normalized.map(rule => rule.code)).size !== normalized.length
      || (effectiveUntil && new Date(effectiveUntil).getTime() <= new Date(effectiveFrom).getTime())) {
      setPolicyError('Check the policy name, effective dates, unique rule codes, labels, and explicit rates. Non-taxable treatments must use 0%.'); return;
    }
    const toIso = (value: string) => new Date(value).toISOString();
    setPolicySaving(true);
    try {
      if (!supabase) throw new Error('Restaurant workspace services are not configured.');
      const config = readPublicConfig(import.meta.env);
      if (!config) throw new Error('POS service configuration is unavailable.');
      const { data, error: authError } = await supabase.auth.getSession();
      if (authError) throw authError;
      const token = data.session?.access_token;
      if (!token) throw new Error('Sign in again to save tax policies.');
      const response = await fetch(`${config.url.replace(/\\/+$/, '')}/functions/v1/pos-api/api/pos/v1/fiscal-tax-policies`, {
        method: 'POST', credentials: 'omit',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchId: selectedBranchId, policyName: policyName.trim(), effectiveFrom: toIso(effectiveFrom), effectiveUntil: effectiveUntil ? toIso(effectiveUntil) : null,
          rules: normalized.map(rule => ({ code: rule.code, label: rule.label, treatment: rule.treatment, rateBasisPoints: Math.round(rule.rate * 100), priceIncludesTax: rule.priceIncludesTax })) }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === 'string' ? payload.error.message : 'Unable to save tax policy.');
      const value = isRecord(payload) && isRecord(payload.data) ? payload.data as unknown as TaxPolicy : null;
      if (!value || value.branch_id !== selectedBranchId) throw new Error('POS service returned a policy for a different branch.');
      setPolicies(current => [value, ...current.filter(item => item.id !== value.id)]);
      setPolicyName(''); setEffectiveFrom(''); setEffectiveUntil(''); setTaxRules([blankRule()]);
      setPolicyNotice('Tax policy saved as a draft. It is not approved and will not be applied to checkout.');
    } catch (reason) { setPolicyError(reason instanceof Error ? reason.message : 'Unable to save tax policy.'); }
    finally { setPolicySaving(false); }
  }

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
      const response = await fetch(`${config.url.replace(/\/+$/, '')}/functions/v1/pos-api/api/pos/v1/fiscal-profile`, {
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
    <div className="owner-fiscal-heading">
      <div><p className="owner-page-eyebrow">OWNER CONTROLS</p><h1>Fiscal &amp; POS</h1><p>Taxpayer configuration belongs here, separate from cashier workflows.</p></div>
      <span className="owner-page-status">{profile?.fiscal_status?.replaceAll('_', ' ') ?? (loading ? 'Loading' : 'Draft setup')}</span>
    </div>
    <section className="owner-fiscal-notice" role="note">
      <strong>Fiscal issuance is disabled.</strong>
      <p>Saving creates a draft only. It does not confirm BIR authorization or make operational receipt/X/Z previews fiscal documents. Have your tax adviser verify applicable tax treatment and authorization before production use.</p>
    </section>
    {error && <div className="owner-fiscal-notice" role="alert"><strong>Could not load or save settings.</strong><p>{error}</p></div>}
    {notice && <div className="owner-fiscal-notice" role="status"><strong>Saved.</strong><p>{notice}</p></div>}
    {branches.length > 1 && <section className="owner-fiscal-card owner-fiscal-branch-picker" aria-label="Branch selection">
      <label>Configure branch<select value={selectedBranchId} onChange={event => setSelectedBranchId(event.target.value)} disabled={loading || saving}>
        {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
      </select></label>
    </section>}
    {loading ? <p role="status">Loading authorized branch configuration…</p> : <section className="owner-fiscal-card" aria-labelledby="owner-taxpayer-title">
      <div className="owner-fiscal-card-heading"><div><h2 id="owner-taxpayer-title">Taxpayer configuration</h2><p>Branch: {branchName || 'Not available'}</p></div><span>{profile ? 'Profile saved' : 'Not set up'}</span></div>
      <form className="owner-fiscal-form" onSubmit={event => void save(event)}>
        <div className="owner-fiscal-fields">
          <label>Registered taxpayer name<input required maxLength={200} value={draft.taxpayerRegisteredName} onChange={e => update('taxpayerRegisteredName', e.target.value)} autoComplete="organization" /></label>
          <label>Trade name (optional)<input maxLength={200} value={draft.tradeName} onChange={e => update('tradeName', e.target.value)} /></label>
          <label>TIN (digits only)<input required inputMode="numeric" maxLength={12} value={draft.taxpayerTin} onChange={e => update('taxpayerTin', e.target.value.replace(/\D/g, '').slice(0, 12))} /></label>
          <label>TIN branch code<input required inputMode="numeric" maxLength={3} value={draft.tinBranchCode} onChange={e => update('tinBranchCode', e.target.value.replace(/\D/g, '').slice(0, 3))} /></label>
          <label className="owner-fiscal-wide">Registered business address<textarea required maxLength={500} rows={3} value={draft.registeredAddress} onChange={e => update('registeredAddress', e.target.value)} /></label>
          <label>Tax regime<select value={draft.taxRegime} onChange={e => update('taxRegime', e.target.value as TaxRegime)}><option value="other_requires_review">Needs tax review</option><option value="vat_registered">VAT registered</option><option value="non_vat">Non-VAT</option></select></label>
          <label>Invoice series prefix<input required maxLength={20} value={draft.invoiceSeriesPrefix} onChange={e => update('invoiceSeriesPrefix', e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20))} /></label>
          <label>Software name<input required maxLength={160} value={draft.softwareName} onChange={e => update('softwareName', e.target.value)} /></label>
          <label>Software version<input required maxLength={80} value={draft.softwareVersion} onChange={e => update('softwareVersion', e.target.value)} /></label>
          <label className="owner-fiscal-wide">Machine / terminal identifier (if applicable)<input maxLength={160} value={draft.machineOrTerminalIdentifier} onChange={e => update('machineOrTerminalIdentifier', e.target.value)} /></label>
        </div>
        <div className="owner-fiscal-actions"><button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save taxpayer configuration'} <span aria-hidden="true">→</span></button></div>
      </form>
    </section>}
    {!loading && profile && <section className="owner-fiscal-card owner-tax-policy-card" aria-labelledby="owner-tax-policy-title">
      <div className="owner-fiscal-card-heading"><div><h2 id="owner-tax-policy-title">Tax policy drafts</h2><p>Branch: {branchName || 'Not available'} · Currency PHP · Rounding to nearest centavo</p></div><span>Draft only</span></div>
      <p className="owner-tax-policy-warning">Enter rates and classifications only after they are verified for this business. No statutory rate is preselected. Policies remain drafts until a formal review workflow is implemented.</p>
      {policyError && <div className="owner-fiscal-notice owner-tax-policy-alert" role="alert"><strong>Tax policy not saved.</strong><p>{policyError}</p></div>}
      {policyNotice && <div className="owner-fiscal-notice owner-tax-policy-alert" role="status"><strong>Draft saved.</strong><p>{policyNotice}</p></div>}
      <form className="owner-tax-policy-form" onSubmit={event => void saveTaxPolicy(event)}>
        <div className="owner-tax-policy-fields">
          <label>Policy name<input required maxLength={120} value={policyName} onChange={e => setPolicyName(e.target.value)} placeholder="e.g. Reviewed branch tax configuration" /></label>
          <label>Effective from<input required type="datetime-local" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} /></label>
          <label>Effective until (optional)<input type="datetime-local" value={effectiveUntil} onChange={e => setEffectiveUntil(e.target.value)} /></label>
        </div>
        <div className="owner-tax-policy-rules-heading"><h3>Tax rules</h3><button type="button" disabled={taxRules.length >= 50 || policySaving} onClick={() => setTaxRules(current => [...current, blankRule()])}>Add rule</button></div>
        {taxRules.map((rule, index) => <div className="owner-tax-policy-rule" key={index}>
          <label>Code<input required maxLength={40} value={rule.code} onChange={e => updateTaxRule(index, 'code', e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 40))} placeholder="RULE_CODE" /></label>
          <label>Label<input required maxLength={120} value={rule.label} onChange={e => updateTaxRule(index, 'label', e.target.value)} /></label>
          <label>Treatment<select value={rule.treatment} onChange={e => updateTaxRule(index, 'treatment', e.target.value as TaxTreatment)}><option value="requires_review">Requires review</option><option value="taxable">Taxable</option><option value="zero_rated">Zero-rated</option><option value="exempt">Exempt</option><option value="out_of_scope">Out of scope</option></select></label>
          <label>Rate (%)<input required inputMode="decimal" value={rule.ratePercent} onChange={e => updateTaxRule(index, 'ratePercent', e.target.value)} aria-describedby={`tax-rule-rate-help-${index}`} /><small id={`tax-rule-rate-help-${index}`}>Enter an explicitly verified rate; non-taxable treatments require 0.</small></label>
          <label className="owner-tax-policy-checkbox"><input type="checkbox" checked={rule.priceIncludesTax} onChange={e => updateTaxRule(index, 'priceIncludesTax', e.target.checked)} /> Price includes tax</label>
          {taxRules.length > 1 && <button className="owner-tax-policy-remove" type="button" disabled={policySaving} onClick={() => setTaxRules(current => current.filter((_, i) => i !== index))}>Remove rule</button>}
        </div>)}
        <div className="owner-fiscal-actions"><button type="submit" disabled={policySaving || policiesLoading}>{policySaving ? 'Saving draft…' : 'Save tax policy draft'} <span aria-hidden="true">→</span></button></div>
      </form>
      <div className="owner-tax-policy-list"><div className="owner-tax-policy-list-heading"><h3>Saved policies</h3><span>{policiesLoading ? 'Loading…' : `${policies.length} saved`}</span></div>
        {policies.length === 0 && !policiesLoading ? <p className="owner-tax-policy-empty">No policy drafts for this branch yet.</p> : policies.map(policy => <article key={policy.id} className="owner-tax-policy-item">
          <div><strong>{policy.policy_name} · v{policy.policy_version}</strong><small>Effective {new Date(policy.effective_from).toLocaleString()} {policy.effective_until ? `through ${new Date(policy.effective_until).toLocaleString()}` : '· no end date'}</small><small>{policy.rules.length} rule(s): {policy.rules.map(rule => `${rule.code} (${rule.treatment}, ${(rule.rateBasisPoints / 100).toFixed(2)}%)`).join(' · ')}</small></div><span>{policy.status}</span>
        </article>)}
      </div>
    </section>}
  </main>;
}
