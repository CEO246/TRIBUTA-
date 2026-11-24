# Arquitectura de integración de Tributa

## La decisión clave
"Integrarse con cualquier módulo contable" no se logra construyendo un conector por cada ERP. En Colombia hay cientos de softwares contables, pero **todos** emiten la misma factura electrónica: XML UBL 2.1 validado por la DIAN, con CUFE. Ese es el estándar universal y Tributa se conecta ahí.

## Tres puertas de entrada (en orden de prioridad)

| Puerta | Quién la usa | Esfuerzo para el cliente | Estado |
|---|---|---|---|
| 1. XML UBL DIAN (`ubl-dian`) | Cualquier empresa con factura electrónica, sin importar el ERP. Llega por API, por carga manual o reenviando el correo de facturación (AttachedDocument). | Casi nulo | Construido y probado |
| 2. JSON canónico (`tributa-json`) | ERPs propios, el módulo contable de AbundBank, integradores. | Un desarrollador, días | Construido y probado |
| 3. Adaptadores nativos (`siigo`, `alegra`, World Office…) | Solo cuando un ERP concentre muchos clientes y se quiera sincronización automática por su API. | Ninguno (OAuth/token) | Mapeos esqueleto, **sin probar contra sandbox** |

Facturas de **compra** (para IVA descontable y retenciones que practica el cliente) entran por la misma puerta 1: son los XML que el cliente recibe de sus proveedores.

## Flujo
```
ERP / correo / AbundBank ──► Adaptador ──► CanonicalInvoice ──► Motor de impuestos ──► Libro de provisiones
                                                                                        │
                                                    BankPort (banco aliado, mandato) ◄──┤ instrucción idempotente (CUFE)
                                                    Webhook firmado HMAC al ERP     ◄──┘ provision.created
```

## Reglas de diseño
- **Idempotencia por CUFE.** El mismo documento puede llegar por XML y por API: se provisiona una sola vez.
- **Centavos enteros.** Nunca coma flotante con dinero.
- **Provisionar ≠ pagar.** Por factura se aparta; a la DIAN se paga por periodo el neto (F.300 IVA, F.350 retenciones, F.110 renta, F.2593 Simple).
- **Tributa no toca el dinero.** `BankPort` solo instruye al banco aliado; el saldo es del cliente.
- **Parámetros versionados y con firma de contador.** Un test documenta qué parámetros siguen sin validar.

## Qué calcula hoy el motor
- Vendedor: IVA generado (menos reteIVA sufrida), INC, autorretención especial de renta, provisión de renta neta de retenciones sufridas, o anticipo del Régimen Simple.
- Comprador: IVA descontable (resta), retefuente y reteIVA practicadas como agente retenedor (se provisionan al 100%); reteICA se reporta pero no va a la DIAN.
- Notas crédito reversan.

## Pendientes conocidos
1. Validación de parámetros por contador (UVT 2026, Dec. 572/2025).
2. Persistencia en Supabase/Postgres (hoy `MemoryStore`).
3. Entrega real de webhooks con reintentos; hoy quedan en `outbox`.
4. Prorrateo de IVA descontable (art. 490 E.T.), ICA municipal, retención a personas naturales por depuración.
5. Probar adaptadores Siigo/Alegra contra sus sandboxes.
6. Banco aliado real detrás de `BankPort`.
