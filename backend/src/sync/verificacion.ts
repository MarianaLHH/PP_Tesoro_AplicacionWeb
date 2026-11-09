import Decimal from 'decimal.js';
import {
  calcularCompraItem,
  calcularFundicion,
  calcularLoteDeCompra,
  calcularTotalCompra,
  calcularVentaDeLotes,
  DECIMALES_ENTRADA,
} from '@tesoro/dominio';

/**
 * Lectura y verificación de lo que envía la PWA.
 *
 * La PWA liquida offline con `@tesoro/dominio`; aquí se vuelve a liquidar con
 * el mismo paquete y se exige que coincida. Así un dato corrupto o manipulado
 * no llega a la base, y la PWA recibe un mensaje que el operador entiende.
 *
 * Todo es puro (sin base de datos) para poder probarlo aislado. Los importes
 * salen como string decimal, que Prisma acepta sin pasar por `number`.
 */

/** Error del dato, no del servidor: reintentar no lo arregla. */
export class OperacionRechazada extends Error {}

function rechazar(mensaje: string): never {
  throw new OperacionRechazada(mensaje);
}

type Objeto = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIA = /^\d{4}-\d{2}-\d{2}$/;

function objeto(valor: unknown, que: string): Objeto {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    rechazar(`${que}: faltan los datos.`);
  }
  return valor as Objeto;
}

function texto(o: Objeto, campo: string, que: string): string {
  const v = o[campo];
  if (typeof v !== 'string' || !v.trim()) rechazar(`${que}: falta "${campo}".`);
  return (v as string).trim();
}

function textoOpcional(o: Objeto, campo: string, que: string): string | null {
  const v = o[campo];
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string') rechazar(`${que}: "${campo}" debe ser texto.`);
  return (v as string).trim() || null;
}

function uuid(o: Objeto, campo: string, que: string): string {
  const v = texto(o, campo, que);
  if (!UUID.test(v)) rechazar(`${que}: "${campo}" no es un identificador válido.`);
  return v.toLowerCase();
}

function decimal(o: Objeto, campo: string, que: string): string {
  const v = o[campo];
  if (typeof v !== 'string' && typeof v !== 'number') {
    rechazar(`${que}: falta "${campo}".`);
  }
  let d: Decimal;
  try {
    d = new Decimal(v as string | number);
  } catch {
    return rechazar(`${que}: "${campo}" no es un número válido (${String(v)}).`);
  }
  if (!d.isFinite()) rechazar(`${que}: "${campo}" no es un número válido.`);
  return d.toString();
}

function decimalOpcional(o: Objeto, campo: string, que: string): string | null {
  const v = o[campo];
  if (v === undefined || v === null || v === '') return null;
  return decimal(o, campo, que);
}

/**
 * Dato tecleado por el operador (no calculado). Si trae más decimales de los
 * que caben en su columna, PostgreSQL lo redondearía en silencio y lo guardado
 * no coincidiría con lo que se usó para liquidar.
 */
function entrada(
  valor: string,
  tipo: keyof typeof DECIMALES_ENTRADA,
  campo: string,
  que: string,
): string {
  const maximo = DECIMALES_ENTRADA[tipo];
  if (new Decimal(valor).decimalPlaces() > maximo) {
    rechazar(`${que}: "${campo}" admite hasta ${maximo} decimales (${valor}).`);
  }
  return valor;
}

const onzaDe = (o: Objeto, que: string) =>
  positivo(entrada(decimal(o, 'onzaCierreUsd', que), 'onza', 'onzaCierreUsd', que), 'onzaCierreUsd', que);

const tipoCambioDe = (o: Objeto, que: string) =>
  positivo(entrada(decimal(o, 'tipoCambio', que), 'tipoCambio', 'tipoCambio', que), 'tipoCambio', que);

const pesoDe = (o: Objeto, campo: string, que: string) =>
  entrada(decimal(o, campo, que), 'peso', campo, que);

const leyDe = (o: Objeto, que: string) => entrada(decimal(o, 'ley', que), 'ley', 'ley', que);

/** Día de operación `YYYY-MM-DD` como medianoche UTC (columna DATE). */
function dia(o: Objeto, campo: string, que: string): Date {
  const v = texto(o, campo, que);
  const fecha = new Date(`${v}T00:00:00Z`);
  if (!DIA.test(v) || Number.isNaN(fecha.getTime())) {
    rechazar(`${que}: "${campo}" no es una fecha válida (${v}).`);
  }
  return fecha;
}

