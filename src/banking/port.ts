// Puerto bancario. Tributa NUNCA recibe el dinero: instruye al banco aliado (con mandato firmado
// por el cliente) a mover fondos de la cuenta operativa del cliente a su subcuenta/bolsillo tributario.
import type { Cents } from '../domain/types.ts';

export interface TransferInstruction {
  idempotencyKey: string;   // = CUFE (+ sufijo para reversos)
  clientNit: string;
  amount: Cents;            // positivo: operativa → tributaria; negativo: devolución
  reference: string;
}
export interface TransferResult { status: 'aceptada' | 'rechazada' | 'pendiente'; bankRef?: string; reason?: string }

export interface BankPort {
  name: string;
  instructTransfer(i: TransferInstruction): Promise<TransferResult>;
}

/** Banco simulado para el MVP/pruebas, mientras se firma el banco aliado. */
export class SandboxBank implements BankPort {
  name = 'sandbox';
  balances = new Map<string, Cents>();
  seen = new Map<string, TransferResult>();
  async instructTransfer(i: TransferInstruction): Promise<TransferResult> {
    const prev = this.seen.get(i.idempotencyKey);
    if (prev) return prev;
    const r: TransferResult = { status: 'aceptada', bankRef: `SBX-${this.seen.size + 1}` };
    this.balances.set(i.clientNit, (this.balances.get(i.clientNit) ?? 0) + i.amount);
    this.seen.set(i.idempotencyKey, r);
    return r;
  }
}
