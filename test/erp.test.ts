import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alegraAdapter, siigoAdapter } from '../src/integration/adapters/erp-mappers.ts';
import { canonicalJsonAdapter } from '../src/integration/adapters/canonical-json.ts';

test('Alegra: mapea factura con CUFE e IVA', () => {
  const [inv] = alegraAdapter('900123456', 'Demo').parse({ id: 7, date: '2026-11-20', total: 119000, numberTemplate: { prefix: 'FE', number: 7 }, client: { identification: '800555111', name: 'X' }, items: [{ name: 'A', price: 100000, quantity: 1, tax: [{ name: 'IVA', percentage: 19 }] }], stamp: { cufe: 'abc' } });
  assert.equal(inv.number, 'FE7');
  assert.equal(inv.taxes[0].amount, 19000_00);
});

test('Siigo: sin CUFE no se provisiona', () => {
  assert.throws(() => siigoAdapter('900123456', 'Demo').parse({ id: 1, date: '2026-11-20', total: 1, items: [] }), /sin CUFE/);
});

test('JSON canónico: exige montos enteros en centavos', () => {
  const base = { cufe: 'x', number: '1', documentType: 'factura', issueDate: '2026-11-20', seller: { nit: '1', name: 'a' }, buyer: { nit: '2', name: 'b' }, taxes: [], withholdings: [], subtotal: 100.5, total: 100 };
  assert.throws(() => canonicalJsonAdapter.parse(base), /centavos/);
});
