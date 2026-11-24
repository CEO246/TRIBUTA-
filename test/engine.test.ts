import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ublDianAdapter } from '../src/integration/adapters/ubl-dian.ts';
import { computeProvision } from '../src/tax/engine.ts';
import { unverifiedParams } from '../src/tax/params.ts';
import { xml, seller, buyer } from './helpers.ts';

const [inv] = ublDianAdapter.parse(xml);

test('Vendedor: provisiona IVA completo y renta neta de la retención sufrida', () => {
  const r = computeProvision(inv, seller);
  assert.equal(r.role, 'vendedor');
  const iva = r.entries.find(e => e.obligation === 'IVA')!;
  assert.equal(iva.amount, 1_900_000_00);
  assert.equal(iva.period, '2026-B6');
  const renta = r.entries.find(e => e.obligation === 'RENTA')!;
  assert.equal(renta.amount, 500_000_00 - 250_000_00); // 5% de 10M menos 250k ya retenidos
  assert.equal(r.netToProvision, 1_900_000_00 + 250_000_00);
});

test('Comprador agente retenedor: IVA descontable resta, retenciones se provisionan 100%', () => {
  const r = computeProvision(inv, buyer);
  assert.equal(r.role, 'comprador');
  assert.equal(r.entries.find(e => e.obligation === 'IVA')!.amount, -1_900_000_00);
  const ret = r.entries.filter(e => e.obligation === 'RETENCIONES');
  assert.equal(ret.find(e => e.concept.startsWith('Retefuente'))!.amount, 250_000_00);
  assert.equal(ret.find(e => e.concept.startsWith('ReteIVA'))!.amount, 285_000_00); // gran contribuyente: 15% de 1.9M
});

test('Nota crédito reversa la provisión', () => {
  const r = computeProvision({ ...inv, documentType: 'nota_credito' }, seller);
  assert.equal(r.entries.find(e => e.obligation === 'IVA')!.amount, -1_900_000_00);
  assert.equal(r.netToProvision, 0);
});

test('Régimen Simple sustituye renta', () => {
  const r = computeProvision(inv, { ...seller, regimenSimple: { rate: 3.4 } });
  assert.ok(!r.entries.some(e => e.obligation === 'RENTA'));
  assert.equal(r.entries.find(e => e.obligation === 'SIMPLE')!.amount, 340_000_00);
});

test('Factura ajena se rechaza', () => {
  assert.throws(() => computeProvision(inv, { ...seller, nit: '111' }), /no pertenece/);
});

test('Guardia de producción: hay parámetros tributarios sin validar por contador', () => {
  // Este test DOCUMENTA el bloqueo: cuando un contador valide UVT, tarifas y bases, se marcan verified:true y la lista queda vacía.
  assert.deepEqual(unverifiedParams(2026).sort(), ['reteIvaRate', 'retefuenteConcepts', 'uvt']);
});
