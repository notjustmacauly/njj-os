"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Input } from "./input";
import { Select } from "./select";
import { DateInput } from "./date-input";

export function UrlSearch({
  paramKey = "q",
  placeholder = "Search…",
  className,
}: {
  paramKey?: string;
  placeholder?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const initial = params.get(paramKey) ?? "";
  const [value, setValue] = React.useState(initial);

  React.useEffect(() => {
    setValue(initial);
  }, [initial]);

  React.useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(paramKey, value);
      else next.delete(paramKey);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder={placeholder}
      className={className}
    />
  );
}

export function UrlSelect({
  paramKey,
  options,
  className,
  ariaLabel,
}: {
  paramKey: string;
  options: { value: string; label: string }[];
  className?: string;
  ariaLabel?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get(paramKey) ?? "";

  return (
    <Select
      aria-label={ariaLabel}
      value={current}
      onChange={(e) => {
        const next = new URLSearchParams(params.toString());
        if (e.target.value) next.set(paramKey, e.target.value);
        else next.delete(paramKey);
        const qs = next.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname);
      }}
      className={className}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

export function UrlDateRange({
  fromKey = "from",
  toKey = "to",
  fromDefault,
  toDefault,
}: {
  fromKey?: string;
  toKey?: string;
  fromDefault?: string;
  toDefault?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const fromVal = params.get(fromKey) ?? fromDefault ?? "";
  const toVal = params.get(toKey) ?? toDefault ?? "";

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex items-center gap-1">
      <DateInput
        value={fromVal}
        onChange={(e) => setParam(fromKey, e.target.value)}
        aria-label="From date"
        className="h-9 text-xs"
      />
      <span className="text-inkSoft text-sm">→</span>
      <DateInput
        value={toVal}
        onChange={(e) => setParam(toKey, e.target.value)}
        aria-label="To date"
        className="h-9 text-xs"
      />
    </div>
  );
}

export function UrlCheckbox({
  paramKey,
  label,
  trueValue = "1",
}: {
  paramKey: string;
  label: string;
  trueValue?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const checked = params.get(paramKey) === trueValue;

  return (
    <label className="inline-flex items-center gap-2 text-sm text-ink select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          if (e.target.checked) next.set(paramKey, trueValue);
          else next.delete(paramKey);
          const qs = next.toString();
          router.replace(qs ? `${pathname}?${qs}` : pathname);
        }}
        className="rounded border-border"
      />
      {label}
    </label>
  );
}
