import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsuarioSesion } from '../auth/sesion';
import { OperacionDto, ResultadoOperacion } from './sync.dto';
import {
  esVentaSinLotes,
  leerCliente,
  leerCompra,
  leerCotizacion,
  leerFundicion,
  leerVenta,
  LoteServidor,
  OperacionRechazada,
  verificarFundicion,
  verificarVenta,
} from './verificacion';

type Tx = Prisma.TransactionClient;

interface Contexto {
  usuarioId: string;
  dispositivoId: string | null;
}

/**
 * Recibe la cola de salida de la PWA y la aplica en el mismo orden.
 *
 * - Idempotente: el id de cada entidad nace en el dispositivo. Si ya existe,
 *   la operación se da por aplicada y se devuelve lo que tenga (su número).
 * - Una transacción por operación: entidad, correlativo, kardex y auditoría
 *   se guardan juntos o nada.
 * - Se detiene en la primera rechazada: lo que sigue puede depender de ella
 *   (una compra de su cliente, una venta del lote de esa compra).
 */
@Injectable()
export class SyncService {
  private readonly log = new Logger('Sync');

  constructor(private readonly prisma: PrismaService) {}

  async procesar(
    operaciones: OperacionDto[],
    sesion: UsuarioSesion,
    dispositivoId?: string,
  ): Promise<ResultadoOperacion[]> {
    await this.exigirUsuarioHabilitado(sesion);
    const ctx: Contexto = { usuarioId: sesion.id, dispositivoId: dispositivoId ?? null };

    const resultados: ResultadoOperacion[] = [];
    for (const op of operaciones) {
      try {
        const numero = await this.aplicar(op, ctx);
        resultados.push({ id: op.id, estado: 'ok', ...(numero ? { numero } : {}) });
      } catch (e) {
        const mensaje = mensajeDeRechazo(e);
        if (mensaje === null) throw e; // falla del servidor: la PWA reintenta todo
        this.log.warn(`Rechazada ${op.entidad} ${op.entidadId}: ${mensaje}`);
        resultados.push({ id: op.id, estado: 'rechazada', mensaje });
        break;
      }
    }
    return resultados;
  }

  /** El token puede seguir vigente aunque el usuario se haya desactivado. */
  private async exigirUsuarioHabilitado(sesion: UsuarioSesion) {
    const usuario = await this.prisma.usuario.findUnique({ where: { id: sesion.id } });
    if (!usuario?.activo) throw new UnauthorizedException('El usuario no está habilitado.');
    if (usuario.rol === 'AUDITOR') {
      throw new ForbiddenException('El rol auditor no puede registrar operaciones.');
    }
  }

  private aplicar(op: OperacionDto, ctx: Contexto): Promise<number | null> {
    if (op.accion !== 'crear') {
      throw new OperacionRechazada(`La acción "${op.accion}" todavía no está disponible.`);
    }
    if (String(op.payload.id).toLowerCase() !== op.entidadId.toLowerCase()) {
      throw new OperacionRechazada('Los datos enviados no corresponden a la operación.');
    }

    return this.prisma.$transaction(async (tx) => {
      switch (op.entidad) {
        case 'cliente':
          return this.crearCliente(tx, op.payload, ctx);
        case 'cotizacion':
          return this.crearCotizacion(tx, op.payload, ctx);
        case 'compra':
          return this.crearCompra(tx, op.payload, ctx);
        case 'fundicion':
          return this.crearFundicion(tx, op.payload, ctx);
        case 'venta':
          return this.crearVenta(tx, op.payload, ctx);
        default:
          throw new OperacionRechazada(`Entidad desconocida: ${String(op.entidad)}.`);
      }
    });
  }

  // ---------------------------------------------------------------- Entidades

  private async crearCliente(tx: Tx, payload: unknown, ctx: Contexto) {
    const c = leerCliente(payload);
    if (await tx.cliente.findUnique({ where: { id: c.id } })) return null;
    await tx.cliente.create({ data: c });
    await auditar(tx, 'cliente', c.id, payload, ctx);
    return null;
  }

