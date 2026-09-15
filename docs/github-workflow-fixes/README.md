# GitHub workflow fixes (copy into `.github/workflows/`)

The GitHub token used to open PR #5 does not include the `workflow` scope, so these YAML files could not be committed directly under `.github/workflows/`.

## How to apply
1. Open each file below.
2. In the GitHub UI (or locally), replace the matching file under `.github/workflows/` with this content.
3. Commit on this branch (or merge after copying).

Files:
- `verify-cron.yml` — default SITE_URL + clearer HTTP checks (SITE_URL secret is also now set)
- `deploy.yml` — Node 22 for Wrangler
- `p0.yml` — install WebKit + Node 22 + test production
- `cron.yml` — hit tenderpreneurs.co.za instead of pages.dev

## Still required in repo secrets
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
