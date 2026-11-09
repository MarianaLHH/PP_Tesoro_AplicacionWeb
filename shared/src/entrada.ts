import Decimal from 'decimal.js';

/**
 * Lectura de los números que teclea el operador.
 *
 * La app MUESTRA las cifras en formato boliviano (1.234,56), así que también
 * debe ACEPTARLAS así. Reglas:
 *
 *   49,2        -> 49.2      coma decimal
 *   49.2        -> 49.2      punto decimal (teclado numérico del celular)
 *   1.234,56    -> 1234.56   con los dos separadores, el último es el decimal
 *   1,234.56    -> 1234.56
 *   1.234.567   -> 1234567   el mismo separador repetido solo puede ser de miles
 *   1.234       -> 1.234     UN solo separador siempre es decimal
 *
 * El resultado es un string decimal canónico (con punto): lo que se guarda y
 * lo que recibe el dominio.
 */

/**
 * Decimales que admite cada dato de entrada. Coinciden con las columnas de
 * PostgreSQL: lo que no cabe se rechaza en vez de redondearse en silencio.
 */
export const DECIMALES_ENTRADA = {
  onza: 2, // Decimal(18,2)
  tipoCambio: 4, // Decimal(18,4)
  peso: 3, // Decimal(14,3)
  ley: 4, // Decimal(6,4), en fracción
  leyPorcentaje: 2, // la misma ley escrita en %
} as const;

export type TipoNumero = 'onza' | 'tipoCambio' | 'peso' | 'leyPorcentaje';

const REGLAS: Record<TipoNumero, { nombre: string; maximo?: number; unidad?: string }> = {
  onza: { nombre: 'La onza' },
  tipoCambio: { nombre: 'El tipo de cambio' },
  peso: { nombre: 'El peso' },
  leyPorcentaje: { nombre: 'La ley', maximo: 100, unidad: ' %' },
};

/** `valor` y `error` en null = campo vacío (todavía no se escribió nada). */
export interface Lectura {
  valor: string | null;
  error: string | null;
}

/** Texto tecleado -> string decimal canónico; `null` si no es un número. */
export function normalizarNumero(texto: string): string | null {
  const t = texto.replace(/\s/g, '');
  if (!/^[\d.,]+$/.test(t) || !/\d/.test(t)) return null;

  const puntos = t.split('.').length - 1;
  const comas = t.split(',').length - 1;
  let miles: '.' | ',' | null = null;
  let decimal: '.' | ',' | null = null;

  if (puntos > 0 && comas > 0) {
    decimal = t.lastIndexOf(',') > t.lastIndexOf('.') ? ',' : '.';
    miles = decimal === ',' ? '.' : ',';
  } else if (comas > 0) {
    if (comas > 1) miles = ',';
    else decimal = ',';
  } else if (puntos > 0) {
    if (puntos > 1) miles = '.';
    else decimal = '.';
  }

  const partes = decimal ? t.split(decimal) : [t];
  if (partes.length > 2) return null;
  let [entero, fraccion = ''] = partes;

  if (miles) {
    const agrupado = new RegExp(`^\\d{1,3}(\\${miles}\\d{3})+$`);
    if (!agrupado.test(entero)) return null;
    entero = entero.split(miles).join('');
  }
  if (!/^\d*$/.test(entero) || !/^\d*$/.test(fraccion)) return null;
  if (!entero && !fraccion) return null;

  return new Decimal(`${entero || '0'}.${fraccion || '0'}`).toString();
}

/** Lee y valida un campo numérico según su tipo. */
export function leerNumero(texto: string, tipo: TipoNumero): Lectura {
  if (!texto.trim()) return { valor: null, error: null };
  const regla = REGLAS[tipo];
  const fallo = (mensaje: string): Lectura => ({ valor: null, error: mensaje });

  const valor = normalizarNumero(texto);
  if (valor === null) {
    return fallo(`${regla.nombre} no es un número válido: "${texto.trim()}".`);
  }
  const d = new Decimal(valor);
  if (d.lessThanOrEqualTo(0)) return fallo(`${regla.nombre} debe ser mayor a cero.`);
  if (regla.maximo !== undefined && d.greaterThan(regla.maximo)) {
    return fallo(`${regla.nombre} no puede pasar de ${regla.maximo}${regla.unidad ?? ''}.`);
  }
  const decimales = DECIMALES_ENTRADA[tipo];
  if (d.decimalPlaces() > decimales) {
    return fallo(`${regla.nombre} admite hasta ${decimales} decimales.`);
  }
  return { valor, error: null };
}