  private async crearCotizacion(tx: Tx, payload: unknown, ctx: Contexto) {
    const c = leerCotizacion(payload);
    if (await tx.cotizacion.findUnique({ where: { id: c.id } })) return null;
    await tx.cotizacion.create({ data: { ...c, usuarioId: ctx.usuarioId } });
    await auditar(tx, 'cotizacion', c.id, payload, ctx);
    return null;
  }

  private async crearCompra(tx: Tx, payload: unknown, ctx: Contexto) {
    const c = leerCompra(payload);
    const existente = await tx.compra.findUnique({ where: { id: c.id } });
    if (existente) return existente.numero;

    if (!(await tx.cliente.findUnique({ where: { id: c.clienteId } }))) {
      throw new OperacionRechazada('Compra: el cliente todavía no está registrado en el servidor.');
    }

    const numero = await siguienteNumero(tx, 'COMPRA');
    await tx.compra.create({
      data: {
        id: c.id,
        numero,
        numeroLocal: c.numeroLocal,
        fecha: c.fecha,
        clienteId: c.clienteId,
        onzaCierreUsd: c.onzaCierreUsd,
        tipoCambio: c.tipoCambio,
        totalBs: c.totalBs,
        estado: 'CONFIRMADA',
        observacion: c.observacion,
        usuarioId: ctx.usuarioId,
        dispositivoId: ctx.dispositivoId,
        items: { create: c.items },
      },
    });

    // El lote nace disponible aunque en el dispositivo ya se haya fundido o
    // vendido: esas operaciones llegan después en la cola y lo cambian.
    await tx.lote.create({
      data: {
        ...c.lote,
        origen: 'COMPRA',
        compraId: c.id,
        fecha: c.fecha,
        estado: 'DISPONIBLE',
      },
    });
    await moverInventario(tx, c.lote.id, 'ENTRADA_COMPRA', c.lote.pesoFinoG, 'compra', c.id, c.fecha, ctx);
    await auditar(tx, 'compra', c.id, payload, ctx);
    return numero;
  }

  private async crearFundicion(tx: Tx, payload: unknown, ctx: Contexto) {
    const f = leerFundicion(payload);
    if (await tx.fundicion.findUnique({ where: { id: f.id } })) return null;

    const { origen, resultado: r } = verificarFundicion(f, await lotesDelServidor(tx, f.loteIds));

    await tx.fundicion.create({
      data: {
        id: f.id,
        fecha: f.fecha,
        pesoBrutoOrigenG: r.pesoBrutoOrigenG.toString(),
        pesoResultanteG: r.pesoBrutoG.toString(),
        mermaG: r.mermaG.toString(),
        pesoFinoG: r.pesoFinoG.toString(),
        leyEstimada: r.leyEstimada.toString(),
        costoBs: r.costoBs.toString(),
        observacion: f.observacion,
        usuarioId: ctx.usuarioId,
        dispositivoId: ctx.dispositivoId,
      },
    });
    await consumirLotes(tx, f.loteIds, { estado: 'FUNDIDO', fundicionDestinoId: f.id });
    await tx.lote.create({
      data: {
        id: f.loteResultante.id,
        codigo: f.loteResultante.codigo,
        origen: 'FUNDICION',
        fundicionOrigenId: f.id,
        fecha: f.fecha,
        pesoBrutoG: r.pesoBrutoG.toString(),
        pesoFinoG: r.pesoFinoG.toString(),
        leyEstimada: r.leyEstimada.toString(),
        costoBs: r.costoBs.toString(),
        estado: 'DISPONIBLE',
      },
    });

    for (const lote of origen) {
      await moverInventario(tx, lote.id, 'SALIDA_FUNDICION', `-${lote.pesoFinoG}`, 'fundicion', f.id, f.fecha, ctx);
    }
    await moverInventario(tx, f.loteResultante.id, 'ENTRADA_FUNDICION', r.pesoFinoG.toString(), 'fundicion', f.id, f.fecha, ctx);
    await auditar(tx, 'fundicion', f.id, payload, ctx);
    return null;
  }

