"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Picking a brand colour without making somebody hunt in a system dialog.
 *
 * A row of sensible presets covers most brands in one click; the swatch opens
 * the full picker for anything else; and the hex box is there for the person
 * who has the brand guidelines open in another tab. All three edit the same
 * value, so none of them is the "real" one.
 */
export function ColorField({
  label,
  value,
  onChange,
  presets,
  hint,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  presets: string[];
  hint?: string;
}) {
  const nativeRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(value);

  // The hex box is free-typed, so it follows the value while somebody is
  // clicking swatches and only pushes upward once it reads as a colour.
  useEffect(() => setDraft(value), [value]);

  function commit(text: string) {
    setDraft(text);
    const candidate = text.startsWith("#") ? text : `#${text}`;
    if (/^#[0-9a-fA-F]{6}$/.test(candidate)) onChange(candidate.toLowerCase());
  }

  return (
    <div className="colorfield">
      <span className="colorfield__label">{label}</span>

      <div className="colorfield__row">
        <button
          type="button"
          className="colorfield__swatch"
          style={{ background: value }}
          onClick={() => nativeRef.current?.click()}
          aria-label={`${label}: open the colour picker`}
        />
        <input
          ref={nativeRef}
          type="color"
          className="colorfield__native"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          tabIndex={-1}
          aria-hidden
        />
        <input
          className="input colorfield__hex"
          value={draft}
          onChange={(event) => commit(event.target.value)}
          onBlur={() => setDraft(value)}
          spellCheck={false}
          aria-label={`${label} hex code`}
        />
      </div>

      <div className="colorfield__presets">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            className={`colorfield__preset${
              preset.toLowerCase() === value.toLowerCase() ? " colorfield__preset--on" : ""
            }`}
            style={{ background: preset }}
            onClick={() => onChange(preset)}
            aria-label={preset}
          />
        ))}
      </div>

      {hint && <span className="colorfield__hint">{hint}</span>}
    </div>
  );
}
