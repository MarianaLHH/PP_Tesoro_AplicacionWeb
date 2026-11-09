import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type Decimal from 'decimal.js';
import { calcularVentaDeLotes } from '@tesoro/dominio';
import {
  db,
  encolar,
  fechaHoy,
  numeroProvisional,
  type Lote,
  type Venta,
} from '../db/db';
import { claseError, leerLey, leerNumero, type Lectura } from '../entrada';
import { importe, leyPorcentaje, numero, peso as formatearPeso } from '../formato';
import { IconoCruz } from '../componentes/Iconos';

/** Peso y ley de una fila tal como se entendieron. */
interface LecturaFila {
  peso: Lectura;
  ley: Lectura;
}

/** Lote elegido para la venta, con lo que mide el comprador. */
interface FilaVenta {
  loteId: string;
  /** Precargado con el peso del lote; el comprador puede pesar distinto. */
  pesoG: string;
  /** Ley medida por el comprador, en %. */
  leyPorcentaje: string;
}

const filaDe = (lote: Lote): FilaVenta => ({
  loteId: lote.id,
  pesoG: lote.pesoBrutoG,
  leyPorcentaje: '',
});

/**
 * Venta de lotes completos al comprador final.
 *
 * El comprador fija la onza y el tipo de cambio, y mide la ley de cada pieza:
 * todo eso se teclea aquí y queda congelado en la venta. Paga en bolivianos;
 * los dólares son referencia. La ganancia se calcula contra lo que se pagó por
 * cada lote, arrastrado desde la compra.
 */
