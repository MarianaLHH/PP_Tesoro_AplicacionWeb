import Decimal from 'decimal.js';

/**
 * Reglas de cálculo de compra de oro.
 *
 * Fuente de verdad: `COMPRA ORO LIQUIDACION.xlsx`, hoja COMPRA.
 * Ver docs/reglas-de-calculo.md
 *
 * Se usa decimal.js en lugar de `number` porque en oro un error de redondeo
 * en el flotante binario es dinero perdido.
 */

/** Gramos que contiene una onza troy. Constante física, no configurable. */
export const GRAMOS_POR_ONZA_TROY = new Decimal('31.1035');

/** Decimales de presentación acordados con el cliente. */
export const DECIMALES_IMPORTE = 2;
export const DECIMALES_PESO = 3;

export type Valor = Decimal | string | number;

export interface ParametrosValoracion {
  /** Cotización internacional de cierre, en USD por onza troy. */
  onzaCierreUsd: Valor;
  /** Bolivianos por dólar. */
  tipoCambio: Valor;
}

export interface EntradaCompraItem extends ParametrosValoracion {
  /** PESO A/F — peso antes de fundir. Ausente si la pieza no se funde. */
  pesoAntesFundirG?: Valor | null;
  /** PESO D/F — peso después de fundir. Es el peso que se paga. */
  pesoDespuesFundirG: Valor;
  /** Ley expresada en fracción: 0.87 = 87 %. */
  ley: Valor;
}

export interface ResultadoCompraItem {
  bsPorGramo: Decimal;
  totalBs: Decimal;
  pesoFinoG: Decimal;
  mermaG: Decimal | null;
}

const d = (v: Valor): Decimal => new Decimal(v as Decimal.Value);

const redondearImporte = (v: Decimal): Decimal =>
  v.toDecimalPlaces(DECIMALES_IMPORTE, Decimal.ROUND_HALF_UP);

const redondearPeso = (v: Decimal): Decimal =>
  v.toDecimalPlaces(DECIMALES_PESO, Decimal.ROUND_HALF_UP);

/**
 * Precio en bolivianos de un gramo BRUTO, ya castigado por la ley.
 *
 *     bsPorGramo = (onzaCierreUsd * ley) / 31.1035 * tipoCambio
 *
 * Ojo: la ley va dentro del precio. El precio resultante multiplica al peso
 * bruto (D/F), no al peso fino. Así lo presenta el negocio.
 *
 * Devuelve el valor redondeado, solo para mostrar. El total NO se calcula con
 * este valor sino con el exacto: así lo hace el Excel, que muestra 2 decimales
 * pero opera con todos.
 */
export function calcularBsPorGramo(
  params: ParametrosValoracion & { ley: Valor },
): Decimal {
  return redondearImporte(bsPorGramoExacto(params));
}

function bsPorGramoExacto(
  params: ParametrosValoracion & { ley: Valor },
): Decimal {
  return d(params.onzaCierreUsd)
    .times(d(params.ley))
    .dividedBy(GRAMOS_POR_ONZA_TROY)
    .times(d(params.tipoCambio));
}

/** Peso fino contenido: lo que realmente ingresa al inventario. */
export function calcularPesoFino(pesoBrutoG: Valor, ley: Valor): Decimal {
  return redondearPeso(d(pesoBrutoG).times(d(ley)));
}

/** Merma de fundición. `null` si la pieza no se fundió. */
export function calcularMerma(
  pesoAntesFundirG: Valor | null | undefined,
  pesoDespuesFundirG: Valor,
): Decimal | null {
  if (pesoAntesFundirG === null || pesoAntesFundirG === undefined) return null;
  return redondearPeso(d(pesoAntesFundirG).minus(d(pesoDespuesFundirG)));
}

/** Liquidación completa de una pieza comprada. */
export function calcularCompraItem(
  entrada: EntradaCompraItem,
): ResultadoCompraItem {
  const peso = d(entrada.pesoDespuesFundirG);

  if (peso.lessThanOrEqualTo(0)) {
    throw new Error('El peso después de fundir debe ser mayor a cero.');
  }
  const ley = d(entrada.ley);
  if (ley.lessThanOrEqualTo(0) || ley.greaterThan(1)) {
    throw new Error('La ley debe expresarse como fracción entre 0 y 1.');
  }

  const merma = calcularMerma(
    entrada.pesoAntesFundirG,
    entrada.pesoDespuesFundirG,
  );
  if (merma !== null && merma.isNegative()) {
    throw new Error(
      'El peso después de fundir no puede superar al peso antes de fundir.',
    );
  }

  const bsPorGramo = bsPorGramoExacto({
    onzaCierreUsd: entrada.onzaCierreUsd,
    tipoCambio: entrada.tipoCambio,
    ley,
  });

  return {
    bsPorGramo: redondearImporte(bsPorGramo),
    // Se redondea solo el total, como en el Excel.
    totalBs: redondearImporte(peso.times(bsPorGramo)),
    pesoFinoG: calcularPesoFino(peso, ley),
    mermaG: merma,
  };
}