  private async crearVenta(tx: Tx, payload: unknown, ctx: Contexto) {
    const leida = leerVenta(payload);
    const existente = await tx.venta.findUnique({ where: { id: leida.id } });
    if (existente) return existente.numero;

    const loteIds = leida.items.flatMap((i) => (i.loteId ? [i.loteId] : []));
    const v = verificarVenta(leida, await lotesDelServidor(tx, loteIds));

    const numero = await siguienteNumero(tx, 'VENTA');
    await tx.venta.create({
      data: {
        id: v.id,
        numero,
        numeroLocal: v.numeroLocal,
        fecha: v.fecha,
        destino: v.destino,
        onzaCierreUsd: v.onzaCierreUsd,
        tipoCambio: v.tipoCambio,
        totalUsd: v.totalUsd,
        totalBs: v.totalBs,
        costoBs: v.costoBs,
        gananciaBs: v.gananciaBs,
        estado: 'CONFIRMADA',
        observacion: v.observacion,
        usuarioId: ctx.usuarioId,
        dispositivoId: ctx.dispositivoId,
        items: { create: v.items },
      },
    });

    if (!esVentaSinLotes(v)) {
      await consumirLotes(tx, loteIds, { estado: 'VENDIDO' });
      for (const item of v.items) {
        await moverInventario(tx, item.loteId!, 'SALIDA_VENTA', `-${item.pesoFinoEstimadoG}`, 'venta', v.id, v.fecha, ctx);
      }
    }
    await auditar(tx, 'venta', v.id, payload, ctx);
    return numero;
  }
}

// ---------------------------------------------------------------- Apoyo

/** Mensaje para el operador si el error es del dato; `null` si es del servidor. */
function mensajeDeRechazo(e: unknown): string | null {
  if (e instanceof OperacionRechazada) return e.message;
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2002') {
      return `Ya existe un registro con el mismo valor único (${String(e.meta?.target ?? '')}).`;
    }
    if (e.code === 'P2003') return 'Hace referencia a un registro que no existe en el servidor.';
  }
  return null;
}

/** Correlativo definitivo. Dentro de la transacción: si algo falla, no se pierde el número. */
async function siguienteNumero(tx: Tx, tipo: 'COMPRA' | 'VENTA'): Promise<number> {
  const c = await tx.correlativo.upsert({
    where: { tipo },
    create: { tipo, ultimo: 1 },
    update: { ultimo: { increment: 1 } },
  });
  return c.ultimo;
}

async function lotesDelServidor(tx: Tx, ids: string[]): Promise<Map<string, LoteServidor>> {
  const lotes = await tx.lote.findMany({ where: { id: { in: ids } } });
  return new Map(
    lotes.map((l) => [
      l.id,
      {
        id: l.id,
        codigo: l.codigo,
        estado: l.estado,
        pesoBrutoG: l.pesoBrutoG.toString(),
        pesoFinoG: l.pesoFinoG.toString(),
        costoBs: l.costoBs.toString(),
      },
    ]),
  );
}

/**
 * Saca lotes de stock. El filtro por DISPONIBLE dentro del UPDATE evita que
 * dos dispositivos consuman el mismo lote a la vez.
 */
async function consumirLotes(tx: Tx, ids: string[], cambio: Prisma.LoteUncheckedUpdateManyInput) {
  const { count } = await tx.lote.updateMany({
    where: { id: { in: ids }, estado: 'DISPONIBLE' },
    data: cambio,
  });
  if (count !== ids.length) {
    throw new OperacionRechazada('Uno de los lotes acaba de dejar de estar disponible.');
  }
}

function moverInventario(
  tx: Tx,
  loteId: string,
  tipo: Prisma.MovimientoInventarioCreateInput['tipo'],
  pesoFinoG: string,
  referenciaTipo: string,
  referenciaId: string,
  fecha: Date,
  ctx: Contexto,
) {
  return tx.movimientoInventario.create({
    data: { loteId, tipo, pesoFinoG, referenciaTipo, referenciaId, fecha, usuarioId: ctx.usuarioId },
  });
}

function auditar(tx: Tx, entidad: string, entidadId: string, payload: unknown, ctx: Contexto) {
  return tx.auditoria.create({
    data: {
      entidad,
      entidadId,
      accion: 'CREAR',
      datosDespues: payload as Prisma.InputJsonValue,
      usuarioId: ctx.usuarioId,
      dispositivoId: ctx.dispositivoId,
    },
  });
}
