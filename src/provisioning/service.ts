// Orquesta: factura canónica → motor → libro de provisiones → instrucción al banco → webhook.
import type { CanonicalInvoice, TaxProfile } from '../domain/types.ts';
import { computeProvision, type EngineResult, type ProvisionEntry } from '../tax/engine.ts';
import type { BankPort, TransferResult } from '../banking/port.ts';

export interface ProvisionRecord extends EngineResult { clientNit: string; invoiceNumber: string; transfer?: TransferResult; createdAt: string }

/** Almacén. La implementación en memoria sirve para pruebas; en producción va Postgres/Supabase. */
export interface ProvisionStore {
  get(clientNit: string, cufe: string): Promise<ProvisionRecord | undefined>;
  put(r: ProvisionRecord): Promise<void>;
  list(clientNit: string): Promise<ProvisionRecord[]>;
}
export class MemoryStore implements ProvisionStore {
  private m = new Map<string, ProvisionRecord>();
  async get(n: string, c: string) { return this.m.get(`${n}|${c}`); }
  async put(r: ProvisionRecord) { this.m.set(`${r.clientNit}|${r.cufe}`, r); }
  async list(n: string) { return [...this.m.values()].filter(r => r.clientNit === n); }
}

export type EventSink = (event: string, data: unknown) => void | Promise<void>;

export class ProvisioningService {
  store: ProvisionStore; private bank: BankPort; private profiles: Map<string, TaxProfile>; private emit: EventSink;
  constructor(store: ProvisionStore, bank: BankPort, profiles: Map<string, TaxProfile>, emit: EventSink = () => {}) {
    this.store = store; this.bank = bank; this.profiles = profiles; this.emit = emit;
  }

  async ingest(clientNit: string, inv: CanonicalInvoice, opts: { autoTransfer?: boolean } = {}): Promise<{ record: ProvisionRecord; duplicate: boolean }> {
    const profile = this.profiles.get(clientNit);
    if (!profile) throw new Error(`Cliente ${clientNit} sin perfil tributario`);
    const existing = await this.store.get(clientNit, inv.cufe);
    if (existing) return { record: existing, duplicate: true }; // idempotencia por CUFE: el ERP puede reenviar sin duplicar
    const result = computeProvision(inv, profile);
    const record: ProvisionRecord = { ...result, clientNit, invoiceNumber: inv.number, createdAt: new Date().toISOString() };
    if (opts.autoTransfer !== false && result.netToProvision > 0) {
      record.transfer = await this.bank.instructTransfer({ idempotencyKey: inv.cufe, clientNit, amount: result.netToProvision, reference: `Tributa ${inv.number}` });
    }
    await this.store.put(record);
    await this.emit('provision.created', record);
    return { record, duplicate: false };
  }

  /** Resumen por obligación y periodo: lo que se pagará a la DIAN en cada vencimiento. */
  async summary(clientNit: string) {
    const out: Record<string, number> = {};
    for (const r of await this.store.list(clientNit)) for (const e of r.entries as ProvisionEntry[]) {
      const k = `${e.obligation}:${e.period}`;
      out[k] = (out[k] ?? 0) + e.amount;
    }
    return out;
  }
}