export interface EntradaVenta extends ParametrosValoracion {
  /** Peso bruto que sale del inventario. */
  pesoG: Valor;
  /** Ley del material vendido, en fracción. */
  ley: Valor;
}

export interface ResultadoVenta {
  /** Bs por gramo bruto, ya castigado por la ley. Solo para mostrar. */
  bsPorGramo: Decimal;
  /** USD por gramo bruto, ya castigado por la ley. Solo para mostrar. */
  precioGramoUsd: Decimal;
  /** Lo que paga el comprador. */
  totalBs: Decimal;
  /** Equivalente en dólares, de referencia. */
  totalUsd: Decimal;
  /** Oro puro que sale del inventario. */
  pesoFinoG: Decimal;
}

/**
 * Liquidación de una venta al comprador final, con SUS valores: onza, tipo de
 * cambio y la ley que midió.
 *
 *     bsPorGramo = (onzaCierreUsd * ley) / 31.1035 * tipoCambio
 *     totalBs    = pesoG * bsPorGramo
 *
 * Misma fórmula que la compra. El comprador paga en bolivianos; los dólares
 * son la referencia.
 */
export function calcularVenta(entrada: EntradaVenta): ResultadoVenta {
  const peso = d(entrada.pesoG);
  if (peso.lessThanOrEqualTo(0)) {
    throw new Error('El peso a vender debe ser mayor a cero.');
  }

  const ley = d(entrada.ley);
  if (ley.lessThanOrEqualTo(0) || ley.greaterThan(1)) {
    throw new Error('La ley debe expresarse como fracción entre 0 y 1.');
  }

  // Mismo criterio que la compra: los precios por gramo se redondean solo
  // para mostrar; los totales se calculan con el valor exacto.
  const precioGramoUsd = d(entrada.onzaCierreUsd)
    .times(ley)
    .dividedBy(GRAMOS_POR_ONZA_TROY);
  const bsPorGramo = precioGramoUsd.times(d(entrada.tipoCambio));

  return {
    bsPorGramo: redondearImporte(bsPorGramo),
    precioGramoUsd: redondearImporte(precioGramoUsd),
    totalBs: redondearImporte(peso.times(bsPorGramo)),
    totalUsd: redondearImporte(peso.times(precioGramoUsd)),
    pesoFinoG: calcularPesoFino(peso, ley),
  };
}

/** Total de una compra: suma de sus piezas. */
export function calcularTotalCompra(
  items: ReadonlyArray<{ totalBs: Valor }>,
): Decimal {
  return redondearImporte(
    items.reduce((acc, item) => acc.plus(d(item.totalBs)), new Decimal(0)),
  );
}

