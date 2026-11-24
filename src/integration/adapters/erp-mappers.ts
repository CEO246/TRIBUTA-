// Puerta 3: adaptadores nativos. ADVERTENCIA: los nombres de campo se basan en la documentación
// pública de Siigo API y Alegra API y NO se han probado contra sus sandboxes. Validar antes de usar.
// Además, ambos ERP emiten el XML UBL: si el cliente puede reenviar ese XML, prefiera 'ubl-dian'.
import type { CanonicalInvoice, LineTax } from '../../domain/types.ts';
import { AdapterError, toCents, type SourceAdapter } from '../adapter.ts';

const taxCode = (name: string): LineTax['code'] | null => {
  const n = name.toUpperCase();
  if (n.includes('IVA')) return 'IVA';
  if (n.includes('INC') || n.includes('CONSUMO')) return 'INC';
  return null;
};

function totalsFromLines(lines: CanonicalInvoice['lines']): LineTax[] {
  const m = new Map<string, LineTax>();
  for (const l of lines) for (const t of l.taxes) {
    const k = `${t.code}-${t.rate}`;
    const acc = m.get(k) ?? { code: t.code, rate: t.rate, base: 0, amount: 0 };
    acc.base += t.base; acc.amount += t.amount; m.set(k, acc);
  }
  return [...m.values()];
}

function build(adapter: string, d: any, seller: any, buyer: any, items: any[], cufe: string, number: string, mapTaxes: (it: any, lineTotal: number) => LineTax[]): CanonicalInvoice {
  if (!cufe) throw new AdapterError(adapter, `Factura ${number} sin CUFE: aún no está validada por la DIAN, no se provisiona.`);
  const lines = items.map(it => {
    const lineTotal = toCents(it.price) * Number(it.quantity ?? 1);
    return { description: String(it.description ?? it.name ?? ''), quantity: Number(it.quantity ?? 1), unitPrice: toCents(it.price), lineTotal, taxes: mapTaxes(it, lineTotal) };
  });
  const taxes = totalsFromLines(lines);
  const subtotal = lines.reduce((a, l) => a + l.lineTotal, 0);
  return { cufe, number, documentType: 'factura', issueDate: String(d.date).slice(0, 10), currency: 'COP', seller, buyer, lines, subtotal, taxes, withholdings: [], total: toCents(d.total), source: { adapter, externalId: String(d.id) } };
}

export function siigoAdapter(ownNit: string, ownName: string): SourceAdapter {
  return {
    id: 'siigo', accepts: ['application/json'],
    parse(payload) {
      const d: any = typeof payload === 'string' ? JSON.parse(payload) : payload;
      return [build('siigo', d, { nit: ownNit, name: ownName }, { nit: String(d.customer?.identification ?? ''), name: String(d.customer?.name?.join?.(' ') ?? d.customer?.name ?? '') }, d.items ?? [], d.stamp?.cufe, d.name ?? String(d.number),
        (it, base) => (it.taxes ?? []).flatMap((t: any) => { const c = taxCode(t.type ?? t.name ?? ''); return c ? [{ code: c, rate: Number(t.percentage), base, amount: toCents(t.value) }] : []; }))];
    },
  };
}

export function alegraAdapter(ownNit: string, ownName: string): SourceAdapter {
  return {
    id: 'alegra', accepts: ['application/json'],
    parse(payload) {
      const d: any = typeof payload === 'string' ? JSON.parse(payload) : payload;
      const num = `${d.numberTemplate?.prefix ?? ''}${d.numberTemplate?.number ?? d.id}`;
      return [build('alegra', d, { nit: ownNit, name: ownName }, { nit: String(d.client?.identification ?? ''), name: String(d.client?.name ?? '') }, d.items ?? [], d.stamp?.cufe, num,
        (it, base) => (it.tax ?? []).flatMap((t: any) => { const c = taxCode(t.type ?? t.name ?? ''); return c ? [{ code: c, rate: Number(t.percentage), base, amount: Math.round(base * Number(t.percentage) / 100) }] : []; }))];
    },
  };
}
