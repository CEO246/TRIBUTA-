# Tributa — núcleo (tributa-core)

Núcleo de Tributa: recibe facturas electrónicas de **cualquier** sistema contable, calcula qué impuestos provisionar por factura e instruye al banco aliado a apartar ese dinero en la subcuenta tributaria **del cliente**.

```bash
npm install
npm test        # 13 pruebas: UBL DIAN, motor de impuestos, adaptadores ERP, API
npm start       # API demo en http://localhost:3000 (API key: demo-key, NIT 900123456)
```

Requiere Node ≥ 22.18 (ejecuta TypeScript nativo, sin compilar).

Ver [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

> ⚠️ Los parámetros tributarios (UVT 2026, bases y tarifas de retención tras el Dec. 572/2025, reteIVA) están marcados `verified: false`. No se usa en producción hasta que un contador los firme.
