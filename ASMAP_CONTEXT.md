# ASMaP + Transcript System: project context (handoff for any developer or AI)

Last updated: 24 Nov 2026. Owner: Ato (Philip Ato Sam), teacher/administrator at Oguaa Senior High Technical School (OSTECH), Cape Coast, Ghana.
Read this file first. It says what exists, how it is wired, what is finished, what is pending, and the traps to avoid.

## 1. The two systems and how they relate
| System | What it is | Where it runs | Code |
|---|---|---|---|
| **ASMaP** (Adombra School Management & Analytics Platform) | Staff web app: attendance, payments/ledger, scores, conduct, PTA, SMS, manage, settings. Also the public parent portal (`/portal`). | Vercel, `https://asmap-oguaa.vercel.app` | `index.html` (single ~930 KB file, vanilla JS), `portal.html`, `sw.js`, `vercel.json`, numbered `*.sql` scripts, `supabase/functions/*` |
| **Transcript system** ("Students Transcript System") | Flask app. Staff upload a WAEC/GES batch PDF per class; it splits it into one PDF per student (name, DOB, ref id read from the PDF). Parents search the ward's name, confirm date of birth, (optionally pay) and download. | Render (free plan), `https://transcript-oguaashts.onrender.com` | `reportcard_portal` repo: `app.py`, `db.py`, `splitter.py`, `storage.py`, `payments.py`, templates |

They are **separate apps sharing one Supabase project** (same Postgres database). The transcript tables are `reportcard_*`. ASMaP does not hold the PDFs. ASMaP only links to the transcript site.
Why separate: PDF splitting/compression needs a Python server; rebuilding it inside ASMaP would duplicate the most sensitive data handling. **Decision (agreed): keep separate, connect by link, share a "paid once" record.**

