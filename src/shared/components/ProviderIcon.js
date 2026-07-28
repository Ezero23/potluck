"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import {
  ANTHROPIC_COMPATIBLE_PREFIX,
  OPENAI_COMPATIBLE_PREFIX,
} from "@/shared/constants/providers";

const PROVIDER_ICON_ALIASES = {
  "qoder-cn": "qoder",
};

const PROVIDERS_WITHOUT_ICON_ASSETS = new Set([
  "gitlab",
  "mmf",
  "venice",
  "vercel-ai-gateway",
]);

function resolveProviderIconSrc(src) {
  if (!src) return null;

  const match = src.match(/^\/providers\/([^/]+)\.png$/);
  if (!match) return src;

  const providerId = match[1];
  if (PROVIDERS_WITHOUT_ICON_ASSETS.has(providerId)) return null;

  let assetId = PROVIDER_ICON_ALIASES[providerId] || providerId;
  if (providerId.startsWith(OPENAI_COMPATIBLE_PREFIX)) {
    assetId = providerId.startsWith(`${OPENAI_COMPATIBLE_PREFIX}responses-`)
      ? "oai-r"
      : "oai-cc";
  } else if (providerId.startsWith(ANTHROPIC_COMPATIBLE_PREFIX)) {
    assetId = "anthropic-m";
  }

  return `/providers/${assetId}.png`;
}

export default function ProviderIcon({
  src,
  alt,
  size = 32,
  className = "",
  fallbackText = "?",
  fallbackColor,
}) {
  const [errored, setErrored] = useState(false);
  const resolvedSrc = resolveProviderIconSrc(src);

  if (!resolvedSrc || errored) {
    return (
      <span
        className={`inline-flex items-center justify-center font-bold rounded-lg ${className}`.trim()}
        style={{
          width: size,
          height: size,
          color: fallbackColor,
          fontSize: Math.max(10, Math.floor(size * 0.38)),
        }}
      >
        {fallbackText}
      </span>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      width={size}
      height={size}
      className={className}
      onError={() => setErrored(true)}
    />
  );
}

ProviderIcon.propTypes = {
  src: PropTypes.string,
  alt: PropTypes.string,
  size: PropTypes.number,
  className: PropTypes.string,
  fallbackText: PropTypes.string,
  fallbackColor: PropTypes.string,
};
