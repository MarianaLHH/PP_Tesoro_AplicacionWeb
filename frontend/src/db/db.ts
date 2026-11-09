import Dexie, { type EntityTable } from 'dexie';
import Decimal from 'decimal.js';
import { calcularLoteDeCompra } from '@tesoro/dominio';

/**
 * Base de datos local (IndexedDB).
 *
 * La aplicación escribe SIEMPRE aquí primero y luego sincroniza.
 * Así el registro funciona sin conexión, que es el requisito central.
 *
 * Los importes y pesos se guardan como STRING para no perder precisión:
 * IndexedDB no tiene tipo decimal y `number` es flotante binario.
 */

export type EstadoSync = 'pendiente' | 'sincronizado' | 'error';
export type EstadoOperacion = 'BORRADOR' | 'CONFIRMADA' | 'ANULADA';

export interface Cliente {
  id: string;
  nombre: string;
  ci?: string;
  telefono?: string;
  direccion?: string;
  notas?: string;
  activo: boolean;
  actualizadoEn: string;
  estadoSync: EstadoSync;
}

export interface Cotizacion {
  id: string;
  fecha: string;
  /** USD por onza troy. */
  onzaCierreUsd: string;
  /** Bs por USD. */
  tipoCambio: string;
  actualizadoEn: string;
  estadoSync: EstadoSync;
}

export interface CompraItem {
  id: string;
  pesoAntesFundirG?: string | null;
  pesoDespuesFundirG: string;
  mermaG?: string | null;
  ley: string;
  bsPorGramo: string;
  totalBs: string;
  pesoFinoG: string;
  observacion?: string;
}

export interface Compra {
  id: string;
  /** Correlativo definitivo; lo asigna el servidor al sincronizar. */
  numero?: number | null;
  /** Provisional mientras está offline. */
  numeroLocal: string;
  fecha: string;
  clienteId: string;
  clienteNombre: string;
  onzaCierreUsd: string;
  tipoCambio: string;
  totalBs: string;
  estado: EstadoOperacion;
  observacion?: string;
  items: CompraItem[];
  actualizadoEn: string;
  estadoSync: EstadoSync;
}

/**
 * Pieza física de oro en caja fuerte.
 *
 * Nace de una compra (todas sus piezas se funden en una) o de fundir varios
 * lotes juntos. Siempre se vende completa. La ley y el fino son ESTIMADOS: la
 * ley real la mide el comprador al momento de la venta.
 */
export type EstadoLote = 'DISPONIBLE' | 'FUNDIDO' | 'VENDIDO';

export interface Lote {
  id: string;
  /** Código corto para etiquetar la pieza y leerla con la pistola. */
  codigo: string;
  origen: 'COMPRA' | 'FUNDICION';
  /** Compra o fundición que lo originó. */
  origenId: string;
  fecha: string;
  /** Clientes de los que proviene el material, para trazabilidad. */
  clientes: string[];
  pesoBrutoG: string;
  pesoFinoG: string;
  leyEstimada: string;
  /** Lo que se pagó por el material. Se arrastra hasta la venta. */
  costoBs: string;
  estado: EstadoLote;
  /** Fundición o venta que lo consumió. */
  destinoId?: string;
  actualizadoEn: string;
  estadoSync: EstadoSync;
}

/** Varios lotes que se funden en uno solo (caso C1 + C2). */
export interface Fundicion {
  id: string;
  fecha: string;
  loteIds: string[];
  loteResultanteId: string;
  pesoBrutoOrigenG: string;
  pesoResultanteG: string;
  mermaG: string;
  pesoFinoG: string;
  leyEstimada: string;
  costoBs: string;
  observacion?: string;
  actualizadoEn: string;
  estadoSync: EstadoSync;
}

/** Un lote dentro de una venta, liquidado con la ley que midió el comprador. */
export interface VentaItem {
  /** `null` solo en ventas anteriores al módulo de lotes. */
  loteId: string | null;
  loteCodigo: string;
  pesoG: string;
  ley: string;
  pesoFinoG: string;
  pesoFinoEstimadoG: string;
  /** Ausente en ventas anteriores a que se cobrara en bolivianos. */
  bsPorGramo?: string;
  precioGramoUsd: string;
  totalUsd: string;
  totalBs: string;
  costoBs: string | null;
}

