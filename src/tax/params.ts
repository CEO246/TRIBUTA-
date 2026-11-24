// Parámetros tributarios versionados por año. NINGÚN valor de aquí debe ir a producción sin
// la firma de un contador/revisor fiscal. Cada valor trae `verified` para forzar esa revisión.

export interface Param<T> { value: T; source: string; verified: boolean }

export interface RetefuenteConcept {
  id: string;
  label: string;
  baseUvt: number;          // base mínima en UVT
  rateDeclarante: number;   // %
  rateNoDeclarante?: number;
}

export interface TaxParams {
  year: number;
  uvt: Param<number>;
  reteIvaRate: Param<number>;
  retefuenteConcepts: Param<RetefuenteConcept[]>;
}

const PARAMS: Record<number, TaxParams> = {
  2026: {
    year: 2026,
    uvt: { value: 52374, source: 'Resolución DIAN UVT 2026 (verificar número y valor)', verified: false },
    reteIvaRate: { value: 15, source: 'Art. 437-1 E.T.', verified: false },
    retefuenteConcepts: {
      source: 'Art. 392 y ss. E.T.; Dec. 1625/2016; Dec. 572/2025 modificó bases y tarifas — VALIDAR con contador',
      verified: false,
      value: [
        { id: 'compras', label: 'Compras generales', baseUvt: 10, rateDeclarante: 2.5, rateNoDeclarante: 3.5 },
        { id: 'servicios', label: 'Servicios generales', baseUvt: 2, rateDeclarante: 4, rateNoDeclarante: 6 },
        { id: 'honorarios', label: 'Honorarios y comisiones', baseUvt: 0, rateDeclarante: 11, rateNoDeclarante: 10 },
        { id: 'arriendo_inmuebles', label: 'Arrendamiento de inmuebles', baseUvt: 10, rateDeclarante: 3.5 },
        { id: 'arriendo_muebles', label: 'Arrendamiento de muebles', baseUvt: 0, rateDeclarante: 4 },
        { id: 'transporte_carga', label: 'Transporte de carga', baseUvt: 2, rateDeclarante: 1 },
        { id: 'restaurante_hotel', label: 'Hoteles y restaurantes', baseUvt: 2, rateDeclarante: 3.5 },
      ],
    },
  },
};

export function getParams(year: number): TaxParams {
  const p = PARAMS[year];
  if (!p) throw new Error(`No hay parámetros tributarios cargados para ${year}`);
  return p;
}

/** Lista de parámetros sin validar: bloquea el paso a producción (ver test de "go-live"). */
export function unverifiedParams(year: number): string[] {
  const p = getParams(year);
  return Object.entries(p).filter(([, v]) => typeof v === 'object' && v && 'verified' in v && !v.verified).map(([k]) => k);
}
