"use client";

import { JURISDICTION_RULES } from "@/lib/compliance/jurisdictions";

export function JurisdictionSelect({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (code: string) => void;
}) {
  return (
    <label className="field">
      <span>Listing location</span>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {JURISDICTION_RULES.map((rule) => (
          <option key={rule.code} value={rule.code}>
            {rule.name}
          </option>
        ))}
      </select>
    </label>
  );
}
