import * as React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  Link,
  StyleSheet,
} from "@react-pdf/renderer";
import { COMPANY } from "@/lib/company";
import { formatPHP, formatDate } from "@/lib/utils";

export type InvoiceData = {
  origin: string;
  bill: {
    external_id: string | null;
    bill_date: string | null;
    due_date: string | null;
    payment_terms: string | null;
    status: string;
    subtotal: number;
    delivery_fees: number;
    discount: number;
    total: number;
  };
  partner: {
    name: string | null;
    registered_business_name: string | null;
    tin: string | null;
    address: string | null;
    email: string | null;
  };
  lines: Array<{
    order_external_id: string | null;
    receivable_external_id: string | null;
    order_date: string | null;
    delivery_date: string | null;
    amount: number;
    public_token: string | null;
  }>;
};

const INK = "#20130f";
const SOFT = "#6b6460";
const BORDER = "#e7e2dc";
const CREAM = "#faf6f0";
const BERRY = "#b3245f";

const s = StyleSheet.create({
  page: { paddingBottom: 40, fontSize: 10, color: INK, fontFamily: "Helvetica" },
  band: { backgroundColor: "#f7b7a3", paddingVertical: 14, paddingHorizontal: 24 },
  logo: { width: 130 },
  body: { paddingHorizontal: 32, paddingTop: 20 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  h1: { fontSize: 22, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  bold: { fontFamily: "Helvetica-Bold" },
  soft: { color: SOFT },
  mono: { fontFamily: "Courier" },
  section: { marginTop: 22 },
  label: { fontSize: 8, color: SOFT, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 },
  table: { borderWidth: 1, borderColor: BORDER, borderRadius: 4, marginTop: 6 },
  th: { flexDirection: "row", backgroundColor: CREAM, paddingVertical: 6, paddingHorizontal: 8 },
  tr: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: BORDER },
  cDelivery: { flex: 2 },
  cDate: { flex: 1.4 },
  cAmt: { flex: 1.2, textAlign: "right" },
  link: { color: BERRY, textDecoration: "underline" },
  totals: { marginTop: 18, marginLeft: "auto", width: 220 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  totalFinal: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: BORDER,
    marginTop: 4,
    paddingTop: 5,
  },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 32,
    right: 32,
    textAlign: "center",
    color: SOFT,
    fontSize: 8,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 8,
  },
});

export function BillInvoicePdf({ data }: { data: InvoiceData }) {
  const { bill, partner, lines, origin } = data;
  const billTo = partner.registered_business_name || partner.name || "—";
  return (
    <Document title={`Invoice ${bill.external_id ?? ""}`}>
      <Page size="A4" style={s.page}>
        <View style={s.band}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image style={s.logo} src={`${origin}${COMPANY.logoSrc}`} />
        </View>

        <View style={s.body}>
          {/* From + invoice meta */}
          <View style={s.rowBetween}>
            <View style={{ maxWidth: 300 }}>
              <Text style={s.bold}>{COMPANY.registeredName}</Text>
              {COMPANY.tin ? <Text style={s.soft}>TIN: {COMPANY.tin}</Text> : null}
              {COMPANY.address ? <Text style={s.soft}>{COMPANY.address}</Text> : null}
              <Text style={s.soft}>{COMPANY.email}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={s.h1}>INVOICE</Text>
              <Text style={[s.mono, s.soft]}>{bill.external_id ?? "—"}</Text>
              <Text style={[s.label, { marginTop: 6 }]}>{bill.status}</Text>
            </View>
          </View>

          {/* Bill to + dates */}
          <View style={[s.rowBetween, s.section]}>
            <View style={{ maxWidth: 300 }}>
              <Text style={s.label}>Bill to</Text>
              <Text style={s.bold}>{billTo}</Text>
              {partner.tin ? <Text style={s.soft}>TIN: {partner.tin}</Text> : null}
              {partner.address ? <Text style={s.soft}>{partner.address}</Text> : null}
              {partner.email ? <Text style={s.soft}>{partner.email}</Text> : null}
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <MetaRow label="Bill date" value={formatDate(bill.bill_date)} />
              <MetaRow label="Due date" value={bill.due_date ? formatDate(bill.due_date) : "—"} />
              {bill.payment_terms ? <MetaRow label="Terms" value={bill.payment_terms} /> : null}
            </View>
          </View>

          {/* Deliveries */}
          <View style={s.section}>
            <Text style={s.label}>Deliveries ({lines.length})</Text>
            <View style={s.table}>
              <View style={s.th}>
                <Text style={[s.cDelivery, s.bold]}>Delivery</Text>
                <Text style={[s.cDate, s.bold]}>Order date</Text>
                <Text style={[s.cDate, s.bold]}>Delivered</Text>
                <Text style={[s.cAmt, s.bold]}>Amount</Text>
              </View>
              {lines.map((l, i) => {
                const label = l.order_external_id ?? l.receivable_external_id ?? "View delivery";
                return (
                  <View style={s.tr} key={i}>
                    <View style={s.cDelivery}>
                      {l.public_token ? (
                        <Link style={[s.mono, s.link]} src={`${origin}/receipt/${l.public_token}`}>
                          {label}
                        </Link>
                      ) : (
                        <Text style={s.mono}>{label}</Text>
                      )}
                    </View>
                    <Text style={[s.cDate, s.soft]}>{l.order_date ? formatDate(l.order_date) : "—"}</Text>
                    <Text style={[s.cDate, s.soft]}>{l.delivery_date ? formatDate(l.delivery_date) : "—"}</Text>
                    <Text style={[s.cAmt, s.mono]}>{formatPHP(l.amount)}</Text>
                  </View>
                );
              })}
            </View>
            <Text style={[s.soft, { fontSize: 8, marginTop: 4 }]}>
              Tap any delivery to view its full itemised receipt.
            </Text>
          </View>

          {/* Totals */}
          <View style={s.totals}>
            <View style={s.totalRow}>
              <Text style={s.soft}>Subtotal</Text>
              <Text style={s.mono}>{formatPHP(bill.subtotal)}</Text>
            </View>
            {bill.delivery_fees > 0 ? (
              <View style={s.totalRow}>
                <Text style={s.soft}>Delivery fees</Text>
                <Text style={s.mono}>{formatPHP(bill.delivery_fees)}</Text>
              </View>
            ) : null}
            {bill.discount > 0 ? (
              <View style={s.totalRow}>
                <Text style={s.soft}>Discount</Text>
                <Text style={s.mono}>- {formatPHP(bill.discount)}</Text>
              </View>
            ) : null}
            <View style={s.totalFinal}>
              <Text style={s.bold}>Total due</Text>
              <Text style={[s.bold, s.mono]}>{formatPHP(bill.total)}</Text>
            </View>
          </View>
        </View>

        <Text style={s.footer} fixed>
          {COMPANY.brandName} — Thank you for your business. Questions? {COMPANY.email}
        </Text>
      </Page>
    </Document>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
      <Text style={s.soft}>{label}</Text>
      <Text style={s.bold}>{value}</Text>
    </View>
  );
}
