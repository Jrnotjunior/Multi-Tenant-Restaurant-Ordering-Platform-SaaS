import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type Props = { tenantId: string };
type Address = { line1: string; line2: string; city: string; state: string; country: string; postal_code: string };
type Person = {
  first_name: string; last_name: string; middle_name: string; mobile_number: string; email_address: string;
  date_of_birth: { day: number; month: number; year: number }; nationality: string; nature_of_work: string;
  place_of_birth: { city: string; country: string }; source_of_funds: string; source_of_funds_other: string;
  source_of_funds_salary: string; tin: string; address: Address;
};
type Business = {
  trade_name: string; legal_name: string; dti_registered_name: string; type: string; tin: string;
  industry: string; description: string; age: string; size: string; estimated_monthly_volume: string;
  physical_store: boolean; customer_service_number: string; website: string; address: Address;
};
type ApiState = { status?: string; paymongoAccountId?: string; verificationUrl?: string; onboardingStep?: string; identityVerificationStatus?: string; activationStatus?: string; error?: string; account?: { person?: Partial<Person>; business?: Partial<Business> }; message?: string };

const blankAddress = (): Address => ({ line1: '', line2: '', city: '', state: '', country: 'PH', postal_code: '' });
const blankPerson = (): Person => ({
  first_name: '', last_name: '', middle_name: '', mobile_number: '', email_address: '',
  date_of_birth: { day: 1, month: 1, year: 1990 }, nationality: 'PHL', nature_of_work: 'self_employed',
  place_of_birth: { city: '', country: 'PH' }, source_of_funds: 'other', source_of_funds_other: '',
  source_of_funds_salary: '', tin: '', address: blankAddress(),
});
const blankBusiness = (): Business => ({
  trade_name: '', legal_name: '', dti_registered_name: '', type: 'sole_proprietor', tin: '',
  industry: '5812', description: 'Restaurant food and beverage business', age: 'less_than_1_year',
  size: 'less_than_10', estimated_monthly_volume: 'less_than_100K', physical_store: true,
  customer_service_number: '', website: '', address: blankAddress(),
});
function mergePerson(base: Person, value: Partial<Person>): Person {
  return { ...base, ...value, date_of_birth: { ...base.date_of_birth, ...(value.date_of_birth ?? {}) },
    place_of_birth: { ...base.place_of_birth, ...(value.place_of_birth ?? {}) },
    address: { ...base.address, ...(value.address ?? {}) } };
}
function mergeBusiness(base: Business, value: Partial<Business>): Business {
  return { ...base, ...value, address: { ...base.address, ...(value.address ?? {}) } };
}
function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Unable to complete PayMongo onboarding.';
}

