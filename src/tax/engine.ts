// Motor de impuestos: dada una factura canónica y el perfil del cliente, calcula qué debe
// PROVISIONARSE. No paga nada: el pago a la DIAN se hace por periodo (formularios 300, 350,
// 110, 260, 2593) sobre el neto acumulado. Provisionar por factura ≠ pagar por factura.

import type { CanonicalInvoice, Cents, TaxProfile } from '../domain/types.ts';
import { getParams } from './params.ts';

export type Obligation =
  | 'IVA'               // F.300 — neto: generado − descontable − reteIVA sufrida
  | 'INC'               // F.310
  | 'RETENCIONES'       // F.350 — lo que el cliente retiene a terceros (no es su plata)
  | 'AUTORRETENCION'    // F.350 — autorretención especial de renta
  | 'RENTA'             // F.110 — provisión estimada anual
  | 'SIMPLE';           // F.2593 — anticipo bimestral Régimen Simple

export interface ProvisionEntry {
  obligation: Obligation;
  period: string;       // ej. '2026-B6' (bimestre), '2026-11' (mes), '2026' (año)
  amount: Cents;        // positivo = aumenta la provisión; negativo = la reduce (crédito)
  base: Cents;
  concept: string;      // explicación legible para el empresario y el contador
}

export interface EngineResult {
  cufe: string;
  role: 'vendedor' | 'comprador';
  entries: ProvisionEntry[];
  netToProvision: Cents;
  warnings: string[];
}

function ivaPeriod(date: string, periodicity: TaxProfile['ivaPeriodicity']): string {
  const [y, m] = date.split('-').map(Number);
  return periodicity === 'bimestral' ? `${y}-B${Math.ceil(m / 2)}` : `${y}-C${Math.ceil(m / 4)}`;
}
const month = (d: string) => d.slice(0, 7);
const year = (d: string) => d.slice(0, 4);
const pct = (base: Cents, rate: number): Cents => Math.round((base * rate) / 100);

