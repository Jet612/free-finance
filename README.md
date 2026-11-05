# Free Finance

See your whole financial life without paying a subscription. A free, private
dashboard for your bank accounts, credit cards, spending, budgets,
subscriptions, and investments. It runs in your own accounts, so your data stays
yours.

## Set it up

You don't need to install anything or use a terminal. Everything happens in your
web browser and takes about 15 minutes. You'll need free accounts with
[GitHub](https://github.com/signup), [Vercel](https://vercel.com/signup), and
[Plaid](https://dashboard.plaid.com/signup).

### 1. Get your Plaid keys

Plaid is the service that securely connects to your bank.

1. Sign in to the [Plaid Dashboard](https://dashboard.plaid.com/).
2. Request **Production** access so you can connect real accounts. To follow
   along with fake test data instead, use the Sandbox keys and set `PLAID_ENV`
   to `sandbox` in the next step.
3. Open [Developers → Keys](https://dashboard.plaid.com/developers/keys) and keep
   this page open. You'll copy your **client_id** and your **Production secret**.

### 2. Deploy your copy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FJet612%2Ffree-finance&project-name=free-finance&repository-name=free-finance&env=PLAID_CLIENT_ID%2CPLAID_SECRET%2CPLAID_ENV%2CCRON_SECRET%2CAPP_TIMEZONE&envDefaults=%7B%22PLAID_ENV%22%3A%22production%22%2C%22APP_TIMEZONE%22%3A%22America%2FNew_York%22%7D&envDescription=Paste%20your%20Plaid%20keys%2C%20then%20make%20up%20a%20setup%20password%20of%20at%20least%2032%20characters%20for%20CRON_SECRET%20and%20save%20it%20somewhere%20safe.&envLink=https%3A%2F%2Fdashboard.plaid.com%2Fdevelopers%2Fkeys&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22supabase%22%2C%22productSlug%22%3A%22supabase%22%2C%22protocol%22%3A%22storage%22%7D%5D)

Click the button and follow the steps. Vercel makes your own copy of the app and
creates a free Supabase database for it. It then asks for a few values:

| Field | What to enter |
| --- | --- |
| `PLAID_CLIENT_ID` | Your **client_id** from Plaid |
| `PLAID_SECRET` | Your **Production secret** from Plaid |
| `PLAID_ENV` | Leave as `production` |
| `CRON_SECRET` | **A long, random password of at least 32 characters.** Have your password manager generate and save one |
| `APP_TIMEZONE` | Your [time zone](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones), such as `America/Chicago` |

`CRON_SECRET` is your setup password. It proves this copy of the app is yours,
and it protects your bank connections, so make it random rather than something
you'd type by hand. Don't change it later: if you do, you'll need to reconnect
your banks.

### 3. Finish in your app

1. Open your new site. Vercel shows you the link when it finishes deploying.
2. Enter your setup password, then choose the email and password you'll use to
   sign in.
3. Choose **Add a bank or credit card**, then sign in to your bank on Plaid's
   secure page. Repeat for each bank.
4. To add investments, choose **Add an investment account**. This is also how you
   connect Robinhood, Fidelity, and other brokerages.

That's it. Your accounts update by themselves every morning.

## Using it day to day

- **Updates:** everything refreshes once a day, early in the morning (US time).
  There's nothing to keep open. To update sooner, choose **Refresh** on the Overview page,
  up to once an hour.
- **If a bank asks you to sign in again:** banks do this from time to time. You'll
  see a notice on the Overview page. Choose **Reconnect** on the Connections page.
- **Extra sign-in protection:** you can add a passkey or an authenticator app on
  the **Security** page.
- **Showing it to someone:** every copy has a demo with sample data. Choose
  **Explore the interactive demo** on the sign-in page.

## Is it safe?

- **Your bank password never touches this app.** You type it on Plaid's page, and
  the app only receives a key that lets it read your data.
- **It can't move money.** The connection is read-only.
- **Your data lives in your accounts.** There's no shared server, and nobody else
  can sign in. Each copy of the app has exactly one login.
- **Bank keys are encrypted** before they're saved to your database.

If you ever want to cut off access, choose **Remove** on the Connections page.
That also cancels the connection with Plaid.

## Costs

The Vercel and Supabase free plans are enough to run this. Plaid sets its own
pricing and limits for connecting real accounts, so check
[their pricing](https://plaid.com/pricing/) before connecting many accounts.
Investment accounts use a separate Plaid product from bank accounts.

## Upgrading an older install

Versions that synced through GitHub Actions need a one-time move. These steps use
a terminal, because your existing bank connection lives in `.env.local`. Moving it
keeps your transaction history connected. Adding the same bank again through the
app would create duplicates.

1. Generate a `CRON_SECRET` with `openssl rand -base64 32`. Add the same value to
   both your Vercel project and `.env.local`.
2. In your Vercel project, make sure `PLAID_CLIENT_ID`, `PLAID_SECRET`, and
   `PLAID_ENV` are set.
3. Deploy this version. The database updates itself during the deploy.
4. Move your bank connections, checking the preview first:

   ```bash
   pnpm plaid:import --dry-run
   pnpm plaid:import
   ```

5. Reconnect Robinhood, if you used it, with **Add an investment account** on the
   Connections page. Old Robinhood accounts stop counting toward your totals, but
   their history stays in your database.
6. Clean up what's no longer used:
   - Delete the repository's GitHub Actions secrets and variables.
   - Delete `GITHUB_SYNC_TOKEN` and `GITHUB_SYNC_REPOSITORY` from Vercel, and
     revoke that GitHub token.
   - Delete `ROBINHOOD_USERNAME`, `ROBINHOOD_PASSWORD`, and
     `ROBINHOOD_SESSION_B64` from `.env.local` and Vercel.

## For developers

### Running locally

You need [Node.js 22+](https://nodejs.org/en/download) and
[pnpm](https://pnpm.io/installation).

```bash
git clone <your-repo-url>
cd free-finance
cp .env.example .env.local   # then fill it in
pnpm install
pnpm db:migrate
pnpm dev
```

`.env.example` documents every setting. Hosted Plaid Link needs a public HTTPS
return URL, so connect banks from a deployed copy rather than from localhost.

### Commands

```bash
pnpm dev            # Start the dashboard
pnpm db:migrate     # Apply database migrations
pnpm db:generate    # Create a migration after changing src/db/schema.ts
pnpm db:studio      # Browse the database
pnpm test           # Run unit tests
pnpm test:db        # Run database tests (needs TEST_DATABASE_URL)
pnpm lint           # Run ESLint
pnpm typecheck      # Check TypeScript
pnpm build          # Create a production build
pnpm check          # Run every check
```

`pnpm test:db` wipes the database it connects to, so point `TEST_DATABASE_URL` at a
scratch Postgres that has been migrated.

### How it works

- Next.js runs the dashboard on Vercel, and Supabase provides PostgreSQL and
  sign-in.
- Vercel Cron calls `/api/cron/sync` once a day. It's authenticated with
  `CRON_SECRET` and skips repeat deliveries. **Refresh** runs the same sync.
- Each bank syncs independently, so one expired login doesn't block the others.
  Everything for a bank, including its cursor, is written in one transaction.
- Banks connect through Plaid Hosted Link, so no third-party script runs on the
  site. Access tokens are encrypted with AES-256-GCM using a key derived from
  `CRON_SECRET`, and are only ever decrypted on the server.
- Production builds apply database migrations before `next build`. A failed
  migration fails the deploy, which leaves the previous version running.
- Each deployment accepts one owner, claimed once on `/welcome` using `CRON_SECRET`.
  All tables use Row Level Security with no policies, so Supabase's public API can't
  read them.
