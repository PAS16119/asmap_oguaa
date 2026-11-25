// Supabase Edge Function: portal-data  (v3: config / version / search / verify / claim / report)
// The public parent portal reads ONE child's data after the parent proves who they are.
// Needs: 17_portal_attempts.sql (attempt log). If that table is missing the function falls back to in-memory limits.
// Optional secret PORTAL_HMAC_SECRET (any long random text). If absent, one is derived from the service key.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json' };
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sb = createClient(Deno.env.get('SUPABASE_URL')!, SERVICE, { auth: { persistSession: false } });

const PAY_FIELDS = ['id', 'full_name', 'class_name', 'form', 'programme', 'house', 'residential_status', 'admission_year', 'bece_index'];
const FULL = ['id', 'full_name', 'class_name', 'class', 'form', 'programme', 'house', 'residential_status', 'admission_year', 'status', 'gender', 'items_submitted', 'nhis_number', 'hometown', 'date_of_birth', 'bece_index'];
const PAY_HIDE = ['parent_phone', 'phone', 'momo_number', 'phone_number'];
const pick = (o: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));

// ---------- who is calling (cannot be faked by a client-supplied header) ----------
function clientIp(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip'); if (cf) return cf.trim();
  const xff = (req.headers.get('x-forwarded-for') || '').split(',').map((s) => s.trim()).filter(Boolean);
  return xff.length ? xff[xff.length - 1] : 'unknown';   // last hop is added by the platform, not by the caller
}

// ---------- attempt log (database first, memory as a fallback) ----------
const mem = new Map<string, number[]>();
async function recent(kind: string, col: 'ip' | 'student_id' | null, val: string, minutes: number): Promise<number> {
  const since = new Date(Date.now() - minutes * 60000).toISOString();
  try {
    let q = sb.from('portal_attempts').select('id', { count: 'exact', head: true }).eq('kind', kind).gte('ts', since);
    if (col) q = q.eq(col, val);
    const { count, error } = await q;
    if (!error) return count ?? 0;
  } catch { /* fall through */ }
  const k = kind + '|' + (col || '') + '|' + val;
  return (mem.get(k) || []).filter((t) => t > Date.now() - minutes * 60000).length;
}
async function note(kind: string, studentId: string, ip: string) {
  try { const { error } = await sb.from('portal_attempts').insert({ kind, student_id: studentId, ip }); if (!error) return; } catch { /* fall through */ }
  for (const k of [kind + '|ip|' + ip, kind + '|student_id|' + studentId]) { const a = mem.get(k) || []; a.push(Date.now()); mem.set(k, a.slice(-200)); }
}

