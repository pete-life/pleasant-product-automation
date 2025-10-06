# Pleasant Product Automation

Headless automation service that replaces a legacy n8n flow by orchestrating Google Sheets, Google Drive, OpenAI, and Shopify. The intended workflow is image-first: newly dropped assets trigger AI-generated merchandising copy, a human reviews and enriches the structured sheet, and finally approved rows are published to Shopify with variants, inventory, metafields, and images.

## Highlights
- Fastify server deployed on Google Cloud Run (Node 20).
- Google Service Account JWT for Sheets, Drive, and Change Notifications.
- Deterministic image ordering with post-upload archival to Drive.
- AI-powered copy generation (OpenAI Responses API) drafts copy and metafields as soon as new images appear, so humans only review and enrich structured fields before approval.
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
- **Google**: project id, sheet id, source folder id, archive folder id. (When running on Cloud Run the service account key is provided automatically; local runs can still supply `GOOGLE_CLIENT_EMAIL` + `GOOGLE_PRIVATE_KEY` if needed.)
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
- `POST /tasks/stage-drafts`
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

## Workflow Overview
1. **Image ingest** – Designers drop product imagery into the shared Drive "New Products" folder.
2. **AI staging** – The service groups assets, generates copy/metafields with OpenAI, and writes draft content plus image IDs into the `Products` tab while leaving `Status=PENDING`.
3. **Human review** – Merchandisers edit the row (sizes, inventory, tags, compliance fields) and flip `Status` to `APPROVED` once satisfied.
4. **Shopify publish** – Approved rows are picked up, pushed to Shopify with variants, inventory, metafields, and images, and the sheet is updated with the resulting product IDs and timestamps.

## Observability
- Success and progress messages append to the `Logs` tab with timestamps, actions, and product keys.
- Failures append to the `Errors` tab with diagnostic hints and payload snippets.
- Drive webhook notifications are logged and immediately trigger a background reconciliation run.

## Google Sheet Structure
- **Products tab** (`Products`): row 1 must contain the columns listed in the testing checklist. Image ingestion triggers an automated draft of title, description, meta description, tags, and Shopify metafields. Humans adjust inventory and structured attributes, then change `Status` to `APPROVED`. The `Sizes` column is optional—if omitted, it is derived from the stock columns.
- **Logs tab** (`Logs`): headers `Timestamp,Action,ProductKey,Message`; populated automatically.
- **Errors tab** (`Errors`): headers `Timestamp,ProductKey,Step,Message,Hint,PayloadSnippet`; rows appear only when processing fails.
- **Config tab** (`Config`): headers `Key,Value`; used internally to store Google Drive watch tokens—leave subsequent rows empty.

## Testing Checklist

- Drop images for a sample product into the Drive inbox and confirm the app seeds the `Products` tab with AI-generated copy while leaving `Status=PENDING`.
- Merchandiser reviews the draft row, fills per-size stock counts, and flips `Status` to `APPROVED` (keeping `ShopifyProductId` empty).
- Required `Products` headers (row 1): `BatchID,Status,RowID,ShopifyProductId,ProductKey,SKU,Title,Description,MetaDescription,Tags,Style,Category,Color,Pattern,Vendor,Price,Stock: One-size,Stock: XS,Stock: S,Stock: M,Stock: L,Stock: XL,MainImageId,CloseImageId,ModelImageId,Model2ImageId,MetafieldFabric,MetafieldColor,MetafieldPattern,MetafieldTargetGender,MetafieldAgeGroup,MetafieldSleeveLength,MetafieldClothingFeature,GPCCode,GPCAttributes,GoogleProductCategory,StructuredData,CreatedAt,GPCDescription,GPCSegment,GPCSegmentName,GPCFamily,GPCFamilyName,GPCClass,GPCClassName,GPCBrick,GPCBrickName`
- Run `POST /tasks/process-approved` locally or via Cloud Run; confirm Shopify products, variants, images, and metafields exist.
- Verify the Sheet row now includes `ShopifyProductId`, refreshed copy, updated timestamps, and `Status=COMPLETE`.
- Confirm images are moved into the `Archive` folder.
- Check `Logs` and `Errors` tabs for expected entries.

## Assumptions
- OpenAI model `gpt-5` is acceptable for production copy generation.
- Sheet columns match the documented names (e.g., `MetafieldFabric`, `GPCCode`, `Stock: XS`) and include headers on row 1.
- Drive webhook target URL is reachable from Google; HTTPS certificate and domain management are handled outside this repo.

## Optional Improvements (Do Not Implement Yet)
- Persist published product metadata in a dedicated tab to avoid refetching Shopify when reconciling past runs.
- Introduce structured debug logging toggled by environment to reduce noisy output in production.
- Add automated integration tests using a mock Shopify server and in-memory sheets to validate end-to-end behaviour.
