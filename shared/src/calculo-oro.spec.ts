import {
  calcularBsPorGramo,
  calcularCompraItem,
  calcularFundicion,
  calcularLoteDeCompra,
  calcularMerma,
  calcularVentaDeLotes,
  calcularPesoFino,
  calcularTotalCompra,
  karatsALey,
  calcularVenta,
  milesimasALey,
  porcentajeALey,
} from './calculo-oro';

/**
 * Caso de referencia tomado de `COMPRA ORO LIQUIDACION.xlsx`, fila 7:
 *   ONZA CIERRE = 4867 USD/oz
 *   T/C         = 11.5 Bs/USD
 *   LEY         = 0.87
 *   PESO D/F    = 49.2 g
 *   BS/GRAMO    = 1565.5580561673123
 *   TOTAL BS    = 77025.456363431775
 */
const EXCEL = {
  onzaCierreUsd: '4867',
  tipoCambio: '11.5',
  ley: '0.87',
  pesoDespuesFundirG: '49.2',
};

describe('calculo-oro', () => {
  describe('calcularBsPorGramo', () => {
    it('reproduce el valor del Excel redondeado a 2 decimales', () => {
      // Excel: 1565.5580561673123 -> 1565.56
      expect(calcularBsPorGramo(EXCEL).toString()).toBe('1565.56');
    });

    it('escala linealmente con la ley', () => {
      const mitad = calcularBsPorGramo({ ...EXCEL, ley: '0.435' });
      expect(mitad.toString()).toBe('782.78');
    });

    it('una ley de 1 equivale a oro puro', () => {
      // 4867 / 31.1035 * 11.5 = 1799.49...
      expect(calcularBsPorGramo({ ...EXCEL, ley: '1' }).toString()).toBe(
        '1799.49',
      );
    });
  });

  describe('calcularCompraItem', () => {
    it('liquida la fila del Excel', () => {
      const r = calcularCompraItem(EXCEL);

      expect(r.bsPorGramo.toString()).toBe('1565.56');
      // Como el Excel: 49.2 * 1565.5580561673... = 77025.4563... -> 77025.46
      // (no 49.2 * 1565.56 = 77025.55: el precio por gramo no se redondea antes)
      expect(r.totalBs.toString()).toBe('77025.46');
      // 49.2 * 0.87 = 42.804
      expect(r.pesoFinoG.toString()).toBe('42.804');
      expect(r.mermaG).toBeNull();
    });

    it('calcula la merma cuando hay peso antes de fundir', () => {
      const r = calcularCompraItem({ ...EXCEL, pesoAntesFundirG: '50.5' });
      expect(r.mermaG?.toString()).toBe('1.3');
    });

    it('rechaza un peso no positivo', () => {
      expect(() =>
        calcularCompraItem({ ...EXCEL, pesoDespuesFundirG: '0' }),
      ).toThrow(/mayor a cero/);
    });

    it('rechaza una ley fuera del rango 0-1', () => {
      expect(() => calcularCompraItem({ ...EXCEL, ley: '87' })).toThrow(
        /fracción entre 0 y 1/,
      );
    });

    it('rechaza una merma negativa', () => {
      expect(() =>
        calcularCompraItem({ ...EXCEL, pesoAntesFundirG: '40' }),
      ).toThrow(/no puede superar/);
    });
  });

  describe('calcularPesoFino', () => {
    it('multiplica peso por ley con 3 decimales', () => {
      expect(calcularPesoFino('49.2', '0.87').toString()).toBe('42.804');
    });
  });

  describe('calcularMerma', () => {
    it('devuelve null si no hubo fundición', () => {
      expect(calcularMerma(null, '49.2')).toBeNull();
      expect(calcularMerma(undefined, '49.2')).toBeNull();
    });
  });

  describe('calcularTotalCompra', () => {
    it('suma los subtotales de las piezas', () => {
      const total = calcularTotalCompra([
        { totalBs: '77025.55' },
        { totalBs: '1000.45' },
      ]);
      expect(total.toString()).toBe('78026');
    });

    it('devuelve cero sin piezas', () => {
      expect(calcularTotalCompra([]).toString()).toBe('0');
    });
  });

  describe('calcularVenta', () => {
    const parametros = { onzaCierreUsd: '4867', tipoCambio: '11.95' };

    it('liquida en Bs con la misma fórmula que la compra', () => {
      const r = calcularVenta({ ...parametros, pesoG: '100', ley: '0.999' });

      // 4867 * 0.999 / 31.1035 * 11.95 = 1868.0370... Bs por gramo
      expect(r.bsPorGramo.toString()).toBe('1868.04');
      // 100 * 1868.0370... = 186803.7017..., redondeado solo al final.
      // No 15632.11 USD * 11.95 = 186803.71: eso redondea dos veces.
      expect(r.totalBs.toString()).toBe('186803.7');
      // Dólares de referencia: 4867 * 0.999 / 31.1035 = 156.3211...
      expect(r.precioGramoUsd.toString()).toBe('156.32');
      expect(r.totalUsd.toString()).toBe('15632.11');
      expect(r.pesoFinoG.toString()).toBe('99.9');
    });

    it('rechaza un peso no positivo', () => {
      expect(() =>
        calcularVenta({ ...parametros, pesoG: '0', ley: '0.999' }),
      ).toThrow(/peso a vender/i);
    });

    it('rechaza una ley fuera del rango 0-1', () => {
      expect(() =>
        calcularVenta({ ...parametros, pesoG: '10', ley: '1.5' }),
      ).toThrow(/fracción/i);
    });
  });

  describe('calcularLoteDeCompra', () => {
    it('una compra de una pieza es un lote con sus mismos valores', () => {
      const r = calcularLoteDeCompra([
        { pesoDespuesFundirG: '49.2', pesoFinoG: '42.804', totalBs: '77025.46' },
      ]);
      expect(r.pesoBrutoG.toString()).toBe('49.2');
      expect(r.pesoFinoG.toString()).toBe('42.804');
      expect(r.leyEstimada.toString()).toBe('0.87');
      expect(r.costoBs.toString()).toBe('77025.46');
    });

    it('varias piezas se suman y la ley es la ponderada por peso', () => {
      const r = calcularLoteDeCompra([
        { pesoDespuesFundirG: '10', pesoFinoG: '7.5', totalBs: '10000' },
        { pesoDespuesFundirG: '20', pesoFinoG: '18', totalBs: '25000.5' },
      ]);
      expect(r.pesoBrutoG.toString()).toBe('30');
      expect(r.pesoFinoG.toString()).toBe('25.5');
      // 25.5 / 30 = 0.85, no el promedio simple (0.75 + 0.9) / 2 = 0.825
      expect(r.leyEstimada.toString()).toBe('0.85');
      expect(r.costoBs.toString()).toBe('35000.5');
    });

    it('rechaza una compra sin piezas', () => {
      expect(() => calcularLoteDeCompra([])).toThrow(/sin piezas|no tiene piezas/);
    });
  });

  describe('calcularFundicion', () => {
    // Caso C del diagrama: dos clientes, un solo lingote.
    const C1 = { pesoBrutoG: '49.2', pesoFinoG: '42.804', costoBs: '77025.46' };
    const C2 = { pesoBrutoG: '30', pesoFinoG: '25.5', costoBs: '35000.5' };

    it('conserva el fino, suma el costo y registra la merma', () => {
      const r = calcularFundicion({ lotes: [C1, C2], pesoResultanteG: '78.5' });

      expect(r.pesoBrutoOrigenG.toString()).toBe('79.2');
      expect(r.pesoBrutoG.toString()).toBe('78.5');
      expect(r.mermaG.toString()).toBe('0.7');
      expect(r.pesoFinoG.toString()).toBe('68.304');
      // 68.304 / 78.5 = 0.87011... : al perder impurezas la ley sube
      expect(r.leyEstimada.toString()).toBe('0.8701');
      expect(r.costoBs.toString()).toBe('112025.96');
    });

    it('exige al menos dos lotes', () => {
      expect(() =>
        calcularFundicion({ lotes: [C1], pesoResultanteG: '49' }),
      ).toThrow(/al menos dos/);
    });

    it('rechaza un resultante mayor que lo que entró al horno', () => {
      expect(() =>
        calcularFundicion({ lotes: [C1, C2], pesoResultanteG: '80' }),
      ).toThrow(/no puede superar/);
    });

    it('rechaza un resultante menor que el oro fino estimado', () => {
      expect(() =>
        calcularFundicion({ lotes: [C1, C2], pesoResultanteG: '60' }),
      ).toThrow(/menor que el oro fino/);
    });
  });

  describe('calcularVentaDeLotes', () => {
    const lingote = {
      pesoG: '78.5',
      ley: '0.88', // la que midió el comprador
      pesoFinoEstimadoG: '68.304',
      costoBs: '112025.96',
    };

    it('liquida con la ley del comprador y calcula la ganancia sobre el costo', () => {
      const r = calcularVentaDeLotes({
        onzaCierreUsd: '4867',
        tipoCambio: '11.95',
        lotes: [lingote],
      });

      expect(r.items[0].precioGramoUsd.toString()).toBe('137.7');
      expect(r.totalUsd.toString()).toBe('10809.47');
      expect(r.totalBs.toString()).toBe('129173.17');
      expect(r.costoBs.toString()).toBe('112025.96');
      expect(r.gananciaBs.toString()).toBe('17147.21');
      expect(r.gananciaPorcentaje?.toString()).toBe('15.31');
      // 78.5 * 0.88 = 69.08 g según el comprador; se estimaban 68.304
      expect(r.items[0].diferenciaFinoG.toString()).toBe('0.776');
    });

    it('suma varios lotes vendidos juntos', () => {
      const r = calcularVentaDeLotes({
        onzaCierreUsd: '4867',
        tipoCambio: '11.95',
        lotes: [lingote, lingote],
      });
      expect(r.totalUsd.toString()).toBe('21618.94');
      expect(r.gananciaBs.toString()).toBe('34294.42');
    });

    it('exige al menos un lote', () => {
      expect(() =>
        calcularVentaDeLotes({ onzaCierreUsd: '4867', tipoCambio: '11.95', lotes: [] }),
      ).toThrow(/al menos un lote/);
    });
  });

  describe('conversiones de ley', () => {
    it('convierte karats', () => {
      expect(karatsALey('18').toString()).toBe('0.75');
      expect(karatsALey('24').toString()).toBe('1');
    });

    it('convierte porcentajes', () => {
      expect(porcentajeALey('87').toString()).toBe('0.87');
      expect(porcentajeALey('100').toString()).toBe('1');
      expect(porcentajeALey('91.6').toString()).toBe('0.916');
    });

    it('convierte milésimas', () => {
      expect(milesimasALey('750').toString()).toBe('0.75');
      expect(milesimasALey('999').toString()).toBe('0.999');
    });
  });
});
