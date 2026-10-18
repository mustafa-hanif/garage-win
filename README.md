# Garage Pro

Cloud workshop software for UAE garages. One Cloudflare Worker serves the API (`/api`) and the Vite + React app. Data lives in Turso.

## Features in this cut

1. **Service intake:** search by plate, mobile or name; add a customer with their cars; open a service on a car.
2. **Service and e-invoice:** record labour and parts (5% VAT), then issue a numbered tax invoice per branch. Issued invoices can't be edited, and the app downloads a PINT AE (UBL 2.1) XML file.

## Run it

```bash
npm install
cp .dev.vars.example .dev.vars        # set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN
npm run db:migrate                    # applies migrations/ and the pilot seed
npm run dev                           # app on http://localhost:5173
npm test                              # API and calculation tests
npm run typecheck
```

For a local database without Turso, set `TURSO_DATABASE_URL=file:local.db`.

## Deploy

```bash
npx wrangler secret put TURSO_AUTH_TOKEN
npm run deploy
```

## Notes

- No sign-in yet. The app runs as the pilot tenant (Excellence Services) and picks a branch from the top bar. Every table carries `tenant_id`, so sign-in can be added without a data migration.
- The pilot branch names, addresses and TRN in `migrations/seed.sql` are placeholders.
- The PINT AE file has not yet been checked against the official schematron. That check belongs with the Wafeq integration in Phase 2.
