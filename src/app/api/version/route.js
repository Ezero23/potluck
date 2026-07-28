import pkg from "../../../../package.json" with { type: "json" };

const LATEST_RELEASE_API = "https://api.github.com/repos/Ezero23/potluck/releases/latest";
const RELEASES_URL = "https://github.com/Ezero23/potluck/releases";

function normalizeVersion(tag) {
  const match = String(tag || "").trim().match(/^v?(\d+\.\d+\.\d+)$/);
  return match?.[1] || null;
}

export function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

async function fetchLatestRelease() {
  try {
    const response = await fetch(LATEST_RELEASE_API, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Potluck-Version-Check",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;

    const release = await response.json();
    const version = normalizeVersion(release.tag_name);
    if (!version) return null;

    return {
      version,
      releaseUrl: release.html_url || RELEASES_URL,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const currentVersion = pkg.version;
  const latestRelease = await fetchLatestRelease();
  const latestVersion = latestRelease?.version || null;
  const hasUpdate = latestVersion
    ? compareVersions(latestVersion, currentVersion) > 0
    : false;

  return Response.json({
    currentVersion,
    latestVersion,
    hasUpdate,
    releaseUrl: latestRelease?.releaseUrl || RELEASES_URL,
  });
}
