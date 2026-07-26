"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildEndpointOptions } from "./cliEndpointOptions";

const STORAGE_KEY = "potluck.cliToolEndpointPresets";
const CUSTOM_VALUE = "__custom__";
const SAVE_VALUE = "__save__";

const readSavedPresets = () => {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((p) => p?.name && p?.baseUrl);
  } catch {
    return [];
  }
};

const writeSavedPresets = (presets) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
};

export default function BaseUrlSelect({
  value,
  onChange,
  requiresExternalUrl = false,
  tunnelEnabled = false,
  tunnelPublicUrl = "",
  tailscaleEnabled = false,
  tailscaleUrl = "",
  cloudEnabled = false,
  cloudUrl = "",
  withV1 = true,
}) {
  const [localBaseUrl] = useState(() =>
    typeof window === "undefined" ? "" : window.location.origin
  );
  const [savedPresets, setSavedPresets] = useState(readSavedPresets);

  const options = useMemo(() => {
    const endpointOptions = buildEndpointOptions({
      localBaseUrl: localBaseUrl || "",
      requiresExternalUrl,
      tunnelEnabled,
      tunnelPublicUrl,
      tailscaleEnabled,
      tailscaleUrl,
      cloudEnabled,
      cloudUrl,
      savedPresets,
      withV1,
    });
    endpointOptions.push({ value: CUSTOM_VALUE, label: "Custom URL...", url: "" });
    return endpointOptions;
  }, [
    localBaseUrl,
    requiresExternalUrl,
    tunnelEnabled,
    tunnelPublicUrl,
    tailscaleEnabled,
    tailscaleUrl,
    cloudEnabled,
    cloudUrl,
    savedPresets,
    withV1,
  ]);

  const initialOption = options.find((option) => option.value !== CUSTOM_VALUE);
  const [mode, setMode] = useState(initialOption?.value || CUSTOM_VALUE);
  const [customInput, setCustomInput] = useState("");
  const initialUrlRef = useRef(initialOption?.url || "");
  const onChangeRef = useRef(onChange);

  // Synchronize the parent card with the endpoint shown as selected.
  useEffect(() => {
    if (initialUrlRef.current) onChangeRef.current(initialUrlRef.current);
  }, []);

  const handleSelect = (e) => {
    const next = e.target.value;
    if (next === SAVE_VALUE) {
      const trimmed = (value || "").trim();
      if (!trimmed) return;
      let defaultName = trimmed;
      try { defaultName = new URL(trimmed).host; } catch {}
      const name = window.prompt("Save endpoint as:", defaultName);
      if (!name?.trim()) return;
      const updated = [...savedPresets.filter((p) => p.name !== name.trim()), { name: name.trim(), baseUrl: trimmed }]
        .sort((a, b) => a.name.localeCompare(b.name));
      setSavedPresets(updated);
      writeSavedPresets(updated);
      return;
    }
    setMode(next);
    if (next === CUSTOM_VALUE) {
      setCustomInput("");
      onChange("");
      return;
    }
    const opt = options.find((o) => o.value === next);
    if (opt) onChange(opt.url);
  };

  const handleCustomInput = (e) => {
    const v = e.target.value;
    setCustomInput(v);
    onChange(v);
  };

  const handleDeleteSaved = () => {
    if (!mode.startsWith("saved:")) return;
    const name = mode.slice(6);
    const updated = savedPresets.filter((p) => p.name !== name);
    setSavedPresets(updated);
    writeSavedPresets(updated);
    setMode(CUSTOM_VALUE);
    setCustomInput("");
    onChange("");
  };

  const isSaved = mode.startsWith("saved:");
  const isCustom = mode === CUSTOM_VALUE;
  const canSave = isCustom && (customInput || "").trim().length > 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <select
          value={mode}
          onChange={handleSelect}
          className="flex-1 min-w-0 px-2 py-2 bg-surface rounded text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary/50 sm:py-1.5"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
          {canSave && <option value={SAVE_VALUE}>+ Save current as...</option>}
        </select>
        {isSaved && (
          <button type="button" onClick={handleDeleteSaved} className="p-1 text-text-muted hover:text-red-500 rounded transition-colors shrink-0" title="Delete saved endpoint">
            <span className="material-symbols-outlined text-[14px]">delete</span>
          </button>
        )}
      </div>
      {isCustom && (
        <input
          type="text"
          value={customInput}
          onChange={handleCustomInput}
          placeholder={withV1 ? "https://example.com/v1" : "https://example.com"}
          className="w-full min-w-0 px-2 py-2 bg-surface rounded border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 sm:py-1.5"
        />
      )}
    </div>
  );
}
