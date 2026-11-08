# Sistema de Registro de Compra y Venta de Oro — Arquitectura

> Estado: **diseño confirmado**. Fórmulas verificadas contra `COMPRA ORO LIQUIDACION.xlsx`
> — ver [reglas-de-calculo.md](reglas-de-calculo.md). Backend: **NestJS**.

## 1. Contexto y restricciones

| Dimensión | Valor |
|---|---|
| Sucursales | 1 (una ciudad) |
| Volumen | ~20 operaciones/día |
| Compra a | Personas naturales |
| Venta a | Exportadores |
| Fundición | Ocasional, bajo demanda |
| Medio de pago | Efectivo (predominante) |
| Conectividad | **Debe operar sin internet** |
| Plataformas | Web + móvil |
| Hardware | Pistola lectora de códigos |
| Despliegue | Nube |
| Montos | Editables en esta fase (con bitácora de cambios) |

**Conclusión de diseño:** el volumen no justifica microservicios, colas ni caché distribuido.
El costo real está en *offline-first*, *trazabilidad de lotes* y *cuadre de caja*.
Se diseña un **monolito modular** con **cliente local-first**.

## 2. Arquitectura general

```
┌─────────────────────────────────────────────┐
│  PWA (React + TypeScript)                   │
│  Navegador de escritorio y móvil            │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │ UI  ->  Dominio  ->  Repositorio local│  │
│  └───────────────────────────────────────┘  │
│                    |                        │
│        IndexedDB (Dexie)  +  Outbox         │
└──────────────────┬──────────────────────────┘
                   │ HTTPS (cuando hay red)
                   v
┌─────────────────────────────────────────────┐
│  API REST (monolito modular)                │
│  Auth · Sync · Módulos de dominio           │
└──────────────────┬──────────────────────────┘
                   v
            PostgreSQL (nube)
```

### Por qué PWA y no app nativa

Una sola base de código cubre web y móvil, se instala en el teléfono,
funciona sin conexión y **la pistola lectora se comporta como un teclado (HID)**:
basta un campo de texto enfocado. No se requiere SDK nativo.

## 3. Módulos del dominio

Fronteras internas claras; un solo despliegue. Si algún módulo crece, se extrae sin reescribir.

| Módulo | Responsabilidad |
|---|---|
| **Identidad** | Usuarios, roles, permisos, sesión |
| **Personas** | Proveedores (personas naturales) y compradores (exportadores) |
| **Precios** | Precio base por gramo fino, moneda, tipo de cambio, vigencia |
| **Compras** | Registro de compra, piezas, pesaje, ley, cálculo de peso fino |
| **Inventario** | Lotes de oro, existencias en peso fino, movimientos |
| **Fundición** | Consume lotes -> produce lote nuevo; registra merma |
| **Ventas** | Venta a exportador, consumo de lotes, ganancia |
| **Caja** | Sesiones/turnos, ingresos, egresos, arqueo y cuadre diario |
| **Auditoría** | Bitácora append-only de toda creación, edición y anulación |
| **Reportes** | Kardex de oro, estado de caja, márgenes, operaciones por período |

## 4. Modelo de datos (preliminar)

> Los campos de cálculo se ajustarán al recibir el Excel con las fórmulas.

### Personas

- `proveedor`: id, ci, nombre, telefono, direccion, foto_url?, notas
- `comprador`: id, razon_social, nit, contacto, pais_destino?

### Precios

- `precio_base`: id, fecha_vigencia, moneda, precio_gramo_fino, tipo_cambio, usuario_id

### Compra

- `compra`: id, numero, fecha, proveedor_id, moneda, tipo_cambio, total,
  estado (`borrador` | `confirmada` | `anulada`), caja_sesion_id, usuario_id
- `compra_item`: id, compra_id, peso_antes_fundir_g?, peso_despues_fundir_g,
  merma_g (derivada), ley, bs_por_gramo, total_bs, observacion

Cada compra congela sus parámetros de valoración:
`onza_cierre_usd`, `tipo_cambio`, y de ahí `bs_por_gramo`.

> **Regla central del negocio** (verificada contra el Excel):
>
> ```
> bs_por_gramo = (onza_cierre_usd × ley) / 31.1035 × tipo_cambio
> total_bs     = peso_despues_fundir_g × bs_por_gramo
> ```
>
> La ley se aplica **dentro** del precio por gramo; el precio multiplica al peso
> bruto después de fundir. Detalle completo en [reglas-de-calculo.md](reglas-de-calculo.md).

### Inventario

- `lote`: id, codigo, origen (`compra` | `fundicion`), fecha, ley_promedio,
  peso_fino_inicial_g, peso_fino_disponible_g, estado
- `movimiento_inventario` *(append-only)*: id, lote_id, tipo
  (`entrada_compra` | `salida_venta` | `entrada_fundicion` | `salida_fundicion` | `merma` | `ajuste`),
  peso_fino_g (con signo), referencia_tipo, referencia_id, fecha, usuario_id

El saldo de un lote **siempre** se deriva de sus movimientos. Nunca se edita un saldo a mano.

### Lotes, fundición y venta (confirmado con el cliente)

Hay tres casos de negocio, que son **el mismo flujo** con distinta fecha:

