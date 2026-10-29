# ASMaP handoff (state on 24 Oct 2026)

Paste this whole file to any AI that continues the work. Read "Rules for working" first.

## 1. Project and owner
- ASMaP = school management platform for Oguaa Senior High Technical School (OSTECH), Cape Coast, Ghana. Owner: Ato (admin and teacher), on Windows, uses Command Prompt, GitHub Desktop (no git CLI) and the Supabase CLI.
- Goal: a complete school system covering teacher monitoring, student attendance and records, PTA-approved fees (not school fees), report cards, parent SMS, monthly teacher analysis (Teacher of the Month), yearly archiving. Launch was targeted for 24 Oct 2026.
- Stack: ONE static file `index.html` (about 700 KB, plain JS, no build), `portal.html` (public parent portal), `sw.js`, Supabase (Postgres, Auth, Edge Functions), Vercel hosting, Africa's Talking SMS, Paystack MoMo.
- Repo: github.com/PAS16119/asmap_oguaa (public). Working branch `lessons` (Vercel preview is behind a Vercel login); `main` = live at asmap-oguaa.vercel.app. Supabase project ref `wwcvvnscekpdrtadqgjs`. The anon key is public in the code (normal); NEVER put the service-role key in the front end.
- Working copies on the owner's PC have CRLF line endings; the repo stores LF. Do not `git apply` patches; replace whole files. Commit only the files you mean to (never `git add .`; folder `patch sec` must not be committed).

## 2. Rules for working (learned the hard way)
- Edit `index.html` by exact-string replacement with a count check, then syntax-check the extracted script with `node --check` and verify every `onclick=` handler has a function. Use acorn (node) for removing functions, since Python string offsets differ from JS offsets for emoji.
- A build stamp is in the Settings footer ("build 24Oct-a"). Bump it each release; the owner uses it to confirm what is deployed.
- Never state something works unless tested. Nothing below was run in a browser by the assistant; all code was syntax-checked only.
- `saveDB()` writes the whole config as one JSON row (`app_config`, key `main`): last write wins. Settings page must not auto-refresh (it wiped typed fields); the 30 s `silentRefresh` skips settings and lessons.
- Keep roles/permission design; owner wants admin to decide who records and who sees what.

## 3. Roles and permissions
Roles: admin, coordinator, supervisor, hod, critical_friend, form_master, house_master, sr_house_master, class_prefect, pta_prefect, pta_executive, viewer (superintendent, read-only, permissions list: et, tm, project, totals, ledger, etc.).
`profiles.permissions` (text[]) also holds tokens: `lesson_log` (may record Lesson Log), `lesson_reports` (may see all teacher reports and ratings), `ttclass:<timetable class id>` (the one class a class prefect may record).
Payments rule from the owner: only coordinators (their assigned classes only), viewers with payment permissions, and admin see student payments.

## 4. Database and SQL scripts (run in this order; VERIFY which were already run)
01_profiles.sql (Supabase Auth profiles, `is_admin()`), migrate-users function (done, then deleted), 04_cutover (locks old `users` table; reissued corrected version; confirm it ran), 05_archives.sql, 06_lessons.sql (`timetable`, `lesson_attendance`), 07_lessons_v2.sql (activity, assess_type, `lesson_log` permission), 08_extended_decisions.sql (`ext_decisions`), 10_lesson_log_v3.sql (new model, see 6), 11_pta.sql (PTA targeting, fines, `student_charges`, `has_perm()`), then LAST 09_lockdown.sql (role/class-scoped RLS; 09_rollback.sql reopens). The owner had NOT run 09 yet at the time of writing.
Tables used by the app: students, payments, payment_allocations, payment_installments, allowances, attendance (has `att_type` normal/extended, `approval_status`), scores, behaviour_records, prefect_reports, pta_meetings, pta_attendance, audit_log, app_config, profiles, archives, timetable, lesson_attendance, ext_decisions.

