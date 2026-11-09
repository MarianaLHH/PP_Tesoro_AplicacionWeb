import {
  calcularCompraItem,
  calcularFundicion,
  calcularLoteDeCompra,
  calcularVentaDeLotes,
} from '@tesoro/dominio';
import {
  leerCompra,
  leerCotizacion,
  leerFundicion,
  leerVenta,
  LoteServidor,
  OperacionRechazada,
  verificarFundicion,
  verificarVenta,
} from './verificacion';

const COTIZACION = { onzaCierreUsd: '4867', tipoCambio: '11.5' };
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Compra tal como la arma la PWA: caso real del Excel (49,2 g al 87 %). */
function compraDeLaApp() {
  const r = calcularCompraItem({ ...COTIZACION, pesoDespuesFundirG: '49.2', ley: '0.87' });
  const item = {
    id: ID(11),
    pesoAntesFundirG: null,
    pesoDespuesFundirG: '49.2',
    ley: '0.87',
    bsPorGramo: r.bsPorGramo.toString(),
    totalBs: r.totalBs.toString(),
    pesoFinoG: r.pesoFinoG.toString(),
  };
  const lote = calcularLoteDeCompra([item]);
  return {
    id: ID(1),
    numeroLocal: 'COM-?2611081200',
    fecha: '2026-11-08',
    clienteId: ID(2),
    clienteNombre: 'Ana',
    ...COTIZACION,
    totalBs: r.totalBs.toString(),
    estado: 'CONFIRMADA',
    items: [item],
    estadoSync: 'pendiente',
    lote: {
      id: ID(3),
      codigo: 'L-000000',
      pesoBrutoG: lote.pesoBrutoG.toString(),
      pesoFinoG: lote.pesoFinoG.toString(),
      leyEstimada: lote.leyEstimada.toString(),
      costoBs: lote.costoBs.toString(),
    },
  };
}

const rechaza = (fn: () => unknown, texto: RegExp) => {
  expect(fn).toThrow(OperacionRechazada);
  expect(fn).toThrow(texto);
};

