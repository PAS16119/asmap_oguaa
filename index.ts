// Supabase Edge Function: migrate-users   (ONE-TIME USE, delete it afterwards)
// Copies rows from the legacy `users` table into Supabase Auth + `profiles`.
// Protected by a secret you set in Edge Functions > Secrets (MIGRATE_SECRET).
// Call with header  x-migrate-secret: <your secret>
// Add ?dry=1 to preview without changing anything.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SECRET = Deno.env.get("MIGRATE_SECRET") ?? "";
const DOMAIN = Deno.env.get("AUTH_EMAIL_DOMAIN") ?? "asmap-oguaa.vercel.app";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-migrate-secret",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const emailFor = (u: string) => u.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "_") + "@" + DOMAIN;
const tempPassword = () => {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const b = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(b, (x) => chars[x % chars.length]).join("");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (!SECRET || req.headers.get("x-migrate-secret") !== SECRET) return json({ error: "Forbidden" }, 403);

  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: legacy, error } = await admin.from("users").select("*").order("created_at");
  if (error) return json({ error: error.message }, 500);

  const { data: existing } = await admin.from("profiles").select("legacy_id, username");
  const doneIds = new Set((existing ?? []).map((p) => p.legacy_id));
  const usedEmails = new Set((existing ?? []).map((p) => emailFor(p.username)));

  const report = { dry, total: legacy?.length ?? 0, created: 0, skipped_already_migrated: 0,
    needs_temp_password: [] as { username: string; temp_password: string }[],
    renamed_for_collision: [] as { username: string; email: string }[],
    errors: [] as { username: string; error: string }[] };

  for (const u of legacy ?? []) {
    if (doneIds.has(u.id)) { report.skipped_already_migrated++; continue; }
    const username = String(u.username ?? "").trim();
    if (!username) { report.errors.push({ username: "(blank)", error: "no username, id " + u.id }); continue; }

    let email = emailFor(username);
    let n = 2;
    while (usedEmails.has(email)) {
      email = emailFor(username).replace("@", "_" + n++ + "@");
    }
    if (email !== emailFor(username)) report.renamed_for_collision.push({ username, email });
    usedEmails.add(email);

    let password = String(u.password ?? "");
    if (password.length < 6) {
      password = tempPassword();
      report.needs_temp_password.push({ username, temp_password: password });
    }
    if (dry) { report.created++; continue; }

    const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (cErr || !created.user) { report.errors.push({ username, error: cErr?.message ?? "create failed" }); continue; }

    const { error: pErr } = await admin.from("profiles").insert({
      id: created.user.id, legacy_id: u.id, username, full_name: u.full_name ?? "",
      role: u.role ?? "viewer", assigned_classes: u.assigned_classes ?? [], permissions: u.permissions ?? [],
      phone: u.phone ?? "", dept: u.dept ?? "", house: u.house ?? "", teacher_link: u.teacher_link ?? "",
      is_active: u.is_active !== false,
      must_change_password: true, // old passwords were readable by anyone, so everyone sets a fresh one
    });
    if (pErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      report.errors.push({ username, error: pErr.message });
      continue;
    }
    report.created++;
  }
  return json(report);
});