function instante(o: Objeto, campo: string, que: string): Date {
  const v = texto(o, campo, que);
  const fecha = new Date(v);
  if (Number.isNaN(fecha.getTime())) {
    rechazar(`${que}: "${campo}" no es una fecha válida (${v}).`);
  }
  return fecha;
}

function positivo(valor: string, campo: string, que: string): string {
  if (!new Decimal(valor).greaterThan(0)) {
    rechazar(`${que}: "${campo}" debe ser mayor a cero.`);
  }
  return valor;
}

/** Exige que lo que mandó la PWA coincida con lo que calcula el dominio. */
function coincide(enviado: string | null, calculado: Decimal, que: string) {
  if (enviado === null || !new Decimal(enviado).equals(calculado)) {
    rechazar(
      `${que}: la app envió ${enviado ?? 'vacío'} pero el cálculo da ${calculado.toString()}.`,
    );
  }
}

/** Ejecuta una regla del dominio y convierte su error en rechazo legible. */
function regla<T>(que: string, calculo: () => T): T {
  try {
    return calculo();
  } catch (e) {
    return rechazar(`${que}: ${(e as Error).message}`);
  }
}

function lista(o: Objeto, campo: string, que: string): unknown[] {
  const v = o[campo];
  if (!Array.isArray(v) || v.length === 0) rechazar(`${que}: "${campo}" está vacío.`);
  return v as unknown[];
}

// ---------------------------------------------------------------- Cliente

export function leerCliente(payload: unknown) {
  const que = 'Cliente';
  const o = objeto(payload, que);
  return {
    id: uuid(o, 'id', que),
    nombre: texto(o, 'nombre', que),
    ci: textoOpcional(o, 'ci', que),
    telefono: textoOpcional(o, 'telefono', que),
    direccion: textoOpcional(o, 'direccion', que),
    notas: textoOpcional(o, 'notas', que),
    activo: o.activo !== false,
  };
}

// ---------------------------------------------------------------- Cotización

export function leerCotizacion(payload: unknown) {
  const que = 'Cotización';
  const o = objeto(payload, que);
  return {
    id: uuid(o, 'id', que),
    fecha: instante(o, 'fecha', que),
    onzaCierreUsd: onzaDe(o, que),
    tipoCambio: tipoCambioDe(o, que),
  };
}

// ---------------------------------------------------------------- Compra

/** Compra confirmada más el lote que origina (`{ ...compra, lote }` en la PWA). */
export function leerCompra(payload: unknown) {
  const que = 'Compra';
  const o = objeto(payload, que);
  if (o.estado !== 'CONFIRMADA') rechazar(`${que}: solo se registran compras confirmadas.`);

  const onzaCierreUsd = onzaDe(o, que);
  const tipoCambio = tipoCambioDe(o, que);

  const items = lista(o, 'items', que).map((crudo, i) => {
    const q = `${que}, pieza ${i + 1}`;
    const it = objeto(crudo, q);
    const antes = decimalOpcional(it, 'pesoAntesFundirG', q);
    const pesoAntesFundirG = antes === null ? null : entrada(antes, 'peso', 'pesoAntesFundirG', q);
    const pesoDespuesFundirG = pesoDe(it, 'pesoDespuesFundirG', q);
    const ley = leyDe(it, q);

    const r = regla(q, () =>
      calcularCompraItem({ onzaCierreUsd, tipoCambio, pesoAntesFundirG, pesoDespuesFundirG, ley }),
    );
    coincide(decimalOpcional(it, 'totalBs', q), r.totalBs, `${q}, total Bs`);
    coincide(decimalOpcional(it, 'pesoFinoG', q), r.pesoFinoG, `${q}, peso fino`);

    return {
      id: uuid(it, 'id', q),
      pesoAntesFundirG,
      pesoDespuesFundirG,
      mermaG: r.mermaG?.toString() ?? null,
      ley,
      bsPorGramo: r.bsPorGramo.toString(),
      totalBs: r.totalBs.toString(),
      pesoFinoG: r.pesoFinoG.toString(),
      observacion: textoOpcional(it, 'observacion', q),
    };
  });

  const totalBs = calcularTotalCompra(items);
  coincide(decimalOpcional(o, 'totalBs', que), totalBs, `${que}, total a pagar`);

  const ql = `${que}, lote`;
  const l = objeto(o.lote, ql);
  const calc = calcularLoteDeCompra(items);
  coincide(decimalOpcional(l, 'pesoBrutoG', ql), calc.pesoBrutoG, `${ql}, peso bruto`);
  coincide(decimalOpcional(l, 'pesoFinoG', ql), calc.pesoFinoG, `${ql}, peso fino`);
  coincide(decimalOpcional(l, 'costoBs', ql), calc.costoBs, `${ql}, costo`);

  return {
    id: uuid(o, 'id', que),
    numeroLocal: textoOpcional(o, 'numeroLocal', que),
    fecha: dia(o, 'fecha', que),
    clienteId: uuid(o, 'clienteId', que),
    onzaCierreUsd,
    tipoCambio,
    totalBs: totalBs.toString(),
    observacion: textoOpcional(o, 'observacion', que),
    items,
    lote: {
      id: uuid(l, 'id', ql),
      codigo: texto(l, 'codigo', ql),
      pesoBrutoG: calc.pesoBrutoG.toString(),
      pesoFinoG: calc.pesoFinoG.toString(),
      leyEstimada: calc.leyEstimada.toString(),
      costoBs: calc.costoBs.toString(),
    },
  };
}