describe('leerCompra', () => {
  it('acepta la compra de la app y guarda los valores del dominio', () => {
    const c = leerCompra(compraDeLaApp());
    expect(c.totalBs).toBe('77025.46');
    expect(c.items[0].bsPorGramo).toBe('1565.56');
    expect(c.fecha.toISOString()).toBe('2026-11-08T00:00:00.000Z');
    expect(c.lote.costoBs).toBe('77025.46');
  });

  it('rechaza un total que no coincide con la fórmula', () => {
    const p = compraDeLaApp();
    p.items[0].totalBs = '77025.55';
    rechaza(() => leerCompra(p), /pieza 1, total Bs/);
  });

  it('rechaza una ley fuera de rango con el mensaje del dominio', () => {
    const p = compraDeLaApp();
    p.items[0].ley = '87';
    rechaza(() => leerCompra(p), /fracción entre 0 y 1/);
  });

  it('rechaza un número con coma decimal', () => {
    const p = compraDeLaApp();
    p.items[0].pesoDespuesFundirG = '49,2';
    rechaza(() => leerCompra(p), /no es un número válido/);
  });

  it('rechaza un peso con más decimales de los que guarda la base', () => {
    const p = compraDeLaApp();
    p.items[0].pesoDespuesFundirG = '49.2001';
    rechaza(() => leerCompra(p), /hasta 3 decimales/);
  });

  it('rechaza una onza con más de 2 decimales', () => {
    const p = compraDeLaApp();
    p.onzaCierreUsd = '4867.001';
    rechaza(() => leerCompra(p), /onzaCierreUsd" admite hasta 2 decimales/);
  });

  it('rechaza una compra sin lote', () => {
    const p: Record<string, unknown> = compraDeLaApp();
    delete p.lote;
    rechaza(() => leerCompra(p), /lote: faltan los datos/);
  });
});

describe('leerCotizacion', () => {
  it('rechaza una onza en cero', () => {
    rechaza(
      () => leerCotizacion({ id: ID(5), fecha: new Date().toISOString(), onzaCierreUsd: '0', tipoCambio: '11.5' }),
      /mayor a cero/,
    );
  });
});

const lote = (n: number, bruto: string, fino: string, costo: string, estado = 'DISPONIBLE'): LoteServidor => ({
  id: ID(n),
  codigo: `L-${String(n).padStart(6, '0')}`,
  estado,
  pesoBrutoG: bruto,
  pesoFinoG: fino,
  costoBs: costo,
});

describe('fundición', () => {
  const l1 = lote(21, '50', '43.5', '77000');
  const l2 = lote(22, '30', '22.5', '40000');
  const servidor = new Map([l1, l2].map((l) => [l.id, l]));

  function fundicionDeLaApp() {
    const r = calcularFundicion({ lotes: [l1, l2], pesoResultanteG: '78' });
    return {
      id: ID(20),
      fecha: '2026-11-08',
      loteIds: [l1.id, l2.id],
      loteResultanteId: ID(23),
      pesoBrutoOrigenG: r.pesoBrutoOrigenG.toString(),
      pesoResultanteG: '78',
      mermaG: r.mermaG.toString(),
      pesoFinoG: r.pesoFinoG.toString(),
      leyEstimada: r.leyEstimada.toString(),
      costoBs: r.costoBs.toString(),
      loteResultante: { id: ID(23), codigo: 'L-000023' },
    };
  }

  it('acepta la fundición y suma el costo de los lotes', () => {
    const { resultado } = verificarFundicion(leerFundicion(fundicionDeLaApp()), servidor);
    expect(resultado.costoBs.toString()).toBe('117000');
    expect(resultado.mermaG.toString()).toBe('2');
  });

  it('rechaza si un lote ya fue vendido en el servidor', () => {
    const vendido = new Map(servidor).set(l2.id, { ...l2, estado: 'VENDIDO' });
    rechaza(() => verificarFundicion(leerFundicion(fundicionDeLaApp()), vendido), /L-000022 ya no está disponible/);
  });

  it('rechaza si el lote no llegó al servidor', () => {
    const incompleto = new Map([[l1.id, l1]]);
    rechaza(() => verificarFundicion(leerFundicion(fundicionDeLaApp()), incompleto), /no existe en el servidor/);
  });
});

describe('venta', () => {
  const l1 = lote(31, '49.2', '42.804', '77025.46');
  const servidor = new Map([[l1.id, l1]]);
  const venta = { onzaCierreUsd: '4900', tipoCambio: '11.6' };

  function ventaDeLaApp() {
    const r = calcularVentaDeLotes({
      ...venta,
      lotes: [{ pesoG: '49.2', ley: '0.88', pesoFinoEstimadoG: l1.pesoFinoG, costoBs: l1.costoBs }],
    });
    const it = r.items[0];
    return {
      id: ID(30),
      numeroLocal: 'VTA-?2611081300',
      fecha: '2026-11-08',
      destino: 'Exportadora Andina',
      ...venta,
      estado: 'CONFIRMADA',
      items: [
        {
          loteId: l1.id,
          loteCodigo: l1.codigo,
          pesoG: '49.2',
          ley: '0.88',
          pesoFinoG: it.pesoFinoG.toString(),
          pesoFinoEstimadoG: l1.pesoFinoG,
          bsPorGramo: it.bsPorGramo.toString(),
          precioGramoUsd: it.precioGramoUsd.toString(),
          totalUsd: it.totalUsd.toString(),
          totalBs: it.totalBs.toString(),
          costoBs: it.costoBs.toString(),
        },
      ],
      totalUsd: r.totalUsd.toString(),
      totalBs: r.totalBs.toString(),
      costoBs: r.costoBs.toString(),
      gananciaBs: r.gananciaBs.toString(),
    };
  }

  it('acepta la venta y calcula la ganancia contra el costo del servidor', () => {
    const v = verificarVenta(leerVenta(ventaDeLaApp()), servidor);
    expect(v.costoBs).toBe('77025.46');
    expect(v.items[0].loteCodigo).toBe(l1.codigo);
  });

  it('rechaza una ganancia alterada', () => {
    const p = ventaDeLaApp();
    p.gananciaBs = '999999';
    rechaza(() => verificarVenta(leerVenta(p), servidor), /ganancia/);
  });

  it('acepta una venta anterior al módulo de lotes sin costo', () => {
    const p = {
      ...ventaDeLaApp(),
      costoBs: null,
      gananciaBs: null,
      items: [{ ...ventaDeLaApp().items[0], loteId: null, loteCodigo: '—', costoBs: null, bsPorGramo: undefined }],
    };
    const v = verificarVenta(leerVenta(p), new Map());
    expect(v.items[0].loteId).toBeNull();
    expect(v.costoBs).toBeNull();
  });
});