export function computeProvision(inv: CanonicalInvoice, profile: TaxProfile): EngineResult {
  const warnings: string[] = [];
  const isSeller = inv.seller.nit === profile.nit;
  const isBuyer = inv.buyer.nit === profile.nit;
  if (!isSeller && !isBuyer) throw new Error(`La factura ${inv.number} no pertenece al NIT ${profile.nit}`);
  const role = isSeller ? 'vendedor' : 'comprador';
  const sign = inv.documentType === 'nota_credito' ? -1 : 1; // nota crédito reversa provisiones
  const entries: ProvisionEntry[] = [];
  const sum = (code: string) => inv.taxes.filter(t => t.code === code).reduce((a, t) => a + t.amount, 0);
  const wh = (code: string) => inv.withholdings.filter(w => w.code === code).reduce((a, w) => a + w.amount, 0);

  if (isSeller) {
    // IVA generado
    const iva = sum('IVA');
    if (iva > 0) {
      if (!profile.ivaResponsable) warnings.push('La factura cobra IVA pero el perfil dice "no responsable de IVA". Revisar RUT.');
      entries.push({ obligation: 'IVA', period: ivaPeriod(inv.issueDate, profile.ivaPeriodicity), amount: sign * iva, base: inv.subtotal, concept: `IVA generado factura ${inv.number}` });
    }
    // ReteIVA que el comprador practicó: ese IVA ya lo paga el comprador, se descuenta del F.300
    const reteIva = wh('RETEIVA');
    if (reteIva > 0) entries.push({ obligation: 'IVA', period: ivaPeriod(inv.issueDate, profile.ivaPeriodicity), amount: -sign * reteIva, base: iva, concept: `ReteIVA sufrida factura ${inv.number}` });

    const inc = sum('INC');
    if (inc > 0) entries.push({ obligation: 'INC', period: ivaPeriod(inv.issueDate, 'bimestral'), amount: sign * inc, base: inv.subtotal, concept: `Impoconsumo factura ${inv.number}` });

    if (profile.regimenSimple) {
      entries.push({ obligation: 'SIMPLE', period: ivaPeriod(inv.issueDate, 'bimestral'), amount: sign * pct(inv.subtotal, profile.regimenSimple.rate), base: inv.subtotal, concept: `Anticipo Régimen Simple (${profile.regimenSimple.rate}%)` });
    } else {
      if (profile.autorretencionRentaRate) {
        entries.push({ obligation: 'AUTORRETENCION', period: month(inv.issueDate), amount: sign * pct(inv.subtotal, profile.autorretencionRentaRate), base: inv.subtotal, concept: `Autorretención especial renta (${profile.autorretencionRentaRate}%)` });
      }
      // Renta: provisión estimada, menos la retención en la fuente que ya le practicaron (es anticipo de renta)
      const renta = pct(inv.subtotal, profile.rentaProvisionRate);
      const rfSufrida = wh('RETEFUENTE');
      const autorr = profile.autorretencionRentaRate ? pct(inv.subtotal, profile.autorretencionRentaRate) : 0;
      const neto = Math.max(0, renta - rfSufrida - autorr);
      entries.push({ obligation: 'RENTA', period: year(inv.issueDate), amount: sign * neto, base: inv.subtotal, concept: `Provisión renta ${profile.rentaProvisionRate}% neta de retenciones/autorretención sufridas` });
    }
  }

  if (isBuyer) {
    // IVA descontable: reduce el IVA a pagar del periodo
    const iva = sum('IVA');
    if (iva > 0 && profile.ivaResponsable) {
      entries.push({ obligation: 'IVA', period: ivaPeriod(inv.issueDate, profile.ivaPeriodicity), amount: -sign * iva, base: inv.subtotal, concept: `IVA descontable compra ${inv.number} (sujeto a requisitos art. 488 y 771-2 E.T.)` });
    }
    if (profile.agenteRetenedor) {
      // Las retenciones que practica el cliente son plata de la DIAN: se provisionan al 100%.
      const rf = wh('RETEFUENTE') || estimateRetefuente(inv, warnings);
      if (rf > 0) entries.push({ obligation: 'RETENCIONES', period: month(inv.issueDate), amount: sign * rf, base: inv.subtotal, concept: `Retefuente practicada a ${inv.seller.name}` });
      const ri = wh('RETEIVA') || (profile.granContribuyente ? pct(iva, getParams(+year(inv.issueDate)).reteIvaRate.value) : 0);
      if (ri > 0) entries.push({ obligation: 'RETENCIONES', period: month(inv.issueDate), amount: sign * ri, base: iva, concept: `ReteIVA practicada a ${inv.seller.name}` });
      const rica = wh('RETEICA');
      if (rica > 0) warnings.push('ReteICA es municipal: no va a la DIAN. Tributa la reporta pero el pago va a la secretaría de hacienda del municipio.');
    }
  }

  const netToProvision = Math.max(0, entries.reduce((a, e) => a + e.amount, 0));
  return { cufe: inv.cufe, role, entries, netToProvision, warnings };
}

/** Si el documento no trae la retención (el ERP no la informó), se estima por concepto. */
function estimateRetefuente(inv: CanonicalInvoice, warnings: string[]): Cents {
  const p = getParams(+year(inv.issueDate));
  let total = 0;
  for (const line of inv.lines) {
    const c = p.retefuenteConcepts.value.find(x => x.id === line.withholdingConcept);
    if (!c) continue;
    if (inv.subtotal < c.baseUvt * p.uvt.value * 100) continue; // base mínima sobre el total de la operación
    total += pct(line.lineTotal, c.rateDeclarante);
  }
  if (total === 0 && inv.lines.some(l => !l.withholdingConcept)) {
    warnings.push('Factura de compra sin retefuente informada ni concepto: Tributa no puede estimarla. Pedir concepto al contador.');
  }
  return total;
}