/**
 * Venta de uno o varios lotes completos al comprador final.
 *
 * El comprador paga en bolivianos (`totalBs`); `totalUsd` es la referencia.
 * Onza, tipo de cambio y ley los fija el comprador y quedan congelados en la
 * venta.
 */
export interface Venta {
  id: string;
  /** Correlativo definitivo; lo asigna el servidor al sincronizar. */
  numero?: number | null;
  /** Provisional mientras está offline. */
  numeroLocal: string;
  fecha: string;
  /** Comprador final: exportador, refinería o comercializadora. */
  destino: string;
  onzaCierreUsd: string;
  tipoCambio: string;
  items: VentaItem[];
  totalUsd: string;
  totalBs: string;
  /** `null` en ventas anteriores al módulo de lotes: no se conoce el costo. */
  costoBs: string | null;
  gananciaBs: string | null;
  estado: EstadoOperacion;
  observacion?: string;
  actualizadoEn: string;
  estadoSync: EstadoSync;
}

/** Cola de salida: operaciones esperando ser enviadas al servidor. */
export interface Outbox {
  id: string;
  entidad: 'cliente' | 'cotizacion' | 'compra' | 'fundicion' | 'venta';
  entidadId: string;
  accion: 'crear' | 'editar' | 'anular';
  payload: unknown;
  intentos: number;
  ultimoError?: string;
  /** El servidor rechazó el dato: reintentar sin corregirlo no lo arregla. */
  rechazada?: boolean;
  creadoEn: string;
}

const db = new Dexie('tesoro') as Dexie & {
  clientes: EntityTable<Cliente, 'id'>;
  cotizaciones: EntityTable<Cotizacion, 'id'>;
  compras: EntityTable<Compra, 'id'>;
  ventas: EntityTable<Venta, 'id'>;
  lotes: EntityTable<Lote, 'id'>;
  fundiciones: EntityTable<Fundicion, 'id'>;
  outbox: EntityTable<Outbox, 'id'>;
};

db.version(1).stores({
  clientes: 'id, nombre, estadoSync',
  cotizaciones: 'id, fecha, estadoSync',
  compras: 'id, fecha, clienteId, estado, estadoSync',
  outbox: 'id, entidad, creadoEn',
});

/** v2: módulo de ventas. Las tablas anteriores se conservan tal cual. */
db.version(2).stores({
  ventas: 'id, fecha, estado, estadoSync',
});

/**
 * v3: lotes y fundición. Cada compra existente pasa a ser un lote disponible.
 * Las ventas anteriores no sabían qué material sacaban: se convierten a un
 * ítem sin lote y sin costo.
 */
db.version(3)
  .stores({
    lotes: 'id, codigo, estado, fecha, origenId',
    fundiciones: 'id, fecha',
  })
  .upgrade(async (tx) => {
    const compras: Compra[] = await tx.table('compras').toArray();
    for (const compra of compras) {
      if (compra.estado === 'ANULADA' || compra.items.length === 0) continue;
      await tx.table('lotes').add(loteDeCompra(compra));
    }

    await tx
      .table('ventas')
      .toCollection()
      .modify((venta: Record<string, unknown>) => {
        if (Array.isArray(venta.items)) return;
        venta.items = [
          {
            loteId: null,
            loteCodigo: '—',
            pesoG: venta.pesoG,
            ley: venta.ley,
            pesoFinoG: venta.pesoFinoG,
            pesoFinoEstimadoG: venta.pesoFinoG,
            precioGramoUsd: venta.precioGramoUsd,
            totalUsd: venta.totalUsd,
            totalBs: venta.totalBs,
            costoBs: null,
          },
        ];
        venta.costoBs = null;
        venta.gananciaBs = null;
        delete venta.pesoG;
        delete venta.ley;
        delete venta.pesoFinoG;
        delete venta.precioGramoUsd;
      });
  });

