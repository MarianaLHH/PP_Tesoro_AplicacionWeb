import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import Decimal from 'decimal.js';
import { db, stockFinoDisponible } from '../db/db';
import { estadoSync, fechaCorta, importe, peso } from '../formato';
import { IconoMas } from '../componentes/Iconos';

/** Salidas del material ya comprado hacia el comprador final. */
export default function Ventas() {
  const ventas = useLiveQuery(
    () => db.ventas.orderBy('fecha').reverse().toArray(),
    [],
  );
  const stock = useLiveQuery(() => stockFinoDisponible(), []);

  return (
    <section>
      <div className="encabezado-pagina bloque">
        <div>
          <h2 className="titulo-pagina">Ventas</h2>
          <p className="ayuda subtitulo">
            Salidas del material ya comprado hacia el comprador final.
          </p>
        </div>
        <Link className="boton primario" to="/ventas/nueva">
          <IconoMas tamano={16} />
          Nueva venta
        </Link>
      </div>

      <div className="tarjeta-stock">
        <span className="tarjeta-etiqueta">En stock (fino estimado)</span>
        <span className="tarjeta-valor-oro">
          {stock ? peso(stock.toString()) : '0,00'} g
        </span>
      </div>

      <div className="rejilla-scroll">
        <div className="rejilla-ventas cabecera">
          <span className="th">Número</span>
          <span className="th">Fecha</span>
          <span className="th">Destino</span>
          <span className="th">Lotes</span>
          <span className="th">Peso (g)</span>
          <span className="th">Total Bs</span>
          <span className="th">Ganancia Bs</span>
          <span className="th">Estado</span>
        </div>

        {ventas?.map((v) => (
          <div
            className={`rejilla-ventas fila ${v.estado === 'ANULADA' ? 'anulada' : ''}`}
            key={v.id}
          >
            {v.numero ? (
              <span>{`VTA-${String(v.numero).padStart(6, '0')}`}</span>
            ) : (
              <span className="provisional" title="Pendiente de sincronizar">
                {v.numeroLocal}
              </span>
            )}
            <span className="tenue">{fechaCorta(v.fecha)}</span>
            <span>{v.destino}</span>
            <span className="codigo">
              {v.items.map((i) => i.loteCodigo).join(', ')}
            </span>
            <span className="tenue">
              {peso(
                v.items
                  .reduce((total, i) => total.plus(i.pesoG), new Decimal(0))
                  .toString(),
              )}
            </span>
            <span className="destacado">{importe(v.totalBs)}</span>
            <span
              className={
                v.gananciaBs === null
                  ? 'tenue'
                  : new Decimal(v.gananciaBs).isNegative()
                    ? 'negativo'
                    : 'positivo'
              }
              title={v.gananciaBs === null ? 'Venta anterior al registro de lotes' : undefined}
            >
              {v.gananciaBs === null ? '—' : importe(v.gananciaBs)}
            </span>
            <span className={estadoSync(v.estadoSync).clase}>
              {estadoSync(v.estadoSync).texto}
            </span>
          </div>
        ))}

        {ventas?.length === 0 && (
          <div className="vacio">Todavía no hay ventas registradas.</div>
        )}
      </div>
    </section>
  );
}
