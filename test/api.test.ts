import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, sign } from '../src/api/server.ts';
import { xml, attached, seller } from './helpers.ts';

test('API: ingesta XML, idempotencia por CUFE, resumen y webhook firmado', async () => {
  const { server, outbox } = createServer({ apiKeys: new Map([['k1', seller.nit]]), profiles: new Map([[seller.nit, seller]]), webhook: { url: 'https://erp.example/hook', secret: 's3cr3t' } });
  await new Promise<void>(r => server.listen(0, r));
  const port = (server.address() as any).port;
  const base = `http://localhost:${port}/v1/clients/${seller.nit}`;
  const post = (body: string) => fetch(`${base}/invoices`, { method: 'POST', headers: { authorization: 'Bearer k1', 'content-type': 'application/xml' }, body });
  try {
    const r1 = await post(xml);
    assert.equal(r1.status, 201);
    const [rec] = await r1.json();
    assert.equal(rec.netToProvision, 2_150_000_00);
    assert.equal(rec.transfer.status, 'aceptada');

    const r2 = await post(attached); // mismo CUFE llegando por otra vía
    assert.equal(r2.status, 200);
    assert.equal((await r2.json())[0].duplicate, true);

    const sum = await (await fetch(`${base}/summary`, { headers: { authorization: 'Bearer k1' } })).json();
    assert.equal(sum['IVA:2026-B6'], 1_900_000_00);

    assert.equal(outbox.length, 1);
    assert.equal(outbox[0].signature, sign(outbox[0].body, 's3cr3t'));

    const bad = await fetch(`${base}/summary`, { headers: { authorization: 'Bearer otra' } });
    assert.equal(bad.status, 401);
  } finally { server.close(); }
});
