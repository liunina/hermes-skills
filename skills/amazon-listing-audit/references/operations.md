# Amazon Listing Audit v2 Operations

## Release Checklist

1. Run the local contract suite:

   ```bash
   node scripts/test_amazon_listing_audit_v2.mjs
   ```

2. Preview generated workflow JSON without changing n8n:

   ```bash
   node scripts/provision_amazon_listing_audit_v2.mjs
   ```

3. Apply and publish after review:

   ```bash
   node scripts/provision_amazon_listing_audit_v2.mjs --apply --publish
   ```

4. Re-read all seven workflows, verify connections, and confirm they are active. The provisioning script performs these checks.
5. Run one real `/workflow listing <ASIN>` test and require all of:
   - run `status: success`
   - `visualStatus: success` or an explicitly accepted degraded state
   - `publishStatus: success`
   - `notifyStatus: success` for Mattermost tests
   - HTTP 200 and an HTML doctype from `htmlReportUrl`
6. Check desktop and 375px mobile layouts for horizontal overflow, image loading, title containment, and control overlap.

The scripts require `N8N_API_KEY` in the environment. Authenticated webhook smoke tests additionally require `AMAZON_LISTING_AUDIT_WEBHOOK_KEY`. Never echo either value.

## Normal Operation

- Use `/workflow listing <ASIN or URL>` for interactive starts.
- Use `/workflow listing查询 <runId>` for status and errors.
- Use `/workflow listing报告 <runId>` for the latest available report link.
- Use Data Table `amazon_listing_audit_runs` as the business source of truth. A green n8n execution can still contain a `partial` business result.
- Prefer `cacheMode: prefer_cache`. Use `refresh` only for an intentional refetch, `cache_only` for zero-live-call diagnostics, and `bypass` for live diagnostics that must not read or write caches.

## Failure Triage

| Symptom | First check | Expected action |
|---|---|---|
| Start returns 400 | `validationErrors` | Correct ASIN, marketplace, or Amazon host |
| Start returns 401 | Header Auth credential | Confirm the client sends the configured header; do not inspect or paste its value |
| Stuck in `queued` | Start and Worker executions | Confirm asynchronous Execute Workflow dispatch and worker activation |
| Listing fetch fails | Fetch workflow and Listing cache state | Check Decodo credential/upstream; allow bounded stale fallback when available |
| Visual status fails/partial | Gemini subworkflow and image cache | Keep audit evidence-bounded; do not infer failed images |
| Audit JSON invalid | OpenAI node and compact retry | Inspect validation errors and prompt/schema versions; do not repeat Decodo/Gemini |
| `publishStatus: failed` with HTTP 200 | Publisher verification response shape | HTTP Request 4.2 returns text in `data`; verifier supports both `body` and `data` |
| Gateway returns 400 | `key` query | Only the two allowlisted HTML key shapes are valid |
| Gateway returns 404 | MinIO object and S3 credential | Confirm the HTML object exists in `amazon-reports` |
| Mattermost notification fails | Notification component and channel ID | Confirm component credential and HTTPS callback handling without logging callback URLs |

## MinIO And Gateway Security

- Keep `amazon-reports` private. Do not grant anonymous bucket write or broad anonymous read.
- n8n accesses MinIO with the `MinIO S3 - Amazon Reports` credential.
- The report gateway exposes only allowlisted HTML objects and returns JSON errors for invalid/unavailable keys.
- Report HTML escapes untrusted Listing and AI text before rendering.
- Product images are loaded from allowlisted HTTPS Amazon media URLs. Their availability remains dependent on the upstream host.
- n8n may replace the custom `Content-Security-Policy` response header with its own sandbox CSP. Do not claim the custom header is authoritative; verify the effective response headers after n8n upgrades.
- The gateway URL is shareable access to one HTML report, not user authentication. Do not render secrets, internal tokens, private callback URLs, or customer PII.

## Credentials

All third-party credentials belong in n8n Credentials. The workflow JSON may contain credential IDs and labels, never values.

Rotate any credential that was previously pasted into chat or stored in a node text field. The current follow-up set includes old Wiki.js, Mattermost, and MinIO administrator credentials. Prefer a scoped MinIO service account over an administrator account for n8n, limited to the required bucket/prefix and object operations.

After rotation:

1. Update only the corresponding n8n credential.
2. Run a cache-backed audit first.
3. Confirm HTML publish, gateway retrieval, and Mattermost notification.
4. Revoke the old credential.

## Legacy And Rollback

The original `AmzonListingAdapt` record (`YKKggk6QZLyI2dk9`) is retired. Its sanitized recovery snapshot is disabled and soft-archived as `6gwIlusLe2WDyVGR`. Archiving is reversible, but do not reactivate it while the v2 Mattermost routes point to the new Start/Query workflows.

For rollback, restore a reviewed workflow version or redeploy from `scripts/provision_amazon_listing_audit_v2.mjs`; do not recover plaintext credentials from legacy workflow history.
