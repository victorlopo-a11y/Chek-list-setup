
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zybitkquonkymrzzrkgo.supabase.co';
const supabaseAnonKey = 'sb_publishable_Wp2tASX60YudmoD2T-mdZg_l_2gMePm';

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