export default function NuevaVenta() {
  const navegar = useNavigate();
  const [parametros] = useSearchParams();

  const disponibles = useLiveQuery(
    () => db.lotes.where('estado').equals('DISPONIBLE').sortBy('fecha'),
    [],
  );
  const lotesPorId = useMemo(
    () => new Map((disponibles ?? []).map((l) => [l.id, l])),
    [disponibles],
  );

  const [fecha, setFecha] = useState(fechaHoy);
  const [destino, setDestino] = useState('');
  const [onza, setOnza] = useState('');
  const [tipoCambio, setTipoCambio] = useState('');
  const [observacion, setObservacion] = useState('');
  const [filas, setFilas] = useState<FilaVenta[]>([]);
  const [codigo, setCodigo] = useState('');
  const [avisoCodigo, setAvisoCodigo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState('');

  /** Lotes que llegan marcados desde Inventario o desde "Registrar y vender". */
  const precargado = useRef(false);
  useEffect(() => {
    if (precargado.current || !disponibles) return;
    precargado.current = true;
    const ids = (parametros.get('lotes') ?? '').split(',').filter(Boolean);
    setFilas(
      ids
        .map((id) => lotesPorId.get(id))
        .filter((l): l is Lote => !!l)
        .map(filaDe),
    );
  }, [disponibles, lotesPorId, parametros]);

  const elegidos = new Set(filas.map((f) => f.loteId));
  const restantes = (disponibles ?? []).filter((l) => !elegidos.has(l.id));

  /** Agrega por código: funciona tecleando o con la pistola lectora. */
  function agregarPorCodigo() {
    const buscado = codigo.trim().toUpperCase();
    if (!buscado) return;
    const lote = disponibles?.find((l) => l.codigo === buscado);
    if (!lote) {
      setAvisoCodigo(`No hay un lote en stock con el código ${buscado}.`);
    } else if (elegidos.has(lote.id)) {
      setAvisoCodigo(`El lote ${buscado} ya está en esta venta.`);
    } else {
      setFilas((prev) => [...prev, filaDe(lote)]);
      setAvisoCodigo('');
    }
    setCodigo('');
  }

  const actualizarFila = (loteId: string, campo: 'pesoG' | 'leyPorcentaje', valor: string) =>
    setFilas((prev) =>
      prev.map((f) => (f.loteId === loteId ? { ...f, [campo]: valor } : f)),
    );

  const onzaLeida = leerNumero(onza, 'onza');
  const tcLeido = leerNumero(tipoCambio, 'tipoCambio');

  const liquidacion = useMemo(() => {
    const errores = [onzaLeida.error, tcLeido.error].filter((e): e is string => !!e);
    const lecturas = new Map<string, LecturaFila>();
    const pesos: string[] = [];
    const leyes: string[] = [];
    const entradas = [];
    let completa = filas.length > 0 && !!onzaLeida.valor && !!tcLeido.valor;

    for (const fila of filas) {
      const lote = lotesPorId.get(fila.loteId);
      if (!lote) {
        errores.push('Uno de los lotes ya no está en stock.');
        completa = false;
        continue;
      }
      const lectura: LecturaFila = {
        peso: leerNumero(fila.pesoG, 'peso'),
        ley: leerLey(fila.leyPorcentaje),
      };
      lecturas.set(fila.loteId, lectura);
      for (const l of [lectura.peso, lectura.ley]) {
        if (l.error) errores.push(`Lote ${lote.codigo}: ${l.error}`);
      }
      if (!lectura.peso.valor || !lectura.ley.valor) {
        completa = false;
        continue;
      }
      pesos.push(lectura.peso.valor);
      leyes.push(lectura.ley.valor);
      entradas.push({
        pesoG: lectura.peso.valor,
        ley: lectura.ley.valor,
        pesoFinoEstimadoG: lote.pesoFinoG,
        costoBs: lote.costoBs,
      });
    }

    if (!completa || errores.length > 0) {
      return { resultado: null, pesos, leyes, errores, lecturas };
    }
    try {
      return {
        resultado: calcularVentaDeLotes({
          onzaCierreUsd: onzaLeida.valor!,
          tipoCambio: tcLeido.valor!,
          lotes: entradas,
        }),
        pesos,
        leyes,
        errores,
        lecturas,
      };
    } catch (e) {
      return { resultado: null, pesos, leyes, errores: [(e as Error).message], lecturas };
    }
  }, [filas, lotesPorId, onzaLeida.valor, onzaLeida.error, tcLeido.valor, tcLeido.error]);

  const lecturaDe = (loteId: string): LecturaFila =>
    liquidacion.lecturas.get(loteId) ?? {
      peso: { valor: null, error: null },
      ley: { valor: null, error: null },
    };

  const resultado = liquidacion.resultado;
  const puedeGuardar = !!destino.trim() && !!resultado && !guardando;

  async function guardar() {
    if (!puedeGuardar || !resultado) return;
    setGuardando(true);
    setErrorGuardado('');
    try {
      const ahora = new Date().toISOString();
      const venta: Venta = {
        id: crypto.randomUUID(),
        numero: null,
        numeroLocal: numeroProvisional('VTA'),
        fecha,
        destino: destino.trim(),
        onzaCierreUsd: onzaLeida.valor!,
        tipoCambio: tcLeido.valor!,
        items: filas.map((fila, i) => {
          const lote = lotesPorId.get(fila.loteId)!;
          const r = resultado.items[i];
          return {
            loteId: lote.id,
            loteCodigo: lote.codigo,
            pesoG: liquidacion.pesos[i],
            ley: liquidacion.leyes[i],
            pesoFinoG: r.pesoFinoG.toString(),
            pesoFinoEstimadoG: lote.pesoFinoG,
            bsPorGramo: r.bsPorGramo.toString(),
            precioGramoUsd: r.precioGramoUsd.toString(),
            totalUsd: r.totalUsd.toString(),
            totalBs: r.totalBs.toString(),
            costoBs: r.costoBs.toString(),
          };
        }),
        totalUsd: resultado.totalUsd.toString(),
        totalBs: resultado.totalBs.toString(),
        costoBs: resultado.costoBs.toString(),
        gananciaBs: resultado.gananciaBs.toString(),
        estado: 'CONFIRMADA',
        observacion: observacion || undefined,
        actualizadoEn: ahora,
        estadoSync: 'pendiente',
      };
      const loteIds = filas.map((f) => f.loteId);

      await db.transaction('rw', db.ventas, db.lotes, db.outbox, async () => {
        const actuales = await db.lotes.bulkGet(loteIds);
        if (actuales.some((l) => l?.estado !== 'DISPONIBLE')) {
          throw new Error('Uno de los lotes ya no está en stock.');
        }
        await db.ventas.add(venta);
        await db.lotes
          .where('id')
          .anyOf(loteIds)
          .modify({ estado: 'VENDIDO', destinoId: venta.id, actualizadoEn: ahora });
        await encolar('venta', venta.id, 'crear', venta);
      });
      navegar('/ventas');
    } catch (e) {
      setErrorGuardado((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  const claseGanancia = (valor: Decimal) =>
    valor.isNegative() ? 'negativo' : 'positivo';

  return (
    <section>
      <h2 className="titulo-pagina">Nueva venta</h2>
      <p className="ayuda subtitulo">
        Los lotes se venden completos. La onza, el tipo de cambio y la ley de
        cada pieza los define el comprador: se registran aquí y quedan
        guardados con esta venta.
      </p>

      <div className="campos alineado-arriba">
        <div className="ancho-fecha">
          <label>
            <span className="etiqueta">Fecha</span>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </label>
        </div>
        <div style={{ width: 320 }}>
          <label>
            <span className="etiqueta">Destino / comprador</span>
            <input
              placeholder="Ej. Refinería La Paz"
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
            />
          </label>
        </div>
        <div style={{ width: 150 }}>
          <label>
            <span className="etiqueta">Onza (USD)</span>
            <input
              inputMode="decimal"
              placeholder="4867"
              className={claseError(onzaLeida)}
              aria-invalid={!!onzaLeida.error}
              value={onza}
              onChange={(e) => setOnza(e.target.value)}
            />
          </label>
        </div>
        <div style={{ width: 150 }}>
          <label>
            <span className="etiqueta">T/C (Bs por USD)</span>
            <input
              inputMode="decimal"
              placeholder="11,95"
              className={claseError(tcLeido)}
              aria-invalid={!!tcLeido.error}
              value={tipoCambio}
              onChange={(e) => setTipoCambio(e.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="piezas">
        <div className="rejilla-scroll">
          <div className="rejilla-venta-lotes cabecera">
            <span className="th">Lote</span>
            <span className="th">Origen</span>
            <span className="th">Peso (g)</span>
            <span className="th">Ley est.</span>
            <span className="th">Ley comprador</span>
            <span className="th">Fino (g)</span>
            <span className="th">Bs por gramo</span>
            <span className="th">Total Bs</span>
            <span className="th">Costo Bs</span>
            <span className="th">Ganancia Bs</span>
            <span />
          </div>

          {filas.map((fila, i) => {
            const lote = lotesPorId.get(fila.loteId);
            if (!lote) return null;
            const r = resultado?.items[i];
            const lectura = lecturaDe(fila.loteId);
            return (
              <div className="rejilla-venta-lotes pieza" key={fila.loteId}>
                <span className="codigo">{lote.codigo}</span>
                <span className="recortado" title={lote.clientes.join(' + ')}>
                  {lote.clientes.join(' + ')}
                </span>
                <input
                  inputMode="decimal"
                  aria-label={`Peso del lote ${lote.codigo}`}
                  className={claseError(lectura.peso)}
                  aria-invalid={!!lectura.peso.error}
                  value={fila.pesoG}
                  onChange={(e) => actualizarFila(fila.loteId, 'pesoG', e.target.value)}
                />
                <span className="calculado">{leyPorcentaje(lote.leyEstimada)}</span>
                <div className="campo-porcentaje">
                  <input
                    inputMode="decimal"
                    aria-label={`Ley medida por el comprador, lote ${lote.codigo}`}
                    className={claseError(lectura.ley)}
                    aria-invalid={!!lectura.ley.error}
                    value={fila.leyPorcentaje}
                    onChange={(e) =>
                      actualizarFila(fila.loteId, 'leyPorcentaje', e.target.value)
                    }
                  />
                  <span aria-hidden="true">%</span>
                </div>
                <span className="calculado">
                  {r ? formatearPeso(r.pesoFinoG.toString()) : '—'}
                </span>
                <span className="calculado">
                  {r ? importe(r.bsPorGramo.toString()) : '—'}
                </span>
                <span className="calculado importe">
                  {r ? importe(r.totalBs.toString()) : '—'}
                </span>
                <span className="calculado">{importe(lote.costoBs)}</span>
                <span className={`calculado ${r ? claseGanancia(r.gananciaBs) : ''}`}>
                  {r ? importe(r.gananciaBs.toString()) : '—'}
                </span>
                <button
                  type="button"
                  className="quitar"
                  aria-label={`Quitar lote ${lote.codigo}`}
                  onClick={() =>
                    setFilas((prev) => prev.filter((f) => f.loteId !== fila.loteId))
                  }
                >
                  <IconoCruz tamano={14} />
                </button>
              </div>
            );
          })}

          {filas.length === 0 && (
            <div className="vacio">
              Agregue los lotes a vender por su código, o márquelos en Inventario.
            </div>
          )}
        </div>

        <div className="agregar-lote">
          <input
            list="lotes-en-caja"
            placeholder="Código de lote (escanear o escribir)"
            aria-label="Código de lote"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                agregarPorCodigo();
              }
            }}
          />
          <datalist id="lotes-en-caja">
            {restantes.map((l) => (
              <option key={l.id} value={l.codigo}>
                {l.clientes.join(' + ')} · {formatearPeso(l.pesoBrutoG)} g
              </option>
            ))}
          </datalist>
          <button type="button" disabled={!codigo.trim()} onClick={agregarPorCodigo}>
            Agregar
          </button>
        </div>
        {avisoCodigo && <p className="advertencia">{avisoCodigo}</p>}
      </div>

      {(liquidacion.errores.length > 0 || errorGuardado) && (
        <ul className="errores">
          {liquidacion.errores.map((e) => (
            <li key={e}>{e}</li>
          ))}
          {errorGuardado && <li>{errorGuardado}</li>}
        </ul>
      )}

      <div className="tarjetas" style={{ marginTop: 32 }}>
        <div className="tarjeta">
          <div className="tarjeta-etiqueta">Equivalente en dólares</div>
          <div className="tarjeta-valor">
            <b>$us</b> {resultado ? importe(resultado.totalUsd.toString()) : '—'}
          </div>
        </div>
        <div className="tarjeta">
          <div className="tarjeta-etiqueta">Costo</div>
          <div className="tarjeta-valor">
            <b>Bs</b> {resultado ? importe(resultado.costoBs.toString()) : '—'}
          </div>
        </div>
        <div className="tarjeta">
          <div className="tarjeta-etiqueta">Ganancia</div>
          <div className={`tarjeta-valor ${resultado ? claseGanancia(resultado.gananciaBs) : ''}`}>
            {resultado ? (
              <>
                Bs {importe(resultado.gananciaBs.toString())}
                {resultado.gananciaPorcentaje && (
                  <small> ({numero(resultado.gananciaPorcentaje, 2)} %)</small>
                )}
              </>
            ) : (
              '—'
            )}
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

      <footer className="pie-compra">
        <div className="total">
          <span>Total a cobrar</span>
          <strong>Bs {resultado ? importe(resultado.totalBs.toString()) : '0,00'}</strong>
        </div>
        <div className="acciones">
          <button
            type="button"
            className="fantasma"
            onClick={() => navegar('/ventas')}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="primario"
            disabled={!puedeGuardar}
            onClick={guardar}
          >
            {guardando ? 'Guardando…' : 'Registrar venta'}
          </button>
        </div>
      </footer>
    </section>
  );
}
