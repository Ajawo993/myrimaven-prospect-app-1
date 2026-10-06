# Myrimaven Prospect Desk

A prospect discovery and qualification tool for Joan at Myrimaven, built with **Next.js** (App Router) and deployed on **Vercel**.

Myrimaven has not yet identified a paying organizational customer or a clear ideal customer profile. This tool helps Joan find organizations that may have a career alignment problem, see how well each fits her criteria and why, identify the right contact, and learn from outreach. It is intentionally not a full CRM or sales platform.

## Routes

| Route | Screen | Workflow it serves |
|---|---|---|
| `/discover` | Organizations sorted by fit, filters, AI suggest and analyze | Workflow 1: Find and investigate a prospect |
| `/prospects` | Prospect list sorted by fit, follow-ups, status filter, CSV export | Follow-up actions, prospect status |
| `/prospects/[id]` | Profile: fit rating, assessment, evidence, hiring activity, contacts, outreach log, next step | Workflow 2: Qualify; Workflow 3: Contact and learn |
| `/learnings` | Not-a-fit reasons, warm vs. cold, responses by sector, lessons | Workflow 3: learning from outreach |
| `/login` | Sign in with Google or with email and password; create an account; email a sign-in link | Access to Joan's prospect data |
| `/api/analyze`, `/api/suggest`, `/api/jobs`, `/api/status` | Server routes for AI analysis and job postings | "Why is this a prospect?" analysis, hiring activity |

## Features

1. **Prospect discovery:** sample organizations sorted by fit, filterable by fit rating and by signal (employee retention, reskilling, career transitions, workforce pipeline). AI can suggest real organizations from a plain-language description.
2. **Explainable fit rating:** Strong, Moderate or Weak, based on eight visible criteria from the discovery call with Joan. It is not a prediction.
3. **"Why is this a prospect?" analysis:** potential problems, supporting evidence with sources, unknowns to validate, roles to contact, and reasons it might not fit.
4. **Hiring activity:** recent job postings for an employer from the Adzuna API, used as evidence and for the "active hiring" criterion.
5. **Contacts:** role, purchasing authority, and connection (warm, referral or cold).
6. **Outreach log:** who was contacted, when, the response, why it wasn't a fit, and what was learned. Rejection reasons include Joan's real ones.
7. **Follow-ups and status:** next action and date, overdue follow-ups highlighted; Needs Validation, Potential Fit, Contacted, Follow-Up, Not a Fit.
8. **Learnings:** not-a-fit reasons, warm vs. cold reply rates, and responses by sector.
9. **CSV export:** prospects and the outreach log.

### How the fit rating works

| Criterion | Must-have | Set by |
|---|---|---|
| Serves adults | Yes | Preset, AI, or Joan |
| Evidence of a career alignment problem | Yes | Preset, AI, or Joan |
| Larger organization (roughly 200+) | | Preset, AI, or Joan |
| Active hiring or workforce change | | Preset, AI, job postings, or Joan |
| Decision-maker reachable | | Contacts marked "Decision-maker" |
| Open to outside tools | Yes | Preset, AI, Joan, or an "Only uses in-house tools" outreach reason |
| Manageable buying process | | Preset, AI, Joan, or a "Bureaucracy" outreach reason |
| Warm connection | | Contacts marked warm or referral |

Strong = 5 or more met. Moderate = 3 or 4. Weak = 2 or fewer, or "No" on any must-have.

## Out of scope

Full CRM, mass email, predictive lead-conversion scores, automated decision-making, K–12 and career-coach prospecting workflows, contracts and invoicing, and advanced analytics.

## Project structure

```
app/
  layout.js                 shared page shell: fonts, header, saved-data provider
  page.js                   / redirects to /discover
  discover/page.js          /discover
  prospects/page.js         /prospects
  prospects/[id]/page.js    /prospects/<id>
  learnings/page.js         /learnings
  login/page.js             /login
  api/analyze/route.js      POST: AI assessment (Anthropic API)
  api/suggest/route.js      POST: AI-suggested organizations (+ Adzuna counts)
  api/jobs/route.js         GET: recent job postings for an employer (Adzuna API)
  api/status/route.js       GET: which server features are switched on
  globals.css               all styles
components/                 the screens and shared UI (client components)
lib/
  supabase.js               the Supabase client used for sign-in
  storage.js                where prospects are saved (swap this for Supabase)
  catalog.js                the 15 fictional sample organizations
  fit.js                    fit criteria and rating
  prompts.js, server.js     AI prompts and server helpers for app/api
```

