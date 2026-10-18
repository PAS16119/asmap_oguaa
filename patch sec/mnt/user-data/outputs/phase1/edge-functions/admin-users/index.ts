// Supabase Edge Function: admin-users
// Admin-only user management (create / update / delete). Passwords never leave the server.
// Deploy name must be exactly: admin-users
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DOMAIN = Deno.env.get("AUTH_EMAIL_DOMAIN") ?? "asmap-oguaa.vercel.app";

const ROLES = new Set([
  "admin", "coordinator", "supervisor", "hod", "critical_friend", "form_master",
  "house_master", "sr_house_master", "class_prefect", "pta_prefect", "pta_executive", "viewer",
]);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Must match authEmail() in index.html
const emailFor = (username: string) =>
  username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "_") + "@" + DOMAIN;

const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    // 1. Who is calling?
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Not signed in" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: me } = await admin.from("profiles").select("id, role, is_active").eq("id", user.id).single();
    if (!me || me.role !== "admin" || !me.is_active) return json({ error: "Admins only" }, 403);

    const body = await req.json();
    const action = body.action;

    const activeAdminCount = async () => {
      const { count } = await admin.from("profiles").select("id", { count: "exact", head: true })
        .eq("role", "admin").eq("is_active", true);
      return count ?? 0;
    };
    const usernameTaken = async (username: string, exceptId?: string) => {
      const { data } = await admin.from("profiles").select("id").ilike("username", username.replace(/[%_]/g, "\\$&"));
      return (data ?? []).some((r) => r.id !== exceptId);
    };

    // ---------- CREATE ----------
    if (action === "create_user") {
      const username = str(body.username);
      const password = String(body.password ?? "");
      const role = str(body.role);
      const legacyId = str(body.legacy_id) || crypto.randomUUID().slice(0, 12);
      if (!username || username.length > 40) return json({ error: "Username required (max 40 characters)" }, 400);
      if (password.length < 6) return json({ error: "Password must be at least 6 characters" }, 400);
      if (!ROLES.has(role)) return json({ error: "Unknown role" }, 400);
      if (await usernameTaken(username)) return json({ error: "Username already taken" }, 409);

      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email: emailFor(username), password, email_confirm: true,
      });
      if (cErr || !created.user) return json({ error: cErr?.message ?? "Could not create account" }, 400);

      const profile = {
        id: created.user.id, legacy_id: legacyId, username, full_name: str(body.full_name), role,
        assigned_classes: arr(body.assigned_classes), permissions: arr(body.permissions),
        phone: str(body.phone), dept: str(body.dept), house: str(body.house),
        teacher_link: str(body.teacher_link), is_active: true, must_change_password: true,
      };
      const { error: pErr } = await admin.from("profiles").insert(profile);
      if (pErr) {
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: pErr.message }, 400);
      }
      return json({ ok: true, profile });
    }

    // ---------- UPDATE ----------
    if (action === "update_user") {
      const legacyId = str(body.legacy_id);
      const { data: target } = await admin.from("profiles").select("*").eq("legacy_id", legacyId).single();
      if (!target) return json({ error: "User not found" }, 404);

      const patch: Record<string, unknown> = {};
      if (body.full_name !== undefined) patch.full_name = str(body.full_name);
      if (body.phone !== undefined) patch.phone = str(body.phone);
      if (body.dept !== undefined) patch.dept = str(body.dept);
      if (body.house !== undefined) patch.house = str(body.house);
      if (body.teacher_link !== undefined) patch.teacher_link = str(body.teacher_link);
      if (body.assigned_classes !== undefined) patch.assigned_classes = arr(body.assigned_classes);
      if (body.permissions !== undefined) patch.permissions = arr(body.permissions);
      if (body.is_active !== undefined) patch.is_active = !!body.is_active;

      if (body.role !== undefined) {
        const role = str(body.role);
        if (!ROLES.has(role)) return json({ error: "Unknown role" }, 400);
        patch.role = role;
      }
      // Never leave the school without an active admin
      const losingAdmin = target.role === "admin" &&
        ((patch.role && patch.role !== "admin") || patch.is_active === false);
      if (losingAdmin && (await activeAdminCount()) <= 1) {
        return json({ error: "You must keep at least one active admin" }, 400);
      }

      const authUpdate: Record<string, unknown> = {};
      if (body.username !== undefined && str(body.username) !== target.username) {
        const username = str(body.username);
        if (!username || username.length > 40) return json({ error: "Invalid username" }, 400);
        if (await usernameTaken(username, target.id)) return json({ error: "Username already taken" }, 409);
        patch.username = username;
        authUpdate.email = emailFor(username);
        authUpdate.email_confirm = true;
      }
      if (body.password) {
        const password = String(body.password);
        if (password.length < 6) return json({ error: "Password must be at least 6 characters" }, 400);
        authUpdate.password = password;
        patch.must_change_password = true; // admin-set passwords are temporary
      }
      if (Object.keys(authUpdate).length) {
        const { error } = await admin.auth.admin.updateUserById(target.id, authUpdate);
        if (error) return json({ error: error.message }, 400);
      }
      if (Object.keys(patch).length) {
        const { error } = await admin.from("profiles").update(patch).eq("id", target.id);
        if (error) return json({ error: error.message }, 400);
      }
      return json({ ok: true });
    }

    // ---------- DELETE ----------
    if (action === "delete_user") {
      const legacyId = str(body.legacy_id);
      const { data: target } = await admin.from("profiles").select("id, role, is_active").eq("legacy_id", legacyId).single();
      if (!target) return json({ error: "User not found" }, 404);
      if (target.id === me.id) return json({ error: "You cannot delete your own account" }, 400);
      if (target.role === "admin" && target.is_active && (await activeAdminCount()) <= 1) {
        return json({ error: "You must keep at least one active admin" }, 400);
      }
      const { error } = await admin.auth.admin.deleteUser(target.id); // profile row cascades
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