## 2. Infrastructure
- **Supabase project** `wwcvvnscekpdrtadqgjs` (org ADOMBRA, **Free plan**: no automatic backups, can pause after inactivity; leaked-password protection is Pro-only).
- **Edge Functions (3 deployed):** `admin-users`, `portal-data`, `send-sms`. **`portal-payment` is NOT deployed** (the portal's online-payment step cannot complete; Paystack public key is empty).
- **Edge Function secrets present:** `ARKESEL_API_KEY`, `ARKESEL_SENDER_ID` (sender name **OGUAASHTS**, approved/working), `ARKESEL_SANDBOX` (= false), legacy `AT_USERNAME/AT_API_KEY/AT_SANDBOX` (Africa's Talking, unused). Never put key values in chat or code.
- **Auth:** users sign in with a made-up email `username@asmap-oguaa.vercel.app` (see `authEmail()`); accounts are created only through `admin-users`. Recommended settings: sign-ups OFF, anonymous sign-ins OFF, min password 10.
- **Browser holds only the public anon key.** The service key lives only in Edge Functions / the transcript app's `DATABASE_URL`.
- **GitHub:** repos should be private. Keep `patch sec/` and `venv/` out of commits.

## 3. ASMaP architecture and conventions (read before editing)
- `index.html` is one script with **global functions**; pages are `<div id="page-NAME" class="page">`, rendered by `renderPage()` via a `switch`. Navigation is built by `buildNav()` -> `_renderNav(tabs)`.
- **Safe-extension pattern used for all later work:** append new code just before the last `</script>`, and wrap existing functions: `var o = window.fn; window.fn = function(){ var r = o.apply(this, arguments); /* extra */ return r; }`. Do not rewrite big functions.
- Helpers: `_x(text)` HTML-escape (now escapes & < > " '); `showToast(msg,type)`; `openModal(title,html)`; `showConfirm(...)`; `saveDB()`; `sbGet/sbPost/sbPatch/sbUpsert` (note **`sbGet` returns `[]` on failure**, so it cannot detect a missing table); `HDR` (headers; includes a `Prefer` header, which must be removed for Edge Function calls or CORS fails); `callAdminUsers(action,payload)`; `asmapSMS({to,message}|{bulk:[...]})`; `toExcel(rows,name)`; `classCmp` (Form 3 first).
- **State** is `DB.*` (students, users, payments, allocations, purposes, settings, ...), cached in localStorage and synced from Supabase. `DB.settings` is stored in `app_config.settings` (key `main`); `pay_settings` holds arrears map.
- **Roles:** admin, coordinator (money), supervisor, hod, critical_friend, form_master, house_master, sr_house_master, class_prefect, pta_prefect, pta_executive, viewer (superintendent, permission checkboxes). Fee clearance per person: `visiblePurposes()`, `clearedFigures()`.
- **Fee model:** purposes (Extended Teaching, Teacher Motivation, PTA Project, Others, Anniversary Levy) with per-form amounts in the **Fee Schedule** (authoritative). Older "Pay Settings" student-fee boxes and "Payment Purposes" expected amounts are legacy/fallback. Extended Teaching is split per payment by `etPlan()` / `getETAmountFromPayments()`.
- **Attribution rule (fixed 24 Nov):** money is credited to the person who **recorded** the payment (`p.recordedBy`), never to everyone assigned to a class. Admin/bulk-import entries appear on their own report row. Coordinators see "Collected by me" vs "Class total", and the Ledger shows "Who collected in [class]".
- Edit conventions: `portal.html` uses CRLF line endings and emoji; preserve them. Verify JS with `node --check` after extracting the largest inline `<script>`. Test logic with jsdom stubs. Strings containing `\n` inside JS strings need exactly one backslash in the file.

## 4. Features added in this engagement (all in `index.html` unless stated)
1. **Class order** Form 3 -> 1 everywhere (`classCmp`, sorted on render).
2. **Admin menu grouped** into Home, Daily, Academics, Reports, People, System (sub-pill row). Roles with 6 tabs or fewer keep a flat row.
3. **Premium styling** (injected `<style id="premium-ui">`): buttons, cards, tables, forms, modals.
4. **Bulk users** (Settings > Users > Bulk add): Excel template with dropdowns (ExcelJS loaded from cdnjs), preview with errors/warnings, creates users via `admin-users`, random 10-char temp passwords (must change at first sign-in), downloads logins, SMS + WhatsApp send.
5. **Send logins** (existing users): resets passwords (`update_user`), then SMS/WhatsApp; Test SMS box shows the real error.
6. **Teacher import** now carries Phone, Email, Department, Staff ID, Notes (fills blanks only).
7. **WhatsApp click-to-send** (wa.me links, one tap per person; never automatic) for logins and SMS Centre.
8. **Login wording**: SMS kept within one 160-char message, role-specific; WhatsApp has the full wording.
9. **Report Cards page** (admin, Academics): link to transcript uploader and parent link; transcript URL setting in School Profile; portal buttons to the transcript site.
10. **Collections fix** (no double counting), admin **Totals by form/class/purpose** with Excel export, coordinator Home split.
11. **Security/robustness:** stronger `_x`; angle brackets/control chars stripped from stored text on render (`_sanitizeDB`); PIN generator uses `crypto.getRandomValues`; prefect login passwords 10 chars.
12. **Deployment check** card (Settings, admin): reports which parts run the latest version (`ASMAP_BUILD = 24Nov-b`).
13. **SMS templates** (fee reminder, report ready, PTA, reopening, absence) in SMS Centre.

## 5. Edge Functions (files in outputs / repo `supabase/functions/`)
- **`send-sms`** (Arkesel). Requires a signed-in active staff member. **Only admin may send to more than 3 people per request**; max 600 recipients and 640 chars. CORS header list includes `prefer`. Has `{action:'version'}`. "Verify JWT" is OFF in the dashboard (function authenticates itself).
- **`admin-users`** (live code reviewed; good): admin-only create/update/delete, keeps >=1 active admin, forces password change. TODO: raise the server minimum password from 6 to 10 (two `password.length < 6` checks).
- **`portal-data` v3** (`{action: config|version|search|verify|claim|report}`):
  - `search`: needs 2+ name words; returns only name, class, last 4 BECE digits and a signed 15-minute handle.
  - `verify`: needs handle + date of birth; 5 wrong tries lock the student for an hour, 15 per IP; returns student fields + `paid` (shared record).
  - `claim`: after DOB check, if access is already paid this semester (transcript site or office) it generates/returns the PIN: **no second charge**.
  - `report`: PIN lookup; 10 wrong PINs/hour/IP and a site-wide brake; **2 views per PIN per semester enforced server-side** (counted in `portal_attempts`, kind `view:<semester>:<hash>`). Client falls back to localStorage if the table is missing.
  - IP comes from `cf-connecting-ip` or the LAST `x-forwarded-for` value (the first can be faked).
- **Not built:** `portal-payment` (Paystack verify + PIN issue). **Before deploying it, it must write a `portal_access` row (source `asmap`) and check `portal_access` first, otherwise parents can be charged twice.**

## 6. Database
- All **36 public tables have RLS ON** (audit 24 Nov; the 7 legacy tables `academic_years, classes, pay_settings, payment_purposes, portal_payments, subjects, teachers` were locked with `lock_unused_tables.sql`). Two read policies remain open to any signed-in user: `timetable (tt_read)`, `ext_decisions (ext_read)` (low risk; sign-ups disabled).
- SQL scripts (run order matters; mostly already run): `01..23_*.sql` in the repo, then `17_portal_attempts.sql`, `lock_unused_tables.sql`, `secure_transcript_tables.sql`, **`24_portal_access.sql` (NEW, must be run)**. `security_audit.sql` is a read-only checker.
- `portal_access(key, semester, source, reference, amount_ghs, student_ref)` unique on (key, semester). `key` = child's name words sorted (capitals, punctuation -> space) + `|` + DOB `YYYY-MM-DD`. Same rule in TS (`portal-data`), Python (`transcript_db.py`) and JS (`_portalAccessKey`). Semester labels like `2026_2027_T1` (Sep-Dec T1, Jan-Apr T2, May-Aug T3).
- RLS policy on `portal_access`: admin (via `my_role()`) can read/write; everything else blocked; the portal-data function (service key) and the transcript app (database owner) bypass RLS.

## 7. Charging GHS 12 once (implemented 24 Nov, NOT yet exercised end-to-end)
Rule from the owner: the portal fee is **GHS 12 per semester, charged once whether paid via ASMaP or the transcript system.**
- Office issues a PIN in ASMaP (SMS Centre > Result Notification > Generate PIN) -> `_recordPortalAccess(student,'office')` writes the shared row.
- Transcript site: after the parent's DOB check, `db.asmap_access_paid(student)`; if true the pay step is skipped. After a successful Paystack payment it calls `db.record_portal_access(..., 'transcript', ...)`.
- ASMaP portal: `verify` returns `paid`; the pay screen then shows "already paid" and a **Get my PIN** button (`claim`).
- Matching needs the child's **name words and DOB to agree in both systems**. If not, the parent is simply asked to pay (fails safe) and the office can resolve it. Children without a recorded DOB cannot be matched.
- Transcript site must have `DOWNLOAD_PRICE_GHS=12` and `PAYMENT_ENABLED=true` set on Render to charge at all (default price in code is 10; payments are OFF by default).

## 8. Security posture and known gaps
Done: RLS everywhere; role-limited SMS; DB-backed attempt limits; no student detail before DOB; signed short-lived handle; crypto PINs; input stripping; transcript IP-spoof fix (`CF-Connecting-IP`/last XFF); transcript tables locked.
Open / recommended:
- Move Supabase to Pro (backups, leaked-password protection) or keep weekly Full Backup copies off-platform.
- Set Auth min password 10 and "letters and digits" after deploying the new prefect generator; sign-ups and anonymous sign-ins OFF.
- PINs are stored in plain text in `students.portal_pin` (readable by staff roles that can read students). Consider hashing.
- ~95 `innerHTML` sites; escaping is partial. Real fix needs removing inline handlers + enforcing a CSP (currently Report-Only). `_sanitizeDB` is a stopgap.
- Admin account has no MFA in the app UI. Captcha must NOT be enabled in Supabase until the login page supports it (it would lock everyone out).
- Transcript download token is deterministic per student (a leaked link works indefinitely).
- Arkesel report page shows message text incl. temporary passwords: restrict who has that login.
- Data Protection Act 2012 (Act 843): consider registering with the Data Protection Commission (minors' data).

## 9. Deploy checklist (what must be done by the owner; Claude cannot deploy)
1. Supabase SQL Editor: run `24_portal_access.sql`, `17_portal_attempts.sql` (if not yet), `lock_unused_tables.sql`, `secure_transcript_tables.sql` (done as of 24 Nov audit).
2. Edge Functions: paste `portal-data-index.ts` into **portal-data**; paste `send-sms-index.ts` into **send-sms**; keep Verify JWT OFF for both. (admin-users: change both `< 6` to `< 10`.)
3. GitHub -> Vercel: upload `index.html`, `portal.html`. Hard refresh (service worker caches).
4. Transcript repo -> Render: replace `app.py` with `transcript_app.py`, `db.py` with `transcript_db.py`; set `ADMIN_PASSWORD`, `DOWNLOAD_PRICE_GHS=12`.
5. ASMaP **Settings > Deployment check** must show all green (the Render item is manual: Render > Events).
6. Test: office PIN for a child with a DOB -> open that child on the transcript site -> must skip payment (needs PAYMENT_ENABLED=true); and the reverse once `portal-payment` exists.

## 10. Owner preferences and decisions
Wants: simple admin menu (six groups), premium look, class order Form 3 -> 1, no double-counted money, each coordinator must see what **they** collected vs the class total and who collected each payment (to prevent disputes), bulk user creation with one-click SMS/WhatsApp, WhatsApp as manual click-to-send, link between ASMaP and the transcript site, strong security. Fee is GHS 12, charged once. Prefers not to break working features: add, do not rewrite. School office numbers: 0241557824 / 0542322727.

## 11. SMS facts
Arkesel via `send-sms`; sender OGUAASHTS delivering (24 Nov: 9 of 10 test messages DELIVERED). Long messages cost multiple segments (160 chars = 1; the PTA invitation used 3). Login SMS is deliberately <=160 chars.