export function OwnerPayMongoOnboardingCard({ tenantId }: Props) {
  const [status, setStatus] = useState('not_connected');
  const [accountId, setAccountId] = useState('');
  const [step, setStep] = useState('');
  const [identity, setIdentity] = useState('');
  const [verificationUrl, setVerificationUrl] = useState('');
  const [person, setPerson] = useState<Person>(blankPerson);
  const [business, setBusiness] = useState<Business>(blankBusiness);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const call = useCallback(async (name: string, body: Record<string, unknown> = {}): Promise<ApiState> => {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data, error: invokeError } = await supabase.functions.invoke(name, { body: { tenantId, ...body } });
    if (invokeError) {
      const context = (invokeError as { context?: Response }).context;
      const payload = context ? await context.clone().json().catch(() => null) : null;
      throw new Error(payload?.error || invokeError.message);
    }
    if (data?.error) throw new Error(String(data.error));
    return (data ?? {}) as ApiState;
  }, [tenantId]);

  const applyState = useCallback((data: ApiState) => {
    if (data.status) setStatus(data.status);
    if (data.paymongoAccountId) setAccountId(data.paymongoAccountId);
    if (data.verificationUrl) setVerificationUrl(data.verificationUrl);
    if (data.onboardingStep) setStep(data.onboardingStep);
    if (data.identityVerificationStatus) setIdentity(data.identityVerificationStatus);
    if (data.account?.person) setPerson(current => mergePerson(current, data.account!.person!));
    if (data.account?.business) setBusiness(current => mergeBusiness(current, data.account!.business!));
    if (data.message) setMessage(data.message);
  }, []);

  const load = useCallback(async () => {
    if (!supabase) { setError('PayMongo settings are unavailable because Supabase is not configured.'); setLoaded(true); return; }
    setError('');
    try {
      const { data, error: loadError } = await supabase.from('tenant_paymongo_accounts')
        .select('connection_status,paymongo_account_id,verification_url,identity_verification_status,onboarding_step,last_error')
        .eq('tenant_id', tenantId).eq('environment', 'live').maybeSingle();
      if (loadError) throw loadError;
      setStatus(data?.connection_status ?? 'not_connected');
      setAccountId(data?.paymongo_account_id ?? '');
      setVerificationUrl(data?.verification_url ?? '');
      setStep(data?.onboarding_step ?? '');
      setIdentity(data?.identity_verification_status ?? '');
      if (data?.last_error) setError(data.last_error);
      if (data?.paymongo_account_id) {
        try {
          const synced = await call('sync-tenant-paymongo-account');
          applyState(synced);
        } catch (syncError) {
          const detail = formatError(syncError);
          // Keep the saved account state visible even while live credentials are unavailable.
          if (!detail.toLowerCase().includes('live mode is not configured')) setError(detail);
        }
      }
    } catch (reason) {
      setError(formatError(reason));
    } finally {
      setLoaded(true);
    }
  }, [tenantId, call, applyState]);

  useEffect(() => { void load(); }, [load]);

  async function runAction(action: () => Promise<ApiState>, successMessage: string) {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await action();
      applyState(result);
      setMessage(result.message || successMessage);
      return result;
    } catch (reason) {
      setError(formatError(reason));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    const result = await runAction(() => call('create-tenant-paymongo-account'), 'PayMongo live onboarding started. Complete identity verification first.');
    if (result?.verificationUrl) window.open(result.verificationUrl, '_blank', 'noopener,noreferrer');
  }
  async function refresh() {
    await runAction(() => call('sync-tenant-paymongo-account'), 'PayMongo status refreshed.');
  }
  async function save() {
    const result = await runAction(() => call('update-tenant-paymongo-account', { person, business }), 'Merchant information saved to PayMongo. Review it before activating.');
    if (result) setStep('activation');
  }
  async function activate() {
    const result = await runAction(() => call('activate-tenant-paymongo-account'), 'Activation request submitted. Refresh the live status after PayMongo processes it.');
    if (result?.status !== 'active') await refresh();
  }

  function field(label: string, value: string, onChange: (value: string) => void, required = false, type = 'text') {
    return <label className="w2t-paymongo-field" key={label}><span>{label}{required ? ' *' : ''}</span>
      <input type={type} value={value} required={required} maxLength={500} disabled={busy || status === 'active'}
        onChange={event => onChange(event.target.value)} /></label>;
  }
  function addressFields(title: string, value: Address, onChange: (address: Address) => void) {
    const set = (key: keyof Address, next: string) => onChange({ ...value, [key]: next });
    return <div className="w2t-paymongo-address" key={title}><h4>{title}</h4>
      {field('Address line 1', value.line1, v => set('line1', v), true)}
      {field('Address line 2', value.line2, v => set('line2', v))}
      {field('City', value.city, v => set('city', v), true)}
      {field('State / province', value.state, v => set('state', v), true)}
      {field('Postal code', value.postal_code, v => set('postal_code', v), true)}
    </div>;
  }
  const dob = String(person.date_of_birth.year) + '-' + String(person.date_of_birth.month).padStart(2, '0') + '-' + String(person.date_of_birth.day).padStart(2, '0');
  const isIdentityPassed = identity === 'passed' || identity === 'passed_attestation_form';

  if (!loaded) return <section className="w2t-settings-card w2t-paymongo-card"><p>Loading PayMongo merchant status…</p></section>;

  return <section className="w2t-settings-card w2t-paymongo-card" aria-labelledby="w2t-paymongo-title">
    {error && <div className="w2t-paymongo-feedback is-error" role="alert"><strong>PayMongo onboarding error</strong><p>{error}</p></div>}
    {message && <div className="w2t-paymongo-feedback is-success" role="status">{message}</div>}
    <h2 id="w2t-paymongo-title">PayMongo Production Payments</h2>
    <p className="w2t-settings-help">Connect this restaurant's merchant account under Web2Table's PayMongo parent account. Never share a PayMongo secret key with the browser.</p>
    <div className="w2t-paymongo-status">
      <div><strong>Live environment</strong><span className={'w2t-paymongo-badge is-' + status}>{status.replaceAll('_', ' ')}</span></div>
      {accountId && <small>Connected account: {accountId}</small>}
      <small>Onboarding step: {step || 'not started'}</small>
      {identity && <small>Identity verification: {identity.replaceAll('_', ' ')}</small>}
    </div>
    {status === 'not_connected' && <button type="button" className="w2t-paymongo-action is-primary" disabled={busy} onClick={() => void start()}>{busy ? 'Starting…' : 'Start Live Onboarding'}</button>}
    {verificationUrl && !isIdentityPassed && status !== 'active' && <a className="w2t-paymongo-action" href={verificationUrl} target="_blank" rel="noreferrer">Open PayMongo Verification</a>}
    {accountId && status !== 'active' && <>
      <div className="w2t-paymongo-section"><h3>Authorized representative</h3><div className="w2t-paymongo-grid">
        {field('First name', person.first_name, v => setPerson(p => ({ ...p, first_name: v })), true)}
        {field('Middle name', person.middle_name, v => setPerson(p => ({ ...p, middle_name: v }))}
        {field('Last name', person.last_name, v => setPerson(p => ({ ...p, last_name: v })), true)}
        {field('Mobile number', person.mobile_number, v => setPerson(p => ({ ...p, mobile_number: v })), true)}
        {field('Email address', person.email_address, v => setPerson(p => ({ ...p, email_address: v })), true, 'email')}
        {field('TIN', person.tin, v => setPerson(p => ({ ...p, tin: v })), true)}
        {field('Date of birth', dob, v => { const parts = v.split('-').map(Number); if (parts.length === 3 && parts.every(Number.isFinite)) setPerson(p => ({ ...p, date_of_birth: { year: parts[0], month: parts[1], day: parts[2] } })); }, true, 'date')}
        {field('Place of birth city', person.place_of_birth.city, v => setPerson(p => ({ ...p, place_of_birth: { ...p.place_of_birth, city: v } })), true)}
        {field('Nature of work', person.nature_of_work, v => setPerson(p => ({ ...p, nature_of_work: v })), true)}
        <label className="w2t-paymongo-field"><span>Source of funds *</span><select value={person.source_of_funds} required disabled={busy || status === 'active'} onChange={e => setPerson(p => ({ ...p, source_of_funds: e.target.value }))}><option value="salary">Salary</option><option value="business">Business</option><option value="savings">Savings</option><option value="other">Other</option></select></label>
        {person.source_of_funds === 'other' && field('Source of funds details', person.source_of_funds_other, v => setPerson(p => ({ ...p, source_of_funds_other: v })), true)}
        {person.source_of_funds === 'salary' && field('Employer / company', person.source_of_funds_salary, v => setPerson(p => ({ ...p, source_of_funds_salary: v })), true)}
      </div>{addressFields('Current address', person.address, a => setPerson(p => ({ ...p, address: a })))}</div>
      <div className="w2t-paymongo-section"><h3>Business information</h3><div className="w2t-paymongo-grid">
        {field('Trade name', business.trade_name, v => setBusiness(b => ({ ...b, trade_name: v })), true)}
        {field('Legal name', business.legal_name, v => setBusiness(b => ({ ...b, legal_name: v })), true)}
        {field('DTI registered name', business.dti_registered_name, v => setBusiness(b => ({ ...b, dti_registered_name: v }))}
        {field('Business TIN', business.tin, v => setBusiness(b => ({ ...b, tin: v })), true)}
        {field('Industry MCC', business.industry, v => setBusiness(b => ({ ...b, industry: v })), true)}
        {field('Business description', business.description, v => setBusiness(b => ({ ...b, description: v })), true)}
        {field('Customer service number', business.customer_service_number, v => setBusiness(b => ({ ...b, customer_service_number: v })), true)}
        {field('Website', business.website, v => setBusiness(b => ({ ...b, website: v }))}
        <label className="w2t-paymongo-field"><span>Business type *</span><select value={business.type} disabled={busy || status === 'active'} onChange={e => setBusiness(b => ({ ...b, type: e.target.value }))}><option value="sole_proprietor">Sole proprietor</option><option value="partnership">Partnership</option><option value="corporation">Corporation</option></select></label>
        <label className="w2t-paymongo-field"><span>Business age *</span><select value={business.age} disabled={busy || status === 'active'} onChange={e => setBusiness(b => ({ ...b, age: e.target.value }))}><option value="less_than_1_year">Less than 1 year</option><option value="1_to_3_years">1–3 years</option><option value="3_to_5_years">3–5 years</option><option value="more_than_5_years">More than 5 years</option></select></label>
        <label className="w2t-paymongo-field"><span>Business size *</span><select value={business.size} disabled={busy || status === 'active'} onChange={e => setBusiness(b => ({ ...b, size: e.target.value }))}><option value="less_than_10">Fewer than 10 employees</option><option value="10_to_50">10–50 employees</option><option value="more_than_50">More than 50 employees</option></select></label>
        <label className="w2t-paymongo-field"><span>Estimated monthly volume *</span><select value={business.estimated_monthly_volume} disabled={busy || status === 'active'} onChange={e => setBusiness(b => ({ ...b, estimated_monthly_volume: e.target.value }))}><option value="less_than_100K">Under ₱100,000</option><option value="100K_to_500K">₱100,000–₱500,000</option><option value="500K_to_1M">₱500,000–₱1,000,000</option><option value="more_than_1M">Over ₱1,000,000</option></select></label>
      </div>{addressFields('Business address', business.address, a => setBusiness(b => ({ ...b, address: a })))}</div>
      <div className="w2t-paymongo-actions">
        <button type="button" className="w2t-paymongo-action is-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save Merchant Information'}</button>
        <button type="button" className="w2t-paymongo-action" disabled={busy} onClick={() => void activate()}>Activate PayMongo Account</button>
        <button type="button" className="w2t-paymongo-action" disabled={busy} onClick={() => void refresh()}>{busy ? 'Checking…' : 'Refresh Live Status'}</button>
      </div>
    </>}
    {status === 'active' && <div className="w2t-paymongo-actions"><button type="button" className="w2t-paymongo-action" disabled={busy} onClick={() => void refresh()}>{busy ? 'Checking…' : 'Refresh Live Status'}</button></div>}
  </section>;
}