| Caso | Flujo |
|---|---|
| A | compra → lote → venta el mismo día |
| B | compra → lote → venta otro día |
| C | compra C1 → lote 1 ─┐ fundición conjunta → lote 3 → venta otro día<br>compra C2 → lote 2 ─┘ |

Reglas confirmadas:

1. **Un lote por compra.** Todas las piezas de una compra se funden en una
   (`PESO A/F` → `PESO D/F` por pieza, dentro de la compra).
2. **El lote se vende siempre completo.** No hay ventas parciales.
3. **Se pueden fundir juntos lotes de días y clientes distintos** (caso C).
   Solo se pesa la pieza resultante; se conserva el fino y se suma el costo.
4. **La ley real la mide el comprador al vender.** Antes de eso, ley y fino del
   lote son estimados. La venta guarda ambos: la diferencia es ganancia o
   pérdida de ley.
5. **Onza y tipo de cambio de la venta los fija el comprador**, no la cotización
   de compras.

- `lote`: codigo, origen (`COMPRA` | `FUNDICION`), peso_bruto_g, peso_fino_g,
  ley_estimada, costo_bs, estado (`DISPONIBLE` | `FUNDIDO` | `VENDIDO`)
- `fundicion`: lotes fundidos → lote resultante, peso_bruto_origen_g,
  peso_resultante_g, merma_g, peso_fino_g, ley_estimada, costo_bs
- `venta`: numero, fecha, destino, onza_cierre_usd, tipo_cambio, total_usd,
  total_bs, costo_bs, ganancia_bs
- `venta_item` (uno por lote): peso_g, ley (del comprador), peso_fino_g,
  peso_fino_estimado_g, precio_gramo_usd, total_usd, total_bs, costo_bs

Fórmulas en `shared/src/calculo-oro.ts`: `calcularLoteDeCompra`,
`calcularFundicion`, `calcularVentaDeLotes`.

### Caja

- `caja_sesion`: id, fecha_apertura, fecha_cierre?, saldo_inicial,
  saldo_final_declarado?, saldo_final_calculado?, diferencia?, usuario_id
- `caja_movimiento`: id, caja_sesion_id, tipo (`ingreso` | `egreso`), concepto,
  monto, moneda, referencia_tipo, referencia_id, fecha

Toda compra confirmada genera un **egreso**; toda venta, un **ingreso**.
El cuadre compara `saldo_final_declarado` contra `saldo_final_calculado`.

### Auditoría

- `auditoria`: id, entidad, entidad_id, accion (`crear` | `editar` | `anular`),
  datos_antes (jsonb), datos_despues (jsonb), usuario_id, fecha, dispositivo_id

Nada se borra físicamente. Anular = marcar estado `anulada` + contraasiento en inventario y caja.

## 5. Estrategia offline

Con un solo punto de venta y pocos usuarios, los conflictos son casi inexistentes.
Se evita complejidad innecesaria (CRDTs, vector clocks).

1. **Identificadores en el cliente**: cada registro nace con un `UUID` generado localmente.
   Sirve como clave de idempotencia — reenviar no duplica.
2. **Patrón outbox**: las operaciones se guardan en IndexedDB y se encolan.
   Un worker las envía cuando hay red, en orden, con reintentos.
3. **Numeración correlativa**: el número visible (`COM-000123`) lo asigna **el servidor** al
   sincronizar. Offline se muestra un número provisional claramente marcado.
4. **Datos maestros en caché**: proveedores, compradores, precios y lotes se replican
   localmente para poder operar sin red.
5. **Resolución de conflictos**: última escritura gana, con la versión anterior preservada
   en `auditoria`. Suficiente y auditable a este volumen.
6. **Indicador visible** de estado: `sincronizado` / `pendiente (n)` / `sin conexión`.

## 6. Stack propuesto

| Capa | Tecnología | Motivo |
|---|---|---|
| Frontend | React + TypeScript + Vite, PWA | Web y móvil con una sola base de código |
| Persistencia local | IndexedDB vía Dexie.js | Maduro, consultas cómodas, soporta el outbox |
| Backend | NestJS (Node + TS) | Mismo lenguaje que el frontend; estructura modular por defecto |
| Base de datos | PostgreSQL | Transaccional, `jsonb` para auditoría, decimales exactos |
| Auth | JWT + refresh token, roles | Simple y suficiente |
| Despliegue | Contenedor (Railway / Render / Fly) + Postgres gestionado | Costo bajo acorde al volumen |

**Regla no negociable:** todo importe y todo peso se almacenan como `DECIMAL`,
nunca como `float`. En oro, un error de redondeo es dinero perdido.

Alternativa válida al backend: **FastAPI (Python)**, si el equipo domina Python.
No cambia la arquitectura.

## 7. Decisiones diferidas

- Facturación electrónica (SIAT) — fuera de alcance en esta fase; el modelo deja lugar para ello.
- Reportes a la UIF por operaciones en efectivo — a evaluar con el cliente.
- Captura de foto/CI del proveedor — el modelo lo contempla, la implementación queda por definir.
- Multi-moneda — soportada en el modelo (moneda + tipo de cambio en cada operación).

## 8. Siguiente paso

Recibir el **Excel con las fórmulas de cálculo** para fijar:

- Fórmula exacta de peso fino y de valoración
- Tratamiento de descuentos y mermas
- Diferencias de cálculo entre compra y venta
