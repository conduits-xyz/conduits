# @conduits/gateway-service

This service runs `@conduits/gateway` from one YAML file,
`conduits.yaml`. It needs no database.

This tutorial builds `conduits.yaml` in three parts. Each part adds one
conduit and tests it:

1. A Google Sheet.
2. Gmail.
3. Fastmail.

`conduits.example.yaml` contains the result of all three parts.

## Secrets: two different places

`conduits.yaml` refers to secrets in two ways. Do not mix them.

| In `conduits.yaml` | The secret is in | You create it with |
|:--|:--|:--|
| `credential: env:NAME` (Fastmail), `bearerToken.value: env:NAME` | `.env`, as `NAME=...` | A text editor |
| `credential: google:<name>` (Google Sheets, Gmail) | `~/.conduits/credentials.json` | `npm run auth:google` |

The gateway reads `.env` once, when it starts.

- The gateway checks each `env:` reference at startup. A missing
  variable stops the startup, and the error gives its name.
- Only `npm run auth:google` uses `GOOGLE_CLIENT_ID` and
  `GOOGLE_CLIENT_SECRET`. That command saves them in
  `credentials.json` with the grant. The running gateway reads Google
  credentials only from `credentials.json`.

Create `.env` first. The Google step needs it:

```sh
cp .env.example .env
```

