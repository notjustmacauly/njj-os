"use client";

import * as React from "react";
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export type AuditRow = {
  id: string;
  occurred_at: string;
  actor_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  action: "insert" | "update" | "delete" | string;
  table_name: string;
  row_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

// Friendly names for the tables the audit trigger watches.
const TABLE_LABELS: Record<string, string> = {
  expenses: "Expense",
  revenue_entries: "Revenue",
  orders: "Order",
  order_items: "Order item",
  payments: "Payment",
  receivables: "Receivable",
  bills: "Bill",
  deductions: "Deduction",
  deduction_items: "Deduction item",
  batches: "Production batch",
  batch_inputs: "Batch input",
  pos_transactions: "POS sale",
  pos_transaction_items: "POS sale item",
  pos_shifts: "POS shift",
  pos_products: "POS product",
  pos_bundles: "POS bundle",
  partners: "Partner",
  partner_tiers: "Partner tier",
  payees: "Payee",
  accounts: "Account",
  skus: "SKU",
  ingredients: "Ingredient",
  ingredient_lots: "Ingredient lot",
  ticket_types: "Ticket type",
  tickets: "Ticket",
  ledger_entries: "Ledger entry",
  team_members: "Team member",
  staff_pins: "Staff PIN",
  wix_product_map: "Wix product map",
};

// Columns that are noise in a diff (auto timestamps, generated ids).
const NOISE_FIELDS = new Set(["updated_at", "created_at", "id", "idempotency_key"]);

const ACTION_META: Record<
  string,
  { verb: string; icon: React.ComponentType<{ className?: string }>; cls: string; dot: string }
> = {
  insert: { verb: "created", icon: Plus, cls: "bg-berryBg text-berry", dot: "bg-berry" },
  update: { verb: "edited", icon: Pencil, cls: "bg-cream text-ink", dot: "bg-amber-500" },
  delete: { verb: "deleted", icon: Trash2, cls: "bg-salmonBg text-coral", dot: "bg-coral" },
};

function tableLabel(t: string): string {
  return TABLE_LABELS[t] ?? t;
}

function recordLabel(r: AuditRow): string {
  const snap = r.after ?? r.before ?? {};
  const ext = snap["external_id"];
  if (typeof ext === "string" && ext) return ext;
  const name = snap["name"] ?? snap["display_name"] ?? snap["description"];
  if (typeof name === "string" && name) return name.length > 40 ? name.slice(0, 40) + "…" : name;
  return r.row_id ? `#${r.row_id.slice(0, 8)}` : "—";
}

function formatStamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "object") {
    try {
      const s = JSON.stringify(v);
      return s.length > 60 ? s.slice(0, 60) + "…" : s;
    } catch {
      return String(v);
    }
  }
  const s = String(v);
  return s.length > 60 ? s.slice(0, 60) + "…" : s;
}

type FieldChange = { field: string; from: string; to: string };

function diffFields(before: Record<string, unknown> | null, after: Record<string, unknown> | null): FieldChange[] {
  const b = before ?? {};
  const a = after ?? {};
  const keys = Array.from(new Set(Object.keys(b).concat(Object.keys(a))));
  const out: FieldChange[] = [];
  for (const k of keys) {
    if (NOISE_FIELDS.has(k)) continue;
    const bv = JSON.stringify(b[k] ?? null);
    const av = JSON.stringify(a[k] ?? null);
    if (bv !== av) out.push({ field: k, from: formatVal(b[k]), to: formatVal(a[k]) });
  }
  return out.sort((x, y) => x.field.localeCompare(y.field));
}

function actorName(r: AuditRow, nameById: Record<string, string>): string {
  if (r.actor_id && nameById[r.actor_id]) return nameById[r.actor_id];
  if (r.actor_email) return r.actor_email;
  return "System";
}

