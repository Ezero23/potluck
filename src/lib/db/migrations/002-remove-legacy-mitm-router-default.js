import { parseJson, stringifyJson } from "../helpers/jsonCol.js";

const LEGACY_MITM_ROUTER_BASE_URL = "http://localhost:20128";

export function removeLegacyMitmRouterDefault(settings) {
  if (
    !settings ||
    typeof settings !== "object" ||
    Array.isArray(settings) ||
    settings.mitmRouterBaseUrl !== LEGACY_MITM_ROUTER_BASE_URL
  ) {
    return settings;
  }

  const next = { ...settings };
  delete next.mitmRouterBaseUrl;
  return next;
}

const removeLegacyMitmRouterDefaultMigration = {
  version: 2,
  name: "remove-legacy-mitm-router-default",
  up(db) {
    const row = db.get(`SELECT data FROM settings WHERE id = 1`);
    if (!row) return;

    const settings = parseJson(row.data, {});
    const next = removeLegacyMitmRouterDefault(settings);
    if (next === settings) return;

    db.run(`UPDATE settings SET data = ? WHERE id = 1`, [
      stringifyJson(next),
    ]);
  },
};

export default removeLegacyMitmRouterDefaultMigration;
