# Kassensystem

Nuxt-based cash register (PWA) for the Fachschaft. It shares its design system
(Tailwind component classes, SearchSelect/Dropdown components, German/English
translations) with the FSi Buchhaltung application.

## Database

The schema is created from [db/init.sql](db/init.sql) (used by docker-compose on
first start). For existing installations, the schema migrations are exposed as
npm scripts (they read the environment from `.env`):

```bash
npm run setup:migrate:events         # events table + event_id on orders/fachschaft_payments
npm run setup:migrate:app-settings   # app_settings table
npm run setup:migrate:add-donations  # donations table
npm run setup:migrate:price-snapshots # price/amount snapshots + item_price_history + app_settings_history
npm run setup:seed-admin             # admin bootstrap + auth role migration
```

All of these are idempotent and run automatically inside docker compose before
the app is built and started.

`setup:migrate:price-snapshots` backfills the snapshot columns from the *current*
item prices and the *currently configured* Fachschaft payment amount — the real
historical values are not recoverable from the old schema. Run it **before** the
first price change so the approximation is exact.

### Preise ändern

Item prices, deposits and names as well as the Fachschaft payment amount are
editable at any time, and changes are **not** retroactive: every order line and
every Fachschaft payment stores the value that was current when it was written
(`order_items.unit_price` / `unit_deposit` / `item_name`,
`fachschaft_payments.amount`). Past events therefore keep their reported revenue,
and `items` / `app_settings` are only ever used to value *new* writes.
`item_price_history` records who changed a price and when; it is an audit trail,
never a source for money.

An item that has been used in at least one order can no longer be deleted —
deactivate it instead so it disappears from the checkout but stays in the
statistics. Items that were never ordered can still be deleted as before.

One-time, interactive migrations for switching an existing standalone
installation to connected mode (these prompt for confirmation and are therefore
**not** part of the docker compose startup):

```bash
npm run setup:migrate:users-to-accounting
npm run setup:migrate:cashiers-to-accounting
npm run setup:migrate:events-to-accounting
```

## Modes

The app runs in one of two modes, controlled by `ACCOUNTING_MODE`:

- `standalone` — users, cashiers and events are managed locally in the
  `fsi_kasse` database.
- `connected` — users/sessions/permissions, members (cashiers) and events come
  from the FSi Buchhaltung database (`ACCOUNTING_DB_*` variables). Cashiers and
  events are read-only proxies of accounting members/events.

### Connection database users

Each application creates the restricted user for the *other* application in
its own database:

```bash
npm run setup:connection-db-user
```

reads `CONNECTION_DB_USER` / `CONNECTION_DB_PASSWORD` from `.env` and creates a
read-only user in this cash register database (`SELECT` on `events`, `items`,
`orders`, `order_items`, `fachschaft_payments`, `app_settings`). The
buchhaltung uses these credentials as `CASH_REGISTER_DB_USER` /
`CASH_REGISTER_DB_PASSWORD` for its per-event cash register tab.

In the other direction, run the same npm script in the buchhaltung and point
`ACCOUNTING_DB_USER` / `ACCOUNTING_DB_PASSWORD` here at the user it creates.

The script is idempotent (it re-syncs password and grants) and runs
automatically inside docker compose; it skips itself when the env variables
are not set.

### Permissions

Access is controlled through the permission keys `cash_register.use`
(use checkout, history, Fachschaft payments) and `cash_register.manage`
(items, cashiers, events, users, overview, settings). `manage` implies `use`.

### Cash register settings

App-wide settings (e.g. the Fachschaft payment amount) are stored in the local
`app_settings` table and exposed via:

- `GET /api/settings` — requires `cash_register.use`
- `POST /api/settings/save` — requires `cash_register.manage`

In connected mode, sessions are stored in the shared accounting database, so a
user logged into the Buchhaltung with `cash_register.manage` can call these
endpoints directly (cookie auth). To support that:

- `ACCOUNTING_SESSION_COOKIE_NAME` — the Buchhaltung session cookie is accepted
  as a fallback to the local one.
- `ACCOUNTING_APP_ORIGINS` — comma separated origins allowed to call the API
  cross-origin (only needed when the apps do not share a domain).

## Environment variables

See [.env.example](.env.example) for the full list:

- `DB_*` — local cash register database
- `ACCOUNTING_MODE`, `ACCOUNTING_DB_*` — connected mode database
- `ACCOUNTING_SESSION_COOKIE_NAME`, `ACCOUNTING_APP_ORIGINS` — connected mode
  access from the Buchhaltung
- `SESSION_*` — session cookie and lifetime
- `ADMIN_USERNAME`, `ADMIN_PASSWORD` — admin bootstrap (`scripts/seed-admin.mjs`)
- `HOST`, `PORT`, `APP_BASE_URL` — Nuxt runtime
