/**
 * Presentación de cifras y fechas.
 *
 * Los valores viajan como string decimal para no perder precisión; estas
 * funciones son solo la capa de lectura y nunca alimentan un cálculo.
 *
 * Formato boliviano: miles con punto, decimales con coma → 1.234.567,89
 * Se arma a mano en vez de usar `toLocaleString('es-BO')` porque algunos
 * navegadores no agrupan los números de 4 cifras en español (1234,50).
 */
import Decimal from 'decimal.js';

/** Número con `decimales` fijos, punto de miles y coma decimal. */
export function numero(valor: string | number | Decimal, decimales: number): string {
  let d: Decimal;
  try {
    d = new Decimal(valor);
  } catch {
    return String(valor);
  }
  if (!d.isFinite()) return String(valor);

  const fijo = d.toFixed(decimales, Decimal.ROUND_HALF_UP);
  const negativo = fijo.startsWith('-');
  const [entero, fraccion] = (negativo ? fijo.slice(1) : fijo).split('.');
  const conMiles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const texto = fraccion ? `${conMiles},${fraccion}` : conMiles;
  // Evita "-0,00" cuando el valor redondeado es cero.
  return negativo && /[1-9]/.test(texto) ? `-${texto}` : texto;
}

/** Importes (Bs, USD, onza, T/C) con dos decimales: 1.234.567,89 */
export function importe(valor: string | number | Decimal): string {
  return numero(valor, 2);
}

/**
 * Pesos en gramos, con 2 decimales.
 *
 * El dominio guarda 3, pero con tres cifras tras la coma (`116,400`) se lee
 * como miles. Es solo presentación: los cálculos usan el valor guardado.
 */
export function peso(valor: string | number | Decimal): string {
  return numero(valor, 2);
}

/** Ley de fracción a porcentaje legible: 0.87 -> "87 %", 0.8701 -> "87,01 %". */
export function leyPorcentaje(fraccion: string | number | Decimal): string {
  let porcentaje: Decimal;
  try {
    porcentaje = new Decimal(fraccion).times(100);
  } catch {
    return String(fraccion);
  }
  // Los enteros se leen mejor sin decimales: 87 % en vez de 87,00 %.
  return `${numero(porcentaje, porcentaje.isInteger() ? 0 : 2)} %`;
}

/** Texto y clase CSS del estado de envío de un registro. */
export function estadoSync(estado: 'pendiente' | 'sincronizado' | 'error') {
  if (estado === 'pendiente') return { texto: '⏳ pendiente', clase: 'estado-pendiente' };
  if (estado === 'error') return { texto: '⚠ rechazada', clase: 'estado-error' };
  return { texto: '✓ sincronizado', clase: 'estado-ok' };
}

/** Fecha `YYYY-MM-DD` (o ISO) a `DD/MM/AAAA`, sin cruzar husos horarios. */
export function fechaCorta(valor: string): string {
  const [anio, mes, dia] = valor.slice(0, 10).split('-');
  if (!anio || !mes || !dia) return valor;
  return `${dia}/${mes}/${anio}`;
}
