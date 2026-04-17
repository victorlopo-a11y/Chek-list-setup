
import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://zybitkquonkymrzzrkgo.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_Wp2tASX60YudmoD2T-mdZg_l_2gMePm';

const env = import.meta.env as Record<string, string | undefined>;

const supabaseUrl = env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const getBaseUrl = () => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    return url.toString();
  }

  return supabaseUrl;
};
