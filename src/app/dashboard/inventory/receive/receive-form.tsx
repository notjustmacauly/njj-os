"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { formatPHP } from "@/lib/utils";
import { ingredientEmoji } from "@/lib/ingredient-icons";

export type IngredientOption = {
  code: string;
  name: string;
  unit: string;
  type: string;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ReceiveForm({
  ingredients,
  accounts,
  defaultIngredientCode,
  receivedByName,
}: {
  ingredients: IngredientOption[];
  accounts: Array<{ code: string; name: string }>;
  defaultIngredientCode: string | null;
  receivedByName: string;
}) {
  const router = useRouter();
  const toast = useToast();

  const initialIngredient =
    (defaultIngredientCode && ingredients.find((i) => i.code === defaultIngredientCode)?.code) ||
    ingredients[0]?.code ||
    "";

  // Fresh idempotency key per mount; stays stable across re-renders so a
  // double-tap submits as one receipt.
  const [idempotencyKey, setIdempotencyKey] = React.useState(() => crypto.randomUUID());
  const [ingredientCode, setIngredientCode] = React.useState<string>(initialIngredient);
  const [receivedDate, setReceivedDate] = React.useState(todayIso());
  const [vendor, setVendor] = React.useState("");
  const [purchaseQty, setPurchaseQty] = React.useState("1");
  const [purchaseUnit, setPurchaseUnit] = React.useState("box");
  const [convertedQty, setConvertedQty] = React.useState("");
  const [totalCost, setTotalCost] = React.useState("");
  const [accountCode, setAccountCode] = React.useState(accounts[0]?.code ?? "");
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const ingredient = ingredients.find((i) => i.code === ingredientCode);
  const convertedUnit = ingredient?.unit ?? "";

  const purchaseQtyNum = Number(purchaseQty);
  const convertedQtyNum = Number(convertedQty);
  const totalCostNum = Number(totalCost);

  const costPerUnit =
    Number.isFinite(totalCostNum) &&
    Number.isFinite(convertedQtyNum) &&
    convertedQtyNum > 0
      ? totalCostNum / convertedQtyNum
      : null;

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (submitting) return;
    setError(null);

    if (!ingredientCode || !ingredient) return setError("Pick an ingredient.");
    if (!purchaseUnit.trim()) return setError("Purchase unit is required (box, sack, kg…).");
    if (!Number.isFinite(purchaseQtyNum) || purchaseQtyNum <= 0)
      return setError("Purchase qty must be > 0.");
    if (!Number.isFinite(convertedQtyNum) || convertedQtyNum <= 0)
      return setError("Converted qty must be > 0.");
    if (!Number.isFinite(totalCostNum) || totalCostNum < 0)
      return setError("Total cost must be ≥ 0.");
    if (!accountCode) return setError("Pick an account.");

    setSubmitting(true);
    const supabase = createClient();
    const { error: rpcErr } = await supabase.rpc("receive_supplies", {
      p_idempotency_key: idempotencyKey,
      p_ingredient_code: ingredientCode,
      p_purchase_qty: purchaseQtyNum,
      p_purchase_unit: purchaseUnit.trim(),
      p_converted_qty: convertedQtyNum,
      p_converted_unit: convertedUnit,
      p_total_cost: totalCostNum,
      p_account_code: accountCode,
      p_received_date: receivedDate,
      p_vendor: vendor.trim() || null,
      p_notes: notes.trim() || null,
      p_received_by_name: receivedByName,
    });
    setSubmitting(false);

    if (rpcErr) {
      setError(rpcErr.message);
      toast.push(rpcErr.message, "error");
      // Refresh the key so the next submit attempt isn't no-op'd by idempotency.
      setIdempotencyKey(crypto.randomUUID());
      return;
    }

    const accountName = accounts.find((a) => a.code === accountCode)?.name ?? accountCode;
    toast.push(
      `✓ ${convertedQtyNum}${convertedUnit} ${ingredient.name} received · ${accountName} −${formatPHP(totalCostNum)}`,
      "success",
    );
    router.push("/dashboard/inventory");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-2xl bg-white border border-border rounded-lg shadow-card p-6 space-y-5"
    >
      <div className="space-y-1">
        <Label htmlFor="rs_ingredient" required>
          Ingredient
        </Label>
        <Select
          id="rs_ingredient"
          value={ingredientCode}
          onChange={(e) => setIngredientCode(e.target.value)}
          disabled={submitting || ingredients.length === 0}
        >
          {ingredients.map((i) => (
            <option key={i.code} value={i.code}>
              {ingredientEmoji(i.code)} {i.name} ({i.unit})
            </option>
          ))}
        </Select>
        {ingredients.length === 0 ? (
          <p className="text-xs text-coral mt-1">
            No active ingredients. Add one via Production first.
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="rs_date" required>
            Received date
          </Label>
          <DateInput
            id="rs_date"
            value={receivedDate}
            onChange={(e) => setReceivedDate(e.target.value)}
            disabled={submitting}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rs_vendor">Vendor</Label>
          <Input
            id="rs_vendor"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="Mama Sita Produce"
            disabled={submitting}
          />
        </div>
      </div>

      <fieldset className="border border-border rounded-md px-4 py-3 space-y-3">
        <legend className="px-1 text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft">
          What did you buy?
        </legend>
        <div className="grid grid-cols-[1fr_1fr] gap-3">
          <div className="space-y-1">
            <Label htmlFor="rs_purchase_qty" required>
              Purchase qty
            </Label>
            <NumberInput
              id="rs_purchase_qty"
              min="0"
              step="0.01"
              value={purchaseQty}
              onChange={(e) => setPurchaseQty(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rs_purchase_unit" required>
              Purchase unit
            </Label>
            <Input
              id="rs_purchase_unit"
              value={purchaseUnit}
              onChange={(e) => setPurchaseUnit(e.target.value)}
              placeholder="box, crate, sack, kg…"
              disabled={submitting}
            />
          </div>
        </div>
        <div className="grid grid-cols-[1fr_1fr] gap-3">
          <div className="space-y-1">
            <Label htmlFor="rs_converted_qty" required>
              Converted to
            </Label>
            <NumberInput
              id="rs_converted_qty"
              min="0"
              step="0.001"
              value={convertedQty}
              onChange={(e) => setConvertedQty(e.target.value)}
              placeholder="weighable amount"
              disabled={submitting}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rs_converted_unit">Unit</Label>
            <Input
              id="rs_converted_unit"
              value={convertedUnit}
              readOnly
              disabled
              className="text-center"
            />
            <p className="text-[11px] text-inkSoft">Locked to the ingredient&rsquo;s unit.</p>
          </div>
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="rs_total_cost" required>
            Total cost
          </Label>
          <NumberInput
            id="rs_total_cost"
            prefix="₱"
            min="0"
            step="0.01"
            value={totalCost}
            onChange={(e) => setTotalCost(e.target.value)}
            disabled={submitting}
          />
          {costPerUnit != null && convertedUnit ? (
            <p className="text-xs text-berry font-mono">
              ₱{costPerUnit.toFixed(2)} / {convertedUnit}
            </p>
          ) : null}
        </div>
        <div className="space-y-1">
          <Label htmlFor="rs_account" required>
            Paid from
          </Label>
          <Select
            id="rs_account"
            value={accountCode}
            onChange={(e) => setAccountCode(e.target.value)}
            disabled={submitting}
          >
            {accounts.map((a) => (
              <option key={a.code} value={a.code}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="rs_notes">Notes</Label>
        <Textarea
          id="rs_notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={submitting}
          rows={2}
        />
      </div>

      {ingredient && totalCostNum > 0 && convertedQtyNum > 0 ? (
        <p className="text-xs text-inkSoft bg-cream/40 border border-border rounded-md px-3 py-2">
          Will create a lot with{" "}
          <span className="font-semibold">
            {convertedQtyNum}
            {convertedUnit}
          </span>{" "}
          of {ingredient.name} on hand and post{" "}
          <span className="font-mono">{formatPHP(totalCostNum)}</span> out of{" "}
          <span className="font-semibold">
            {accounts.find((a) => a.code === accountCode)?.name ?? accountCode}
          </span>
          .
        </p>
      ) : null}

      {error ? (
        <p className="text-sm text-coral bg-salmonBg/50 border border-coral/30 rounded-md px-3 py-2">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.back()} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Logging…" : "Log receipt"}
        </Button>
      </div>
    </form>
  );
}
