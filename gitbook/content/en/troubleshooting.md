# Troubleshooting

Start with the original response, process output, and sanitized logs. Avoid changing
several settings at once: first prove whether the failure is in Potluck, authentication,
routing, or the selected provider.

## Collect the basics

Record:

- the Potluck version and installation method;
- the exact endpoint path and HTTP status;
- the selected model identifier;
- whether the same model passes its Dashboard connection test;
- the relevant server log lines with credentials and prompt content removed.

Verify the local service first:

```bash
curl --fail --show-error http://localhost:21023/api/health
```

Expected response:

```json
{"ok":true}
```

For Docker:

```bash
docker ps --filter name=potluck
docker logs --tail 100 potluck
```

For a source checkout, inspect the terminal running `npm run dev` or `npm start`.

## Connection refused

`ECONNREFUSED` means no process accepted the connection at that host and port. It is
not a provider or API-key error.

1. Start Potluck:

   ```bash
   npm run dev
   ```

2. Confirm the default port is listening:

   ```bash
   lsof -nP -iTCP:21023 -sTCP:LISTEN
   ```

   On Windows:

   ```powershell
   netstat -ano | findstr :21023
   ```

3. Use the same configured port everywhere:

   ```text
   Dashboard: http://localhost:21023/dashboard
   API base:  http://localhost:21023/v1
   ```

4. If the client runs in a container, VM, remote workspace, or vendor-hosted service,
   its `localhost` is not necessarily the Potluck machine. Use an address reachable
   from that runtime and protect it with HTTPS, login, and endpoint API-key enforcement.

Do not expose the Potluck application port publicly just to work around a connection
problem. Prefer a trusted HTTPS reverse proxy or a configured tunnel.

## Dashboard does not open

Request `/api/health` before clearing browser data. If health fails, inspect the server
logs. If health succeeds but the dashboard does not:

- open `http://localhost:21023/dashboard` directly;
- confirm the browser is not forcing an unrelated proxy or HTTPS upgrade;
- try a private window to rule out stale cookies;
- confirm the dashboard password is correct.

When no password hash or `INITIAL_PASSWORD` exists, the first local password is
`123456`. Change it before allowing access from another machine.

## HTTP 401 or 403

Potluck has two different credential boundaries:

- the dashboard login protects administration pages and local APIs;
- a Potluck endpoint key protects compatible `/v1` client requests when enforcement is
  enabled in **Dashboard → Endpoint**.

Do not send an upstream provider credential as the Potluck endpoint key. Configure the
client with an active key created by this Potluck instance:

```http
Authorization: Bearer YOUR_POTLUCK_KEY
```

If the provider itself returns 401 or 403, reconnect that provider or replace its
credential, then run its Dashboard connection test.

## Model not found

Do not copy model identifiers from screenshots or old documentation. Query the running
instance:

```bash
curl http://localhost:21023/v1/models \
  -H "Authorization: Bearer YOUR_POTLUCK_KEY"
```

Use an identifier returned by the response. A routing profile such as
`profile:PROFILE_NAME` works only after that profile has been configured. If a listed
model still fails, verify its provider connection, account region, quota, and supported
request type.

## OAuth expired or provider authentication failed

Token refresh support varies by provider and can fail after a session is revoked.

1. Open **Dashboard → Providers**.
2. Run the connection test and preserve its original error.
3. Reconnect the provider if the credential or session has expired.
4. Confirm the account and region match the selected provider entry.
5. Check outbound proxy settings and the provider's current service status.

Never post refresh tokens, cookies, API keys, authorization URLs containing secrets, or
the Potluck data directory in an issue.

## Rate limits or quota exhaustion

Quota fields are available only for integrations that implement a provider usage
lookup. A Dashboard quota value can also lag behind the provider.

- check the provider's own billing and quota page;
- reduce concurrency;
- wait for the provider's reset;
- test another connection independently;
- configure a combo or routing profile only after every member works on its own.

Fallback is best effort. It does not create quota and cannot recover when every
candidate is unavailable or the error is not configured as retryable.

## Slow or delayed streaming

First compare one direct provider/model request with the combo or profile request.
Then check:

- provider latency and status;
- outbound proxy latency;
- prompt and response size;
- client timeout settings;
- whether the reverse proxy buffers streaming responses.

For Nginx, the active location should include:

```nginx
proxy_buffering off;
proxy_read_timeout 86400;
```

Use the provider's hostname and an HTTP request for network diagnostics; ICMP `ping`
may be blocked even when HTTPS works.

## Unexpected usage or cost

Dashboard cost is an estimate, not a provider invoice. Compare it with the provider's
current billing page and pricing. Model prices, subscriptions, promotions, and free
allowances change over time.

- review Usage and request details;
- confirm which source a combo or profile selected;
- disable request-body logging unless it is needed;
- configure spending limits and alerts with the provider;
- rotate any credential that may have been exposed.

Potluck does not provide universal budget enforcement.

## Docker, Nginx, or data-directory failures

For an Nginx 502:

```bash
docker ps --filter name=potluck
docker logs --tail 100 potluck
curl http://127.0.0.1:21023/api/health
sudo nginx -t
```

For data errors, verify the configured `DATA_DIR` exists, is writable by the Potluck
process, and is not world-readable. Do not delete or replace `data.sqlite` while the
service is running. Back up the complete data directory before upgrades or migrations.

## Need more help?

- [FAQ](./faq.md)
- [Installation](./getting-started/installation.md)
- [GitHub Issues](https://github.com/Ezero23/potluck/issues)

Include the version, installation method, endpoint, status code, reproduction steps,
and sanitized logs. Remove credentials, tokens, cookies, prompts, responses, and
personal data before posting.
