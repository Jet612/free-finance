# Free Finance

See your whole financial life without paying a subscription. A free, self-hosted
personal finance dashboard—you own the app and your data.

Free Finance brings bank accounts, transactions, budgets, subscriptions, reports,
and investments into one private dashboard. It connects to financial institutions
through Plaid and can optionally show all Robinhood brokerage and managed
accounts.

## Get started

You need [Git](https://git-scm.com/downloads),
[Node.js 22+](https://nodejs.org/en/download),
[Python 3.12+](https://www.python.org/downloads/), and free accounts with
[Supabase](https://database.new/), [Plaid](https://dashboard.plaid.com/signup),
[GitHub](https://github.com/), and [Vercel](https://vercel.com/signup).

### macOS

```bash
brew install git node python
git clone <your-fork-url>
cd free-finance
cp .env.example .env.local
corepack enable
pnpm install
```

### Windows

Install the prerequisites in PowerShell:

```powershell
winget install Git.Git OpenJS.NodeJS.LTS Python.Python.3.12
```

Open a new PowerShell window, then:

```powershell
git clone <your-fork-url>
cd free-finance
Copy-Item .env.example .env.local
corepack enable
pnpm install
```

### Linux

Install Git and Python with your distribution's package manager, and install
[Node.js 22+](https://nodejs.org/en/download). On Ubuntu or Debian:

```bash
sudo apt update
sudo apt install git python3 python3-venv
git clone <your-fork-url>
cd free-finance
cp .env.example .env.local
corepack enable
pnpm install
```

Then, on any operating system:

1. Fill in `.env.local` using the [setup guide](#full-setup).
2. Create the database and start the app:

   ```bash
   pnpm db:migrate
   pnpm dev
   ```

3. Open [http://localhost:3000](http://localhost:3000).
4. When everything works locally, [connect your accounts](#3-connect-plaid) and
   [deploy](#5-deploy-to-vercel).

## Full setup

### 1. Create a Supabase project

1. Create a project on the [Supabase Free plan](https://database.new/).
2. In **Connect**, copy:
   - The transaction pooler URI, normally on port `6543`, to `DATABASE_URL`.
   - The session pooler URI, normally on port `5432`, to
     `DATABASE_MIGRATION_URL`.
3. In **Project Settings → API Keys**, copy:
   - The project URL to `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL`.
   - The publishable key to `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
   - The secret key to `SUPABASE_SECRET_KEY`.
4. In **Authentication → Users**, create your dashboard user and copy its UUID
   to `DASHBOARD_USER_ID`.
5. Disable public signup under **Authentication → Sign In / Providers → Email**.
6. Add `http://localhost:3000/**` as an Auth redirect URL.
7. Apply the database migrations:

   ```bash
   pnpm db:migrate
   ```

Only the two variables beginning with `NEXT_PUBLIC_` are safe for the browser.
Never expose database URLs, provider credentials, or secret keys.

### 2. Create the Python environment

#### macOS and Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r scripts/requirements.txt
```

#### Windows PowerShell

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r scripts/requirements.txt
```

If PowerShell blocks activation, run this once in the current window:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
```

### 3. Connect Plaid

Start with Plaid Sandbox before connecting real accounts.

1. Copy your client ID and Sandbox secret from the
   [Plaid Dashboard](https://dashboard.plaid.com/) into `.env.local`:

   ```dotenv
   PLAID_CLIENT_ID=...
   PLAID_SECRET=...
   PLAID_ENV=sandbox
   PLAID_COUNTRY_CODES=US
   ```

2. Link an institution:

   ```bash
   python scripts/plaid_link.py
   ```

3. Test it without writing data:

   ```bash
   python scripts/sync.py --source plaid --dry-run
   ```

4. Run the first sync:

   ```bash
   python scripts/sync.py --source plaid
   ```

To connect real accounts, request Plaid Trial access, change `PLAID_ENV` to
`production`, replace the Sandbox secret with the Production secret, and run the
linking command again. Repeat it for each institution.

Plaid access tokens are long-lived secrets. Keep them in `.env.local` and GitHub
Actions secrets only.

### 4. Add GitHub Actions configuration

The included workflow syncs data every three hours and can also run manually.

In **Repository → Settings → Secrets and variables → Actions**, add these
repository secrets:

| Secret | Required |
| --- | --- |
| `SUPABASE_URL` | Yes |
| `SUPABASE_SECRET_KEY` | Yes |
| `PLAID_CLIENT_ID` | Yes |
| `PLAID_SECRET` | Yes |
| `PLAID_ACCESS_TOKENS` | Yes |
| `ROBINHOOD_SESSION_B64` | Only for Robinhood |

Add these repository variables:

| Variable | Example |
| --- | --- |
| `PLAID_ENV` | `sandbox` or `production` |
| `PLAID_COUNTRY_CODES` | `US` or `US,CA` |
| `APP_TIMEZONE` | `America/New_York` |

The easiest way to link Plaid and update its GitHub secrets together is:

```bash
python scripts/plaid_link.py --github
```

This requires the optional [GitHub CLI](https://cli.github.com/) to be installed
and authenticated. Without it, copy the values from `.env.local` into GitHub
manually. `PLAID_ACCESS_TOKENS` must remain a JSON array.

Push the repository, then open **Actions → Finance sync → Run workflow**. Confirm
that Sandbox works before switching the workflow to Production.

### 5. Deploy to Vercel

1. [Import your fork into Vercel](https://vercel.com/new).
2. Keep the detected framework as **Next.js** and the root directory as `.`.
3. Add these Production environment variables:

   | Variable | Required |
   | --- | --- |
   | `APP_NAME` | Yes |
   | `APP_TIMEZONE` | Yes |
   | `DATABASE_URL` | Yes |
   | `NEXT_PUBLIC_SUPABASE_URL` | Yes |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes |
   | `DASHBOARD_USER_ID` | Yes |
   | `GITHUB_SYNC_REPOSITORY` | Only for **Sync now** |
   | `GITHUB_SYNC_TOKEN` | Only for **Sync now** |

4. Deploy and open the generated URL.
5. In Supabase Auth, set the Site URL to the deployed URL and add
   `https://your-domain.example/**` to the redirect URLs.
6. Sign in with the Supabase user created earlier.

To enable **Sync now**, create a fine-grained GitHub token limited to this
repository with **Actions: Read and write** permission. Set
`GITHUB_SYNC_REPOSITORY` to `owner/repository` and store the token in
`GITHUB_SYNC_TOKEN`.

The scheduled workflow runs every three hours. Manual requests from the
dashboard have a 10-minute cooldown to avoid dispatching duplicate syncs.

Keep all financial data variables scoped to Production unless you intentionally
want Preview deployments to access them.

## Optional setup

### Robinhood

Robinhood support uses the unofficial `robin_stocks` library and can stop working
if Robinhood changes its private API. It reads portfolio and holding data only,
including separate self-directed and Robinhood Strategies managed accounts.

Add your credentials to `.env.local`, then run:

```dotenv
ROBINHOOD_USERNAME=...
ROBINHOOD_PASSWORD=...
```

```bash
python scripts/robinhood_link.py --github
python scripts/sync.py --source robinhood --dry-run
```

Approve the login prompt in the Robinhood app. The helper stores a reusable
session in `ROBINHOOD_SESSION_B64`; it does not send your username or password to
GitHub. Treat that session value like a password. Omit `--github` if you are not
using the GitHub CLI.

### Passkeys and MFA

Password login works without additional setup. To add stronger authentication:

- Enable passkeys in Supabase, using your final production hostname as the
  relying-party ID, then add a passkey from the dashboard's **Security** page.
- Enable TOTP in **Supabase → Authentication → Multi-Factor**, then enroll an
  authenticator from the **Security** page.

Choose the final domain before enrolling passkeys. Changing it later invalidates
existing passkeys.

## Environment variables

`.env.example` is the source of truth.

| Variable | Used by | Purpose |
| --- | --- | --- |
| `APP_NAME` | Local, Vercel | Dashboard title |
| `APP_TIMEZONE` | Local, Vercel, Actions | Dates and month boundaries |
| `DATABASE_URL` | Local, Vercel | Runtime transaction-pooler connection |
| `DATABASE_MIGRATION_URL` | Local | Migration session-pooler connection |
| `NEXT_PUBLIC_SUPABASE_URL` | Local, Vercel | Browser-safe Auth URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Local, Vercel | Browser-safe Auth key |
| `DASHBOARD_USER_ID` | Local, Vercel | The only allowed user UUID |
| `SUPABASE_URL` | Local, Actions | Sync API URL |
| `SUPABASE_SECRET_KEY` | Local, Actions | Server-only sync access |
| `PLAID_ENV` | Local, Actions | `sandbox` or `production` |
| `PLAID_COUNTRY_CODES` | Local, Actions | Plaid institution regions |
| `PLAID_CLIENT_ID` | Local, Actions | Plaid application ID |
| `PLAID_SECRET` | Local, Actions | Plaid environment secret |
| `PLAID_ACCESS_TOKENS` | Local, Actions | Linked Plaid Item credentials |
| `PLAID_ACCESS_TOKEN` | Legacy installs only | Previous single-Item credential |
| `ROBINHOOD_USERNAME` | Local linking only | Optional Robinhood login |
| `ROBINHOOD_PASSWORD` | Local linking only | Optional Robinhood login |
| `ROBINHOOD_SESSION_B64` | Local, Actions | Optional reusable session |
| `GITHUB_SYNC_REPOSITORY` | Local, Vercel | Repository used by **Sync now** |
| `GITHUB_SYNC_TOKEN` | Local, Vercel | Server-only workflow token |
| `LOG_LEVEL` | Local, Actions | Python log level |

## Common commands

```bash
pnpm dev            # Start the dashboard
pnpm db:migrate     # Apply database migrations
pnpm db:studio      # Browse the database
pnpm test           # Run tests
pnpm lint           # Run ESLint
pnpm typecheck      # Check TypeScript
pnpm build          # Create a production build
pnpm check          # Run every project check

python scripts/plaid_link.py
python scripts/robinhood_link.py
python scripts/sync.py
```

## How it works

- Next.js runs the dashboard locally or on Vercel.
- Supabase provides PostgreSQL and authentication.
- Plaid supplies bank accounts, balances, and transactions.
- GitHub Actions runs the scheduled Python sync.
- Robinhood support is optional and unofficial.

The app is single-tenant: each deployment accepts one Supabase user. Secrets stay
in `.env.local`, GitHub Actions, Supabase, or Vercel and must never be committed.
Syncs use idempotent upserts, so retries update existing records instead of
creating duplicates.

The app can run for $0 while it remains within each provider's free-tier limits.
Provider pricing, limits, and terms can change.
