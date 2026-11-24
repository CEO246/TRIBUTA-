// Contrato de integración. "Cualquier sistema contable" se resuelve con TRES puertas, en orden de preferencia:
//  1. UBL 2.1 DIAN (XML de factura electrónica o AttachedDocument): lo produce CUALQUIER software
//     habilitado por la DIAN. Es el adaptador universal real.
//  2. JSON canónico de Tributa vía API REST: para ERPs propios o módulos como el de AbundBank.
//  3. Adaptadores nativos (Siigo, Alegra, World Office…): sólo cuando el volumen de clientes lo justifique.
import type { CanonicalInvoice } from '../domain/types.ts';

export interface SourceAdapter {
  id: string;
  /** Formatos que acepta (content-type o etiqueta lógica). */
  accepts: string[];
  parse(payload: string | object): CanonicalInvoice[];
}

export class AdapterError extends Error {
  adapter: string;
  constructor(adapter: string, message: string) { super(`[${adapter}] ${message}`); this.adapter = adapter; }
}

const registry = new Map<string, SourceAdapter>();
export function registerAdapter(a: SourceAdapter) { registry.set(a.id, a); }
export function getAdapter(id: string): SourceAdapter {
  const a = registry.get(id);
  if (!a) throw new AdapterError(id, `Adaptador no registrado. Disponibles: ${[...registry.keys()].join(', ')}`);
  return a;
}
export function listAdapters() { return [...registry.keys()]; }

export const toCents = (v: unknown): number => Math.round(Number(String(v ?? 0).replace(/,/g, '')) * 100);
