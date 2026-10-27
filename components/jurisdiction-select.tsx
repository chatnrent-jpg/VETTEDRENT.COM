"use client";

import { MARYLAND_JURISDICTION_RULES, resolveJurisdiction } from "@/lib/compliance/jurisdictions";

export function JurisdictionSelect({
  value,
  disabled,
  onChange,
  label = "Location",
}: {
  value: string;
  disabled?: boolean;
  onChange: (code: string) => void;
  label?: string;
}) {
  // An older record may still carry a non-Maryland code. Show it so the field
  // is truthful, but only Maryland can be chosen from here.
  const legacy = MARYLAND_JURISDICTION_RULES.some((rule) => rule.code === value)
    ? null
    : resolveJurisdiction(value);
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {legacy ? (
          <option value={legacy.code} disabled>
            {legacy.name} (no longer offered)
          </option>
        ) : null}
        {MARYLAND_JURISDICTION_RULES.map((rule) => (
          <option key={rule.code} value={rule.code}>
            {rule.name}
          </option>
        ))}
      </select>
    </label>
  );
}
