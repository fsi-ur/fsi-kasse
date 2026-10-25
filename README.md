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
npm run setup:migrate:client-uuid    # client_uuid on orders/donations/fachschaft_payments (offline idempotency)
npm run setup:migrate:guests         # affiliations, guest_users, guest_sessions + cashiers.is_guest/affiliation_id
npm run setup:migrate:vouchers       # item_groups, voucher_batches, vouchers + order line kinds (line_kind/voucher_id)
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

In connected mode, run `npm run setup:connection-db-user` in the buchhaltung
and point `ACCOUNTING_DB_USER` / `ACCOUNTING_DB_PASSWORD` here at the
restricted user it creates in the accounting database.

### Integration API (Buchhaltung cash register tab)

The buchhaltung's per-event cash register tab does not read this database. It
calls `GET /api/integration/v1/events/<accounting event id>/overview` from its
server (`?locale=de|en`, optional `standId`), authenticated with
`Authorization: Bearer <INTEGRATION_API_KEY>`. Set the same random value (at
least 32 characters, e.g. `openssl rand -hex 32`) as `INTEGRATION_API_KEY` here
and as `CASH_REGISTER_API_KEY` in the buchhaltung. Without the key the API
answers `Integration API disabled`.

The response describes the overview as generic, already translated building
blocks (stat tiles, tables, lists, an hourly chart — see
[server/utils/integration/viewContract.ts](server/utils/integration/viewContract.ts)),
built in [server/utils/integration/eventOverviewView.ts](server/utils/integration/eventOverviewView.ts)
from the same figures as the till's own Overview. Changing what the
buchhaltung shows therefore only needs a till release. A typed `totals` block
carries the figures the buchhaltung may calculate with.

Installs that used the old direct database access can drop the read-only user
(`DROP USER 'fsi_kasse_connect'@'%'`); nothing uses it anymore.

### Permissions

Access is controlled through the permission keys `cash_register.use`
(use checkout, history, Fachschaft payments), `cash_register.guest_manage`
(guest accounts and guest cashiers) and `cash_register.manage` (items,
cashiers, events, users, affiliations, overview, settings). `manage` implies
`guest_manage`, which implies `use`.

### Guest accounts and Zugehörigkeiten

Guests are owned by the till in **both** modes and live in the local database,
never in the accounting app:

- **Gastkonten** (`guest_users`, `guest_sessions`) — login accounts with level
  `use` (sell like a regular user) or `manage` (additionally manage guests).
  A password change at next login can be required when creating a guest or
  setting its password; guests can complete it in connected mode too.
- **Gastkassierer** — rows in `cashiers` with `is_guest = 1` and no accounting
  member. They sell and can be Fachschaft members like any cashier, but the
  accounting sync never touches them. Cashiers with bookings can only be
  deactivated, not deleted.
- **Zugehörigkeiten** (`affiliations`) — only used to sort guests. Managed by
  regular admins (Settings → Zugehörigkeiten); they can be deactivated but
  not deleted. A guest manager *with* an affiliation can only see and manage
  guests of that affiliation; one without, and every regular admin, manages all.

Usernames are unique across regular users and guests; on login regular users
are checked first.

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

### Database snapshots

Settings → Kasse offers an encrypted snapshot of the whole cash register
database (everything in `DB_NAME`, never the accounting database), separate
from the plain CSV export above. It requires `cash_register.manage`.

- **Create**: choose a password (≥ 12 characters) and download
  `kassensystem-db-<date>.json.enc`. The password is never stored — without it
  the snapshot cannot be decrypted again, so keep it somewhere safe.
- **Restore**: upload the `.enc` file and its password. The server previews
  the contents (table/row counts, integrity checksum, the accounting mode it
  was created in) before anything is written; restoring requires the schema
  to match and typing `RESTORE` to confirm. It replaces every table in
  `DB_NAME`, including `users`/`roles`/`user_roles`/`role_permissions`/
  `user_permissions` in **standalone** mode — an old snapshot can therefore
  reinstate old passwords or lock out accounts created since. In **connected**
  mode those auth tables are unused leftovers and the live accounts (in the
  accounting database) are left untouched. Session tokens are never included
  in a snapshot; restoring in standalone mode logs everyone out.

### Card payments (SumUp)

The till takes card payments on SumUp Solo terminals through SumUp's Cloud
API. The server pushes the amount to the stand's terminal and books the order
itself once SumUp reports the payment as successful.

Setup:

1. Set `SUMUP_API_KEY`, `SUMUP_MERCHANT_CODE`, `SUMUP_AFFILIATE_APP_ID`,
   `SUMUP_AFFILIATE_KEY` and `SUMUP_WEBHOOK_BASE_URL` in `.env` (the webhook
   URL must be the public HTTPS origin incl. `APP_BASE_URL`). Without them
   every card UI is hidden.
2. Settings → Terminals: pair each Solo (on the device: log out, *Connections →
   API → Connect*, enter the code shown).
3. Settings → Kasse: switch card payments on, optionally set the three tip
   rates (SumUp shows exactly three) and the estimated fee rate. Orders that
   already contain a donation skip the tip screen unless that is opted in.
4. Settings → Stände: enable card payments per stand and pick its terminal.
   Guest managers can pair a Solo for one of their own stands (it is assigned
   right away and joins the shared pool), pick any terminal for their stands
   and remove the terminals their association paired, but never switch card
   payments on. Settings → Veranstaltungen can block card per event.

Card is online only; cash keeps the offline queue. Payouts are always cash. A
payment that SumUp charged but the till could not book (e.g. a voucher was
redeemed elsewhere in the meantime) ends up as *Buchung fehlgeschlagen* under
Änderungsanträge → Kartenzahlungen, where an admin re-checks, re-books or
closes it with a note. Change requests on card orders are never refunded
automatically; approving one with a price difference requires a note.

All card money goes to the SumUp account configured in `.env`. The Overview shows a settlement
per stand (card sales + donations/tips − SumUp fees), with card-paid
Fachschaft payments in a row of their own; fees SumUp has
not reported yet are estimated with the configured rate and marked
provisional until "Gebühren aktualisieren" fetches them.

Development: `SUMUP_MODE=mock` simulates a terminal (pairing code `MOCK0001`;
the amount's last two cent digits pick the outcome: `13` fails, `37` stays
pending, `50` adds a 10 % tip, `77` is never tapped and fails once the
60 s terminal window is over, `99` charges a wrong amount). The mock never
calls the webhook — polling books; `POST /api/sumup/mock-webhook` triggers
the webhook path by hand.

## Environment variables

See [.env.example](.env.example) for the full list:

- `DB_*` — local cash register database
- `ACCOUNTING_MODE`, `ACCOUNTING_DB_*` — connected mode database
- `ACCOUNTING_SESSION_COOKIE_NAME`, `ACCOUNTING_APP_ORIGINS` — connected mode
  access from the Buchhaltung
- `INTEGRATION_API_KEY` — shared secret for the Buchhaltung's integration API
- `SESSION_*` — session cookie and lifetime
- `ADMIN_USERNAME`, `ADMIN_PASSWORD` — admin bootstrap (`scripts/seed-admin.mjs`)
- `HOST`, `PORT`, `APP_BASE_URL` — Nuxt runtime
- `SUMUP_*` — card terminals (see *Card payments* above)
