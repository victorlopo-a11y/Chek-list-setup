<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1j_seX_o7KvekEmAgXqz2gpOmU0ec9kuT

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local`
3. Set your Supabase values in `.env.local`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Run the app:
   `npm run dev`

## Deploy in Vercel

1. Import this repository in Vercel
2. In Project Settings > Environment Variables, create:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Deploy (build command: `npm run build`, output: `dist`)

## Keep Supabase Always Online

This project includes two keep-alive layers:

1. Frontend keep-alive while users are active in the app (`App.tsx`)
2. Scheduled external ping using GitHub Actions (`.github/workflows/supabase-keepalive.yml`)

### Configure GitHub Secrets (optional)

In your repository settings, add:

- `SUPABASE_URL` (example: `https://your-project.supabase.co`)
- `SUPABASE_ANON_KEY` (your anon/public key)

If not provided, the workflow uses the project defaults already configured in this repository.

### Run keep-alive manually (local)

```bash
npm run keepalive:ping
```