/**
 * v4: el campo `margenBs` de las ventas pasa a llamarse `gananciaBs`.
 * Se copia el valor guardado para que las ventas anteriores no lo pierdan.
 */
db.version(4).upgrade(async (tx) => {
  await tx
    .table('ventas')
    .toCollection()
    .modify((venta: Record<string, unknown>) => {
      if ('margenBs' in venta) {
        venta.gananciaBs = venta.margenBs ?? null;
        delete venta.margenBs;
      }
    });
});

export { db };

/** Cotización vigente = la más reciente registrada. */
export async function cotizacionVigente(): Promise<Cotizacion | undefined> {
  return db.cotizaciones.orderBy('fecha').last();
}

/**
 * Encola una operación para enviarla cuando haya conexión.
 *
 * Llamarla DENTRO de la misma transacción que guarda la entidad: si una de
 * las dos escrituras falla, no debe quedar la otra a medias.
 */
export async function encolar(
  entidad: Outbox['entidad'],
  entidadId: string,
  accion: Outbox['accion'],
  payload: unknown,
): Promise<void> {
  await db.outbox.add({
    id: crypto.randomUUID(),
    entidad,
    entidadId,
    accion,
    payload,
    intentos: 0,
    creadoEn: new Date().toISOString(),
  });
}

/**
 * Registra una cotización nueva. Recibe valores ya validados y normalizados
 * (ver `entrada.ts`). Registro y cola en la misma transacción.
 */
export async function registrarCotizacion(
  onzaCierreUsd: string,
  tipoCambio: string,
): Promise<void> {
  const ahora = new Date().toISOString();
  const cotizacion: Cotizacion = {
    id: crypto.randomUUID(),
    fecha: ahora,
    onzaCierreUsd,
    tipoCambio,
    actualizadoEn: ahora,
    estadoSync: 'pendiente',
  };
  await db.transaction('rw', db.cotizaciones, db.outbox, async () => {
    await db.cotizaciones.add(cotizacion);
    await encolar('cotizacion', cotizacion.id, 'crear', cotizacion);
  });
}

/** Código corto y único sin depender del servidor: L-3FA9C1. */
export function codigoLote(id: string): string {
  return `L-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

/** Lote que origina una compra confirmada. */
export function loteDeCompra(compra: Compra): Lote {
  const r = calcularLoteDeCompra(compra.items);
  const id = crypto.randomUUID();
  return {
    id,
    codigo: codigoLote(id),
    origen: 'COMPRA',
    origenId: compra.id,
    fecha: compra.fecha,
    clientes: [compra.clienteNombre],
    pesoBrutoG: r.pesoBrutoG.toString(),
    pesoFinoG: r.pesoFinoG.toString(),
    leyEstimada: r.leyEstimada.toString(),
    costoBs: r.costoBs.toString(),
    estado: 'DISPONIBLE',
    actualizadoEn: new Date().toISOString(),
    estadoSync: 'pendiente',
  };
}

/**
 * Stock de oro fino disponible, en gramos: la suma de los lotes en caja.
 *
 * Es una cifra estimada (la ley real la mide el comprador), pero es la única
 * que permite comparar material de distinta ley.
 */
export async function stockFinoDisponible(): Promise<Decimal> {
  const lotes = await db.lotes.where('estado').equals('DISPONIBLE').toArray();
  return lotes
    .reduce((fino, lote) => fino.plus(lote.pesoFinoG), new Decimal(0))
    .toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
}

/** Fecha de hoy en la zona horaria del dispositivo, `YYYY-MM-DD`. */
export function fechaHoy(): string {
  const ahora = new Date();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${ahora.getFullYear()}-${mes}-${dia}`;
}

/**
 * Número provisional legible mientras la operación no llega al servidor.
 * Se marca con `?` para que nadie lo confunda con el correlativo definitivo.
 */
export function numeroProvisional(prefijo: 'COM' | 'VTA' = 'COM'): string {
  const ahora = new Date();
  const sello = ahora.toISOString().slice(2, 16).replace(/[-:T]/g, '');
  return `${prefijo}-?${sello}`;
}
