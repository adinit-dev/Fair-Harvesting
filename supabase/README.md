# FairHarvest Supabase setup

1. Create a Supabase project.
2. In **Project settings → API**, copy the project URL and the anon/public key into a local `.env` file:

   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   GROQ_API_KEY=your-server-only-groq-key
   GROQ_MODEL=llama-3.1-8b-instant
   ```

3. Open **SQL editor** in the Supabase dashboard.
4. Open [`migrations/20261028190000_fairharvest_foundation.sql`](./migrations/20261028190000_fairharvest_foundation.sql), paste the complete file into a new query, and run it once.
5. In **Authentication → Providers → Email**, enable email and configure the OTP email template/settings.
6. Restart the Vite dev server after changing `.env`:

   ```bash
   npm run dev
   ```

The migration creates the tables, indexes, update timestamps, new-user profile trigger, and Row Level Security policies. The browser only uses the anon key. Never put a Supabase service-role key in `.env` values beginning with `VITE_` or in frontend code.

With either Supabase variable missing, FairHarvest stays in clearly labelled demo mode. Demo data is never written to Supabase.

## AI assistant API

The AI assistants use the Vercel function at `POST /api/assistant`. `GROQ_API_KEY` is server-only and must not be prefixed with `VITE_`.

Vite does not execute `api/` functions by itself. For local API testing, install the Vercel CLI (`npm install --global vercel`), run `vercel dev`, and provide the environment variables through the Vercel CLI or a local `.env`. The frontend can then call `/api/assistant` through the local Vercel development server. On deployment, import the project into Vercel and configure `GROQ_API_KEY`, optional `GROQ_MODEL`, and the `VITE_*` Supabase variables in Project Settings.

When Groq is unavailable, the UI runs deterministic, clearly labelled demo calculations locally. It does not claim that a Groq request occurred. Neither mode invents market prices: the assistant displays `Market data unavailable.` unless a user supplies a quote.