## 5. Edge functions
- `admin-users` (deployed): create/update/delete users through Supabase Auth; username becomes `<username>@asmap-oguaa.vercel.app`.
- `portal-data` (NEW, built, deploy with `supabase functions deploy portal-data --use-api`): public parent portal reads one child's data (lookup by BECE index, report by PIN, config), rate limited, replaces direct table reads. `portal.html` was rewritten to call it. Must be deployed and tested BEFORE 09_lockdown.sql, or the portal breaks.
- `send-sms` (the existing dashboard function was reported NOT working; its code is not in the repo). The owner chose ARKESEL as the SMS provider. A replacement `send-sms/index.ts` was written for the Arkesel v2 API (POST https://sms.arkesel.com/api/v2/sms/send, header `api-key`, body sender/message/recipients, numbers as 233XXXXXXXXX), signed-in staff only, accepting `{to,message}`, `{recipients,message}`, `{bulk:[...]}`. Secrets: `ARKESEL_API_KEY`, `ARKESEL_SENDER_ID` (approved sender name, max 11 chars), `ARKESEL_SANDBOX=true` while testing. The Arkesel request format was taken from third-party wrappers: verify against Arkesel's own docs. The app now sends the user's token (not the anon key) and shows the real error.
- `portal-payment` (existing, Paystack MoMo verify and PIN generation; code not in repo; unchanged).

## 6. What is DONE (code written, not browser-tested)
- Supabase Auth login (replaced plaintext passwords), forced password change, user admin via function.
- Year Rollover can archive and clear the year into `archives` (download Excel, delete by typing year); verify before real use.
- Timetable: `timetable.json` (2,169 lessons, 57 active classes, teachers, subjects, 9 periods) built from the aSc Excel; imported by admin in Lesson Log.
- Lesson Log (tab "Lesson Log"): class prefect (locked to the class set by admin) or admin-assigned staff records each day once with "Save day". Per lesson: Teacher present (time in/out; lateness computed from time in vs period start, grace 5 min; minutes used), Teacher absent (nobody came, or covered by someone with times), Lesson not held (Holiday/Examination/Other with text); activity (taught, assessment with type, attendance only, revision, other); students present and class size; rating 1 to 5 and remarks. Period 9 is extended teaching. Fixed slots (worship, co-curricular, PLC/VLC) are shown as information only.
- Reports: teacher table (scheduled vs recorded, present, late, absent, minutes late, assessments, attendance-only, average rating), class attendance, remarks list; Teacher of the Month (attendance 50, delivery 20, assessments 15, extended punctuality 15, min 8 lessons); "Extended check" compares class prefect period-9 records with coordinator/monitor records in Attendance and the admin accepts one (updates the attendance row that payroll uses); "Who can record" screen (prefect class, `lesson_log`, `lesson_reports`); "Sync teachers" copies timetable teachers into the app teacher list.
- Settings: "Add school periods 1 to 8" button; tabs renamed (Extended Teaching Report, Lesson Log, Analytics); 12 dead duplicate functions removed; tab clicks deferred for responsiveness.

## 7. What is NOT done (priority order)
1. Deploy and test: SQL 10, portal-data, send-sms secrets, then 09_lockdown (test each role).
2. PTA (BUILT, untested, needs `11_pta.sql`): PTA tab only for admin and people admin ticks (permission `pta_manage`; coordinators and the old pta roles no longer have access). Meetings can target chosen classes (empty = all parents) and carry an absence fine (GHS); "Apply absence fines" charges every invited parent marked absent (everyone must be marked first), stored in `student_charges`, added to the balance in `getStudentBalance`; admin can waive. NOT done: showing fines in the Ledger/owings screens, a payment purpose for paying fines, SMS to fined parents.
3. Fee setup redesign: one source of truth for fee types (extended teaching, teacher motivation, PTA project, anniversary levy), per form/class amounts, due dates, PTA approval reference, waivers, receipts, arrears carry-over at rollover, defaulter list. Currently amounts exist in two Settings places.
4. Retire the old "Extended Teaching Report" prefect tab once prefects use period 9 in Lesson Log.
5. Student attendance by names of absent students (needs elective/group assignment per student; timetable classes split into parallel groups).
6. Map timetable class codes to ASMaP class codes (e.g. `3ARTS1`); 171 lessons lack a teacher (admin sets them in the lesson row); placeholder teachers in aSc ("New Math", "Sam Tech", "Isaac Tech").
7. SMS triggers (absence, fee reminder, report ready), report-card linking with the separate Report Card Portal app, monthly report to staff, ratings in Teacher of the Month.
8. Server-side PIN view counting in the portal; first-run setup screen still stores a plaintext password (unused live); split `index.html`; replace emoji icons; schedule backups; test every legacy module end to end (payments, scores, report cards, conduct).

## 8. Open questions for the owner
Teacher of the Month weights and whether ratings count; whether HODs (monitors) may see payments for their classes; whether coordinators add allowances (09 makes allowances admin-only to write); which SMS messages should go automatically; whether the timetable's period 9 equals the paid Extended Teaching session; how the Report Card Portal should receive data.

## 9. Late findings (24 Oct, build 24Oct-c)
- A load-time bug existed in the ORIGINAL repo: `var _origOpenStudentDetail = openStudentDetail;` threw a ReferenceError (the function does not exist), which stopped ~43 later top-level statements from running. Effects: `MYSHSADM_MAP` (admission import) and `GRADE_POINTS` (GPA/report cards) were undefined; wrappers for renderScores, renderManage, renderDashboard, renderSettings never applied. Fixed by guarding with `typeof`. Re-test admission import, report cards, dashboard and settings extras because that code is now live for the first time.
- A simulated-browser harness (jsdom with a stubbed fetch, in /tmp during the session) exercised Lesson Log save, prefect lock and all 16 page renders. Recreate similar tests after changes: load index.html in jsdom with `runScripts:'dangerously'`, stub `fetch`, call functions with `window.eval`.
- Deployment order and checks are in DEPLOYMENT_GUIDE.md.
