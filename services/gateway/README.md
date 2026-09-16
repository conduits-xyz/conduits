# @conduits/gateway-service

A database-free run of `@conduits/gateway`, configured entirely from a
YAML file. See `@conduits/config` for the schema this file is parsed
against, and `packages/gateway`'s own README/types for what the
gateway itself does with the result.

This guide builds one `conduits.yaml` up incrementally, three conduits
in a row — Google Sheets, then Gmail, then Fastmail — each one a
complete, working, curl-verified step before you move to the next. If
you already know what you're doing, `conduits.example.yaml` has the
end state of all three; copying it is a shortcut through this same
tutorial.

## How credentials actually flow

This is the part that's easy to get backwards, so before touching
anything: **two independent secret mechanisms exist side by side**,
and `conduits.yaml` uses a different syntax for each.

| In `conduits.yaml` | The actual secret lives in | Created by |
|:--|:--|:--|
| `credential: env:SOME_NAME` (Fastmail), `bearerToken.value: env:SOME_NAME` | `.env`, as `SOME_NAME=...` | you, typing it in |
| `credential: google:<name>` (Sheets, Gmail) | `~/.conduits/credentials.json` (a separate file this CLI manages) | `conduits auth google`, a command you run once per name+purpose |

`.env` is read once, at process start (`--env-file-if-exists=.env` in
every script below), into `process.env`. From there:

- an `env:` reference is checked at *load time* (a missing variable
  fails startup immediately, naming it) and read again on every
  request that needs it;