export function AuditLogView({
  rows,
  nameById,
}: {
  rows: AuditRow[];
  nameById: Record<string, string>;
}) {
  const [q, setQ] = React.useState("");
  const [action, setAction] = React.useState<string>("all");
  const [table, setTable] = React.useState<string>("all");
  const [person, setPerson] = React.useState<string>("all");
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const tableOptions = React.useMemo(() => {
    const set = new Map<string, string>();
    for (const r of rows) set.set(r.table_name, tableLabel(r.table_name));
    return Array.from(set.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const personOptions = React.useMemo(() => {
    const set = new Map<string, string>();
    for (const r of rows) {
      const key = r.actor_id ?? "system";
      set.set(key, actorName(r, nameById));
    }
    return Array.from(set.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows, nameById]);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (action !== "all" && r.action !== action) return false;
      if (table !== "all" && r.table_name !== table) return false;
      if (person !== "all" && (r.actor_id ?? "system") !== person) return false;
      if (needle) {
        const hay = `${actorName(r, nameById)} ${tableLabel(r.table_name)} ${recordLabel(r)} ${r.actor_email ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, q, action, table, person, nameById]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink">Activity Log</h1>
        <p className="text-sm text-inkSoft mt-0.5">
          Every create, edit, and delete across the system — who did it, when, and exactly what changed.
        </p>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <Input
          placeholder="Search person, record…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="all">All actions</option>
          <option value="insert">Created</option>
          <option value="update">Edited</option>
          <option value="delete">Deleted</option>
        </Select>
        <Select value={table} onChange={(e) => setTable(e.target.value)}>
          <option value="all">All record types</option>
          {tableOptions.map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </Select>
        <Select value={person} onChange={(e) => setPerson(e.target.value)}>
          <option value="all">Everyone</option>
          {personOptions.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      <div className="text-xs text-inkSoft">
        Showing {filtered.length} of {rows.length} most recent changes.
      </div>

      {/* List */}
      <div className="bg-white border border-border rounded-lg shadow-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-inkSoft">No changes match these filters.</div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((r) => {
              const meta = ACTION_META[r.action] ?? ACTION_META.update;
              const Icon = meta.icon;
              const changes = r.action === "update" ? diffFields(r.before, r.after) : [];
              const isOpen = expanded.has(r.id);
              const canExpand = r.action === "update" && changes.length > 0;
              return (
                <li key={r.id}>
                  <div
                    className={`flex items-start gap-3 px-4 py-3 ${canExpand ? "cursor-pointer hover:bg-cream/40" : ""}`}
                    onClick={canExpand ? () => toggle(r.id) : undefined}
                  >
                    <span className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${meta.cls}`}>
                      <Icon className="w-4 h-4" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-ink">
                        <span className="font-semibold">{actorName(r, nameById)}</span>{" "}
                        {meta.verb}{" "}
                        <span className="text-inkSoft">{tableLabel(r.table_name)}</span>{" "}
                        <span className="font-mono text-xs text-ink">{recordLabel(r)}</span>
                        {r.action === "update" ? (
                          <span className="text-xs text-inkSoft">
                            {" "}· {changes.length} {changes.length === 1 ? "field" : "fields"} changed
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-inkSoft font-mono mt-0.5">
                        {formatStamp(r.occurred_at)}
                        {r.actor_role ? ` · ${r.actor_role}` : ""}
                      </div>

                      {canExpand && isOpen ? (
                        <div className="mt-2 rounded-md border border-border bg-cream/40 divide-y divide-border">
                          {changes.map((c) => (
                            <div key={c.field} className="px-3 py-1.5 text-xs grid grid-cols-[8rem_1fr] gap-2">
                              <span className="font-mono text-inkSoft truncate">{c.field}</span>
                              <span className="min-w-0">
                                <span className="text-coral line-through break-words">{c.from}</span>
                                <span className="text-inkSoft"> → </span>
                                <span className="text-berry break-words">{c.to}</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    {canExpand ? (
                      <span className="shrink-0 text-inkSoft mt-1">
                        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