## Running it locally

Needs Node.js 20.9 or later.

```
npm install
npm run dev
```

Then open http://localhost:3000.

## Deploying on Vercel

In the Vercel project, **Settings → Build and Deployment → Framework Preset** must be **Next.js**. Leave the build and output settings on their defaults. Every commit to `main` redeploys.

### Turning on AI and job postings

The app works without any keys. AI and job postings switch on when these environment variables are set in Vercel (**Settings → Environment Variables**), followed by a redeploy:

| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys (needs a small amount of prepaid credit) |
| `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` | developer.adzuna.com → register for a free key |
| `ANTHROPIC_MODEL` (optional) | Defaults to `claude-haiku-4-5-20251001` |
| `ADZUNA_COUNTRY` (optional) | Defaults to `ca` (Canada) |

Keys stay on the server and are never sent to the browser. The API routes are public, so set a monthly spend limit in the Anthropic console.

## Sign-in (Supabase Auth)

The `/login` screen offers two ways to sign in: **Google**, and **email and password**. It also lets people create an account and, if they forget their password, email themselves a sign-in link. Once sign-in is set up, every screen needs it: signed-out visitors go to `/login` and return to the page they wanted afterwards. The AI and job-posting API routes also check the sign-in token, so strangers can't use up the API credit.

Until the Supabase keys below are set, the app stays open and `/login` says sign-in isn't connected yet.

### 1. Create the Supabase project

1. At supabase.com, create a project.
2. In **Project Settings → API Keys**, copy the **Project URL** and the **publishable key** (`sb_publishable_...`).
3. In Vercel, under **Settings → Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL`: the Project URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: the publishable key
4. Redeploy. These values are built into the app, so they only take effect after a new deployment.

### 2. Tell Supabase where the app lives

In Supabase, go to **Authentication → URL Configuration**:

- **Site URL:** your Vercel URL, e.g. `https://your-app.vercel.app`
- **Redirect URLs:** add `https://your-app.vercel.app/**` (and `http://localhost:3000/**` for local development)

### 3. Email and password

Email sign-in is on by default in **Authentication → Sign In / Providers → Email**. With "Confirm email" on, new accounts get a confirmation email first. Supabase's built-in email service only sends a few emails an hour, which is fine for testing; for real use, set up custom SMTP under **Authentication → Emails**.

### 4. Google

1. In Google Cloud Console, go to **Google Auth Platform**. Set up the consent screen with your app name and the `openid`, `email` and `profile` scopes. While it's in "Testing", only the Google accounts you add as test users can sign in. Publish it to let anyone sign in.
2. Under **Clients**, create an **OAuth client ID** of type **Web application**:
   - **Authorized JavaScript origins:** your Vercel URL
   - **Authorized redirect URIs:** the callback URL shown on Supabase's Google provider page, which looks like `https://<project-ref>.supabase.co/auth/v1/callback`
3. Copy the Client ID and Client Secret into Supabase under **Authentication → Sign In / Providers → Google**, turn it on, and save.

## Saving data, and moving to Supabase

Today, prospects save in the browser's localStorage, so data stays on one computer and isn't shared between people. Sign-in controls who can open the app, but the data itself isn't tied to an account yet.

Every save in the app goes through `components/ProspectsProvider.js`, which only calls the three functions in `lib/storage.js`: `loadProspects`, `saveProspect` and `deleteProspect`. Moving to Supabase means rewriting those three functions to read and write a Supabase table. The screens don't need to change. A simple first version is one `prospects` table with an `id`, a `user_id` (the signed-in person, from Supabase Auth) and a JSON `data` column, which matches how prospects are stored now. Turn on row-level security so each person only sees their own rows. Contacts and outreach can be split into their own tables later.

## Trying it

1. Go to **Prospects** and click **Load 3 examples** to see a warm lead, a referral, and a Not a Fit prospect.
2. In **Discover**, filter to **Strong** fits, open **Why is this a prospect?** on a sample organization, and save it.
3. On the prospect, add a contact who is a decision-maker and watch the fit rating update.
4. Log outreach with the reason "Only uses in-house tools" and watch the rating drop to Weak.
5. Open **Learnings** to see what outreach has taught you, then export the outreach log as CSV.

Sample organizations are fictional.
