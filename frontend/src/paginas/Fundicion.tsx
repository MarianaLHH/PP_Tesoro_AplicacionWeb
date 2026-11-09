import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { calcularFundicion } from '@tesoro/dominio';
import {
  codigoLote,
  db,
  encolar,
  fechaHoy,
  type Fundicion as RegistroFundicion,
  type Lote,
} from '../db/db';
import Decimal from 'decimal.js';
import { leerNumero } from '../entrada';
import { fechaCorta, importe, leyPorcentaje, numero, peso } from '../formato';

/** Lo que entra al horno: referencia para pesar la pieza resultante. */
const sumaBruta = (lotes: Lote[]) =>
  lotes.reduce((suma, l) => suma.plus(l.pesoBrutoG), new Decimal(0));

/**
 * Fundición conjunta: varios lotes, posiblemente de días y clientes distintos,
 * se funden en una sola pieza que después se vende completa.
 *
 * Solo se pesa la pieza resultante. Su ley no se mide aquí: la mide el
 * comprador al vender. Hasta entonces se estima conservando el oro fino.
 */
export default function Fundicion() {
  const navegar = useNavigate();
  const [parametros] = useSearchParams();
  const ids = useMemo(
    () => (parametros.get('lotes') ?? '').split(',').filter(Boolean),
    [parametros],
  );

  const lotes = useLiveQuery(
    async () => (await db.lotes.bulkGet(ids)).filter((l): l is Lote => !!l),
    [ids],
  );

  const [fecha, setFecha] = useState(fechaHoy);
  const [pesoResultante, setPesoResultante] = useState('');
  const [observacion, setObservacion] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState('');

  const noDisponibles = lotes?.filter((l) => l.estado !== 'DISPONIBLE') ?? [];

  const calculo = useMemo(() => {
    const leido = leerNumero(pesoResultante, 'peso');
    if (leido.error) return { resultado: null, error: leido.error };
    if (!lotes || !leido.valor) return { resultado: null, error: '' };
    try {
      return {
        resultado: calcularFundicion({ lotes, pesoResultanteG: leido.valor }),
        error: '',
      };
    } catch (e) {
      return { resultado: null, error: (e as Error).message };
    }
  }, [lotes, pesoResultante]);

  const resultado = calculo.resultado;
  const puedeGuardar =
    !!resultado && !!lotes && noDisponibles.length === 0 && !guardando;

  async function guardar() {
    if (!puedeGuardar || !resultado || !lotes) return;
    setGuardando(true);
    setErrorGuardado('');
    try {
      const ahora = new Date().toISOString();
      const fundicionId = crypto.randomUUID();
      const loteId = crypto.randomUUID();

      const loteResultante: Lote = {
        id: loteId,
        codigo: codigoLote(loteId),
        origen: 'FUNDICION',
        origenId: fundicionId,
        fecha,
        clientes: [...new Set(lotes.flatMap((l) => l.clientes))],
        pesoBrutoG: resultado.pesoBrutoG.toString(),
        pesoFinoG: resultado.pesoFinoG.toString(),
        leyEstimada: resultado.leyEstimada.toString(),
        costoBs: resultado.costoBs.toString(),
        estado: 'DISPONIBLE',
        actualizadoEn: ahora,
        estadoSync: 'pendiente',
      };

      const fundicion: RegistroFundicion = {
        id: fundicionId,
        fecha,
        loteIds: lotes.map((l) => l.id),
        loteResultanteId: loteId,
        pesoBrutoOrigenG: resultado.pesoBrutoOrigenG.toString(),
        pesoResultanteG: resultado.pesoBrutoG.toString(),
        mermaG: resultado.mermaG.toString(),
        pesoFinoG: resultado.pesoFinoG.toString(),
        leyEstimada: resultado.leyEstimada.toString(),
        costoBs: resultado.costoBs.toString(),
        observacion: observacion || undefined,
        actualizadoEn: ahora,
        estadoSync: 'pendiente',
      };

      await db.transaction('rw', db.lotes, db.fundiciones, db.outbox, async () => {
        // Otra pestaña pudo haber usado estos lotes mientras se llenaba el formulario.
        const actuales = await db.lotes.bulkGet(fundicion.loteIds);
        if (actuales.some((l) => l?.estado !== 'DISPONIBLE')) {
          throw new Error('Uno de los lotes ya no está en stock.');
        }
        await db.fundiciones.add(fundicion);
        await db.lotes.add(loteResultante);
        await db.lotes
          .where('id')
          .anyOf(fundicion.loteIds)
          .modify({ estado: 'FUNDIDO', destinoId: fundicionId, actualizadoEn: ahora });
        await encolar('fundicion', fundicionId, 'crear', {
          ...fundicion,
          loteResultante,
        });
      });
      navegar('/inventario');
    } catch (e) {
      setErrorGuardado((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section>
      <h2 className="titulo-pagina">Fundir lotes juntos</h2>
      <p className="ayuda subtitulo">
        Los lotes marcados se funden en una sola pieza con un código nuevo. Pese
        la pieza al sacarla del horno; la ley la medirá el comprador al vender.
      </p>

      {noDisponibles.length > 0 && (
        <ul className="errores">
          {noDisponibles.map((l) => (
            <li key={l.id}>El lote {l.codigo} ya no está en stock.</li>
          ))}
        </ul>
      )}

      <div className="rejilla-scroll">
        <div className="rejilla-fundicion cabecera">
          <span className="th">Lote</span>
          <span className="th">Fecha</span>
          <span className="th">Origen</span>
          <span className="th">Peso (g)</span>
          <span className="th">Ley est.</span>
          <span className="th">Fino est. (g)</span>
          <span className="th">Costo Bs</span>
        </div>
        {lotes?.map((lote) => (
          <div className="rejilla-fundicion fila" key={lote.id}>
            <span className="codigo">{lote.codigo}</span>
            <span className="tenue">{fechaCorta(lote.fecha)}</span>
            <span>{lote.clientes.join(' + ')}</span>
            <span className="tenue">{peso(lote.pesoBrutoG)}</span>
            <span className="tenue">{leyPorcentaje(lote.leyEstimada)}</span>
            <span className="tenue">{peso(lote.pesoFinoG)}</span>
            <span className="destacado">{importe(lote.costoBs)}</span>
          </div>
        ))}
      </div>

      <div className="campos alineado-arriba" style={{ marginTop: 32 }}>
        <div className="ancho-fecha">
          <label>
            <span className="etiqueta">Fecha de fundición</span>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </label>
        </div>
        <div className="ancho-fecha">
          <label>
            <span className="etiqueta">Peso de la pieza resultante (g)</span>
            <input
              inputMode="decimal"
              autoFocus
              className={calculo.error ? 'con-error' : ''}
              aria-invalid={!!calculo.error}
              placeholder={lotes ? peso(sumaBruta(lotes)) : '0,00'}
              value={pesoResultante}
              onChange={(e) => setPesoResultante(e.target.value)}
            />
          </label>
          {calculo.error && <p className="advertencia">{calculo.error}</p>}
        </div>
      </div>

      <div className="tarjetas">
        <div className="tarjeta">
          <div className="tarjeta-etiqueta">Entró al horno</div>
          <div className="tarjeta-valor">
            {resultado ? peso(resultado.pesoBrutoOrigenG.toString()) : '—'} <b>g</b>
          </div>
        </div>
        <div className="tarjeta">
          <div className="tarjeta-etiqueta">Merma</div>
          <div className="tarjeta-valor">
            {/* Porcentaje sobre lo que entró al horno; los gramos quedan guardados en mermaG. */}
            {resultado && !resultado.pesoBrutoOrigenG.isZero()
              ? numero(resultado.mermaG.div(resultado.pesoBrutoOrigenG).times(100), 2)
              : '—'}{' '}
            <b>%</b>
            {resultado && (
              <small className="tenue" style={{ display: 'block', fontSize: '0.75rem' }}>
                {peso(resultado.mermaG)} g
              </small>
            )}
          </div>
        </div>
        <div className="tarjeta">
          <div className="tarjeta-etiqueta">Ley estimada</div>
          <div className="tarjeta-valor">
            {resultado ? leyPorcentaje(resultado.leyEstimada.toString()) : '—'}
          </div>
        </div>
        <div className="tarjeta">
          <div className="tarjeta-etiqueta">Costo acumulado</div>
          <div className="tarjeta-valor">
            <b>Bs</b> {resultado ? importe(resultado.costoBs.toString()) : '—'}
          </div>
        </div>
      </div>

      <label className="observacion-general">
        <span className="etiqueta">Observación</span>
        <textarea
          value={observacion}
          onChange={(e) => setObservacion(e.target.value)}
        />
      </label>

      {errorGuardado && (
        <ul className="errores">
          <li>{errorGuardado}</li>
        </ul>
      )}

      <footer className="pie-compra">
        <div className="total">
          <span>Fino estimado de la pieza</span>
          <strong>{resultado ? peso(resultado.pesoFinoG.toString()) : '0,00'} g</strong>
        </div>
        <div className="acciones">
          <button
            type="button"
            className="fantasma"
            onClick={() => navegar('/inventario')}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="primario"
            disabled={!puedeGuardar}
            onClick={guardar}
          >
            {guardando ? 'Guardando…' : 'Registrar fundición'}
          </button>
        </div>
      </footer>
    </section>
  );
}