// ---------- signed, short-lived handle for a picked student ----------
const enc = new TextEncoder();
let keyP: Promise<CryptoKey> | null = null;
function hmacKey() {
  if (!keyP) keyP = crypto.subtle.importKey('raw', enc.encode(Deno.env.get('PORTAL_HMAC_SECRET') || ('portal|' + SERVICE)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  return keyP;
}
const b64u = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
async function makeHandle(id: string): Promise<string> {
  const body = b64u(enc.encode(JSON.stringify({ id, exp: Date.now() + 15 * 60000 })));
  return body + '.' + b64u(await crypto.subtle.sign('HMAC', await hmacKey(), enc.encode(body)));
}
async function readHandle(h: string): Promise<{ id: string } | 'expired' | null> {
  try {
    const [body, sig] = String(h || '').split('.'); if (!body || !sig) return null;
    if (!(await crypto.subtle.verify('HMAC', await hmacKey(), unb64u(sig), enc.encode(body)))) return null;
    const p = JSON.parse(new TextDecoder().decode(unb64u(body)));
    return p.exp > Date.now() ? { id: String(p.id) } : 'expired';
  } catch { return null; }
}

const isoDate = (v: unknown): string => {
  const s = String(v ?? '').trim(); if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s); return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};
const BUILD = 'portal-data v3 2026-11-24';
const normName = (n: unknown) => String(n ?? '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
const accessKey = (s: any) => { const d = isoDate(s.date_of_birth); return d ? normName(s.full_name) + '|' + d : ''; };
function semNow(): string {   // same labels as portal.html: 2026_2027_T1 (Sep-Dec), T2 (Jan-Apr), T3 (May-Aug)
  const n = new Date(), y = n.getUTCFullYear(), m = n.getUTCMonth() + 1;
  return (m >= 9 ? y + '_' + (y + 1) : (y - 1) + '_' + y) + '_' + (m >= 9 ? 'T1' : m <= 4 ? 'T2' : 'T3');
}
async function paidThisSem(s: any): Promise<boolean> {
  const k = accessKey(s); if (!k) return false;
  try { const { data } = await sb.from('portal_access').select('id').eq('key', k).eq('semester', semNow()).limit(1); return !!(data && data[0]); } catch { return false; }
}
function genPin(): string {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', b = new Uint8Array(8); crypto.getRandomValues(b);
  return Array.from(b).map((x) => a.charAt(x % a.length)).join('');
}
async function sha16(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return Array.from(new Uint8Array(d)).slice(0, 8).map((x) => x.toString(16).padStart(2, '0')).join('');
}
const like = (t: string) => '%' + t.replace(/[%_\\,()]/g, '') + '%';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const out = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: CORS });
  try {
    const ip = clientIp(req);
    const b = await req.json().catch(() => ({}));

    if (b.action === 'version') return out({ version: BUILD });

    // ----- config (public, harmless) -----
    if (b.action === 'config') {
      const { data } = await sb.from('app_config').select('settings').eq('key', 'main').maybeSingle();
      const s = (data && data.settings) || {};
      const tu = typeof s.transcriptUrl === 'string' && /^https:\/\/[^\s"'<>]+$/i.test(s.transcriptUrl) ? s.transcriptUrl : '';
      return out({ portalFee: s.portalFee || 10, paystackPublicKey: s.paystackPublicKey || '', transcriptUrl: tu });
    }

    // ----- search by name: returns only name, class and the LAST 4 digits of the BECE number -----
    if (b.action === 'search') {
      if ((await recent('search', 'ip', ip, 10)) >= 25) return out({ error: 'rate' }, 429);
      await note('search', '', ip);
      const toks = String(b.name || '').toUpperCase().split(/\s+/).map((t) => t.trim()).filter((t) => t.length >= 2);
      if (toks.length < 2 || toks.length > 6) return out({ results: [] });
      let q = sb.from('students').select('id, full_name, class_name, bece_index, status').or('status.eq.active,status.is.null');
      for (const t of toks) q = q.ilike('full_name', like(t));
      const { data, error } = await q.limit(9);
      if (error) return out({ results: [] });
      if ((data || []).length > 8) return out({ tooMany: true, results: [] });
      const results = await Promise.all((data || []).map(async (s: any) => ({
        name: s.full_name, class: s.class_name || '',
        bece: s.bece_index ? '••••' + String(s.bece_index).slice(-4) : '',
        h: await makeHandle(String(s.id)),
      })));
      return out({ results });
    }

    // ----- verify date of birth: nothing about the child is returned before this passes -----
    if (b.action === 'verify') {
      const hd = await readHandle(b.h);
      if (hd === 'expired') return out({ error: 'expired' });
      if (!hd) return out({ error: 'expired' });
      const sid = hd.id;
      if ((await recent('dob_fail', 'student_id', sid, 60)) >= 5) return out({ error: 'locked' }, 429);
      if ((await recent('dob_fail', 'ip', ip, 60)) >= 15) return out({ error: 'rate' }, 429);
      const { data } = await sb.from('students').select('*').eq('id', sid).limit(1);
      const s = data && data[0]; if (!s) return out({ error: 'expired' });
      const real = isoDate(s.date_of_birth); if (!real) return out({ error: 'nodob' });
      if (isoDate(b.dob) !== real) { await note('dob_fail', sid, ip); return out({ error: 'mismatch' }); }
      return out({ student: pick(s, PAY_FIELDS), paid: await paidThisSem(s) });
    }

    // ----- claim: access already paid this semester (on the transcript site or at the office) -> hand over the PIN, no second charge -----
    if (b.action === 'claim') {
      const hd = await readHandle(b.h);
      if (!hd || hd === 'expired') return out({ error: 'expired' });
      const sid = hd.id;
      if ((await recent('dob_fail', 'student_id', sid, 60)) >= 5) return out({ error: 'locked' }, 429);
      if ((await recent('dob_fail', 'ip', ip, 60)) >= 15) return out({ error: 'rate' }, 429);
      const { data } = await sb.from('students').select('*').eq('id', sid).limit(1);
      const s = data && data[0]; if (!s) return out({ error: 'expired' });
      const real = isoDate(s.date_of_birth); if (!real) return out({ error: 'nodob' });
      if (isoDate(b.dob) !== real) { await note('dob_fail', sid, ip); return out({ error: 'mismatch' }); }
      if (!(await paidThisSem(s))) return out({ error: 'notpaid' });
      let pin = String(s.portal_pin || '').toUpperCase();
      if (!pin || !s.portal_unlocked) {
        pin = genPin();
        const { error } = await sb.from('students').update({ portal_pin: pin, portal_unlocked: true }).eq('id', s.id);
        if (error) return out({ error: 'server' }, 500);
      }
      await note('claim', sid, ip);
      return out({ pin });
    }

    // ----- report by PIN -----
    if (b.action === 'report') {
      if ((await recent('pin_fail', 'ip', ip, 60)) >= 10) return out({ error: 'rate' }, 429);
      if ((await recent('pin_fail', null, '', 10)) >= 300) return out({ error: 'rate' }, 429);   // whole-site brake against spread-out guessing
      const pin = String(b.pin || '').trim().toUpperCase();
      if (!/^[A-Z0-9]{6,12}$/.test(pin)) { await note('pin_fail', '', ip); return out({ student: null }); }
      const { data } = await sb.from('students').select('*').eq('portal_pin', pin).eq('portal_unlocked', true).limit(1);
      const s = data && data[0];
      if (!s) { await note('pin_fail', '', ip); return out({ student: null }); }

      // Server-side limit: 2 views per PIN per semester (a new PIN starts a fresh count)
      const vk = 'view:' + semNow() + ':' + await sha16(pin);
      let used = -1;
      try { const r = await sb.from('portal_attempts').select('id', { count: 'exact', head: true }).eq('kind', vk).eq('student_id', String(s.id)); if (!r.error) used = r.count ?? 0; } catch { /* table missing: client falls back */ }
      if (used >= 2) return out({ limit: true });
      if (used >= 0) await note(vk, String(s.id), ip);
      const { data: pays } = await sb.from('payments').select('*').eq('student_name', s.full_name).eq('class_name', s.class_name || '').eq('approval_status', 'confirmed').order('date', { ascending: false });
      const ids = (pays || []).map((p: any) => p.id).filter(Boolean);
      let allocs: any[] = [];
      if (ids.length) { const r = await sb.from('payment_allocations').select('payment_id, purpose, amount').in('payment_id', ids); allocs = r.data || []; }
      const payments = (pays || []).map((p: Record<string, unknown>) => {
        const c: Record<string, unknown> = { ...p }; PAY_HIDE.forEach((k) => delete c[k]);
        c.allocations = allocs.filter((a) => a.payment_id === p.id).map((a) => ({ purpose: a.purpose, amount: a.amount }));
        return c;
      });
      const { data: pta } = await sb.from('pta_attendance').select('parent_attended').eq('student_id', s.id);
      const { data: ch } = await sb.from('student_charges').select('amount, note, waived').eq('student_id', s.id);
      const fines = (ch || []).filter((c: any) => !c.waived).map((c: any) => ({ note: c.note, amount: c.amount }));
      const { data: cfg } = await sb.from('app_config').select('pay_settings').eq('key', 'main').maybeSingle();
      const arrears = Number(((cfg && cfg.pay_settings && cfg.pay_settings.arrears) || {})[s.id]) || 0;
      return out({
        student: pick(s, FULL), payments, fines, arrears, views: used >= 0 ? { used: used + 1 } : null,
        pta: { total: (pta || []).length, attended: (pta || []).filter((x: { parent_attended: boolean }) => x.parent_attended).length },
      });
    }
    return out({ error: 'bad_request' }, 400);
  } catch (_e) { return out({ error: 'server' }, 500); }
});
