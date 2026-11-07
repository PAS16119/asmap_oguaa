// Supabase Edge Function: portal-data
// Lets the public parent portal read ONE child's data without exposing the tables.
//
// Parent flow:  search (name)  ->  choose ward (class + last 4 BECE digits shown)  ->  verify (date of birth)  ->  pay / PIN  ->  report
// The student id is NOT revealed by search. Search returns an encrypted, 20-minute handle. The id and the BECE number
// are only returned by verify, after the date of birth has matched, so a stranger who only knows a name cannot reach payment.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json' };
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sb = createClient(Deno.env.get('SUPABASE_URL')!, SERVICE_KEY);
const LOOKUP = ['id','full_name','class_name','form','programme','house','residential_status','admission_year','bece_index'];
const FULL = ['id','full_name','class_name','class','form','programme','house','residential_status','admission_year','status','gender','items_submitted','nhis_number','hometown','date_of_birth','bece_index'];
const PAY_HIDE = ['parent_phone','phone','momo_number','phone_number'];
const pick = (o: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));

// ---- simple in-memory limiter (per function instance). The wrong-date counter below is also kept in the database.
const mem = new Map<string, number[]>();
function hit(k: string, windowMs: number, add = true) {
  const now = Date.now(), a = (mem.get(k) || []).filter((t) => now - t < windowMs);
  if (add) a.push(now);
  mem.set(k, a); return a.length;
}
const limited = (ip: string) => hit('r|' + ip, 600000) > 30;

// ---- opaque handle: AES-GCM({id, exp}) so the student id stays hidden until the date of birth is right
let _key: CryptoKey | null = null;
async function key() {
  if (_key) return _key;
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('portal-handle:' + SERVICE_KEY));
  _key = await crypto.subtle.importKey('raw', h, 'AES-GCM', false, ['encrypt', 'decrypt']); return _key;
}
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
async function seal(id: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), new TextEncoder().encode(JSON.stringify({ id, exp: Date.now() + 20 * 60000 }))));
  const o = new Uint8Array(12 + ct.length); o.set(iv); o.set(ct, 12); return b64(o);
}
async function unseal(h: string): Promise<string | null> {
  try {
    const raw = unb64(h), pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, await key(), raw.slice(12));
    const o = JSON.parse(new TextDecoder().decode(pt)); return o.exp > Date.now() ? String(o.id) : null;
  } catch { return null; }
}

