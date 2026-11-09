import { db, type Outbox } from './db';
import {
  dispositivoId,
  marcarSesionVencida,
  mensajeDeError,
  obtenerSesion,
} from '../sesion';

/**
 * Vacía la cola de salida hacia `/api/sync`, en orden y por tramos.
 *
 * - Sin red, sin sesión o con la sesión vencida no hace nada: la cola espera.
 * - Una operación rechazada (dato inválido) detiene el envío: lo que sigue
 *   puede depender de ella. Queda marcada con su mensaje.
 * - Un fallo del servidor o de red se reintenta en la siguiente vuelta.
 */

const TRAMO = 25;

type Resultado =
  | { id: string; estado: 'ok'; numero?: number }
  | { id: string; estado: 'rechazada'; mensaje: string };

let enCurso: Promise<void> | null = null;

/** Seguro de llamar muchas veces: si ya hay un envío en curso, se une a él. */
export function sincronizar(): Promise<void> {
  if (!enCurso) enCurso = ejecutar().finally(() => (enCurso = null));
  return enCurso;
}

async function ejecutar() {
  for (;;) {
    const sesion = obtenerSesion();
    if (!sesion || sesion.vencida || !navigator.onLine) return;

    const tramo = await db.outbox.orderBy('creadoEn').limit(TRAMO).toArray();
    if (tramo.length === 0) return;

    const operaciones = await Promise.all(
      tramo.map(async (op) => ({
        id: op.id,
        entidad: op.entidad,
        entidadId: op.entidadId,
        accion: op.accion,
        payload: await datosActuales(op),
      })),
    );

    let resp: Response;
    try {
      resp = await fetch('/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sesion.token}`,
        },
        body: JSON.stringify({ dispositivoId: dispositivoId(), operaciones }),
      });
    } catch {
      return; // sin red: se reintenta en la siguiente vuelta
    }

    if (resp.status === 401) {
      marcarSesionVencida();
      return;
    }
    if (!resp.ok) {
      await anotarFallo(tramo[0], await mensajeDeError(resp), false);
      return;
    }

    const { resultados } = (await resp.json()) as { resultados: Resultado[] };
    for (const r of resultados) {
      const op = tramo.find((o) => o.id === r.id);
      if (!op) continue;
      if (r.estado === 'ok') {
        await confirmar(op, r.numero);
      } else {
        await anotarFallo(op, r.mensaje, true);
        return;
      }
    }
    if (resultados.length < tramo.length) return;
  }
}

/**
 * Lo que se envía es el registro tal como está HOY en la base local, no la
 * copia guardada al encolar: así las operaciones encoladas antes de una
 * migración de Dexie (p. ej. ventas previas a los lotes) viajan con la forma
 * actual. Si el registro ya no existe, se usa la copia.
 */
async function datosActuales(op: Outbox): Promise<unknown> {
  switch (op.entidad) {
    case 'cliente':
      return (await db.clientes.get(op.entidadId)) ?? op.payload;
    case 'cotizacion':
      return (await db.cotizaciones.get(op.entidadId)) ?? op.payload;
    case 'venta':
      return (await db.ventas.get(op.entidadId)) ?? op.payload;
    case 'compra': {
      const compra = await db.compras.get(op.entidadId);
      if (!compra) return op.payload;
      const lote = await db.lotes.where('origenId').equals(compra.id).first();
      return { ...compra, lote };
    }
    case 'fundicion': {
      const fundicion = await db.fundiciones.get(op.entidadId);
      if (!fundicion) return op.payload;
      const loteResultante = await db.lotes.get(fundicion.loteResultanteId);
      return { ...fundicion, loteResultante };
    }
  }
}

const TABLAS = [db.outbox, db.clientes, db.cotizaciones, db.compras, db.fundiciones, db.ventas, db.lotes];

/** El servidor la aplicó: sale de la cola y el registro queda sincronizado. */
async function confirmar(op: Outbox, numero?: number) {
  const listo = { estadoSync: 'sincronizado' as const };
  await db.transaction('rw', TABLAS, async () => {
    await db.outbox.delete(op.id);
    switch (op.entidad) {
      case 'cliente':
        await db.clientes.update(op.entidadId, listo);
        break;
      case 'cotizacion':
        await db.cotizaciones.update(op.entidadId, listo);
        break;
      case 'compra':
        await db.compras.update(op.entidadId, { ...listo, numero: numero ?? null });
        await db.lotes.where('origenId').equals(op.entidadId).modify(listo);
        break;
      case 'fundicion':
        await db.fundiciones.update(op.entidadId, listo);
        await db.lotes.where('origenId').equals(op.entidadId).modify(listo);
        break;
      case 'venta':
        await db.ventas.update(op.entidadId, { ...listo, numero: numero ?? null });
        break;
    }
  });
}

/**
 * Deja constancia del fallo en la cola. Si fue un rechazo del dato, el
 * registro se marca con error para que se vea en las listas.
 */
async function anotarFallo(op: Outbox, mensaje: string, rechazada: boolean) {
  await db.transaction('rw', TABLAS, async () => {
    await db.outbox.update(op.id, {
      intentos: op.intentos + 1,
      ultimoError: mensaje,
      rechazada,
    });
    if (!rechazada) return;
    const error = { estadoSync: 'error' as const };
    switch (op.entidad) {
      case 'cliente':
        await db.clientes.update(op.entidadId, error);
        break;
      case 'cotizacion':
        await db.cotizaciones.update(op.entidadId, error);
        break;
      case 'compra':
        await db.compras.update(op.entidadId, error);
        break;
      case 'fundicion':
        await db.fundiciones.update(op.entidadId, error);
        break;
      case 'venta':
        await db.ventas.update(op.entidadId, error);
        break;
    }
  });
}
