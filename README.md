# Sesios Character Manager

An invite-only, single-campaign web application built from the Amutsu character workbook. Players can create and manage only their own characters. The DM can manage every character, invite players, edit the campaign, and add, edit, or remove catalogue entries.

The complete workbook-derived formula engine remains in `public/sheet`. Character inputs are stored in Supabase and recalculated in the browser whenever they change.

## What is included

- Email and password login with no public registration page
- Invitation acceptance and password reset flows
- Player-only character visibility enforced by PostgreSQL row-level security
- DM access to every character
- Permanent character deletion with an explicit warning
- Automatic online character saving
- DM character assignment and reassignment
- DM player invitation screen backed by a protected Edge Function
- DM editing for items, personality traits, conditions, food, food rules, and crafting sections
- Responsive desktop and mobile layouts
- Original workbook calculations, catalogues, validation choices, notes, and source compatibility behavior

## Project structure

- `src/`: login, account, character selector, DM tools, and Supabase integration
- `public/sheet/`: complete workbook-derived character application and calculation engine
- `supabase/migrations/`: database schema, row-level security, and workbook catalogue seed data
- `supabase/functions/invite-player/`: DM-only invitation service
- `scripts/`: deterministic workbook data generation and project checks

## One-time setup, in order

### 1. Create the database schema

In the Supabase dashboard for project `bxujxmmoyxlqjdqhpkjs`, open **SQL Editor** and run these files in order:

1. `supabase/migrations/20260717000000_initial_schema.sql`
2. `supabase/migrations/20260717001000_seed_catalogues.sql`

Alternatively, with the Supabase CLI:

```sh
npx supabase login
npx supabase link --project-ref bxujxmmoyxlqjdqhpkjs
npx supabase db push
```

The first migration enables row-level security on every browser-accessible table. The second loads all workbook catalogue records so the DM can edit them individually.

### 2. Create and promote the first DM

In **Authentication → Users**, create your own email/password user. Then run this once in SQL Editor, replacing the email:

```sql
update public.profiles
set role = 'dm'
where email = 'your-email@example.com';
```

Sign out and back in after promotion. Do not put a service-role key in this project or in Vercel.

### 3. Enforce invite-only registration

In **Authentication → Sign In / Providers**:

1. Keep email/password authentication enabled.
2. Disable new-user sign-ups.

The website intentionally has no sign-up form. New player accounts are created only through the DM invitation function.

For production use, configure custom SMTP in Supabase. The built-in email sender is rate-limited and is intended mainly for testing, so it may not reliably handle a larger batch of invitations or password resets.

In **Authentication → URL Configuration**, set the production site URL and add both local and production redirect URLs, for example:

```text
http://localhost:5173/**
https://your-project.vercel.app/**
```

### 4. Deploy the invitation function

From the project folder:

```sh
npx supabase functions deploy invite-player --project-ref bxujxmmoyxlqjdqhpkjs
npx supabase secrets set APP_URL=https://your-project.vercel.app --project-ref bxujxmmoyxlqjdqhpkjs
```

Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to the function at runtime. The service-role key stays inside Supabase and is never sent to the website. The function verifies that the caller has the `dm` role before sending an invitation.

For local invitation testing, temporarily set `APP_URL=http://localhost:5173` and change it back before inviting production players.

### 5. Run locally

```sh
npm install
npm run dev
```

Open `http://localhost:5173`. The supplied Supabase URL and publishable key are browser-safe defaults. You may override them with a local `.env` copied from `.env.example`.

### 6. Deploy with Vercel

1. Import the GitHub repository into Vercel.
2. Keep the detected framework as **Vite**.
3. Use build command `npm run build` and output directory `dist`.
4. Deploy.
5. Put the final Vercel URL in Supabase **URL Configuration** and in the `APP_URL` function secret from step 4.

The committed `vercel.json` supplies the build settings and security headers.

## Normal DM workflow

1. Sign in with the DM account.
2. Open **Players** and send an invitation.
3. The player opens the email link and chooses a password.
4. The player creates their character, or the DM creates one and assigns it to them.
5. Open **Catalogues** to edit any catalogue record. Changes apply to all sheets when reopened or refreshed.

## Security rules

| Action | Player | DM |
|---|---:|---:|
| View own character | Yes | Yes |
| View another player's character | No | Yes |
| Create a character | Own account only | For any player |
| Edit or delete a character | Own account only | Any character |
| View catalogues | Yes | Yes |
| Add, edit, or delete catalogue entries | No | Yes |
| Invite players | No | Yes |
| Edit campaign settings | No | Yes |

These are database policies, not merely hidden buttons. A player cannot retrieve another player's rows by changing browser code or calling the API directly.

## Development commands

```sh
npm run generate:workbook  # regenerate default state and catalogue seed SQL from data.js
npm run check              # verify required assets, catalogue counts, bridge, and RLS declarations
npm run build              # production build
npm run preview            # preview the production build locally
```

The workbook inspection report is available at `public/sheet/AUDIT.md`.
