import { useCallback, useEffect, useState } from 'react';
import { ownerSupportService, type OwnerSupportAttachment, type OwnerSupportMessage, type OwnerSupportTicket } from './ownerSupportService';
import './OwnerSupportPage.css';

const statusLabels: Record<OwnerSupportTicket['status'], string> = {
  open: 'Open', in_progress: 'In progress', resolved: 'Resolved', closed: 'Closed', cancelled: 'Cancelled',
};
const typeLabels = { incident: 'Incident', request_item: 'Request Item (RITM)' } as const;

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function OwnerSupportPage() {
  const [tickets, setTickets] = useState<OwnerSupportTicket[]>([]);
  const [selected, setSelected] = useState<OwnerSupportTicket | null>(null);
  const [messages, setMessages] = useState<OwnerSupportMessage[]>([]);
  const [attachments, setAttachments] = useState<OwnerSupportAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [requestType, setRequestType] = useState<'incident' | 'request_item'>('incident');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [impact, setImpact] = useState<OwnerSupportTicket['impact']>('normal');
  const [reply, setReply] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refreshTickets = useCallback(async () => {
    const rows = await ownerSupportService.listTickets();
    setTickets(rows);
    setSelected(current => current ? rows.find(row => row.id === current.id) ?? null : null);
  }, []);

  useEffect(() => {
    let active = true;
    ownerSupportService.getCurrentUserId()
      .then(id => { if (active) setCurrentUserId(id); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to verify your account.'); });
    ownerSupportService.listTickets()
      .then(rows => { if (active) setTickets(rows); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load support requests.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selected) { setMessages([]); setAttachments([]); return; }
    let active = true;
    Promise.all([ownerSupportService.listMessages(selected.id), ownerSupportService.listAttachments(selected.id)])
      .then(([rows, files]) => { if (active) { setMessages(rows); setAttachments(files); } })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load conversation and attachments.'); });
    return () => { active = false; };
  }, [selected?.id]);

  const createTicket = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true); setError(''); setNotice('');
    try {
      const created = await ownerSupportService.createTicket({ request_type: requestType, subject, description, impact });
      await refreshTickets();
      setSelected(created);
      setShowForm(false);
      setSubject(''); setDescription(''); setImpact('normal');
      setNotice(`Support request ${created.request_number ?? ''} submitted successfully.`.trim());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to submit your request.');
    } finally { setSaving(false); }
  };

  const uploadFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!selected || !file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'text/plain'];
    if (!allowed.includes(file.type)) { setError('Choose a JPG, PNG, WEBP, GIF, PDF, or TXT file.'); return; }
    if (file.size < 1 || file.size > 10 * 1024 * 1024) { setError('Attachments must be 10 MB or smaller.'); return; }
    setUploading(true); setError(''); setNotice('');
    try {
      await ownerSupportService.uploadAttachment(selected.id, file);
      setAttachments(await ownerSupportService.listAttachments(selected.id));
      setNotice('Attachment uploaded successfully.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to upload attachment.');
    } finally { setUploading(false); }
  };

  const openAttachment = async (file: OwnerSupportAttachment) => {
    setError('');
    try {
      const url = await ownerSupportService.getAttachmentUrl(file.storage_path);
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.click();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to open attachment.');
    }
  };

  const formatFileSize = (bytes: number) => bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  const sendReply = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !reply.trim()) return;
    setSaving(true); setError('');
    try {
      await ownerSupportService.sendMessage(selected.id, reply.trim());
      setReply('');
      setMessages(await ownerSupportService.listMessages(selected.id));
      setNotice('Your reply has been sent.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to send your reply.');
    } finally { setSaving(false); }
  };

  return <section className="owner-support-page">
    <header className="owner-support-heading">
      <div><p className="owner-support-eyebrow">HELP & SUPPORT</p><h1>Customer Support</h1><p>Submit a request and communicate directly with the Web2table support team.</p></div>
      <button type="button" className="owner-support-primary" onClick={() => { setShowForm(value => !value); setSelected(null); setError(''); }}>{showForm ? 'Back to requests' : '＋ New request'}</button>
    </header>
    {error && <p className="owner-support-alert" role="alert">{error}</p>}
    {notice && <p className="owner-support-notice" role="status">{notice}</p>}

    {showForm ? <form className="owner-support-form" onSubmit={createTicket}>
      <div className="owner-support-form-heading"><h2>Submit a support request</h2><p>Choose the type that best describes what you need.</p></div>
      <label>Request type<select value={requestType} onChange={event => setRequestType(event.target.value as typeof requestType)}><option value="incident">Incident</option><option value="request_item">Request Item (RITM)</option></select></label>
      <label>Subject<input required minLength={5} maxLength={180} value={subject} onChange={event => setSubject(event.target.value)} placeholder="Briefly describe what you need help with"/></label>
      <label>Description<textarea required minLength={10} maxLength={10000} rows={6} value={description} onChange={event => setDescription(event.target.value)} placeholder="Provide details that will help our support team understand your request."/></label>
      <label>Impact<select value={impact} onChange={event => setImpact(event.target.value as typeof impact)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></label>
      <div className="owner-support-form-actions"><button type="button" className="owner-support-secondary" onClick={() => setShowForm(false)}>Cancel</button><button className="owner-support-primary" disabled={saving}>{saving ? 'Submitting…' : 'Submit request'}</button></div>
    </form> : selected ? <div className="owner-support-detail">
      <button type="button" className="owner-support-back" onClick={() => setSelected(null)}>← All requests</button>
      <div className="owner-support-ticket-title"><div><span className="owner-support-ticket-number">{selected.request_number ?? 'Support request'}</span><h2>{selected.subject}</h2><p>{typeLabels[selected.request_type]} · Submitted {formatDate(selected.created_at)}</p></div><span className={`owner-support-status is-${selected.status}`}>{statusLabels[selected.status]}</span></div>
      <div className="owner-support-description"><h3>Request details</h3><p>{selected.description}</p></div>
      <div className="owner-support-conversation"><h3>Conversation</h3>
        <div className="owner-support-attachments">
          <div className="owner-support-attachments-heading"><h4>Attachments</h4><span>Private files · 10 MB maximum</span></div>
          {attachments.length === 0 ? <p className="owner-support-empty">No attachments yet.</p> : <ul>{attachments.map(file => <li key={file.id}><span><strong>{file.file_name}</strong><small>{formatFileSize(file.file_size)} · {formatDate(file.created_at)}</small></span><button type="button" className="owner-support-file-link" onClick={() => openAttachment(file)}>Open file</button></li>)}</ul>}
          <label className="owner-support-upload"><input type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain" disabled={uploading || saving} onChange={uploadFile}/><span>{uploading ? 'Uploading…' : '＋ Add attachment'}</span></label>
        </div>{messages.length === 0 ? <p className="owner-support-empty">No replies yet. Our support team will respond here.</p> : messages.map(message => <article className="owner-support-message" key={message.id}><div><strong>{message.sender_user_id === currentUserId ? 'You' : 'Support team'}</strong><time>{formatDate(message.created_at)}</time></div><p>{message.message}</p></article>)}
        <form onSubmit={sendReply}><label htmlFor="owner-support-reply">Your reply</label><textarea id="owner-support-reply" rows={3} value={reply} onChange={event => setReply(event.target.value)} placeholder="Write a message to the support team…" required/><button className="owner-support-primary" disabled={saving || !reply.trim()}>{saving ? 'Sending…' : 'Send reply'}</button></form>
      </div>
    </div> : <div className="owner-support-list">
      <div className="owner-support-list-heading"><h2>Your requests</h2><span>{tickets.length} total</span></div>
      {loading ? <p className="owner-support-empty">Loading your requests…</p> : tickets.length === 0 ? <div className="owner-support-empty-state"><span>◎</span><h3>No support requests yet</h3><p>When you submit an Incident or Request Item, you can follow its progress here.</p><button type="button" className="owner-support-secondary" onClick={() => setShowForm(true)}>Create your first request</button></div> : tickets.map(ticket => <button type="button" className="owner-support-ticket-row" key={ticket.id} onClick={() => { setSelected(ticket); setError(''); setNotice(''); }}><span className="owner-support-ticket-main"><strong>{ticket.subject}</strong><small>{ticket.request_number} · {typeLabels[ticket.request_type]} · {formatDate(ticket.created_at)}</small></span><span className={`owner-support-status is-${ticket.status}`}>{statusLabels[ticket.status]}</span><span aria-hidden="true">›</span></button>)}
    </div>}
  </section>;
}