// ---------------------------------------------------------------- Lotes en el servidor

/** Lo que el servidor sabe de un lote que la operación quiere consumir. */
export interface LoteServidor {
  id: string;
  codigo: string;
  estado: string;
  pesoBrutoG: string;
  pesoFinoG: string;
  costoBs: string;
}

function loteDisponible(
  lotes: ReadonlyMap<string, LoteServidor>,
  id: string,
  que: string,
): LoteServidor {
  const lote = lotes.get(id);
  if (!lote) return rechazar(`${que}: el lote ${id} no existe en el servidor.`);
  if (lote.estado !== 'DISPONIBLE') {
    rechazar(`${que}: el lote ${lote.codigo} ya no está disponible (${lote.estado}).`);
  }
  return lote;
}

// ---------------------------------------------------------------- Fundición

/** Fundición más el lote que produce (`{ ...fundicion, loteResultante }`). */
export function leerFundicion(payload: unknown) {
  const que = 'Fundición';
  const o = objeto(payload, que);
  const loteIds = lista(o, 'loteIds', que).map((id, i) =>
    uuid({ id }, 'id', `${que}, lote ${i + 1}`),
  );
  if (new Set(loteIds).size !== loteIds.length) rechazar(`${que}: hay lotes repetidos.`);

  const ql = `${que}, lote resultante`;
  const l = objeto(o.loteResultante, ql);
  const loteResultanteId = uuid(o, 'loteResultanteId', que);
  if (uuid(l, 'id', ql) !== loteResultanteId) {
    rechazar(`${ql}: no corresponde a esta fundición.`);
  }

  return {
    id: uuid(o, 'id', que),
    fecha: dia(o, 'fecha', que),
    loteIds,
    pesoResultanteG: pesoDe(o, 'pesoResultanteG', que),
    observacion: textoOpcional(o, 'observacion', que),
    enviado: {
      pesoBrutoOrigenG: decimalOpcional(o, 'pesoBrutoOrigenG', que),
      mermaG: decimalOpcional(o, 'mermaG', que),
      pesoFinoG: decimalOpcional(o, 'pesoFinoG', que),
      costoBs: decimalOpcional(o, 'costoBs', que),
    },
    loteResultante: { id: loteResultanteId, codigo: texto(l, 'codigo', ql) },
  };
}

export function verificarFundicion(
  f: ReturnType<typeof leerFundicion>,
  lotes: ReadonlyMap<string, LoteServidor>,
) {
  const que = 'Fundición';
  const origen = f.loteIds.map((id) => loteDisponible(lotes, id, que));
  const r = regla(que, () =>
    calcularFundicion({ lotes: origen, pesoResultanteG: f.pesoResultanteG }),
  );
  coincide(f.enviado.pesoBrutoOrigenG, r.pesoBrutoOrigenG, `${que}, peso de origen`);
  coincide(f.enviado.mermaG, r.mermaG, `${que}, merma`);
  coincide(f.enviado.pesoFinoG, r.pesoFinoG, `${que}, peso fino`);
  coincide(f.enviado.costoBs, r.costoBs, `${que}, costo`);
  return { origen, resultado: r };
}

// ---------------------------------------------------------------- Venta

