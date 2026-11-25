// Supabase Edge Function: send-sms (Arkesel). Signed-in staff only.
// Secrets: ARKESEL_API_KEY, ARKESEL_SENDER_ID (approved sender name, max 11 characters), ARKESEL_SANDBOX ("true" while testing)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, prefer', 'Content-Type': 'application/json' };
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sb = createClient(Deno.env.get('SUPABASE_URL')!, SERVICE);
const fix = (n: string) => { const d = String(n || '').replace(/[^0-9]/g, ''); if (d.startsWith('233')) return d; if (d.startsWith('0')) return '233' + d.slice(1); return '233' + d; };
async function send(recipients: string[], message: string) {
  const key = Deno.env.get('ARKESEL_API_KEY') || '', sender = Deno.env.get('ARKESEL_SENDER_ID') || '';
  if (!key || !sender) throw new Error('SMS is not set up (ARKESEL_API_KEY / ARKESEL_SENDER_ID)');
  const body: Record<string, unknown> = { sender, message, recipients };
  if (Deno.env.get('ARKESEL_SANDBOX') === 'true') body.sandbox = true;
  const r = await fetch('https://sms.arkesel.com/api/v2/sms/send', { method: 'POST', headers: { 'api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const t = await r.text(); let j: any = {};
  try { j = JSON.parse(t); } catch { throw new Error('SMS provider said: ' + t.slice(0, 120)); }
  if (j.status && j.status !== 'success') throw new Error(j.message || 'SMS provider refused the request');
  const data: any[] = j.data || [];
  const sent = data.filter((x) => x.recipient).length;
  const bad = data.flatMap((x) => x['invalid numbers'] || []);
  return { sent, failed: bad.length, bad };
}
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const out = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: CORS });
  try {
    let role = 'service';
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    if (token !== SERVICE) {
      const { data } = await sb.auth.getUser(token);
      if (!data?.user) return out({ success: false, error: 'Please sign in again' }, 401);
      const { data: p } = await sb.from('profiles').select('is_active, role').eq('id', data.user.id).maybeSingle();
      if (!p || !p.is_active) return out({ success: false, error: 'Account not active' }, 403);
      role = p.role || '';
    }
    const b = await req.json();
    if (b.action === 'version') return out({ success: true, version: 'send-sms v2 2026-11-24 (role limits)' });
    const jobs: { to: string[]; message: string }[] = [];
    if (b.bulk) b.bulk.forEach((x: any) => jobs.push({ to: [fix(x.to)], message: x.message }));
    else if (b.recipients) jobs.push({ to: b.recipients.map(fix), message: b.message });
    else if (b.to) jobs.push({ to: [fix(b.to)], message: b.message });
    if (!jobs.length) return out({ success: false, error: 'No recipients' }, 400);
    // Safety limits: only the admin may send to many people; everyone else a couple of messages at a time.
    const total = jobs.reduce((n, j) => n + j.to.length, 0);
    if (role !== 'admin' && role !== 'service' && total > 3) return out({ success: false, error: 'Only the admin can send to many people at once' }, 403);
    if (total > 600) return out({ success: false, error: 'Too many recipients in one request (max 600)' }, 400);
    if (jobs.some((j) => !j.message || String(j.message).length > 640)) return out({ success: false, error: 'Message is empty or too long' }, 400);
    let sent = 0, failed = 0; const bad: string[] = [];
    for (const j of jobs) for (let i = 0; i < j.to.length; i += 200) { const r = await send(j.to.slice(i, i + 200), j.message); sent += r.sent; failed += r.failed; bad.push(...r.bad); }
    return out({ success: sent > 0, sent, failed, sandbox: Deno.env.get('ARKESEL_SANDBOX') === 'true', error: sent > 0 ? undefined : ('No messages were accepted' + (bad[0] ? ': ' + bad[0] : '')) });
  } catch (e) { return out({ success: false, error: String((e as Error).message || e) }, 500); }
});