`.env.example` also contains the required settings, with values. See
[Settings](#settings).

## Part 1: a Google Sheet

### Set up Google Cloud

Do these steps one time, in one Google Cloud project:

1. Go to **APIs & Services → Library**.
2. Enable the **Google Sheets API**.
3. Go to **APIs & Services → Credentials → Create Credentials → OAuth
   client ID**.
4. Select the type **Desktop app**. Do not select "Web application".
5. Copy the client ID, and the client secret if there is one.

A Desktop app client accepts `http://127.0.0.1` on any port as the
redirect URI. If you do not enable the Sheets API, Google returns
`PERMISSION_DENIED` on the first read or write.

> **WARNING:** A Google Cloud project in "Testing" status gives refresh
> tokens that expire after 7 days. Then each Google Sheets and Gmail
> conduit returns `502`. To prevent this, publish the app: **OAuth
> consent screen → Publish app**. Adding yourself as a test user does
> not prevent it. Google does not review an app that requests only
> `drive.file` and `gmail.send`.

### Authorize

1. Put the two values in `.env`:

   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```

2. Run:

   ```sh
   npm run auth:google -- --purpose sheets --name personal
   ```

3. Open the URL that the command shows. Approve the access.

The command saves the grant in `~/.conduits/credentials.json`. It shows
the line for your YAML: `credential: google:personal`.

### Create the sheet

> **CAUTION:** Use only a sheet that this command creates. The grant
> has the `drive.file` scope. This scope gives access only to files
> that the app created. A sheet that you already have returns `403` on
> the first read or write.

Run:

```sh
npm run sheets:create -- --name personal --title "My Signups"
```

The command creates an empty spreadsheet and shows its
`spreadsheetId`.

### Write the conduit

1. Copy the example:

   ```sh
   cp conduits.example.yaml conduits.yaml
   ```

2. Delete the `event-rsvp` and `contact-form` blocks. You add them
   again in parts 2 and 3.
3. Put the `spreadsheetId` in the `newsletter-signup` block:

   ```yaml
   conduits:
     newsletter-signup:
       curi: newsletter-signup
       methods: [POST, GET]
       source:
         type: googleSheets
         credential: google:personal
         spreadsheetId: <the id from sheets:create>
         # No `sheet:`. The first tab is the default.
   ```

The map key (`newsletter-signup:`) is a label in this file only. The
`curi:` value is the name in the URL. They can be different.

### Test

1. Start the gateway:

   ```sh
   npm run gateway
   ```

2. Send the two requests:

   ```sh
   curl -i http://localhost:8787/newsletter-signup/.conduits/readyz   # 204
   curl -i -X POST http://localhost:8787/newsletter-signup \
     -H 'Content-Type: application/json' \
     -d '{"fields": {"email": "ada@example.com"}}'                    # 201
   ```

3. Open the spreadsheet. Make sure that the row is there.

The gateway adds a `conduit-id` column. It uses this column to find
each row.

> **CAUTION:** Do not delete or rename the `conduit-id` column.

## Part 2: Gmail

Gmail uses the same Google Cloud project and the same OAuth client. It
needs its own grant.

1. In the same project, go to **APIs & Services → Library**. Enable the
   **Gmail API**.
2. Authorize the `gmail` purpose. You can use the same `--name`:

   ```sh
   npm run auth:google -- --purpose gmail --name personal
   ```

3. Add this block to `conduits.yaml`:

   ```yaml
     event-rsvp:
       curi: event-rsvp
       methods: [POST]
       source:
         type: gmail
         credential: google:personal
         recipients: [owner@example.com]
         subject: New RSVP
   ```

4. Stop and start the gateway. The gateway reads `conduits.yaml` only
   when it starts.
5. Test:

   ```sh
   curl -i http://localhost:8787/event-rsvp/.conduits/readyz   # 204
   curl -i -X POST http://localhost:8787/event-rsvp \
     -H 'Content-Type: application/json' \
     -d '{"fields": {"name": "Ada"}}'                           # 201, and an email
   ```

Gmail sends from the primary address of the connected account. The
7-day warning in part 1 also applies to Gmail.

## Part 3: Fastmail

Fastmail uses an API token, not OAuth.

1. In Fastmail, go to **Settings → Privacy & Security → Integrations →
   API tokens → New API token**.
2. Give the token the **Mail** scope only (`Email` and
   `Email submission`).
3. Find your JMAP identity id (the "send as" address). Use Fastmail's
   JMAP `Identity/get` call. This repository has no tool for it.
4. Add two values to `.env`. You choose the names:

   ```
   FASTMAIL_TOKEN=...
   CONTACT_FORM_TOKEN=...    # a bearer token that you make, for example `openssl rand -hex 16`
   ```

5. Add this block to `conduits.yaml`:

   ```yaml
     contact-form:
       curi: contact-form
       methods: [POST, GET]
       bearerToken:
         value: env:CONTACT_FORM_TOKEN
         requiredFor: [GET]       # POST stays public. GET requires the token.
       hiddenFields:
         - name: website          # people leave this empty; bots fill it
           policy: honeypot
       source:
         type: fastmail
         identityId: <from step 3>
         credential: env:FASTMAIL_TOKEN
         recipients: [owner@example.com]
         subject: New contact form submission
   ```

6. Stop and start the gateway.
7. Test:

   ```sh
   curl -i http://localhost:8787/contact-form/.conduits/readyz                  # 204
   curl -i -X POST http://localhost:8787/contact-form \
     -H 'Content-Type: application/json' \
     -d '{"fields": {"name": "Ada", "email": "ada@example.com"}}'                # 201, and an email
   curl -i http://localhost:8787/contact-form \
     -H "Authorization: Bearer $CONTACT_FORM_TOKEN"                              # 200; without the header, 401
   ```

Your `conduits.yaml` now equals `conduits.example.yaml`.

## `conduits.yaml` reference

Each conduit is one entry under `conduits:`.

| Key | Required | Meaning |
|:--|:--|:--|
| `curi` | Yes | The conduit's permanent name. The default route is `/<curi>`. |
| `methods` | Yes | The allowed HTTP methods (RACM), for example `[POST, GET]`. |
| `throttle` | No | `true` (default) or `false`. 5 requests each second for each conduit. |
| `allowlist` | No | A list of IPs: `- 203.0.113.7`, or `- {ip: 203.0.113.7, comment: office}`. |
| `bearerToken.value` | No | `env:NAME`. The token is in `.env`. |
| `bearerToken.requiredFor` | With `bearerToken` | The methods that require the token. Each must be in `methods`. |
| `hiddenFields` | No | A list of rules. See below. |
| `routes` | No | A list of `{path, host}`. `host` is optional. See [Routes](#routes). |
| `source` | Yes | See [Sources](#sources). |

### Hidden fields

| YAML | Meaning |
|:--|:--|
| `{name: website, policy: honeypot}` | Drop the submission when the field has a value. The field is never stored. |
| `{name: code, policy: mustEqual, value: spring}` | Drop the submission unless the field equals `value`. The field is not stored. |
| `{name: code, policy: mustEqual, value: spring, forward: true}` | The same, but the field is stored. |

A dropped submission gets the same `201` as a stored one. In
[`docs/gateway-api.md`](../../docs/gateway-api.md#hidden-form-fields),
`honeypot` is `drop-if-filled`, `mustEqual` is `pass-if-match`, and
`forward` is `include`.

### Sources

| `type` | Keys |
|:--|:--|
| `googleSheets` | `credential: google:<name>`, `spreadsheetId` (from `npm run sheets:create` only), optional `sheet` (tab name), optional `fieldMap` |
| `gmail` | `credential: google:<name>`, `recipients`, `subject` |
| `fastmail` | `credential: env:NAME`, `identityId`, `recipients`, `subject`, optional `mailbox` |

## Routes

The default route of a conduit is `/<curi>`, with no `/api` prefix. To
use a different path or a specific host, add `routes:`:

```yaml
  contact-form:
    curi: contact-form
    routes:
      - path: /forms/contact
      - path: /contact
        host: forms.example.com
```

Without `routes:`, the route is `/<curi>`.

- `.conduits` is a reserved path segment. A route cannot contain it.
- Each route has `<route>/.conduits/readyz` and
  `<route>/.conduits/schema`.
- The gateway also has its own `/.conduits/readyz`.

For all routes, see
[`docs/gateway-api.md`](../../docs/gateway-api.md#routes).

## Settings

`.env` contains these required settings. `.env.example` gives values
for them. The gateway does not start without them.

| Variable | Meaning |
|:--|:--|
| `CONDUITS_LIST_DEFAULT_LIMIT` | The page size of a list read (`GET <route>`) without `limit`. |
| `CONDUITS_LIST_MAX_LIMIT` | The largest `limit` that a list read accepts. It must not be less than the default. |
| `CONDUITS_SHEETS_READ_CACHE_MS` | How long reads can use a copy of a sheet tab, in milliseconds. A write through the gateway clears the copy. |
| `CONDUITS_SHEETS_REQUESTS_PER_MINUTE` | The number of requests each minute to Google Sheets from this gateway. Reads and writes have separate counts. Above it, callers get `503` `source_busy` with `Retry-After`. |
| `CONDUITS_SHEETS_REQUESTS_PER_MINUTE_PER_ACCOUNT` | The same, for each Google account. |

Keep the two Google Sheets values below Google's quotas. By default,
Google allows 300 requests each minute for each project, and 60 for
each user.

These settings are optional:

| Variable | Default |
|:--|:--|
| `PORT` | `8787` |
| `CONDUITS_CONFIG_PATH` | `./conduits.yaml` |
| `CONDUITS_CREDENTIAL_STORE_PATH` | `~/.conduits/credentials.json` |

## The credential store

`~/.conduits/credentials.json` is a plain JSON file. It is not
encrypted. File permissions protect it: `0600` for the file and `0700`
for its directory.

> **WARNING:** Treat this file like an SSH private key. Do not commit
> it. Do not copy it to a place with less strict permissions.

## Limits of this service

- The gateway does not reload `conduits.yaml`. Stop and start it after
  each change.
- There are no commands to edit conduits. Edit `conduits.yaml`.
- The gateway stores no metrics. It writes hit and honeypot counts to
  stdout.
- Google's OAuth client comes from two environment variables. The
  gateway does not read the JSON file that Google offers.
- The gateway does not look up a Fastmail identity id for you.
