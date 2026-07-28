const REPOSITORY = "Ezero23/potluck";
const RELEASE_API_URL = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;

function compareVersions(a, b) {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);

  for (let i = 0; i < 3; i++) {
    if (partsA[i] > partsB[i]) return 1;
    if (partsA[i] < partsB[i]) return -1;
  }

  return 0;
}

function getAvailableCliRelease(release, currentVersion) {
  if (!release || release.draft || release.prerelease) return null;

  const version = String(release.tag_name || "").replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+$/.test(version)) return null;
  if (compareVersions(version, currentVersion) <= 0) return null;

  const assetName = `potluck-cli-${version}.tgz`;
  const asset = (release.assets || []).find(
    (candidate) =>
      candidate.name === assetName &&
      typeof candidate.browser_download_url === "string",
  );

  if (!asset) return null;

  return {
    version,
    downloadUrl: asset.browser_download_url,
  };
}

function getCliInstallCommand(version) {
  const assetUrl =
    `https://github.com/${REPOSITORY}/releases/download/` +
    `v${version}/potluck-cli-${version}.tgz`;

  return `npm install -g ${assetUrl}`;
}

module.exports = {
  RELEASE_API_URL,
  compareVersions,
  getAvailableCliRelease,
  getCliInstallCommand,
};
