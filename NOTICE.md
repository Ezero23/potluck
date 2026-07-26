# Potluck project notice

This file records the project's known lineage and acknowledgments. It complements the
MIT license in `LICENSE`; it does not replace or modify that license.

## Direct code base

### 9router

- Project: https://github.com/decolua/9router
- Relationship: Potluck started from a 9router code baseline and continues to use
  substantial parts of its provider integrations, protocol translation, OAuth,
  dashboard, quota, persistence, and routing foundation.
- License: MIT.
- Required notice: `Copyright (c) 2024-2026 decolua and contributors`, preserved in
  `LICENSE`.

Potluck's repository history begins with a flattened baseline and therefore does not
contain the complete upstream commit history. The missing Git ancestry does not change
the origin or license of the inherited code.

Potluck-specific work after that baseline includes rotation-first scheduling,
same-model source aggregation, concurrency-aware source selection, routing-pool
inspection, Potluck-specific data paths and ports, and subsequent deployment, security,
translation, and observability fixes.

## Related project

### OmniRoute

- Project: https://github.com/diegosouzapw/OmniRoute
- Relationship: a separate project also derived from 9router.

OmniRoute is not a fork of Potluck and Potluck is not presented as its upstream. It is
acknowledged as a related project and as a reference for testing, documentation,
security, release engineering, and product design. This notice does not claim that
OmniRoute endorses Potluck.

## Earlier projects and feature influences

### CLIProxyAPI

- Project: https://github.com/router-for-me/CLIProxyAPI
- Relationship: the Go project credited by 9router as an inspiration for its JavaScript
  implementation. Potluck inherits that lineage through its 9router code base.

### RTK

- Project: https://github.com/rtk-ai/rtk
- Relationship: inspiration for tool-output detection and compression behavior present
  in the inherited code and adapted by Potluck.

Potluck does not claim fixed token savings. Results depend on the request content,
enabled filters, model tokenizer, and configuration.

### Headroom

- Project: https://github.com/chopratejas/headroom
- Relationship: optional external compression service supported through its HTTP
  interface. Headroom is not bundled as Potluck-owned code.

### Caveman

- Project: https://github.com/JuliusBrussee/caveman
- Author: Julius Brussee
- Relationship: inspiration for an optional terse-output prompting mode inherited and
  adapted by Potluck.

### Ponytail

- Project: https://github.com/DietrichGebert/ponytail
- Author: Dietrich Gebert
- Relationship: inspiration for an optional YAGNI-oriented prompting mode inherited
  and adapted by Potluck.

## Trademarks and third-party services

Names such as Anthropic, Claude, OpenAI, Codex, Google, Gemini, GitHub, Copilot, Cursor,
Kiro, and other provider or client names belong to their respective owners. References
in Potluck describe interoperability and do not imply affiliation, sponsorship, or
endorsement.

Third-party model availability, pricing, quotas, authentication, and terms are
controlled by those third parties. Potluck cannot guarantee free, unlimited, or
permanent access to any external service.

## Contributions

Potluck contributors retain copyright in their original contributions under the
project's MIT license. When code is adapted from another project, contributors should
record the source project and commit in the change description and preserve all notices
required by that project's license.
