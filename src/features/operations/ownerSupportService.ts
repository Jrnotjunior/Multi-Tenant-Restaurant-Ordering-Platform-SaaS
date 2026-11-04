import { createClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

const ticketClient = createClient(
  'https://cishhexduxgrwdvptuhj.supabase.co',
  'sb_publishable_tr8QdcIBOu2FfjMx_7YyjA_sP4ZM782',
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function invoke<T>(action: string, body?: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Web2table authentication is unavailable.');
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.access_token) throw new Error('Your session has expired. Please sign in again.');
  const { data, error } = await ticketClient.functions.invoke('support-owner-portal', {
    body: body ?? {},
    headers: {
      Authorization: `Bearer ${sessionData.session.access_token}`,
      'x-action': action,
    },
  });
  if (error) throw new Error(error.message || 'The support service could not be reached.');
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export type OwnerSupportTicket = {
  id: string;
  request_number: string | null;
  request_type: 'incident' | 'request_item';
  subject: string;
  description: string;
  impact: 'low' | 'normal' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'resolved' | 'closed' | 'cancelled';
  created_at: string;
  updated_at: string;
};

export type OwnerSupportMessage = {
  id: string;
  ticket_id: string;
  sender_user_id: string;
  message: string;
  visibility: 'public' | 'internal';
  created_at: string;
};

export const ownerSupportService = {
  async getCurrentUserId() {
    if (!supabase) throw new Error('Web2table authentication is unavailable.');
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw new Error('Unable to verify your signed-in account.');
    return data.user.id;
  },
  async listTickets() {
    const result = await invoke<{ tickets: OwnerSupportTicket[] }>('list_tickets');
    return result.tickets;
  },
  async createTicket(input: {
    request_type: 'incident' | 'request_item';
    subject: string;
    description: string;
    impact: OwnerSupportTicket['impact'];
  }) {
    const result = await invoke<{ ticket: OwnerSupportTicket }>('create_ticket', input);
    return result.ticket;
  },
  async listMessages(ticketId: string) {
    const result = await invoke<{ messages: OwnerSupportMessage[] }>('list_messages', { ticket_id: ticketId });
    return result.messages;
  },
  async sendMessage(ticketId: string, message: string) {
    const result = await invoke<{ message: OwnerSupportMessage }>('send_message', { ticket_id: ticketId, message });
    return result.message;
  },
};
