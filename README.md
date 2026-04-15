# SplitMint Monorepo

SplitMint v1 is implemented as a monorepo with:
- `client`: Vite + React + Tailwind + TypeScript SPA
- `server`: Express + Prisma + PostgreSQL + TypeScript API
- `shared`: shared API contracts and Zod validation schemas

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables:
- Copy `.env.example` into `.env` at repo root, or use `server/.env.example` and `client/.env.example` values.

3. Generate Prisma client and apply migration:

```bash
npm run prisma:generate -w server
npm run prisma:migrate -w server -- --name init
```

4. Seed demo data:

```bash
npm run prisma:seed -w server
```

5. Run backend and frontend in separate terminals:

```bash
npm run dev -w server
npm run dev -w client
```

## Demo Credentials

- Email: `demo@splitmint.app`
- Password: `password123`

## API Surface

- Auth: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- Groups: `GET /api/groups`, `POST /api/groups`, `GET /api/groups/:id`, `PUT /api/groups/:id`, `DELETE /api/groups/:id`
- Participants: `GET/POST/PUT/DELETE /api/groups/:id/participants`
- Expenses: `GET/POST/PUT/DELETE /api/groups/:id/expenses`
- Balances: `GET /api/groups/:id/balances`
- Settlements: `GET /api/groups/:id/settlements`
- MintSense: `POST /api/ai/parse-expense`

## Notes

- All monetary values use integer minor units (`amountMinor`).
- Equal and percentage rounding remainders are assigned to the payer share.
- Group access is owner-only in v1.
- MintSense requires `OPENAI_API_KEY`; otherwise frontend/API shows graceful fallback.
