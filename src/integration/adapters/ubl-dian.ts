// Adaptador universal: UBL 2.1 según el Anexo Técnico de Factura Electrónica DIAN.
// Códigos de tributo DIAN: 01 IVA, 03 ICA, 04 INC; retenciones (WithholdingTaxTotal): 05 ReteIVA, 06 ReteFuente, 07 ReteICA.
import { XMLParser } from 'fast-xml-parser';
import type { CanonicalInvoice, LineTax, Withholding } from '../../domain/types.ts';
import { AdapterError, toCents, type SourceAdapter } from '../adapter.ts';

const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, attributeNamePrefix: '@', parseTagValue: false, isArray: (n) => ['InvoiceLine', 'CreditNoteLine', 'DebitNoteLine', 'TaxTotal', 'TaxSubtotal', 'WithholdingTaxTotal'].includes(n) });

const TAX: Record<string, LineTax['code']> = { '01': 'IVA', '03': 'ICA', '04': 'INC' };
const WH: Record<string, Withholding['code']> = { '05': 'RETEIVA', '06': 'RETEFUENTE', '07': 'RETEICA' };
const txt = (v: any): string => (v == null ? '' : typeof v === 'object' ? String(v['#text'] ?? '') : String(v));

function party(p: any) {
  const tax = p?.Party?.PartyTaxScheme;
  const id = tax?.CompanyID;
  return {
    nit: txt(id),
    dv: id?.['@schemeID'],
    name: txt(tax?.RegistrationName ?? p?.Party?.PartyName?.Name),
    personType: txt(p?.AdditionalAccountID) === '2' ? 'natural' as const : 'juridica' as const,
  };
}

function subtotals(totals: any[] | undefined, map: Record<string, string>) {
  const out: any[] = [];
  for (const t of totals ?? []) for (const s of t.TaxSubtotal ?? []) {
    const code = map[txt(s.TaxCategory?.TaxScheme?.ID)];
    if (!code) continue;
    out.push({ code, rate: Number(txt(s.TaxCategory?.Percent) || txt(s.Percent) || 0), base: toCents(txt(s.TaxableAmount)), amount: toCents(txt(s.TaxAmount)) });
  }
  return out;
}

function fromDoc(root: string, doc: any): CanonicalInvoice {
  const lineTag = root === 'CreditNote' ? 'CreditNoteLine' : root === 'DebitNote' ? 'DebitNoteLine' : 'InvoiceLine';
  const totals = doc.LegalMonetaryTotal ?? doc.RequestedMonetaryTotal ?? {};
  return {
    cufe: txt(doc.UUID),
    number: txt(doc.ID),
    documentType: root === 'CreditNote' ? 'nota_credito' : root === 'DebitNote' ? 'nota_debito' : 'factura',
    issueDate: txt(doc.IssueDate),
    currency: 'COP',
    seller: party(doc.AccountingSupplierParty),
    buyer: party(doc.AccountingCustomerParty),
    lines: (doc[lineTag] ?? []).map((l: any) => ({
      description: txt(l.Item?.Description),
      quantity: Number(txt(l.InvoicedQuantity ?? l.CreditedQuantity ?? l.DebitedQuantity) || 0),
      unitPrice: toCents(txt(l.Price?.PriceAmount)),
      lineTotal: toCents(txt(l.LineExtensionAmount)),
      taxes: subtotals(l.TaxTotal, TAX),
    })),
    subtotal: toCents(txt(totals.TaxExclusiveAmount ?? totals.LineExtensionAmount)),
    taxes: subtotals(doc.TaxTotal, TAX),
    withholdings: subtotals(doc.WithholdingTaxTotal, WH),
    total: toCents(txt(totals.PayableAmount)),
    source: { adapter: 'ubl-dian' },
  };
}

export const ublDianAdapter: SourceAdapter = {
  id: 'ubl-dian',
  accepts: ['application/xml', 'text/xml'],
  parse(payload) {
    if (typeof payload !== 'string') throw new AdapterError('ubl-dian', 'Se esperaba XML como texto');
    const x = parser.parse(payload);
    // Lo que el cliente recibe por correo es un AttachedDocument con la factura embebida en CDATA.
    if (x.AttachedDocument) {
      const inner = txt(x.AttachedDocument.Attachment?.ExternalReference?.Description);
      if (!inner) throw new AdapterError('ubl-dian', 'AttachedDocument sin factura embebida');
      return this.parse(inner);
    }
    for (const root of ['Invoice', 'CreditNote', 'DebitNote']) if (x[root]) {
      const inv = fromDoc(root, x[root]);
      if (!inv.cufe) throw new AdapterError('ubl-dian', 'Documento sin CUFE/CUDE (cbc:UUID)');
      return [inv];
    }
    throw new AdapterError('ubl-dian', 'No es un documento UBL DIAN reconocido');
  },
};
