# Project gotchas

- Do not include 9Remote promotional UI or links in Potluck. It belongs to a different product.
- Displayed Potluck versions must come from the canonical package version and be updated as part of a release, never hard-coded in a component.
- Potluck follows the `0.1.x` product version line; the current release version is `0.1.10`. Never infer the next product version from stale package metadata or existing Git tags—confirm the intended release line first.
