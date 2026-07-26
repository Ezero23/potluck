# Local Deployment

Use this path for development, evaluation, and personal use on one computer.
This page covers a source checkout. For the packaged desktop command, install
`potluck-cli` as described in the project README.

---

## Install

Requirements:

- Node.js 22
- npm
- Git

```bash
git clone https://github.com/Ezero23/potluck.git
cd potluck
cp .env.example .env
npm ci
```

---

## Start development mode

```bash
npm run dev
```

Open the dashboard manually:

```text
http://localhost:21023/dashboard
```

Client base URL:

```text
http://localhost:21023/v1
```

Health check:

```bash
curl http://localhost:21023/api/health
```

Expected response:

```json
{"ok":true}
```

The development script explicitly uses the project default port `21023`.

---

## Configure a provider and client

1. Sign in with the initial password `123456`, unless `INITIAL_PASSWORD` was
   set before the first start.
2. Change the password from the application settings.
3. Open **Dashboard → Providers**, add a connection, and run its test.
4. Open **Dashboard → Endpoint** to create a Potluck key if endpoint API-key
   enforcement is enabled.
5. Configure a compatible client with the local `/v1` base URL and an available
   model or combo name.

Provider access, quota, and billing remain the provider's responsibility.

---

## Stop and restart

Press `Ctrl+C` in the terminal running `npm run dev`. Start it again with the
same command.

Application data remains in `DATA_DIR`; stopping the server does not remove it.

---

## Data and backups

When `DATA_DIR` is unset:

- macOS/Linux: `~/.potluck`
- Windows: `%APPDATA%\potluck`

Current storage:

```text
${DATA_DIR}/
└── db/
    ├── data.sqlite
    └── backups/
```

Legacy JSON files may remain after an upgrade because they are retained as
migration inputs. They are not the active database.

Before upgrading, stop Potluck and back up the complete `DATA_DIR`.

---

## Update the source checkout

Review the release notes and back up `DATA_DIR` first. Then:

```bash
git pull --ff-only
npm ci
npm run build
```

Run `npm run dev` again after the build succeeds.

---

## Troubleshooting

### Port `21023` is occupied

On macOS or Linux:

```bash
lsof -i :21023
```

Stop the owning process gracefully. Avoid `kill -9` unless normal termination
has already failed.

### Data directory is not writable

Check the directory selected by `DATA_DIR`. On macOS or Linux:

```bash
ls -ld "$HOME/.potluck"
```

Do not make credential-containing data world-readable.

### A client cannot connect

- Confirm `curl http://localhost:21023/api/health` succeeds.
- Confirm the client base URL ends in `/v1` where required.
- Confirm the model ID is returned by this Potluck instance.
- If endpoint-key enforcement is enabled, supply an active Potluck endpoint
  key.

---

## Next steps

- [Connect subscription providers](../providers/subscription.md)
- [Create combos](../features/combos.md)
- [Connect a compatible client](../integration/other-tools.md)
