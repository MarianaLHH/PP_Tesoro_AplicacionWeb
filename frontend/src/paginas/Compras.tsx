import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '../db/db';
import { estadoSync, fechaCorta, importe } from '../formato';

export default function Compras() {
  const compras = useLiveQuery(
    () => db.compras.orderBy('fecha').reverse().toArray(),
    [],
  );

  return (
    <section>
      <header className="encabezado-pagina">
        <h2>Compras</h2>
        <Link className="primario boton" to="/compras/nueva">
          Nueva compra
        </Link>
      </header>

      <table>
        <thead>
          <tr>
            <th>Número</th>
            <th>Fecha</th>
            <th>Cliente</th>
            <th>Piezas</th>
            <th>Total Bs</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {compras?.map((c) => (
            <tr key={c.id} className={c.estado === 'ANULADA' ? 'anulada' : ''}>
              <td>
                {c.numero ? (
                  `COM-${String(c.numero).padStart(6, '0')}`
                ) : (
                  <span className="provisional" title="Pendiente de sincronizar">
                    {c.numeroLocal}
                  </span>
                )}
              </td>
              <td>{fechaCorta(c.fecha)}</td>
              <td>{c.clienteNombre}</td>
              <td>{c.items.length}</td>
              <td className="importe">{importe(c.totalBs)}</td>
              <td className={estadoSync(c.estadoSync).clase}>{estadoSync(c.estadoSync).texto}</td>
            </tr>
          ))}
          {compras?.length === 0 && (
            <tr>
              <td colSpan={6}>Todavía no hay compras registradas.</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
