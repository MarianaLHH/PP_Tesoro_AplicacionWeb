import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import Decimal from 'decimal.js';
import { db, type EstadoLote } from '../db/db';
import { fechaCorta, importe, leyPorcentaje, peso } from '../formato';

const ETIQUETA_ESTADO: Record<EstadoLote, string> = {
  DISPONIBLE: 'En stock',
  FUNDIDO: 'Fundido',
  VENDIDO: 'Vendido',
};

/**
 * Lotes de oro: lo que hay en caja fuerte y de dónde salió.
 *
 * Desde aquí se eligen los lotes a fundir juntos o a vender. Un lote siempre
 * se vende o se funde completo, por eso la selección es por lote y no por peso.
 */
export default function Inventario() {
  const navegar = useNavigate();
  const [verTodos, setVerTodos] = useState(false);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());

  const lotes = useLiveQuery(
    () =>
      verTodos
        ? db.lotes.orderBy('fecha').reverse().toArray()
        : db.lotes.where('estado').equals('DISPONIBLE').reverse().sortBy('fecha'),
    [verTodos],
  );

  const resumen = useMemo(() => {
    let fino = new Decimal(0);
    let costo = new Decimal(0);
    let cantidad = 0;
    for (const lote of lotes ?? []) {
      if (lote.estado !== 'DISPONIBLE') continue;
      fino = fino.plus(lote.pesoFinoG);
      costo = costo.plus(lote.costoBs);
      cantidad++;
    }
    return { cantidad, fino: fino.toString(), costo: costo.toString() };
  }, [lotes]);

  function alternar(id: string) {
    setSeleccion((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  }

  const ids = [...seleccion].join(',');

  return (
    <section>
      <div className="encabezado-pagina bloque">
        <div>
          <h2 className="titulo-pagina">Inventario</h2>
          <p className="ayuda subtitulo">
            Cada compra es un lote. Marque varios para fundirlos en una sola
            pieza, o uno o más para venderlos. Ley y fino son estimados: la ley
            real la mide el comprador.
          </p>
        </div>
        <div className="acciones">
          <button
            type="button"
            disabled={seleccion.size < 2}
            title="Se necesitan al menos dos lotes"
            onClick={() => navegar(`/inventario/fundir?lotes=${ids}`)}
          >
            Fundir juntos{seleccion.size >= 2 ? ` (${seleccion.size})` : ''}
          </button>
          <button
            type="button"
            className="primario"
            disabled={seleccion.size === 0}
            onClick={() => navegar(`/ventas/nueva?lotes=${ids}`)}
          >
            Vender{seleccion.size > 0 ? ` (${seleccion.size})` : ''}
          </button>
        </div>
      </div>

      <div className="tarjetas">
        <div className="tarjeta">
          <div className="tarjeta-etiqueta">Lotes en stock</div>
          <div className="tarjeta-valor">{resumen.cantidad}</div>
        </div>
        <div className="tarjeta">
          <div className="tarjeta-etiqueta">Fino estimado</div>
          <div className="tarjeta-valor">
            {peso(resumen.fino)} <b>g</b>
          </div>
        </div>
        <div className="tarjeta">
          <div className="tarjeta-etiqueta">Costo</div>
          <div className="tarjeta-valor">
            <b>Bs</b> {importe(resumen.costo)}
          </div>
        </div>
      </div>

      <div className="filtros">
        <button
          type="button"
          className={verTodos ? '' : 'activo'}
          onClick={() => setVerTodos(false)}
        >
          En stock
        </button>
        <button
          type="button"
          className={verTodos ? 'activo' : ''}
          onClick={() => setVerTodos(true)}
        >
          Todos
        </button>
      </div>

      <div className="rejilla-scroll">
        <div className="rejilla-inventario cabecera">
          <span />
          <span className="th">Lote</span>
          <span className="th">Fecha</span>
          <span className="th">Origen</span>
          <span className="th">Peso (g)</span>
          <span className="th">Ley est.</span>
          <span className="th">Fino est. (g)</span>
          <span className="th">Costo Bs</span>
          <span className="th">Estado</span>
        </div>

        {lotes?.map((lote) => {
          const disponible = lote.estado === 'DISPONIBLE';
          return (
            <label
              key={lote.id}
              className={`rejilla-inventario fila ${disponible ? '' : 'consumido'} ${
                seleccion.has(lote.id) ? 'marcado' : ''
              }`}
            >
              <input
                type="checkbox"
                disabled={!disponible}
                checked={seleccion.has(lote.id)}
                onChange={() => alternar(lote.id)}
              />
              <span className="codigo">{lote.codigo}</span>
              <span className="tenue">{fechaCorta(lote.fecha)}</span>
              <span>
                {lote.origen === 'FUNDICION' && (
                  <span className="insignia">Fundido</span>
                )}
                {lote.clientes.join(' + ')}
              </span>
              <span className="tenue">{peso(lote.pesoBrutoG)}</span>
              <span className="tenue">{leyPorcentaje(lote.leyEstimada)}</span>
              <span className="tenue">{peso(lote.pesoFinoG)}</span>
              <span className="destacado">{importe(lote.costoBs)}</span>
              <span className={disponible ? 'estado-pendiente' : 'estado-ok'}>
                {ETIQUETA_ESTADO[lote.estado]}
              </span>
            </label>
          );
        })}

        {lotes?.length === 0 && (
          <div className="vacio">
            {verTodos
              ? 'Todavía no hay lotes. Se crean al registrar una compra.'
              : 'No hay lotes en stock.'}
          </div>
        )}
      </div>
    </section>
  );
}
