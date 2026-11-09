import { leerNumero, normalizarNumero } from './entrada';

describe('normalizarNumero', () => {
  it.each([
    ['49,2', '49.2'],
    ['49.2', '49.2'],
    [' 49 , 2 ', '49.2'],
    ['4867', '4867'],
    ['1.234,56', '1234.56'],
    ['1,234.56', '1234.56'],
    ['1.234.567', '1234567'],
    ['1.234.567,8', '1234567.8'],
    ['1.234', '1.234'], // un solo separador: decimal
    ['1,234', '1.234'],
    [',5', '0.5'],
    ['5,', '5'],
    ['49,200', '49.2'],
  ])('%s -> %s', (texto, esperado) => {
    expect(normalizarNumero(texto)).toBe(esperado);
  });

  it.each(['', 'abc', '49,2g', '-5', '1e3', '.', ',', '1,2,3.4', '12.34,5.6', '1.23.456', '4.86.7'])(
    'rechaza "%s"',
    (texto) => {
      expect(normalizarNumero(texto)).toBeNull();
    },
  );
});

describe('leerNumero', () => {
  it('un campo vacío no es error', () => {
    expect(leerNumero('  ', 'peso')).toEqual({ valor: null, error: null });
  });

  it('acepta la coma decimal', () => {
    expect(leerNumero('11,5', 'tipoCambio')).toEqual({ valor: '11.5', error: null });
  });

  it('rechaza cero', () => {
    expect(leerNumero('0', 'onza').error).toMatch(/mayor a cero/);
  });

  it('rechaza texto con un mensaje que repite lo escrito', () => {
    expect(leerNumero('abc', 'onza').error).toBe('La onza no es un número válido: "abc".');
  });

  it('limita los decimales a los de la base', () => {
    expect(leerNumero('4867,123', 'onza').error).toMatch(/hasta 2 decimales/);
    expect(leerNumero('11,95001', 'tipoCambio').error).toMatch(/hasta 4 decimales/);
    expect(leerNumero('49,2001', 'peso').error).toMatch(/hasta 3 decimales/);
    expect(leerNumero('49,200', 'peso').valor).toBe('49.2');
  });

  it('la ley no pasa de 100 %', () => {
    expect(leerNumero('100', 'leyPorcentaje').valor).toBe('100');
    expect(leerNumero('100,01', 'leyPorcentaje').error).toMatch(/no puede pasar de 100 %/);
    expect(leerNumero('87,555', 'leyPorcentaje').error).toMatch(/hasta 2 decimales/);
  });
});
