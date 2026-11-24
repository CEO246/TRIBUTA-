// Modelo canónico de Tributa. Todo adaptador (UBL DIAN, Siigo, Alegra, AbundBank, etc.)
// traduce su formato a CanonicalInvoice. El motor de impuestos SOLO conoce este modelo.

export type TaxCode = 'IVA' | 'INC' | 'ICA';
export type WithholdingCode = 'RETEFUENTE' | 'RETEIVA' | 'RETEICA';

/** Montos siempre en pesos colombianos, como enteros en centavos para evitar errores de coma flotante. */
export type Cents = number;

export interface Party {
  nit: string;               // sin dígito de verificación
  dv?: string;
  name: string;
  personType?: 'juridica' | 'natural';
}

export interface LineTax {
  code: TaxCode;
  rate: number;              // porcentaje, ej. 19
  base: Cents;
  amount: Cents;
}

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPrice: Cents;
  lineTotal: Cents;          // antes de impuestos
  taxes: LineTax[];
  /** Concepto de retención, si el emisor/ERP lo informa (ej. 'compras', 'servicios'). */
  withholdingConcept?: string;
}

export interface Withholding {
  code: WithholdingCode;
  rate: number;
  base: Cents;
  amount: Cents;
}

export interface CanonicalInvoice {
  /** CUFE: identificador único DIAN. Es la llave de idempotencia de todo Tributa. */
  cufe: string;
  number: string;            // prefijo + consecutivo
  documentType: 'factura' | 'nota_credito' | 'nota_debito';
  issueDate: string;         // YYYY-MM-DD
  currency: 'COP';
  seller: Party;
  buyer: Party;
  lines: InvoiceLine[];
  subtotal: Cents;           // base gravable total (sin impuestos)
  taxes: LineTax[];          // totales por impuesto/tarifa
  withholdings: Withholding[]; // retenciones informadas en el documento
  total: Cents;              // a pagar
  source: { adapter: string; externalId?: string };
}

/** Perfil tributario del cliente de Tributa. Lo diligencia el contador en el onboarding. */
export interface TaxProfile {
  nit: string;
  name: string;
  personType: 'juridica' | 'natural';
  ivaResponsable: boolean;
  ivaPeriodicity: 'bimestral' | 'cuatrimestral';
  incResponsable: boolean;
  agenteRetenedor: boolean;
  granContribuyente: boolean;
  /** Autorretención especial de renta (Dec. 2201/2016): tarifa según CIIU (0.4%, 0.8% o 1.6%). */
  autorretencionRentaRate?: number;
  /** Porcentaje de los ingresos netos a provisionar para el impuesto de renta anual. Lo define el contador. */
  rentaProvisionRate: number;
  /** Régimen Simple de Tributación: sustituye renta y se paga por anticipos bimestrales. */
  regimenSimple?: { rate: number };
}
