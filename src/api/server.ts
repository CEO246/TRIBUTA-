// API REST mínima (sin framework) para el MVP. Endpoints:
//  POST /v1/clients/:nit/invoices   Content-Type xml → ubl-dian | json → tributa-json | header X-Tributa-Source=siigo|alegra
//  GET  /v1/clients/:nit/provisions  libro de provisiones
//  GET  /v1/clients/:nit/summary     acumulado por obligación y periodo
// Webhooks salientes firmados con HMAC-SHA256 (header X-Tributa-Signature).
import http from 'node:http';
import crypto from 'node:crypto';
import { registerAdapter, getAdapter, listAdapters } from '../integration/adapter.ts';
import { ublDianAdapter } from '../integration/adapters/ubl-dian.ts';
import { canonicalJsonAdapter } from '../integration/adapters/canonical-json.ts';
import { ProvisioningService, MemoryStore } from '../provisioning/service.ts';
import { SandboxBank } from '../banking/port.ts';
import type { TaxProfile } from '../domain/types.ts';

registerAdapter(ublDianAdapter);
registerAdapter(canonicalJsonAdapter);

export function sign(body: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

export function createServer(opts: { apiKeys: Map<string, string>; profiles: Map<string, TaxProfile>; webhook?: { url: string; secret: string } }) {
  const outbox: { event: string; body: string; signature: string }[] = [];
  const service = new ProvisioningService(new MemoryStore(), new SandboxBank(), opts.profiles, (event, data) => {
    if (!opts.webhook) return;
    const body = JSON.stringify({ event, data, sentAt: new Date().toISOString() });
    outbox.push({ event, body, signature: sign(body, opts.webhook.secret) }); // un worker real lo entrega con reintentos
  });

  const server = http.createServer(async (req, res) => {
    const send = (code: number, obj: unknown) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    try {
      const m = req.url?.match(/^\/v1\/clients\/(\d+)\/(invoices|provisions|summary)$/);
      if (!m) return send(404, { error: 'ruta no encontrada', adapters: listAdapters() });
      const [, nit, resource] = m;
      const key = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
      if (opts.apiKeys.get(key) !== nit) return send(401, { error: 'API key inválida para este NIT' });

      if (req.method === 'GET' && resource === 'provisions') return send(200, await service.store.list(nit));
      if (req.method === 'GET' && resource === 'summary') return send(200, await service.summary(nit));
      if (req.method === 'POST' && resource === 'invoices') {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const raw = Buffer.concat(chunks).toString('utf8');
        const ct = String(req.headers['content-type'] ?? '');
        const source = String(req.headers['x-tributa-source'] ?? (ct.includes('xml') ? 'ubl-dian' : 'tributa-json'));
        const invoices = getAdapter(source).parse(raw);
        const results = [];
        for (const inv of invoices) results.push(await service.ingest(nit, inv));
        return send(results.every(r => r.duplicate) ? 200 : 201, results.map(r => ({ duplicate: r.duplicate, ...r.record })));
      }
      return send(405, { error: 'método no permitido' });
    } catch (e: any) {
      return send(422, { error: e.message });
    }
  });
  return { server, service, outbox };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const demo: TaxProfile = { nit: '900123456', name: 'Demo SAS', personType: 'juridica', ivaResponsable: true, ivaPeriodicity: 'bimestral', incResponsable: false, agenteRetenedor: true, granContribuyente: false, rentaProvisionRate: 5 };
  const { server } = createServer({ apiKeys: new Map([['demo-key', demo.nit]]), profiles: new Map([[demo.nit, demo]]) });
  server.listen(3000, () => console.log('Tributa API en http://localhost:3000 (API key: demo-key, NIT 900123456)'));
}
