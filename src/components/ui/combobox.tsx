"use client";

import * as React from "react";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ComboboxOption = {
  value: string;
  label: string;
  hint?: string;
};

/**
 * Searchable dropdown. Filters options by typed query against label + hint.
 * `clearable` shows an X to reset to empty.
 *
 * When `creatable` is set, a name that isn't in the list can be typed and
 * used as-is: the dropdown shows a "Use …" row that selects the raw text as
 * the value. The current value is shown even if it isn't one of `options`.
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Select…",
  emptyMessage = "No matches",
  disabled,
  clearable = true,
  creatable = false,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  clearable?: boolean;
  creatable?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const selected = options.find((o) => o.value === value);
  // In creatable mode the value can be free text not present in `options` —
  // show the value itself so the typed name stays visible.
  const displayLabel = selected ? selected.label : value;

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const hay = `${o.label} ${o.hint ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [options, query]);

  const trimmedQuery = query.trim();
  const showCreate =
    creatable &&
    trimmedQuery.length > 0 &&
    !options.some((o) => o.label.toLowerCase() === trimmedQuery.toLowerCase());

  React.useEffect(() => {
    if (!open) return;
    function close(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    }
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", key);
    };
  }, [open]);

  function handleOpen() {
    if (disabled) return;
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function pick(val: string) {
    onChange(val);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex h-10 min-h-[44px] md:min-h-0 w-full items-center justify-between gap-2 rounded-md border border-border bg-white px-3 py-2 text-sm text-left touch-manipulation",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-berry/30 focus-visible:border-berry",
          "disabled:cursor-not-allowed disabled:bg-cream disabled:text-inkSoft",
          !displayLabel && "text-inkSoft/60",
        )}
      >
        <span className="truncate">{displayLabel || placeholder}</span>
        <span className="flex items-center gap-1 text-inkSoft">
          {clearable && displayLabel && !disabled ? (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="p-0.5 rounded hover:bg-cream"
              aria-label="Clear"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          ) : null}
          <ChevronDown className="w-4 h-4" />
        </span>
      </button>

      {open ? (
        <div
          className="absolute z-30 mt-1 w-full bg-white border border-border rounded-md shadow-card max-h-72 flex flex-col overflow-hidden"
          role="listbox"
        >
          <div className="p-2 border-b border-border">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-full h-9 px-2 text-sm rounded-md border border-border focus:outline-none focus:ring-2 focus:ring-berry/30 focus:border-berry"
            />
          </div>
          <div className="overflow-y-auto py-1">
            {showCreate ? (
              <button
                type="button"
                onClick={() => pick(trimmedQuery)}
                className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-cream text-berry"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span className="min-w-0 truncate">
                  Use “<span className="font-semibold">{trimmedQuery}</span>”
                </span>
              </button>
            ) : null}
            {filtered.length === 0 && !showCreate ? (
              <div className="px-3 py-2 text-sm text-inkSoft">{emptyMessage}</div>
            ) : (
              filtered.map((o) => {
                const isSel = o.value === value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => pick(o.value)}
                    role="option"
                    aria-selected={isSel}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 hover:bg-cream",
                      isSel && "bg-berryBg/50 text-berry",
                    )}
                  >
                    <span className="min-w-0 truncate">
                      <span className="truncate">{o.label}</span>
                      {o.hint ? (
                        <span className="ml-2 text-xs text-inkSoft">{o.hint}</span>
                      ) : null}
                    </span>
                    {isSel ? <Check className="w-4 h-4 shrink-0" /> : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
