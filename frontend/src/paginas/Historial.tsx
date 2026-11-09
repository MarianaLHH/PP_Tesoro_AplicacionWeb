import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Decimal from 'decimal.js';
import { db } from '../db/db';
import { estadoSync, fechaCorta, importe, leyPorcentaje, peso } from '../formato';

/**
 * Historial de compras por cliente.
 *
 * Una fila por PIEZA, no por compra: es el nivel al que el operador recuerda
 * la operación («la cadena de 18 k que trajo Juana»), y permite comparar leyes
 * y precios del mismo cliente en distintas fechas sin abrir cada documento.
 */
export default function Historial() {
  const compras = useLiveQuery(() => db.compras.toArray(), []);
  const [busqueda, setBusqueda] = useState('');

  const filas = useMemo(() => {
    if (!compras) return [];

    return compras
      .filter((c) => c.estado !== 'ANULADA')
      .flatMap((compra) =>
        compra.items.map((item) => ({
          id: item.id,
          compraId: compra.id,
          cliente: compra.clienteNombre,
          fecha: compra.fecha,
          pesoG: item.pesoDespuesFundirG,
          ley: item.ley,
          bsPorGramo: item.bsPorGramo,
          totalBs: item.totalBs,
          estadoSync: compra.estadoSync,
        })),
      )
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [compras]);

  const termino = busqueda.trim().toLowerCase();
  const visibles = termino
    ? filas.filter((f) => f.cliente.toLowerCase().includes(termino))
    : filas;

  /** Los totales acompañan al filtro: resumen del cliente buscado. */
  const resumen = useMemo(() => {
    let pesoTotal = new Decimal(0);
    let totalBs = new Decimal(0);
    const documentos = new Set<string>();

    for (const fila of visibles) {
      pesoTotal = pesoTotal.plus(fila.pesoG);
      totalBs = totalBs.plus(fila.totalBs);
      documentos.add(fila.compraId);
    }

    return {
      compras: documentos.size,
      pesoTotal: pesoTotal.toDecimalPlaces(3).toString(),
      totalBs: totalBs.toDecimalPlaces(2).toString(),
    };
  }, [visibles]);

  return (
    <section>
      <h2 className="titulo-pagina">Historial</h2>
      <p className="ayuda subtitulo">
        Qué trajo cada cliente, cuánto se le pagó y cuándo. Busca por nombre
        para ver el detalle de una persona.
      </p>

      <div className="ancho-cliente buscador">
        <label>
          <span className="etiqueta">Cliente</span>
          <input
            type="search"
            placeholder="Buscar por nombre…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </label>
      </div>

      <div className="tarjetas">
        <div className="tarjeta">
          <div className="tarjeta-etiqueta">Compras</div>
          <div className="tarjeta-valor">{resumen.compras}</div>
        </div>
        <div className="tarjeta">
          <div className="tarjeta-etiqueta">Peso total</div>
          <div className="tarjeta-valor">
            {peso(resumen.pesoTotal)} <b>g</b>
          </div>
        </div>
        <div className="tarjeta">
          <div className="tarjeta-etiqueta">Total pagado</div>
          <div className="tarjeta-valor">
            <b>Bs</b> {importe(resumen.totalBs)}
          </div>
        </div>
      </div>

      <div className="rejilla-scroll">
        <div className="rejilla-historial cabecera">
          <span className="th">Cliente</span>
          <span className="th">Peso (g)</span>
          <span className="th">Ley</span>
          <span className="th">Precio/gramo</span>
          <span className="th">Total Bs</span>
          <span className="th">Fecha</span>
          <span className="th">Estado</span>
        </div>

        {visibles.map((fila) => (
          <div className="rejilla-historial fila" key={fila.id}>
            <span>{fila.cliente}</span>
            <span className="tenue">{peso(fila.pesoG)}</span>
            <span className="tenue">{leyPorcentaje(fila.ley)}</span>
            <span className="tenue">{importe(fila.bsPorGramo)}</span>
            <span className="destacado">{importe(fila.totalBs)}</span>
            <span className="tenue">{fechaCorta(fila.fecha)}</span>
            <span className={estadoSync(fila.estadoSync).clase}>
              {estadoSync(fila.estadoSync).texto}
            </span>
          </div>
        ))}

        {visibles.length === 0 && (
          <div className="vacio">
            {termino
              ? `Ningún cliente coincide con "${busqueda.trim()}".`
              : 'Todavía no hay compras registradas.'}
          </div>
        )}
      </div>
    </section>
  );
}
