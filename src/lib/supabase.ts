import { createClient } from '@supabase/supabase-js';
import { readPublicConfig } from './config';
const config = readPublicConfig(import.meta.env);
/** Public browser client only. Never use secret keys or bypass RLS here. */
export const supabase = config ? createClient(config.url, config.publishableKey) : null;
