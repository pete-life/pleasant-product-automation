# Pleasant Product Automation

Headless automation service that replaces a legacy n8n flow by orchestrating Google Sheets, Google Drive, OpenAI, and Shopify. The app polls approved sheet rows, enriches missing content with AI, uploads product data (variants, images, metafields) to Shopify, archives processed assets, and records observability signals back into the workbook.

## Highlights
- Fastify server deployed on Google Cloud Run (Node 20).
- Google Service Account JWT for Sheets, Drive, and Change Notifications.
- Deterministic image ordering with post-upload archival to Drive.
- AI-powered copy generation (OpenAI Responses API) only when fields are missing or regeneration is requested.
- Batched sheet writes with structured Logs and Errors tabs.
- Robust retry/backoff handling for all outbound API calls.

## Prerequisites
- Node.js 20+
- npm 9+
- Docker 24+
- `gcloud` CLI authenticated against the target project
- Shopify Admin API access token (2025-07)
- OpenAI API key with access to the Responses API

## Setup
1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```
2. Create a Google Service Account and grant it access to the target Google Sheet and Drive folders (Reader/Writer as appropriate).
3. Copy `.env.example` to `.env` and populate all secrets:
   ```bash
   cp .env.example .env
   ```
4. Ensure the Drive folder contains an `Archive` subfolder and share both with the Service Account email.

### Environment Variables
- **Google**: project id, service account email + private key, sheet id, source folder id, archive folder id.
- **Shopify**: store domain (`yourstore.myshopify.com`), admin token, API version (default `2025-07`), and target location id.
- **OpenAI**: standard API key.
- **App**: port (default 8080) and public base URL (used for Drive webhooks).

## Local Development
- Run in watch mode:
  ```bash
  npm run dev
  ```
- Type-check / build once:
  ```bash
  npm run build
  ```

The Fastify server exposes:
- `GET /health`
- `POST /tasks/process-approved`
- `POST /tasks/reprocess?key=<ProductKey>`
- `POST /tasks/renew-drive-watch`
- `POST /webhooks/drive`

## Deployment (Cloud Run)
1. Build the container:
   ```bash
   gcloud builds submit --tag gcr.io/${GOOGLE_PROJECT_ID}/pleasant-product-automation
   ```
2. Deploy to Cloud Run:
   ```bash
   gcloud run deploy pleasant-product-automation \
     --image gcr.io/${GOOGLE_PROJECT_ID}/pleasant-product-automation \
     --platform managed \
     --region <region> \
     --allow-unauthenticated \
     --set-env-vars "$(cat .env | xargs)"
   ```
   (Use `--set-secrets` instead of raw env vars if storing secrets in Secret Manager.)
3. Update `.env` `APP_BASE_URL` with the Cloud Run HTTPS URL.
4. Call `POST /tasks/renew-drive-watch` once to initialize the Drive watch channel (or schedule it periodically).

## Cloud Scheduler
Create a scheduler job that triggers the primary workflow driver every five minutes:
```bash
gcloud scheduler jobs create http process-approved \
  --schedule "*/5 * * * *" \
  --uri "https://<cloud-run-url>/tasks/process-approved" \
  --http-method POST \
  --oidc-service-account-email <service-account>@${GOOGLE_PROJECT_ID}.iam.gserviceaccount.com
```

## Observability
- Success and progress messages append to the `Logs` tab with timestamps, actions, and product keys.
- Failures append to the `Errors` tab with diagnostic hints and payload snippets.
- Drive webhook notifications are logged and immediately trigger a background reconciliation run.

## Testing Checklist
- Populate the `Products` tab with sample data and mark rows as `APPROVED` without `ShopifyProductId`.
- Drop image files named `<productKey>_role.jpg` into the Drive inbox folder.
- Run `POST /tasks/process-approved` locally or via Cloud Run; confirm Shopify products, variants, images, and metafields exist.
- Verify the Sheet row now includes `ShopifyProductId`, refreshed copy, updated timestamps, and `Status=COMPLETE`.
- Confirm images are moved into the `Archive` folder.
- Check `Logs` and `Errors` tabs for expected entries.

## Assumptions
- OpenAI model `gpt-4.1-mini` is acceptable for production copy generation.
- Sheet columns match the documented names (e.g., `MetaDescription`, lowercase metafield columns) and include headers on row 1.
- Drive webhook target URL is reachable from Google; HTTPS certificate and domain management are handled outside this repo.

## Optional Improvements (Do Not Implement Yet)
- Persist published product metadata in a dedicated tab to avoid refetching Shopify when reconciling past runs.
- Introduce structured debug logging toggled by environment to reduce noisy output in production.
- Add automated integration tests using a mock Shopify server and in-memory sheets to validate end-to-end behaviour.
