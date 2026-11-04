# Google sign-in setup

The app uses Better Auth with Google OAuth, persistent database sessions, and one-time username onboarding. There is one Google button for both registration and login. After Google returns, new users choose a unique public username; returning users go straight back to their original page. No Google name or email is displayed on public profiles.

## What you need from Google

Create an OAuth client with application type **Web application** in [Google Cloud Console](https://console.cloud.google.com/auth/clients). Configure the project's Google Auth Platform branding and audience first if prompted.

Copy these two values into `.env.local` for development and your hosting provider's environment settings for production:

```dotenv
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

Keep the secret in environment settings, never in source control or a `NEXT_PUBLIC_` variable. A service account, Google API key, or downloadable service-account JSON is not used for this flow.

Add the following **Authorized redirect URIs** to the OAuth client:

| Environment       | Exact redirect URI                               |
| ----------------- | ------------------------------------------------ |
| Local development | `http://localhost:3000/api/auth/callback/google` |
| Production        | `https://YOUR-DOMAIN/api/auth/callback/google`   |

Set `BETTER_AUTH_URL` to the corresponding origin, without `/api/auth`:

```dotenv
BETTER_AUTH_URL=http://localhost:3000
```

The browser address, `BETTER_AUTH_URL`, and registered callback must agree on scheme, hostname, and port. If you use a different development port or `127.0.0.1`, register that exact callback too. Use a stable production or staging domain for OAuth; arbitrary preview domains are not automatically trusted.

This server redirect flow does not require Authorized JavaScript origins. If you fill them in, use `http://localhost:3000` and `https://YOUR-DOMAIN` (no path). Request only the basic Google identity scopes: `openid`, `email`, and `profile`; the provider config already does this. You do not need to enable the People API.

Choose an External audience for a community open to people outside your organization. While the app is in Testing, add the Google accounts you will test with under Audience → Test users. Before public launch, publish the OAuth app and complete any branding/domain requirements Google presents.

Official references: [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Better Auth Google provider](https://better-auth.com/docs/authentication/google).

## Local setup

```sh
bun install --frozen-lockfile
bun run setup
# Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local.
bun dev
```

`setup` creates `.env.local` with a cryptographically random session secret if the file does not already exist. It also runs migrations and inserts the illustrative project/comment seed data without overwriting existing records. The local database is `local.db`, which is gitignored. Restart the development server after changing environment variables.

The UI remains browsable without Google credentials and explains that sign-in is unavailable. The secret and database still need to be initialized with `setup`.

## Production with Turso

Create a hosted Turso database and a database access token. Set these on your Node.js hosting service:

```dotenv
BETTER_AUTH_URL=https://YOUR-DOMAIN
BETTER_AUTH_SECRET=a-separate-random-production-secret-at-least-32-characters
DATABASE_URL=libsql://YOUR-DATABASE.turso.io
DATABASE_AUTH_TOKEN=your-database-token
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
MODERATOR_EMAILS=your-verified-google-email@example.com
```

Generate the production secret with `openssl rand -base64 32`. Keep it stable across deployments and shared across instances. Rotating it invalidates session signatures and affects encrypted OAuth tokens.

Run `bun run db:migrate` once against the production database as a release step, then build and start the app with `bun run build` and `bun start`. The migration command reads environment variables and `.env.local`; confirm you are targeting the intended database. Production requires an explicit `DATABASE_URL` and `BETTER_AUTH_URL`. Local SQLite is also supported on a single Node server with persistent disk, but is unsuitable for ephemeral serverless storage.

`MODERATOR_EMAILS` is an optional comma-separated list of verified Google email addresses. Only those accounts can create or update projects. User input cannot grant moderator access. Leave it empty to keep all accounts as regular members.

## Account behavior

- Usernames are normalized to lowercase, 3–24 characters, and support `a–z`, `æøå`, numbers, and underscores. Usernames are permanent to keep profile URLs and comment identities stable. System names and illustrative profile names are reserved. A database unique constraint resolves simultaneous claims.
- Accounts without a username can browse, but server-side checks require onboarding before comments, bookmarks, votes, or profile edits.
- Database sessions last 30 days and renew through the auth endpoint while active. Session tokens are signed, HttpOnly cookies, with Secure cookies on HTTPS. Server rendering and application API reads do not renew a cookie they cannot return.
- Comments, votes, and bookmarks are shared/persistent database records; bookmarks and personal votes are scoped to the authenticated account. A bookmark that triggered login is completed after onboarding in the same tab. Old browser-only demo content is not assigned to a real account.
- Google names and emails stay private. Public profiles contain the chosen username, optional bio/location, and joining date.
- Account settings support profile editing, sign-out, revoking other sessions, and account deletion. Deletion requires authentication within the last 10 minutes, removes the account's comments/bookmarks/votes and sessions, and keeps other people's replies. Reply threads are re-rooted when a parent is removed.
- Project changes require a verified moderator account. Application mutations enforce the configured origin and validate server-side input. Google OAuth state/PKCE and session validation are handled by Better Auth. Auth endpoints and community writes are rate-limited in the database.

## Verification

```sh
bun run lint
bun run typecheck
bunx playwright install chromium # first time on a new machine
bun run test
bun run build
```

Tests run on a port derived from the checkout path (3100–3999, override with `TEST_PORT`) with a separate `test-auth.db` and `.next-test` build directory. Test sessions are inserted directly into that isolated database; there is no development-login endpoint or authentication bypass in the application.

Automated coverage includes username races and validation, server-side authorization, forged/expired sessions, CSRF rejection, profile privacy, per-account persistence, moderator enforcement, account deletion, OAuth initiation/state rejection, and desktop/mobile onboarding. A real Google authorization-code exchange still requires the configured credentials and an interactive Google login.
