
PH SmallBiz — All-in-One
========================

This is the consolidated, ready-to-run bundle:
- Precision PDFs (2551Q, 1701Q, 1701A) with editable coordinates
- Multi-tenant (organizations)
- Auth (signup/login)
- 2307 credits import (file + paste)
- Reports + Print buttons
- Automation scheduler (quarterly PDFs; annual helper)
- Docker & Compose
- Shared navbar with tenant dropdown

Quick start
-----------
```bash
npm install
npm run start   # or: node server.precision.plus.js
# open http://localhost:3000 (then sign up, go to forms)
```

Docker
------
```bash
docker compose up --build -d
# open http://localhost:3000
```

Env
---
- `JWT_SECRET` (required for production)
- Optional email for automation: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `MAIL_TO`

Where things are
----------------
- Server: `server.precision.plus.js`
- Auth: `auth.js`
- DB (SQLite): `./data/app.db` (auto-created) — tables: users, organizations, settings, transactions, credits
- PDF forms: `pdf_forms_bir_positions_full.js` + `bir_positions_full.json`
- Frontend: `public/` (login, dashboard, forms, import2307, orgs, nav.js)
- Automation: `automation.js`
- Docker: `Dockerfile`, `docker-compose.yml`

Notes
-----
- The income tax calculations are **simplified**; update brackets/logic as needed for production.
- Edit coordinates in `bir_positions_full.json` to align perfectly to boxes on printed official forms.
- You can add seed data into the DB by POSTing to `/api/tx` and `/api/credits` after login.