- `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are the odd one out: the
  **running gateway never reads them at all.** They exist in `.env`
  purely so the one-time `conduits auth google` command has something
  to register a Google OAuth client with. Once that command has run,
  the resulting grant — including the client id/secret it used —
  is saved into `credentials.json`, and the gateway reads *that* file
  from then on, restart after restart, never `.env` again for anything
  Google-related.

So: **`.env` is the first thing you create, before anything else in
this directory** — even the one-time Google auth step below needs it.
`conduits.yaml` comes together piece by piece as you add each conduit.

```sh
cp .env.example .env
```

## Part 1: your first conduit — a Google Sheet

**1. Enable the API and create an OAuth client**, once, in a Google
Cloud Console project:

- **APIs & Services → Library** → enable the **Google Sheets API**. A
  project with this left disabled gets a clear `PERMISSION_DENIED`
  from Google on first real use, not a silent failure — easy to miss
  if you don't know to look for it.
- **APIs & Services → Credentials → Create Credentials → OAuth client
  ID**, type **Desktop app** (not "Web application" — a Desktop app
  client is what lets `http://127.0.0.1:<any port>` work as a redirect
  URI without registering an exact port in advance). Download it; note
  the client ID (and secret, if the download includes one — some
  Desktop client configurations don't).

**2. Put those two values in `.env`:**

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

**3. Authorize once:**

```sh
npm run auth:google -- --purpose sheets --name personal
```

Prints a URL — open it in a browser, approve access, and it redirects
back to this process automatically. This saves the grant (tokens + the
client id/secret above) to
`~/.conduits/credentials.json` and prints the exact line to use in
YAML: `credential: google:personal`.

> **Before you rely on this for anything real**: a Google Cloud OAuth
> project left in "Testing" publishing status issues refresh tokens
> that expire after **7 days**. Adding yourself as a Test user does
> **not** avoid this — only publishing the app does (Console → OAuth
> consent screen → Publish, "In production"). `drive.file` and
> `gmail.send` aren't in Google's sensitive/restricted scope tiers, so
> publishing an External app that only requests them is a self-service
> setting, not a submission-and-review process. Skip this and the
> gateway will work fine for a week, then start 502ing on Sheets/Gmail
> conduits with no apparent cause — do it now, not after that happens.

**4. Create a sheet the grant can actually use:**

```sh
npm run sheets:create -- --name personal --title "My Signups"
```

Creates a brand-new, blank spreadsheet and prints its
`spreadsheetId:`. Use *this* id, not one you already have — the grant
only requests `drive.file` (Google's narrowest Sheets scope), which
only ever grants access to a file the authorizing app itself created.
An existing sheet's id looks like it works right up until the first
real read or write, which 403s.

**5. Write your first `conduits.yaml`:**

```sh
cp conduits.example.yaml conduits.yaml
```

Then trim it down to just the `newsletter-signup` block for now —
delete `event-rsvp` and `contact-form`, you'll add each back in its
own part below — and fill in the id from step 4:

```yaml
conduits:
  newsletter-signup:
    methods: [POST, GET]
    source:
      type: googleSheets
      credential: google:personal
      spreadsheetId: <the id sheets:create just printed>
      # sheet: omitted on purpose — a brand-new spreadsheet's first
      # (and only) tab is the default when this is unset.
```

**6. Start the gateway and verify:**

```sh
npm run start
```

```sh
curl -i http://localhost:8787/api/newsletter-signup/readyz   # expect 204
curl -i -X POST http://localhost:8787/api/newsletter-signup \
  -H 'Content-Type: application/json' \
  -d '{"fields": {"email": "ada@example.com"}}'               # expect 201
```

Open the spreadsheet — the row should be there, with a `conduit-id`
column the gateway added automatically (needed for later
read/update/delete; never rename or delete it).

## Part 2: add a second conduit — Gmail

Gmail reuses the *same* Google Cloud project and the *same*
`GOOGLE_CLIENT_ID`/`SECRET` — no second OAuth client. It's a separate
grant, though: Sheets and Gmail access are never bundled into one
authorization, even for the same Google account.

**1. Enable the API**: **APIs & Services → Library** → **Gmail API**,
same project as Part 1.

**2. Authorize the `gmail` purpose** — same `--name` is fine, it's
stored as a separate grant under it:

```sh
npm run auth:google -- --purpose gmail --name personal
```

**3. Add a second block to the same `conduits.yaml`:**

```yaml
  event-rsvp:
    methods: [POST]
    source:
      type: gmail
      credential: google:personal
      recipients: [owner@example.com]
      subject: New RSVP
```

No `identityId` (unlike Fastmail below) — a Gmail send always goes out
as the connected account's own primary address, there's no "send as"
choice.

**4. Restart and verify** — editing `conduits.yaml` needs a restart to
take effect, there's no file watcher:

```sh
npm run start
curl -i http://localhost:8787/api/event-rsvp/readyz          # expect 204
curl -i -X POST http://localhost:8787/api/event-rsvp \
  -H 'Content-Type: application/json' \
  -d '{"fields": {"name": "Ada"}}'                            # expect 201, and a real email
```

Same 7-day-refresh-token caveat from Part 1 applies here too — one
published Cloud Console app covers both purposes once you publish it.

## Part 3: add a third conduit — Fastmail

No OAuth at all — a single, static API token.

**1. Get a Fastmail API token**: Fastmail Settings → Privacy & Security
→ Integrations → API tokens → New API token, scoped to **Mail** only
(`Email` + `Email submission` — never a broader grant).

**2. Find your JMAP identity id** — the "send as" address's id. There's
no lookup tool for this yet; find it via Fastmail's own JMAP
`Identity/get` call.

**3. Add both new values to `.env`** — the name on the left is yours to
choose, it just has to match what you write in `conduits.yaml` next:

```
FASTMAIL_TOKEN=...
CONTACT_FORM_TOKEN=...    # a bearer token YOU pick, e.g. `openssl rand -hex 16`
```

**4. Add the third block:**

```yaml
  contact-form:
    methods: [POST, GET]
    bearerToken:
      value: env:CONTACT_FORM_TOKEN
      requiredFor: [GET]        # POST (submitting) stays public; GET (reading back) is gated
    hiddenFields:
      - name: website            # a real submitter never fills this in
        policy: honeypot
    source:
      type: fastmail
      identityId: <from step 2>
      credential: env:FASTMAIL_TOKEN
      recipients: [owner@example.com]
      subject: New contact form submission
```

**5. Restart and verify:**

```sh
npm run start
curl -i http://localhost:8787/api/contact-form/readyz                        # expect 204
curl -i -X POST http://localhost:8787/api/contact-form \
  -H 'Content-Type: application/json' \
  -d '{"fields": {"name": "Ada", "email": "ada@example.com"}}'                # expect 201, and a real email
curl -i http://localhost:8787/api/contact-form \
  -H "Authorization: Bearer $CONTACT_FORM_TOKEN"                              # expect 200, without the header expect 401
```

You now have exactly `conduits.example.yaml`, hand-built one working
conduit at a time.

## The credential store

`~/.conduits/credentials.json` (override with
`CONDUITS_CREDENTIAL_STORE_PATH`) is a **plain JSON file, not
encrypted** — protected by filesystem permissions (written `0600`, its
parent directory `0700`), the same trust model most local CLI
credential stores use. Treat it like an SSH private key: don't commit
it, don't copy it somewhere with looser permissions.

## Source types (reference)

- **`fastmail`** — `credential: env:VAR_NAME`, `identityId`,
  `recipients`, `subject`, optional `mailbox`.
- **`googleSheets`** — `credential: google:<name>`, `spreadsheetId`
  (from `conduits sheets create` only), optional `sheet` (tab name)
  and `fieldMap`.
- **`gmail`** — `credential: google:<name>`, `recipients`, `subject`.

`conduits auth google` and `conduits sheets create` are the only CLI
surfaces here — there's no general conduit-editing command; conduits
are still authored directly in `conduits.yaml`.

## What's deliberately not here yet

No config-reload watcher, no general-purpose conduit-editing CLI
commands, no metrics persistence (hit/honeypot counts are logged to
stdout, not stored anywhere — there's no database to store them in). A
future CLI improvement: accepting Google's downloaded Desktop-client
JSON directly instead of two env vars, and looking up a Fastmail
identity id instead of requiring you to find it yourself. These are
later milestones, not oversights.
