import * as React from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  emoji,
  title,
  description,
  action,
  className,
}: {
  emoji?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-white border border-border rounded-lg shadow-card text-center py-16 px-6",
        className,
      )}
    >
      {emoji ? <div className="text-4xl mb-3">{emoji}</div> : null}
      <h3 className="font-serif font-bold text-lg text-ink mb-1">{title}</h3>
      {description ? (
        <p className="text-sm text-inkSoft max-w-sm mx-auto">{description}</p>
      ) : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
