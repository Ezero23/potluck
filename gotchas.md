# Project gotchas

- Do not include 9Remote promotional UI or links in Potluck. It belongs to a different product.
- Displayed Potluck versions must come from the canonical package version and be updated as part of a release, never hard-coded in a component.
- Potluck follows the `0.1.x` product version line; the current release version is `0.1.10`. Never infer the next product version from stale package metadata or existing Git tags—confirm the intended release line first.
- API-key connection names are display labels, not account identities. Creating a same-name key must add a separate connection; only an explicit connection ID may update an existing account.
- Provider summary cards represent every connection for that provider, including legacy and dual-auth records. Never filter a provider card to one auth type when the detail page shows more.
- Next.js treats `src/app/favicon.ico` as a special icon route that can override metadata. Replace it together with SVG and manifest assets whenever the product icon changes.
- Never group recurring quotas, regional/model-limited access, development trials, and expiring welcome credit under an unexplained “free tier” claim. Store verified restrictions once and surface them on both summary and detail pages.
- Tunnel reconnect E2E checks must carry the old PID and URL into the polling process and require both to change; a live-process check alone can pass before the killed process has exited.
- Potluck-to-Monitor account and tunnel state must refresh without depending on usage traffic. A Monitor opened after Potluck must receive a new snapshot automatically, including after an earlier delivery failure.
