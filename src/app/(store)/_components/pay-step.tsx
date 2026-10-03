"use client";

import * as React from "react";
import Image from "next/image";
import { ImageUp, Loader2 } from "lucide-react";
import { COMPANY } from "@/lib/company";
import { cn, formatPHP } from "@/lib/utils";

// Shared bank-QR payment step for every public checkout (shop + event passes).

/**
 * Shrink big phone screenshots before upload (server functions cap request
 * size ~6 MB). Falls back to the original if the browser can't decode it.
 */
export async function shrinkImage(file: File): Promise<File> {
  if (file.size < 1.5 * 1024 * 1024 && /^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** QR to scan + screenshot upload. */
export function PayPanels({
  total,
  file,
  onFile,
}: {
  total: number;
  file: File | null;
  onFile: (f: File | null) => void;
}) {
  const [preview, setPreview] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <>
      <div className="rounded-3xl bg-white ring-1 ring-border p-6">
        <div className="text-sm font-semibold text-ink">1. Scan and pay exactly</div>
        <div className="mt-1 font-display text-4xl font-semibold text-berry tabular-nums">{formatPHP(total)}</div>
        <div className="mt-4 flex flex-col sm:flex-row gap-5 sm:items-center">
          <div className="relative w-56 h-56 shrink-0 rounded-2xl overflow-hidden ring-1 ring-border bg-white">
            <Image src={COMPANY.payQrSrc} alt="Payment QR code" fill sizes="224px" className="object-contain" />
          </div>
          <p className="text-sm text-inkSoft">
            Scan with GCash, Maya or any bank app (InstaPay). On your phone? Screenshot this QR and open it from your
            banking app.
          </p>
        </div>
      </div>

      <div className="rounded-3xl bg-white ring-1 ring-border p-6">
        <div className="text-sm font-semibold text-ink">2. Upload your payment screenshot</div>
        <label
          className={cn(
            "mt-3 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 cursor-pointer transition text-center",
            file ? "border-berry/40 bg-berryBg/40" : "border-border hover:border-berry/40",
          )}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Your payment screenshot" className="max-h-64 rounded-lg" />
          ) : (
            <>
              <ImageUp className="w-8 h-8 text-berry" />
              <span className="text-sm font-semibold text-ink">Tap to choose your screenshot</span>
              <span className="text-xs text-inkSoft">JPG or PNG, up to 10 MB</span>
            </>
          )}
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
        </label>
        {file ? (
          <button type="button" onClick={() => onFile(null)} className="mt-2 text-xs text-inkSoft underline">
            Choose a different image
          </button>
        ) : null}
      </div>
    </>
  );
}

export function ConfirmingOverlay() {
  return (
    <div className="fixed inset-0 z-[60] bg-cream/95 backdrop-blur flex flex-col items-center justify-center text-center px-6">
      <Loader2 className="w-10 h-10 text-berry animate-spin" />
      <p className="mt-5 font-display text-2xl font-semibold text-ink">Confirming your payment…</p>
      <p className="mt-1 text-inkSoft">Hang tight, this only takes a moment.</p>
    </div>
  );
}

/**
 * Upload the (shrunk) screenshot + payload to a checkout endpoint, keeping
 * the "confirming" moment on screen for at least ~1.8 s. Returns the order
 * token or throws a shopper-readable message.
 */
export async function submitWithProof(endpoint: string, payload: unknown, file: File): Promise<string> {
  const started = Date.now();
  const upload = await shrinkImage(file);
  if (upload.size > 5.5 * 1024 * 1024) throw new Error("That image is too large — please send a regular screenshot instead.");
  const body = new FormData();
  body.append("payload", JSON.stringify(payload));
  body.append("proof", upload);
  let res: Response;
  try {
    res = await fetch(endpoint, { method: "POST", body });
  } catch {
    throw new Error("We couldn't reach the server — check your connection and try again.");
  }
  const json = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
  const wait = 1800 - (Date.now() - started);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  if (!res.ok || !json.token) throw new Error(json.error ?? "Something went wrong — please try again.");
  return json.token;
}
