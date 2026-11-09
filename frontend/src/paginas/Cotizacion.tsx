import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { calcularBsPorGramo } from '@tesoro/dominio';
import { db } from '../db/db';
import { importe } from '../formato';

/** Cuántas cotizaciones se listan, de la más reciente hacia atrás. */
const LIMITE_HISTORIAL = 50;

/**
 * Historial de cotizaciones, solo para consulta.
 *
 * Las cotizaciones se registran desde Nueva compra: al cambiar la onza o el
 * T/C, la compra guarda una cotización oficial nueva. Cada registro es
 * histórico e inmutable: las compras copian estos valores, nunca los
 * referencian, así que nada de lo que se vea aquí altera lo ya liquidado.
 */
export default function Cotizacion() {
  const historial = useLiveQuery(
    () => db.cotizaciones.orderBy('fecha').reverse().limit(LIMITE_HISTORIAL).toArray(),
    [],
  );

  /** Referencia: cuánto vale el gramo de oro puro con esos parámetros. */
  const gramoPuro = (onzaCierreUsd: string, tipoCambio: string) => {
    try {
      return importe(calcularBsPorGramo({ onzaCierreUsd, tipoCambio, ley: 1 }).toString());
    } catch {
      return '—';
    }
  };

  return (
    <section>
      <header className="encabezado-pagina">
        <h2>Cotización</h2>
        <p className="ayuda">
          Historial de la onza y el tipo de cambio. Para actualizarlos, cámbielos
          al registrar una nueva compra.
        </p>
        <Link className="primario boton" to="/compras/nueva">
          Nueva compra
        </Link>
      </header>

      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Onza cierre (USD)</th>
            <th>T/C (Bs por USD)</th>
            <th>Gramo puro (Bs)</th>
          </tr>
        </thead>
        <tbody>
          {historial?.map((c, i) => (
            <tr key={c.id}>
              <td>
                {i === 0 && <span className="insignia">Vigente</span>}
                {new Date(c.fecha).toLocaleString('es-BO')}
              </td>
              <td className="importe">{importe(c.onzaCierreUsd)}</td>
              <td className="importe">{importe(c.tipoCambio)}</td>
              <td className="importe">{gramoPuro(c.onzaCierreUsd, c.tipoCambio)}</td>
            </tr>
          ))}
          {historial?.length === 0 && (
            <tr>
              <td colSpan={4}>
                Sin cotizaciones registradas. La primera se guarda al registrar
                una compra.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
