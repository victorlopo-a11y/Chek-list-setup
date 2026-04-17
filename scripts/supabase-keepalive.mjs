const DEFAULT_SUPABASE_URL = 'https://zybitkquonkymrzzrkgo.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_Wp2tASX60YudmoD2T-mdZg_l_2gMePm';

const SUPABASE_URL = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
const TABLE_NAME = process.env.SUPABASE_KEEPALIVE_TABLE || 'checklists';

const normalizedUrl = SUPABASE_URL.endsWith('/')
  ? SUPABASE_URL.slice(0, -1)
  : SUPABASE_URL;

const url = `${normalizedUrl}/rest/v1/${encodeURIComponent(TABLE_NAME)}?select=id&limit=1`;

try {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: 'application/json',
    },
  });

  const result = await response.text();
  console.log(`Keep-alive HTTP status: ${response.status}`);

  const reachableStatus = response.ok || response.status === 401 || response.status === 403;

  if (!reachableStatus) {
    console.log(`Keep-alive response: ${result}`);
    process.exit(1);
  }

  console.log('Supabase keep-alive ping success (project reachable).');
} catch (err) {
  console.error('Keep-alive request failed:', err);
  process.exit(1);
}
