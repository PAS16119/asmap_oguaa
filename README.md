# ASMaP — Adombra School Management & Payment Platform
### Oguaa Senior High Technical School, Cape Coast, Ghana

[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=flat&logo=vercel)](https://oguaa-asmap.vercel.app)

---

## What is ASMaP?

ASMaP is a complete school management and payment platform built for Ghanaian Senior High Schools. It handles:

- 🎓 **Student registration & admission** (including myshsadmissions.net import)
- 💰 **Fee payments & approvals** with Mobile Money (MTN, Vodafone, AirtelTigo via Paystack)
- ✅ **Teacher attendance & monitoring** (6-source cross-reference system)
- 📝 **Academic scores & report cards** (Ghana GES grading + GPA/CGPA/WASSCE aggregate)
- 📱 **SMS notifications** to parents via Africa's Talking
- 👥 **PTA management** with parent attendance tracking
- ⭐ **Student conduct records** per house and form
- 🌐 **Parent portal** — pay MoMo, get PIN, view child's full report
- 📲 **PWA** — installs as an app on Android

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Plain HTML + CSS + JavaScript (single file) |
| Database | Supabase (PostgreSQL) |
| Hosting | Vercel (static) |
| SMS | Africa's Talking |
| Payments | Paystack |
| Edge Functions | Supabase Edge Functions (Deno) |

No Node.js. No React. No build step. Pure static deployment.

---

## File Structure

```
oguaa-asmap/
├── index.html          ← Main ASMaP application (admin + staff)
├── portal.html         ← Parent portal (public, no login)
├── manifest.json       ← PWA manifest (Android install)
├── sw.js               ← Service worker (offline support)
├── vercel.json         ← Vercel routing config
└── README.md           ← This file
```

---

## Deployment

This repo auto-deploys to Vercel on every push to `main`.

**Live URL:** https://oguaa-asmap.vercel.app  
**Parent Portal:** https://oguaa-asmap.vercel.app/portal  
**Future domain:** https://asmap.oguaashts.edu.gh

---

## Supabase Edge Functions

Two Edge Functions are deployed separately in the Supabase dashboard:

| Function | Purpose |
|---|---|
| `send-sms` | Africa's Talking SMS delivery |
| `portal-payment` | Paystack MoMo verification + PIN generation |

---

## For Other Schools

ASMaP is designed to be multi-school. Each school gets:
- Their own Supabase project (separate database, no data mixing)
- The same HTML files (configure school name, houses, programmes on first run)
- Their own Vercel deployment

Contact: adombra.tech@gmail.com

---

## Developer

Built by **A.T.O. (Pastor Ato Samphil)**  
Chaplain, Mathematics & Economics Teacher, Administrator  
Oguaa Senior High Technical School, Cape Coast, Ghana  
Brand: **Adombra**

---

*Last updated: 2025 · ASMaP v5*
