import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ublDianAdapter } from '../src/integration/adapters/ubl-dian.ts';
import { xml, attached } from './helpers.ts';

test('UBL: extrae CUFE, partes, IVA y retefuente en centavos', () => {
  const [inv] = ublDianAdapter.parse(xml);
  assert.equal(inv.cufe, 'cufe-test-0001');
  assert.equal(inv.seller.nit, '900123456');
  assert.equal(inv.buyer.nit, '800555111');
  assert.equal(inv.subtotal, 10_000_000_00);
  assert.deepEqual(inv.taxes, [{ code: 'IVA', rate: 19, base: 10_000_000_00, amount: 1_900_000_00 }]);
  assert.deepEqual(inv.withholdings, [{ code: 'RETEFUENTE', rate: 2.5, base: 10_000_000_00, amount: 250_000_00 }]);
  assert.equal(inv.lines.length, 1);
});

test('UBL: desempaca AttachedDocument (lo que llega por correo)', () => {
  const [inv] = ublDianAdapter.parse(attached);
  assert.equal(inv.cufe, 'cufe-test-0001');
});

test('UBL: rechaza documento sin CUFE', () => {
  assert.throws(() => ublDianAdapter.parse(xml.replace(/<cbc:UUID[^>]*>.*<\/cbc:UUID>/, '')), /sin CUFE/);
});
