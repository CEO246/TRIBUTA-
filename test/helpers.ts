import fs from 'node:fs';
import type { TaxProfile } from '../src/domain/types.ts';
export const xml = fs.readFileSync(new URL('./fixtures/factura-venta.xml', import.meta.url), 'utf8');
export const attached = `<?xml version="1.0"?><AttachedDocument xmlns="urn:oasis:names:specification:ubl:schema:xsd:AttachedDocument-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"><cac:Attachment><cac:ExternalReference><cbc:Description><![CDATA[${xml.replace(/^<\?xml[^>]*\?>/, '')}]]></cbc:Description></cac:ExternalReference></cac:Attachment></AttachedDocument>`;
export const seller: TaxProfile = { nit: '900123456', name: 'Demo SAS', personType: 'juridica', ivaResponsable: true, ivaPeriodicity: 'bimestral', incResponsable: false, agenteRetenedor: true, granContribuyente: false, rentaProvisionRate: 5 };
export const buyer: TaxProfile = { nit: '800555111', name: 'Cliente Grande SA', personType: 'juridica', ivaResponsable: true, ivaPeriodicity: 'bimestral', incResponsable: false, agenteRetenedor: true, granContribuyente: true, rentaProvisionRate: 5 };