// ---- helpers
const normName = (s: unknown) => String(s || '').toUpperCase().replace(/[^A-Z0-9' \-]/g, ' ').replace(/\s+/g, ' ').trim();
function normDob(v: unknown): string | null {
  const t = String(v ?? '').trim(); if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}
const maskBece = (b: unknown) => { const s = String(b || '').trim(); return s ? '••••••' + s.slice(-4) : ''; };
async function failsInDb(studentId: string, ip: string | null, minutes: number): Promise<number> {
  try {
    const since = new Date(Date.now() - minutes * 60000).toISOString();
    let q = sb.from('portal_attempts').select('id', { count: 'exact', head: true }).eq('student_id', studentId).eq('kind', 'dob_fail').gte('ts', since);
    if (ip) q = q.eq('ip', ip);
    const { count, error } = await q; return error ? 0 : (count || 0);
  } catch { return 0; }
}
async function logFail(studentId: string, ip: string) { try { await sb.from('portal_attempts').insert({ student_id: studentId, ip, kind: 'dob_fail' }); } catch { /* table missing: the in-memory limiter still applies */ } }

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
    // 1. search by name. Returns only: an encrypted handle, the name, the class and the last 4 digits of the BECE number.
    if (b.action === 'search') {
      if (hit('s|' + ip, 600000) > 40) return out({ error: 'rate' }, 429);
      const tokens = normName(b.name).split(' ').filter((t) => t.length >= 2);
      if (tokens.length < 2 || tokens.join('').length < 5) return out({ results: [] });
      let q = sb.from('students').select('id,full_name,class_name,bece_index');
      for (const t of tokens.slice(0, 4)) q = q.ilike('full_name', '%' + t + '%');
      const { data } = await q.limit(9);
      const rows = data || [];
      if (rows.length > 8) return out({ tooMany: true });
      const results = [];
      for (const r of rows) results.push({ h: await seal(String(r.id)), name: r.full_name, class: r.class_name || '', bece: maskBece(r.bece_index) });
      return out({ results });
    }
    // 2. verify the date of birth. Only now are the student details (including id and BECE number) released.
    if (b.action === 'verify') {
      const id = await unseal(String(b.h || ''));
      if (!id) return out({ error: 'expired' });
      const failsIp = Math.max(hit('f|' + id + '|' + ip, 3600000, false), await failsInDb(id, ip, 60));
      const failsHr = Math.max(hit('f|' + id, 3600000, false), await failsInDb(id, null, 60));
      const failsDay = Math.max(hit('d|' + id, 86400000, false), await failsInDb(id, null, 1440));
      if (failsIp >= 5 || failsHr >= 15 || failsDay >= 40) return out({ error: 'locked' }, 429);
      const { data } = await sb.from('students').select('*').eq('id', id).limit(1);
      const s = data && data[0];
      if (!s) return out({ error: 'expired' });
      const dob = normDob(s.date_of_birth);
      if (!dob) return out({ error: 'nodob' });
      if (normDob(b.dob) !== dob) {
        hit('f|' + id + '|' + ip, 3600000); hit('f|' + id, 3600000); hit('d|' + id, 86400000);
        await logFail(id, ip);
        return out({ error: 'mismatch' });
      }
      return out({ student: pick(s, LOOKUP) });
    }
    // The old BECE-number-only lookup is switched off: it would let anyone skip the date of birth.
    if (b.action === 'lookup') return out({ student: null });
    if (b.action === 'report') {
      if (limited(ip)) return out({ error: 'rate' }, 429);
      const pin = String(b.pin || '').trim().toUpperCase();
      if (pin.length < 6) return out({ student: null });
      const { data } = await sb.from('students').select('*').eq('portal_pin', pin).eq('portal_unlocked', true).limit(1);
      const s = data && data[0];
      if (!s) return out({ student: null });
      const { data: pays } = await sb.from('payments').select('*').eq('student_name', s.full_name).eq('class_name', s.class_name || '').eq('approval_status', 'confirmed').order('date', { ascending: false });
      const { data: pta } = await sb.from('pta_attendance').select('parent_attended').eq('student_id', s.id);
      const ids = (pays || []).map((p: Record<string, unknown>) => p.id);
      const { data: als } = ids.length ? await sb.from('payment_allocations').select('payment_id,purpose,amount').in('payment_id', ids) : { data: [] };
      const { data: chg } = await sb.from('student_charges').select('id,amount,note,kind').eq('student_id', s.id).eq('waived', false);
      const { data: cfg } = await sb.from('app_config').select('pay_settings').eq('key', 'main').maybeSingle();
      const ps = ((cfg && cfg.pay_settings) || {}) as { arrears?: Record<string, number>; carriedFines?: string[] };
      const carried = ps.carriedFines || [];
      const fines = (chg || []).filter((c: { id: string }) => !carried.includes(c.id)).map((c: { amount: number; note: string }) => ({ amount: c.amount, note: c.note }));
      const arrears = Number((ps.arrears || {})[s.id]) || 0;
      const payments = (pays || []).map((p: Record<string, unknown>) => { const c: Record<string, unknown> = { ...p }; PAY_HIDE.forEach((k) => delete c[k]); c.allocations = (als || []).filter((a: { payment_id: unknown }) => a.payment_id === p.id).map((a: { purpose: string; amount: number }) => ({ purpose: a.purpose, amount: a.amount })); return c; });
      return out({ student: pick(s, FULL), payments, fines, arrears, pta: { total: (pta || []).length, attended: (pta || []).filter((x: { parent_attended: boolean }) => x.parent_attended).length } });
    }
    return out({ error: 'bad_request' }, 400);
  } catch (e) { return out({ error: 'server' }, 500); }
});
