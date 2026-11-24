// Puerta 2: cualquier ERP (incluido el módulo contable de AbundBank) envía el JSON canónico.
import type { CanonicalInvoice } from '../../domain/types.ts';
import { AdapterError, type SourceAdapter } from '../adapter.ts';

const REQUIRED: (keyof CanonicalInvoice)[] = ['cufe', 'number', 'documentType', 'issueDate', 'seller', 'buyer', 'subtotal', 'taxes', 'withholdings', 'total'];

export const canonicalJsonAdapter: SourceAdapter = {
  id: 'tributa-json',
  accepts: ['application/json'],
  parse(payload) {
    const body: any = typeof payload === 'string' ? JSON.parse(payload) : payload;
    const docs: any[] = Array.isArray(body) ? body : [body];
    return docs.map((d, i) => {
      const missing = REQUIRED.filter(k => d[k] === undefined);
      if (missing.length) throw new AdapterError('tributa-json', `Documento ${i}: faltan campos ${missing.join(', ')}`);
      for (const k of ['subtotal', 'total'] as const) if (!Number.isInteger(d[k])) throw new AdapterError('tributa-json', `Documento ${i}: ${k} debe ser entero en centavos`);
      return { currency: 'COP', lines: [], ...d, source: { adapter: 'tributa-json', externalId: d.source?.externalId } };
    });
  },
};
