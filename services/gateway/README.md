# @conduits/gateway-service

A database-free run of `@conduits/gateway`, configured
entirely from a YAML file. See
`@conduits/config` for the schema this file is parsed against, and
`packages/gateway`'s own README/types for what the gateway itself does
with the result.

Fastmail, Google Sheets, and Gmail all work out of the box. Google's own
credentials never live in `conduits.yaml` — they're authorized once via
this app's own CLI and kept in a local credential store instead (see
"Authorizing Google" below).

## ⚠️ Before you rely on Google Sheets/Gmail for anything real

**A Google Cloud OAuth project left in "Testing" publishing status
issues refresh tokens that expire after 7 days**, for these scopes.
That means: if you don't move your project to "In production" (Google
Cloud Console → OAuth consent screen), your Sheets/Gmail conduits will
silently stop working about a week after you run `conduits auth
google` — not because anything here is broken, but because Google
itself revoked the refresh token. Do this before depending on this
gateway for anything beyond trying it out:

1. Google Cloud Console → APIs & Services → OAuth consent screen.
2. Publish the app ("In production"). Adding yourself as a Test user is
   **not** enough to avoid the 7-day expiry — only publishing changes
   it.
3. `drive.file` and `gmail.send` are not in Google's "sensitive" or
   "restricted" scope tiers, so publishing an External app that only
   requests them does not require Google's own app-review process —
   it's a self-service console setting, not a submission-and-wait step.

This isn't optional housekeeping — skip it and you will see
the gateway work fine for a week and then start 502ing with no
apparent cause. `getCredential()`'s own log line when this happens
names the conduit and tells you to re-run `conduits auth google` — that
message is this exact failure mode, not a bug.

## Running it

1. Copy `conduits.example.yaml` to `conduits.yaml` and fill in your own
   source details (see below for each `source.type`).
2. Set every environment variable your config's `env:` references
   point at (e.g. `FASTMAIL_TOKEN`) — a missing one fails startup
   immediately, with the variable named. Google credentials are
   different — see "Authorizing Google" below, not an env var.
3. `npm run gateway` (reads `CONDUITS_CONFIG_PATH`, default
   `./conduits.yaml`, and `PORT`, default `8787`).

Editing `conduits.yaml` requires a restart to take effect — there's no
file watcher or hot reload yet.

## Authorizing Google

Google Sheets and Gmail conduits reference a **local credential**, not
an env var:

```yaml
source:
  type: googleSheets
  credential: google:personal
  spreadsheetId: 1AbC...  # from `conduits sheets create` below, not any sheet's URL
```

Before that reference resolves to anything, authorize it once:

1. In Google Cloud Console, under **APIs & Services → Library**, enable
   the **Google Sheets API** (for a `googleSheets` conduit) and/or the
   **Gmail API** (for a `gmail` conduit) — a separate, one-time step
   from creating the OAuth client below; a project with the API left
   disabled gets a clear `PERMISSION_DENIED` from Google on first use,
   not a silent failure, but it's easy to miss if you don't know to
   look for it.
2. In the same project, create an OAuth client of type **Desktop
   app** (not "Web application" — a Desktop app client is what lets
   `http://127.0.0.1:<any port>` work as a redirect URI without
   registering an exact port in advance). Download its client ID (and
   secret, if the downloaded JSON includes one — some Desktop client
   configurations don't).
3. Set `GOOGLE_CLIENT_ID` (and `GOOGLE_CLIENT_SECRET`, if you have one)
   in your environment — needed only for this one-time step, never
   again afterward.
4. Run:
   ```sh
   npm run auth:google -- --purpose sheets --name personal
   ```
   (`--purpose gmail` for a Gmail conduit — Sheets and Gmail are always
   separate grants, even for the same Google account, so a Gmail
   conduit needs its own `conduits auth google --purpose gmail ...`
   run even if you already authorized `sheets` under the same `--name`.)
5. Open the printed URL, approve access, return to the terminal. The
   grant — including the client id/secret it used, so a running gateway
   never needs `GOOGLE_CLIENT_ID`/`SECRET` set again — is saved to your
   local credential store (`~/.conduits/credentials.json` by default;
   override with `CONDUITS_CREDENTIAL_STORE_PATH`). The command prints
   the exact `credential: google:<name>` line to put in `conduits.yaml`.
6. **For a `googleSheets` conduit only**, run:
   ```sh
   npm run sheets:create -- --name personal --title "My Signups"
   ```
   This creates a brand-new, blank spreadsheet and prints the
   `spreadsheetId:` line for `conduits.yaml` — **don't paste in the id
   of a sheet you already have.** The grant above only requests Google's
   `drive.file` scope (deliberately the narrowest OAuth scope Sheets
   access comes in), which only ever grants access to a file the
   authorizing app itself created; there's no picker UI here to grant
   it access to an existing one instead (see `sheets-create.ts`'s own
   comment on why this command exists at all). An existing sheet's id
   will look like it worked right up until the first real read or
   write, which 403s. `--title` is optional — defaults to
   `Conduits — <name>`.

The credential store is a **plain JSON file, not encrypted** —
protected by filesystem permissions (the file is written `0600`, its
parent directory `0700`), the same trust model most local CLI
credential stores use. Treat it like an SSH private key: don't commit
it, don't copy it somewhere with looser permissions.

`conduits auth google` and `conduits sheets create` are the only CLI
surfaces here — there's no general conduit-editing command; conduits
are still authored directly in `conduits.yaml`.

## Source types

- **`fastmail`** — `credential: env:VAR_NAME`, `identityId` (the
  Fastmail JMAP "send as" identity — no lookup tool for this yet),
  `recipients`, `subject`, optional `mailbox`.
- **`googleSheets`** — `credential: google:<name>`, `spreadsheetId`
  (from `conduits sheets create` — see "Authorizing Google" above for
  why an existing sheet's id won't work), optional `sheet`
  (tab name) and `fieldMap`.
- **`gmail`** — `credential: google:<name>`, `recipients`, `subject`.
  No identity picker — Gmail always sends as the authorized account's
  own primary address.

## What's deliberately not here yet

No config-reload watcher, no
general-purpose conduit-editing CLI commands, no metrics persistence
(hit/honeypot counts are logged to stdout, not stored anywhere — there's
no database to store them in). A future CLI improvement: accepting
Google's downloaded Desktop-client JSON directly instead of two env
vars, and looking up a Fastmail identity id instead of requiring you to
find it yourself. These are later milestones, not oversights.
