// Supabase Edge Function: portal-data
// Lets the public parent portal read ONE child's data without exposing the tables.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json' };
const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const LOOKUP = ['id','full_name','class_name','form','programme','house','residential_status','admission_year','bece_index'];
const FULL = ['id','full_name','class_name','class','form','programme','house','residential_status','admission_year','status','gender','items_submitted','nhis_number','hometown','date_of_birth','bece_index'];
const PAY_HIDE = ['parent_phone','phone','momo_number','phone_number'];
const tries = new Map<string, { n: number; t: number }>();
function limited(ip: string) {
  const now = Date.now(), e = tries.get(ip);
  if (!e || now - e.t > 600000) { tries.set(ip, { n: 1, t: now }); return false; }
  e.n++; return e.n > 30;
}
const pick = (o: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const out = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: CORS });
  try {
    const ip = (req.headers.get('x-forwarded-for') || 'x').split(',')[0].trim();
    const b = await req.json().catch(() => ({}));
    if (b.action === 'config') {
      const { data } = await sb.from('app_config').select('settings').eq('key', 'main').maybeSingle();
      const s = (data && data.settings) || {};
      return out({ portalFee: s.portalFee || 10, paystackPublicKey: s.paystackPublicKey || '' });
    }
    if (b.action === 'lookup') {
      if (limited(ip)) return out({ error: 'rate' }, 429);
      const bece = String(b.bece || '').trim().toUpperCase();
      if (!bece) return out({ student: null });
      const { data } = await sb.from('students').select('*').eq('bece_index', bece).limit(1);
      return out({ student: data && data[0] ? pick(data[0], LOOKUP) : null });
    }
    if (b.action === 'report') {
      if (limited(ip)) return out({ error: 'rate' }, 429);
      const pin = String(b.pin || '').trim().toUpperCase();
      if (pin.length < 6) return out({ student: null });
      const { data } = await sb.from('students').select('*').eq('portal_pin', pin).eq('portal_unlocked', true).limit(1);
      const s = data && data[0];
      if (!s) return out({ student: null });
      const { data: pays } = await sb.from('payments').select('*').eq('student_name', s.full_name).eq('class_name', s.class_name || '').eq('approval_status', 'confirmed').order('date', { ascending: false });
      const { data: pta } = await sb.from('pta_attendance').select('parent_attended').eq('student_id', s.id);
      const payments = (pays || []).map((p: Record<string, unknown>) => { const c = { ...p }; PAY_HIDE.forEach((k) => delete c[k]); return c; });
      return out({ student: pick(s, FULL), payments, pta: { total: (pta || []).length, attended: (pta || []).filter((x: { parent_attended: boolean }) => x.parent_attended).length } });
    }
    return out({ error: 'bad_request' }, 400);
  } catch (e) { return out({ error: 'server' }, 500); }
});
