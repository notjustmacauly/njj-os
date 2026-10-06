"use client";

import * as React from "react";
import Image from "next/image";
import { ImageUpLine, SpinnerLine } from "./icons";
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
      <div className="rounded-[28px] bg-s-surface ring-1 ring-s-line/[0.07] p-6 sm:p-7">
        <p className="text-sm font-semibold text-s-fg">1. Scan and pay exactly</p>
        <p className="mt-1 font-display text-5xl font-semibold tracking-[-0.03em] tabular-nums text-s-fg">{formatPHP(total)}</p>
        <div className="mt-6 flex flex-col sm:flex-row gap-6 sm:items-center">
          <div className="relative w-56 h-56 shrink-0 rounded-[20px] overflow-hidden bg-white ring-1 ring-s-line/10">
            <Image src={COMPANY.payQrSrc} alt="InstaPay QR code for payment" fill sizes="224px" className="object-contain" />
          </div>
          <p className="text-sm text-s-muted leading-relaxed max-w-[34ch]">
            Scan with GCash, Maya or any bank app through InstaPay. On your phone? Screenshot this QR and open it from your
            banking app.
          </p>
        </div>
      </div>

      <div className="rounded-[28px] bg-s-surface ring-1 ring-s-line/[0.07] p-6 sm:p-7">
        <p className="text-sm font-semibold text-s-fg">2. Upload your payment screenshot</p>
        <label
          className={cn(
            "mt-4 flex flex-col items-center justify-center gap-2 rounded-[20px] border-2 border-dashed px-4 py-10 cursor-pointer text-center transition duration-300 ease-settle",
            file ? "border-s-fg/30 bg-s-sunken/60" : "border-s-line/15 hover:border-s-line/40",
          )}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Your payment screenshot" className="max-h-64 rounded-[14px]" />
          ) : (
            <>
              <ImageUpLine className="w-7 h-7 text-s-fg" />
              <span className="text-sm font-semibold text-s-fg">Choose your screenshot</span>
              <span className="text-xs text-s-muted">JPG or PNG, up to 10 MB</span>
            </>
          )}
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
        </label>
        {file ? (
          <button type="button" onClick={() => onFile(null)} className="mt-3 text-xs font-semibold text-s-muted underline underline-offset-4">
            Use a different image
          </button>
        ) : null}
      </div>
    </>
  );
}

export function ConfirmingOverlay() {
  return (
    <div role="status" className="fixed inset-0 z-[60] bg-s-canvas/95 backdrop-blur-xl flex flex-col items-center justify-center text-center px-6">
      <SpinnerLine className="w-9 h-9 text-s-fg animate-spin motion-reduce:animate-none" />
      <p className="mt-6 font-display text-3xl font-semibold tracking-[-0.02em] text-s-fg">Confirming your payment</p>
      <p className="mt-2 text-s-muted">This only takes a moment.</p>
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
  if (upload.size > 5.5 * 1024 * 1024) throw new Error("That image is too large. Send a regular screenshot instead.");
  const body = new FormData();
  body.append("payload", JSON.stringify(payload));
  body.append("proof", upload);
  let res: Response;
  try {
    res = await fetch(endpoint, { method: "POST", body });
  } catch {
    throw new Error("We couldn't reach the server. Check your connection and try again.");
  }
  const json = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
  const wait = 1800 - (Date.now() - started);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  if (!res.ok || !json.token) throw new Error(json.error ?? "Something went wrong. Try again.");
  return json.token;
}
