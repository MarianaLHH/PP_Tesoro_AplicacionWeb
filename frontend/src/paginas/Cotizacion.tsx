import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { calcularBsPorGramo } from '@tesoro/dominio';
import { db, encolar } from '../db/db';
import { importe } from '../formato';

/**
 * Parámetros globales de valoración: onza de cierre y tipo de cambio.
 *
 * Cada registro es histórico e inmutable: las compras copian estos valores,
 * nunca los referencian. Cambiar la cotización de hoy NO altera lo ya
 * liquidado — a diferencia del Excel original.
 */
export default function Cotizacion() {
  const historial = useLiveQuery(
    () => db.cotizaciones.orderBy('fecha').reverse().limit(15).toArray(),
    [],
  );

  const [onzaCierreUsd, setOnza] = useState('');
  const [tipoCambio, setTipoCambio] = useState('');
  const [guardando, setGuardando] = useState(false);

  /** Referencia rápida: cuánto vale el gramo de oro puro con estos parámetros. */
  const referencia = (() => {
    if (!onzaCierreUsd || !tipoCambio) return null;
    try {
      return calcularBsPorGramo({ onzaCierreUsd, tipoCambio, ley: 1 }).toString();
    } catch {
      return null;
    }
  })();

  async function guardar() {
    if (!onzaCierreUsd || !tipoCambio) return;
    setGuardando(true);
    try {
      const cotizacion = {
        id: crypto.randomUUID(),
        fecha: new Date().toISOString(),
        onzaCierreUsd,
        tipoCambio,
        actualizadoEn: new Date().toISOString(),
        estadoSync: 'pendiente' as const,
      };
      await db.cotizaciones.add(cotizacion);
      await encolar('cotizacion', cotizacion.id, 'crear', cotizacion);
      setOnza('');
      setTipoCambio('');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section>
      <header className="encabezado-pagina">
        <h2>Cotización</h2>
        <p className="ayuda">
          Se aplica a las compras que se registren desde ahora. Las anteriores
          conservan la cotización con la que fueron liquidadas.
        </p>
      </header>

      <div className="campos">
        <label>
          Onza cierre (USD)
          <input
            inputMode="decimal"
            value={onzaCierreUsd}
            onChange={(e) => setOnza(e.target.value)}
            placeholder="4867"
          />
        </label>

        <label>
          Tipo de cambio (Bs por USD)
          <input
            inputMode="decimal"
            value={tipoCambio}
            onChange={(e) => setTipoCambio(e.target.value)}
            placeholder="11.5"
          />
        </label>
      </div>

      {referencia && (
        <p className="referencia">
          Gramo de oro puro (ley 100 %): <strong>Bs {importe(referencia)}</strong>
        </p>
      )}

      <button
        className="primario"
        disabled={!onzaCierreUsd || !tipoCambio || guardando}
        onClick={guardar}
      >
        {guardando ? 'Guardando…' : 'Registrar cotización'}
      </button>

      <h3>Historial</h3>
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Onza cierre</th>
            <th>T/C</th>
          </tr>
        </thead>
        <tbody>
          {historial?.map((c) => (
            <tr key={c.id}>
              <td>{new Date(c.fecha).toLocaleString('es-BO')}</td>
              <td className="importe">{importe(c.onzaCierreUsd)}</td>
              <td className="importe">{importe(c.tipoCambio)}</td>
            </tr>
          ))}
          {historial?.length === 0 && (
            <tr>
              <td colSpan={3}>Sin cotizaciones registradas.</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