/** Ley en karats -> fracción. 18k => 0.75 */
export function karatsALey(karats: Valor): Decimal {
  return d(karats).dividedBy(24).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

/** Ley en porcentaje -> fracción. 87 => 0.87 */
export function porcentajeALey(porcentaje: Valor): Decimal {
  return d(porcentaje).dividedBy(100).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

/** Ley en milésimas -> fracción. 750 => 0.75 */
export function milesimasALey(milesimas: Valor): Decimal {
  return d(milesimas).dividedBy(1000).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

// ---------------------------------------------------------------- Lotes

/**
 * Un lote es una pieza física de oro en caja fuerte. Nace de una compra (todas
 * sus piezas se funden en una) o de fundir varios lotes juntos, y siempre se
 * vende completo.
 *
 * La ley y el fino de un lote son ESTIMADOS: la ley real la mide quien compra
 * en el momento de la venta.
 */
export interface ResultadoLote {
  pesoBrutoG: Decimal;
  pesoFinoG: Decimal;
  leyEstimada: Decimal;
  /** Lo que se pagó por el material, en Bs. Se arrastra hasta la venta. */
  costoBs: Decimal;
}

const leyDe = (pesoFinoG: Decimal, pesoBrutoG: Decimal): Decimal =>
  pesoFinoG.dividedBy(pesoBrutoG).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

/** Lote que origina una compra: la suma de sus piezas. */
export function calcularLoteDeCompra(
  items: ReadonlyArray<{
    pesoDespuesFundirG: Valor;
    pesoFinoG: Valor;
    totalBs: Valor;
  }>,
): ResultadoLote {
  if (items.length === 0) {
    throw new Error('La compra no tiene piezas.');
  }

  let bruto = new Decimal(0);
  let fino = new Decimal(0);
  let costo = new Decimal(0);
  for (const item of items) {
    bruto = bruto.plus(d(item.pesoDespuesFundirG));
    fino = fino.plus(d(item.pesoFinoG));
    costo = costo.plus(d(item.totalBs));
  }

  return {
    pesoBrutoG: redondearPeso(bruto),
    pesoFinoG: redondearPeso(fino),
    leyEstimada: leyDe(fino, bruto),
    costoBs: redondearImporte(costo),
  };
}

export interface LoteValorado {
  pesoBrutoG: Valor;
  pesoFinoG: Valor;
  costoBs: Valor;
}

export interface EntradaFundicion {
  lotes: ReadonlyArray<LoteValorado>;
  /** Peso de la pieza que sale del horno. */
  pesoResultanteG: Valor;
}

export interface ResultadoFundicion extends ResultadoLote {
  /** Suma de los pesos brutos que entraron al horno. */
  pesoBrutoOrigenG: Decimal;
  /** Peso bruto perdido al fundir: impurezas y material que queda en el crisol. */
  mermaG: Decimal;
}

/**
 * Fundición conjunta de varios lotes en una sola pieza.
 *
 * Al fundir se pierden impurezas, no oro: el fino estimado se conserva y la
 * ley estimada sube. El costo es la suma de lo pagado por cada lote.
 */
export function calcularFundicion(entrada: EntradaFundicion): ResultadoFundicion {
  if (entrada.lotes.length < 2) {
    throw new Error('Para fundir juntos se necesitan al menos dos lotes.');
  }

  const resultante = d(entrada.pesoResultanteG);
  if (resultante.lessThanOrEqualTo(0)) {
    throw new Error('El peso resultante debe ser mayor a cero.');
  }

  let bruto = new Decimal(0);
  let fino = new Decimal(0);
  let costo = new Decimal(0);
  for (const lote of entrada.lotes) {
    bruto = bruto.plus(d(lote.pesoBrutoG));
    fino = fino.plus(d(lote.pesoFinoG));
    costo = costo.plus(d(lote.costoBs));
  }

  if (resultante.greaterThan(bruto)) {
    throw new Error(
      'El peso resultante no puede superar la suma de los lotes fundidos.',
    );
  }
  if (resultante.lessThan(fino)) {
    throw new Error(
      'El peso resultante es menor que el oro fino estimado de los lotes. Revise el peso.',
    );
  }

  return {
    pesoBrutoOrigenG: redondearPeso(bruto),
    pesoBrutoG: redondearPeso(resultante),
    mermaG: redondearPeso(bruto.minus(resultante)),
    pesoFinoG: redondearPeso(fino),
    leyEstimada: leyDe(fino, resultante),
    costoBs: redondearImporte(costo),
  };
}

export interface LoteAVender {
  /** Peso con el que lo recibe el comprador. */
  pesoG: Valor;
  /** Ley medida por el comprador, en fracción. */
  ley: Valor;
  /** Fino que el negocio estimaba tener en el lote. */
  pesoFinoEstimadoG: Valor;
  costoBs: Valor;
}

export interface ResultadoVentaLote extends ResultadoVenta {
  costoBs: Decimal;
  gananciaBs: Decimal;
  /** Fino según el comprador menos fino estimado. Negativo = había menos oro. */
  diferenciaFinoG: Decimal;
}

export interface ResultadoVentaLotes {
  items: ResultadoVentaLote[];
  totalUsd: Decimal;
  totalBs: Decimal;
  costoBs: Decimal;
  gananciaBs: Decimal;
  /** Ganancia sobre el costo, en %. `null` si el costo es cero. */
  gananciaPorcentaje: Decimal | null;
}

/** Venta de uno o varios lotes completos al mismo comprador. */
export function calcularVentaDeLotes(
  entrada: ParametrosValoracion & { lotes: ReadonlyArray<LoteAVender> },
): ResultadoVentaLotes {
  if (entrada.lotes.length === 0) {
    throw new Error('Seleccione al menos un lote para vender.');
  }

  const items = entrada.lotes.map((lote): ResultadoVentaLote => {
    const venta = calcularVenta({
      onzaCierreUsd: entrada.onzaCierreUsd,
      tipoCambio: entrada.tipoCambio,
      pesoG: lote.pesoG,
      ley: lote.ley,
    });
    const costoBs = redondearImporte(d(lote.costoBs));
    return {
      ...venta,
      costoBs,
      gananciaBs: venta.totalBs.minus(costoBs),
      diferenciaFinoG: venta.pesoFinoG.minus(d(lote.pesoFinoEstimadoG)),
    };
  });

  const sumar = (campo: 'totalUsd' | 'totalBs' | 'costoBs') =>
    items.reduce((acc, item) => acc.plus(item[campo]), new Decimal(0));

  const totalBs = sumar('totalBs');
  const costoBs = sumar('costoBs');
  const gananciaBs = totalBs.minus(costoBs);

  return {
    items,
    totalUsd: sumar('totalUsd'),
    totalBs,
    costoBs,
    gananciaBs,
    gananciaPorcentaje: costoBs.isZero()
      ? null
      : gananciaBs.dividedBy(costoBs).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
  };
}
