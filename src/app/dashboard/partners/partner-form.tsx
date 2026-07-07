"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";

export type PartnerTier = {
  code: string;
  name: string;
  price_pcl: number | string;
  price_acg: number | string;
  price_wpm: number | string;
};

export type PartnerRecord = {
  id: string;
  external_id: string | null;
  name: string;
  city: string | null;
  tier_code: string;
  delivery_fee: number | string | null;
  contact: string | null;
  email: string | null;
  address: string | null;
  registered_business_name: string | null;
  tin: string | null;
  price_pcl: number | string | null;
  price_acg: number | string | null;
  price_wpm: number | string | null;
  notes: string | null;
  pays_on_delivery: boolean | null;
};

type FormState = {
  name: string;
  city: string;
  tier_code: string;
  delivery_fee: string;
  contact: string;
  email: string;
  address: string;
  registered_business_name: string;
  tin: string;
  price_pcl: string;
  price_acg: string;
  price_wpm: string;
  notes: string;
  pays_on_delivery: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NUMERIC_KEYS = ["delivery_fee", "price_pcl", "price_acg", "price_wpm"] as const;

function fromRecord(p?: PartnerRecord, defaultTier?: string): FormState {
  return {
    name: p?.name ?? "",
    city: p?.city ?? "",
    tier_code: p?.tier_code ?? defaultTier ?? "",
    delivery_fee: p?.delivery_fee != null ? String(p.delivery_fee) : "0",
    contact: p?.contact ?? "",
    email: p?.email ?? "",
    address: p?.address ?? "",
    registered_business_name: p?.registered_business_name ?? "",
    tin: p?.tin ?? "",
    price_pcl: p?.price_pcl != null ? String(p.price_pcl) : "",
    price_acg: p?.price_acg != null ? String(p.price_acg) : "",
    price_wpm: p?.price_wpm != null ? String(p.price_wpm) : "",
    notes: p?.notes ?? "",
    pays_on_delivery: p?.pays_on_delivery ?? false,
  };
}

function toNumberOrNull(v: string): number | null {
  const trimmed = v.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function payloadFrom(form: FormState) {
  return {
    name: form.name.trim(),
    city: form.city.trim() || null,
    tier_code: form.tier_code,
    delivery_fee: toNumberOrNull(form.delivery_fee) ?? 0,
    contact: form.contact.trim() || null,
    email: form.email.trim() || null,
    address: form.address.trim() || null,
    registered_business_name: form.registered_business_name.trim() || null,
    tin: form.tin.trim() || null,
    price_pcl: toNumberOrNull(form.price_pcl),
    price_acg: toNumberOrNull(form.price_acg),
    price_wpm: toNumberOrNull(form.price_wpm),
    notes: form.notes.trim() || null,
    pays_on_delivery: form.pays_on_delivery,
  };
}

export function PartnerForm({
  tiers,
  partner,
  canEdit,
}: {
  tiers: PartnerTier[];
  partner?: PartnerRecord;
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const initial = React.useMemo(
    () => fromRecord(partner, tiers[0]?.code),
    [partner, tiers],
  );
  const [form, setForm] = React.useState<FormState>(initial);
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = React.useState(false);

  const tier = tiers.find((t) => t.code === form.tier_code);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validate(): boolean {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (form.name.trim().length < 2) e.name = "Name must be at least 2 characters";
    if (!form.tier_code) e.tier_code = "Pick a tier";
    if (form.email && !EMAIL_RE.test(form.email)) e.email = "Invalid email";
    for (const k of NUMERIC_KEYS) {
      if (form[k] === "") continue;
      const n = Number(form[k]);
      if (!Number.isFinite(n) || n < 0) e[k] = "Must be a number ≥ 0";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!canEdit || submitting) return;
    if (!validate()) return;
    setSubmitting(true);

    const supabase = createClient();
    const next = payloadFrom(form);

    if (partner) {
      const initialPayload = payloadFrom(initial);
      const diff: Record<string, unknown> = {};
      (Object.keys(next) as (keyof typeof next)[]).forEach((k) => {
        if (next[k] !== initialPayload[k]) diff[k as string] = next[k];
      });

      if (Object.keys(diff).length === 0) {
        toast.push("Nothing changed", "info");
        setSubmitting(false);
        return;
      }

      const { error } = await supabase.from("partners").update(diff).eq("id", partner.id);
      setSubmitting(false);
      if (error) {
        toast.push(error.message || "Couldn't save partner", "error");
        return;
      }
      toast.push("Partner saved", "success");
      router.refresh();
    } else {
      const { data, error } = await supabase
        .from("partners")
        .insert(next)
        .select("id")
        .single();
      setSubmitting(false);
      if (error || !data) {
        toast.push(error?.message || "Couldn't create partner", "error");
        return;
      }
      toast.push("Partner created", "success");
      router.push(`/dashboard/partners/${data.id}`);
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {partner ? (
        <div className="space-y-1">
          <Label>External ID</Label>
          <Input value={partner.external_id ?? ""} readOnly disabled />
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="name" required>
            Name
          </Label>
          <Input
            id="name"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            disabled={!canEdit || submitting}
            aria-invalid={!!errors.name}
          />
          {errors.name ? <p className="text-xs text-coral mt-1">{errors.name}</p> : null}
        </div>

        <div className="space-y-1">
          <Label htmlFor="city">City</Label>
          <Input
            id="city"
            value={form.city}
            onChange={(e) => set("city", e.target.value)}
            disabled={!canEdit || submitting}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="tier_code" required>
            Tier
          </Label>
          <Select
            id="tier_code"
            value={form.tier_code}
            onChange={(e) => set("tier_code", e.target.value)}
            disabled={!canEdit || submitting}
          >
            {tiers.map((t) => (
              <option key={t.code} value={t.code}>
                {t.name}
              </option>
            ))}
          </Select>
          {errors.tier_code ? (
            <p className="text-xs text-coral mt-1">{errors.tier_code}</p>
          ) : null}
        </div>

        <div className="space-y-1">
          <Label htmlFor="delivery_fee" required>
            Delivery fee (₱)
          </Label>
          <Input
            id="delivery_fee"
            type="number"
            step="1"
            min="0"
            value={form.delivery_fee}
            onChange={(e) => set("delivery_fee", e.target.value)}
            disabled={!canEdit || submitting}
            aria-invalid={!!errors.delivery_fee}
          />
          {errors.delivery_fee ? (
            <p className="text-xs text-coral mt-1">{errors.delivery_fee}</p>
          ) : null}
        </div>

        <div className="space-y-1">
          <Label htmlFor="contact">Contact</Label>
          <Input
            id="contact"
            value={form.contact}
            onChange={(e) => set("contact", e.target.value)}
            placeholder="Phone / WhatsApp"
            disabled={!canEdit || submitting}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            disabled={!canEdit || submitting}
            aria-invalid={!!errors.email}
          />
          {errors.email ? <p className="text-xs text-coral mt-1">{errors.email}</p> : null}
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="address">Address</Label>
        <Textarea
          id="address"
          value={form.address}
          onChange={(e) => set("address", e.target.value)}
          disabled={!canEdit || submitting}
        />
        <p className="text-xs text-inkSoft">Used as the Business Address on issued bills.</p>
      </div>

      <div className="border-t border-border pt-5">
        <h3 className="text-base font-bold text-ink mb-1">Billing info</h3>
        <p className="text-xs text-inkSoft mb-3">
          Legal entity name and TIN — required on B2B invoices. Both optional, but the
          issue-bill flow will warn if either is missing.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="registered_business_name">Registered Business Name</Label>
            <Input
              id="registered_business_name"
              value={form.registered_business_name}
              onChange={(e) => set("registered_business_name", e.target.value)}
              placeholder="e.g. Acme Hospitality Inc."
              disabled={!canEdit || submitting}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tin">TIN</Label>
            <Input
              id="tin"
              value={form.tin}
              onChange={(e) => set("tin", e.target.value)}
              placeholder="XXX-XXX-XXX-XXX"
              disabled={!canEdit || submitting}
            />
          </div>
        </div>
      </div>

      <div className="border-t border-border pt-5">
        <h3 className="text-base font-bold text-ink mb-1">Per-SKU price overrides</h3>
        <p className="text-xs text-inkSoft mb-3">
          Leave blank to use the tier default. Tier defaults shown as placeholders.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(["pcl", "acg", "wpm"] as const).map((sku) => {
            const k = `price_${sku}` as const;
            const tierPrice = tier ? Number((tier as Record<string, unknown>)[k]) : null;
            return (
              <div key={sku} className="space-y-1">
                <Label htmlFor={k}>Price {sku.toUpperCase()} (₱)</Label>
                <Input
                  id={k}
                  type="number"
                  step="1"
                  min="0"
                  value={form[k]}
                  onChange={(e) => set(k, e.target.value)}
                  placeholder={
                    tierPrice != null
                      ? `tier default (₱${tierPrice})`
                      : "tier default"
                  }
                  disabled={!canEdit || submitting}
                  aria-invalid={!!errors[k]}
                />
                {errors[k] ? <p className="text-xs text-coral mt-1">{errors[k]}</p> : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          disabled={!canEdit || submitting}
        />
      </div>

      <label className="flex items-start gap-2 text-sm bg-cream/40 border border-border rounded-md px-3 py-2.5">
        <input
          type="checkbox"
          checked={form.pays_on_delivery}
          onChange={(e) => set("pays_on_delivery", e.target.checked)}
          disabled={!canEdit || submitting}
          className="mt-0.5"
        />
        <span>
          <span className="font-semibold">Pays on delivery (cash / QR)</span>
          <span className="block text-inkSoft">
            Lets this partner&rsquo;s delivered orders be marked paid directly from the order,
            settling the receivable without issuing a bill. Leave off for partners on invoice terms.
          </span>
        </span>
      </label>

      {canEdit ? (
        <div className="flex justify-end gap-2 border-t border-border pt-5">
          <Button variant="ghost" onClick={() => router.back()} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : partner ? "Save changes" : "Create partner"}
          </Button>
        </div>
      ) : (
        <div className="border-t border-border pt-5 text-sm text-inkSoft">
          Read-only — your role can&apos;t edit partners.
        </div>
      )}
    </form>
  );
}