export function leerVenta(payload: unknown) {
  const que = 'Venta';
  const o = objeto(payload, que);
  if (o.estado !== 'CONFIRMADA') rechazar(`${que}: solo se registran ventas confirmadas.`);

  const items = lista(o, 'items', que).map((crudo, i) => {
    const q = `${que}, lote ${i + 1}`;
    const it = objeto(crudo, q);
    return {
      loteId: it.loteId === null || it.loteId === undefined ? null : uuid(it, 'loteId', q),
      loteCodigo: textoOpcional(it, 'loteCodigo', q) ?? '—',
      pesoG: positivo(pesoDe(it, 'pesoG', q), 'pesoG', q),
      ley: leyDe(it, q),
      pesoFinoG: decimal(it, 'pesoFinoG', q),
      pesoFinoEstimadoG: decimal(it, 'pesoFinoEstimadoG', q),
      bsPorGramo: decimalOpcional(it, 'bsPorGramo', q),
      precioGramoUsd: decimal(it, 'precioGramoUsd', q),
      totalUsd: decimal(it, 'totalUsd', q),
      totalBs: decimal(it, 'totalBs', q),
      costoBs: decimalOpcional(it, 'costoBs', q),
    };
  });

  return {
    id: uuid(o, 'id', que),
    numeroLocal: textoOpcional(o, 'numeroLocal', que),
    fecha: dia(o, 'fecha', que),
    destino: texto(o, 'destino', que),
    onzaCierreUsd: onzaDe(o, que),
    tipoCambio: tipoCambioDe(o, que),
    totalUsd: decimal(o, 'totalUsd', que),
    totalBs: decimal(o, 'totalBs', que),
    costoBs: decimalOpcional(o, 'costoBs', que),
    gananciaBs: decimalOpcional(o, 'gananciaBs', que),
    observacion: textoOpcional(o, 'observacion', que),
    items,
  };
}

/** Venta registrada antes del módulo de lotes: no se sabe qué lote salió. */
export const esVentaSinLotes = (v: ReturnType<typeof leerVenta>) =>
  v.items.every((i) => i.loteId === null);

/**
 * Verifica una venta de lotes contra los lotes del servidor y devuelve los
 * valores que se guardan. Las ventas sin lotes se aceptan como vinieron: se
 * liquidaron con una versión anterior de la app y no hay lote contra el que
 * comparar.
 */
export function verificarVenta(
  v: ReturnType<typeof leerVenta>,
  lotes: ReadonlyMap<string, LoteServidor>,
) {
  const que = 'Venta';
  if (esVentaSinLotes(v)) {
    if (v.costoBs !== null || v.gananciaBs !== null) {
      rechazar(`${que}: una venta sin lotes no puede tener costo ni ganancia.`);
    }
    return v;
  }
  if (v.items.some((i) => i.loteId === null)) {
    rechazar(`${que}: todos los ítems deben indicar su lote.`);
  }
  const ids = v.items.map((i) => i.loteId as string);
  if (new Set(ids).size !== ids.length) rechazar(`${que}: hay lotes repetidos.`);

  const origen = ids.map((id) => loteDisponible(lotes, id, que));
  const r = regla(que, () =>
    calcularVentaDeLotes({
      onzaCierreUsd: v.onzaCierreUsd,
      tipoCambio: v.tipoCambio,
      lotes: v.items.map((item, i) => ({
        pesoG: item.pesoG,
        ley: item.ley,
        pesoFinoEstimadoG: origen[i].pesoFinoG,
        costoBs: origen[i].costoBs,
      })),
    }),
  );

  const items = v.items.map((item, i) => {
    const q = `${que}, lote ${origen[i].codigo}`;
    const calc = r.items[i];
    coincide(item.totalBs, calc.totalBs, `${q}, total Bs`);
    coincide(item.totalUsd, calc.totalUsd, `${q}, total USD`);
    coincide(item.costoBs, calc.costoBs, `${q}, costo`);
    coincide(item.pesoFinoEstimadoG, new Decimal(origen[i].pesoFinoG), `${q}, fino estimado`);
    return {
      ...item,
      loteCodigo: origen[i].codigo,
      pesoFinoG: calc.pesoFinoG.toString(),
      bsPorGramo: calc.bsPorGramo.toString(),
      precioGramoUsd: calc.precioGramoUsd.toString(),
      costoBs: calc.costoBs.toString(),
    };
  });

  coincide(v.totalBs, r.totalBs, `${que}, total Bs`);
  coincide(v.totalUsd, r.totalUsd, `${que}, total USD`);
  coincide(v.costoBs, r.costoBs, `${que}, costo`);
  coincide(v.gananciaBs, r.gananciaBs, `${que}, ganancia`);

  return {
    ...v,
    items,
    costoBs: r.costoBs.toString(),
    gananciaBs: r.gananciaBs.toString(),
  };
}
