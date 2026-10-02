"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { NumberInput } from "@/components/ui/number-input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { formatPHP } from "@/lib/utils";

export type WebProductRow = {
  id: string;
  slug: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  sku_code: string | null;
  cans_per_unit: number;
  deliveries: number;
  delivery_fee: number | string;
  price: number | string;
  image_url: string | null;
  badge: string | null;
  is_published: boolean;
  sort_order: number;
};

type Sku = { code: string; name: string };

type EditingState = { mode: "closed" } | { mode: "create" } | { mode: "edit"; row: WebProductRow };

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function WebProductsClient({
  initial,
  stock,
  skus,
}: {
  initial: WebProductRow[];
  stock: Record<string, number>;
  skus: Sku[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = React.useState<EditingState>({ mode: "closed" });
  const [pendingDelete, setPendingDelete] = React.useState<WebProductRow | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function togglePublished(r: WebProductRow) {
    if (busyId) return;
    setBusyId(r.id);
    const { error } = await createClient()
      .from("web_products")
      .update({ is_published: !r.is_published, updated_at: new Date().toISOString() })
      .eq("id", r.id);
    setBusyId(null);
    if (error) return toast.push(error.message, "error");
    toast.push(r.is_published ? `${r.name} hidden from the shop` : `${r.name} is now live`, "success");
    router.refresh();
  }

  async function handleDelete() {
    if (!pendingDelete || busyId) return;
    setBusyId(pendingDelete.id);
    const { error } = await createClient()
      .from("web_products")
      .update({ deleted_at: new Date().toISOString(), is_published: false })
      .eq("id", pendingDelete.id);
    setBusyId(null);
    if (error) return toast.push(error.message, "error");
    toast.push(`Removed ${pendingDelete.name}`, "success");
    setPendingDelete(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-inkSoft">
          What shoppers see at <span className="font-semibold text-ink">/shop</span>. Stock comes live from
          Inventory.
        </p>
        <div className="ml-auto">
          <Button onClick={() => setEditing({ mode: "create" })}>
            <Plus className="w-4 h-4" />
            New product
          </Button>
        </div>
      </div>

      <div className="bg-white border border-border rounded-lg shadow-card overflow-x-auto">
        {initial.length === 0 ? (
          <p className="px-5 py-8 text-sm text-inkSoft text-center">No products yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-cream text-inkSoft">
              <tr className="text-left">
                <th className="px-4 py-2 font-semibold w-16">Image</th>
                <th className="px-4 py-2 font-semibold">Product</th>
                <th className="px-4 py-2 font-semibold w-24">Flavours</th>
                <th className="px-4 py-2 font-semibold w-20 text-right">Cans</th>
                <th className="px-4 py-2 font-semibold w-24 text-right">Price</th>
                <th className="px-4 py-2 font-semibold w-28">Stock</th>
                <th className="px-4 py-2 font-semibold w-24">Status</th>
                <th className="px-4 py-2 font-semibold w-28 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {initial.map((r) => {
                const n = stock[r.id];
                return (
                  <tr key={r.id} className={`border-t border-border ${r.is_published ? "" : "opacity-60"}`}>
                    <td className="px-4 py-2">
                      <div className="w-10 h-10 rounded-md bg-cream overflow-hidden flex items-center justify-center">
                        {r.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.image_url} alt="" className="w-full h-full object-contain" />
                        ) : (
                          <span className="text-[10px] text-inkSoft">none</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="text-ink font-medium">{r.name}</div>
                      <div className="text-xs text-inkSoft">
                        {[r.subtitle, r.badge].filter(Boolean).join(" · ") || r.slug}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-xs text-inkSoft">{r.sku_code ?? "Mix"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {r.cans_per_unit}
                      {r.deliveries > 1 ? (
                        <div className="text-[10px] text-inkSoft">
                          {r.cans_per_unit / r.deliveries}/wk × {r.deliveries}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatPHP(r.price)}</td>
                    <td className="px-4 py-2 text-xs">
                      {!r.is_published ? (
                        <span className="text-inkSoft">—</span>
                      ) : (n ?? 0) <= 0 ? (
                        <span className="text-coral font-semibold">Sold out</span>
                      ) : (
                        <span className="text-emerald-700">{n} packs</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {r.is_published ? (
                        <span className="text-xs text-emerald-700">Live</span>
                      ) : (
                        <span className="text-xs text-inkSoft">Hidden</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          onClick={() => togglePublished(r)}
                          disabled={busyId === r.id}
                          className="p-1.5 rounded-md text-inkSoft hover:bg-cream hover:text-ink"
                          aria-label={r.is_published ? `Hide ${r.name}` : `Publish ${r.name}`}
                          title={r.is_published ? "Hide from shop" : "Publish to shop"}
                        >
                          {r.is_published ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing({ mode: "edit", row: r })}
                          className="p-1.5 rounded-md text-inkSoft hover:bg-cream hover:text-ink"
                          aria-label={`Edit ${r.name}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(r)}
                          className="p-1.5 rounded-md text-inkSoft hover:bg-salmonBg hover:text-coral"
                          aria-label={`Remove ${r.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editing.mode !== "closed" ? (
        <ProductFormModal
          mode={editing.mode}
          row={editing.mode === "edit" ? editing.row : null}
          skus={skus}
          onClose={() => setEditing({ mode: "closed" })}
          onSaved={() => {
            setEditing({ mode: "closed" });
            router.refresh();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Remove ${pendingDelete?.name ?? ""}?`}
        description="It disappears from the shop. Past orders are not affected."
        confirmLabel="Remove"
        destructive
        busy={busyId !== null}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function ProductFormModal({
  mode,
  row,
  skus,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  row: WebProductRow | null;
  skus: Sku[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = React.useState(row?.name ?? "");
  const [slug, setSlug] = React.useState(row?.slug ?? "");
  const [slugTouched, setSlugTouched] = React.useState(mode === "edit");
  const [subtitle, setSubtitle] = React.useState(row?.subtitle ?? "");
  const [description, setDescription] = React.useState(row?.description ?? "");
  const [skuCode, setSkuCode] = React.useState(row ? row.sku_code ?? "" : "");
  const [cans, setCans] = React.useState(String(row?.cans_per_unit ?? 4));
  const [deliveries, setDeliveries] = React.useState(String(row?.deliveries ?? 1));
  const [deliveryFee, setDeliveryFee] = React.useState(String(Number(row?.delivery_fee ?? 50)));
  const [price, setPrice] = React.useState(String(Number(row?.price ?? 0)));
  const [badge, setBadge] = React.useState(row?.badge ?? "");
  const [imageUrl, setImageUrl] = React.useState(row?.image_url ?? "");
  const [sortOrder, setSortOrder] = React.useState(String(row?.sort_order ?? 100));
  const [isPublished, setIsPublished] = React.useState(row?.is_published ?? false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit() {
    if (submitting) return;
    setError(null);
    if (!name.trim()) return setError("Name is required.");
    if (!SLUG_PATTERN.test(slug)) return setError("Web address must be lowercase words joined by dashes.");
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum < 0) return setError("Price must be ≥ 0.");
    const cansNum = Number(cans);
    if (!Number.isInteger(cansNum) || cansNum <= 0) return setError("Cans per pack must be a whole number above 0.");
    const delivNum = Number(deliveries);
    if (!Number.isInteger(delivNum) || delivNum <= 0) return setError("Deliveries must be a whole number above 0.");
    if (cansNum % delivNum !== 0) return setError("Cans must split evenly across deliveries.");
    const feeNum = Number(deliveryFee);
    if (!Number.isFinite(feeNum) || feeNum < 0) return setError("Delivery fee must be ≥ 0.");
    const sortNum = Number(sortOrder);
    if (!Number.isFinite(sortNum)) return setError("Sort order must be a number.");

    const values = {
      name: name.trim(),
      slug,
      subtitle: subtitle.trim() || null,
      description: description.trim() || null,
      sku_code: skuCode || null,
      cans_per_unit: cansNum,
      deliveries: delivNum,
      delivery_fee: feeNum,
      price: priceNum,
      badge: badge.trim() || null,
      image_url: imageUrl.trim() || null,
      sort_order: sortNum,
      is_published: isPublished,
      updated_at: new Date().toISOString(),
    };

    setSubmitting(true);
    const supabase = createClient();
    const { error: err } =
      mode === "create"
        ? await supabase.from("web_products").insert(values)
        : await supabase.from("web_products").update(values).eq("id", row!.id);
    setSubmitting(false);
    if (err) {
      setError(err.code === "23505" ? "That web address is already used by another product." : err.message);
      return;
    }
    toast.push(mode === "create" ? "Product created" : "Product updated", "success");
    onSaved();
  }

  return (
    <Modal
      open
      onClose={submitting ? () => {} : onClose}
      title={mode === "create" ? "New shop product" : `Edit ${row?.name ?? ""}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Saving…" : mode === "create" ? "Create" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="wp_name" required>
              Name
            </Label>
            <Input
              id="wp_name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
              placeholder="The Glow Pack"
              disabled={submitting}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="wp_subtitle">Subtitle</Label>
            <Input
              id="wp_subtitle"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="4-Pack"
              disabled={submitting}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="wp_slug" required>
            Web address
          </Label>
          <div className="flex items-center gap-1 text-sm">
            <span className="text-inkSoft">/shop/</span>
            <Input
              id="wp_slug"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value.toLowerCase());
              }}
              disabled={submitting}
            />
          </div>
          {mode === "edit" ? (
            <p className="text-xs text-inkSoft">Changing this breaks any links already shared.</p>
          ) : null}
        </div>

        <div className="space-y-1">
          <Label htmlFor="wp_desc">Description</Label>
          <Textarea
            id="wp_desc"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={submitting}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label htmlFor="wp_sku">Flavours</Label>
            <Select id="wp_sku" value={skuCode} onChange={(e) => setSkuCode(e.target.value)} disabled={submitting}>
              <option value="">Mix — customer chooses</option>
              {skus.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code} · {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="wp_cans" required>
              Cans per pack
            </Label>
            <NumberInput
              id="wp_cans"
              min="1"
              step="1"
              value={cans}
              onChange={(e) => setCans(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="wp_price" required>
              Price
            </Label>
            <NumberInput
              id="wp_price"
              prefix="₱"
              min="0"
              step="1"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              disabled={submitting}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="wp_deliveries" required>
              Deliveries
            </Label>
            <NumberInput
              id="wp_deliveries"
              min="1"
              step="1"
              value={deliveries}
              onChange={(e) => setDeliveries(e.target.value)}
              disabled={submitting}
            />
            <p className="text-xs text-inkSoft">
              {Number(deliveries) > 1 && Number(cans) % Number(deliveries) === 0
                ? `${Number(cans) / Number(deliveries)} cans a week, same mix each week.`
                : "1 = delivered all at once."}
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="wp_fee" required>
              Delivery fee (each)
            </Label>
            <NumberInput
              id="wp_fee"
              prefix="₱"
              min="0"
              step="1"
              value={deliveryFee}
              onChange={(e) => setDeliveryFee(e.target.value)}
              disabled={submitting}
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-[1fr_96px] gap-3 items-start">
          <div className="space-y-1">
            <Label htmlFor="wp_image">Image URL</Label>
            <Input
              id="wp_image"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="/can-pcl.png"
              disabled={submitting}
            />
            <p className="text-xs text-inkSoft">Leave blank to use the default can art.</p>
          </div>
          <div className="w-24 h-24 rounded-md bg-cream border border-border overflow-hidden flex items-center justify-center">
            {imageUrl.trim() ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl.trim()} alt="" className="w-full h-full object-contain" />
            ) : (
              <span className="text-xs text-inkSoft">Preview</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="wp_badge">Badge</Label>
            <Input
              id="wp_badge"
              value={badge}
              onChange={(e) => setBadge(e.target.value)}
              placeholder="Best seller"
              disabled={submitting}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="wp_sort" required>
              Sort order
            </Label>
            <NumberInput
              id="wp_sort"
              min="0"
              step="1"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              disabled={submitting}
            />
          </div>
        </div>

        <label className="text-sm text-ink flex items-center gap-2 select-none cursor-pointer">
          <input
            type="checkbox"
            checked={isPublished}
            onChange={(e) => setIsPublished(e.target.checked)}
            disabled={submitting}
          />
          Show in the shop
        </label>

        {error ? <p className="text-sm text-coral">{error}</p> : null}
      </div>
    </Modal>
  );
}
