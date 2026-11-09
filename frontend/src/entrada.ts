/**
 * Lectura de lo que teclea el operador. Las reglas de formato (coma decimal,
 * separador de miles, decimales permitidos) viven en `@tesoro/dominio` para
 * que el servidor valide con los mismos límites.
 */
import Decimal from 'decimal.js';
import { leerNumero, porcentajeALey, type Lectura } from '@tesoro/dominio';
import { importe, numero } from './formato';

export { leerNumero, type Lectura };

/** Ley en fracción (0.87) a partir del porcentaje tecleado (87 u 87,5). */
export function leerLey(texto: string): Lectura {
  const r = leerNumero(texto, 'leyPorcentaje');
  return r.valor ? { valor: porcentajeALey(r.valor).toString(), error: null } : r;
}

/** Margen a partir del cual un cambio de cotización merece una revisión. */
const VARIACION_SOSPECHOSA = new Decimal('0.2');

/**
 * Aviso (no bloquea) si el valor nuevo se aleja mucho del vigente: lo típico
 * de un dígito de más o de menos (48670 en vez de 4867).
 */
export function avisoDeVariacion(
  nuevo: string | null,
  anterior: string | undefined,
  nombre: string,
): string | null {
  if (!nuevo || !anterior) return null;
  let previo: Decimal;
  try {
    previo = new Decimal(anterior);
  } catch {
    return null;
  }
  if (!previo.isFinite() || previo.isZero()) return null;
  const cambio = new Decimal(nuevo).minus(previo).abs().dividedBy(previo);
  if (cambio.lessThanOrEqualTo(VARIACION_SOSPECHOSA)) return null;
  return (
    `${nombre} cambia ${numero(cambio.times(100), 0)} % respecto de la vigente ` +
    `(${importe(anterior)}). Revise que no falte ni sobre un dígito.`
  );
}

/** Clase CSS para resaltar un campo con error. */
export const claseError = (lectura: Lectura) => (lectura.error ? 'con-error' : '');
