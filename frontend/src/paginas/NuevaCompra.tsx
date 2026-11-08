import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  calcularCompraItem,
  calcularTotalCompra,
  porcentajeALey,
} from '@tesoro/dominio';
import {
  cotizacionVigente,
  db,
  encolar,
  fechaHoy,
  loteDeCompra,
  numeroProvisional,
  type Compra,
  type CompraItem,
} from '../db/db';
import { importe } from '../formato';
import { IconoCruz, IconoLapiz, IconoMas } from '../componentes/Iconos';

/**
 * Fila del formulario, con los pesos y la ley tal como los teclea el operador.
 *
 * `leyPorcentaje` es lo que se escribe en pantalla: 87 = 87 %. El dominio y la
 * base de datos siguen trabajando con la fracción (0.87), así que la
 * conversión ocurre solo en este borde.
 */
interface FilaBorrador {
  id: string;
  pesoAntesFundirG: string;
  pesoDespuesFundirG: string;
  leyPorcentaje: string;
  observacion: string;
}

const filaVacia = (): FilaBorrador => ({
  id: crypto.randomUUID(),
  pesoAntesFundirG: '',
  pesoDespuesFundirG: '',
  leyPorcentaje: '',
  observacion: '',
});

/** Fracción de ley a partir del porcentaje tecleado; `null` si no es válido. */
function leyDesdePorcentaje(porcentaje: string) {
  let ley;
  try {
    ley = porcentajeALey(porcentaje);
  } catch {
    return null;
  }
  if (!ley.isFinite() || ley.lessThanOrEqualTo(0) || ley.greaterThan(1)) {
    return null;
  }
  return ley;
}

/**
 * Registro de compra en una sola pantalla.
 *
 * El operador no debería tener que salir de aquí para atender al cliente que
 * tiene enfrente: la cotización se ajusta en el chip del encabezado y un
 * cliente nuevo se da de alta en la ventana del selector. Ambas acciones
 * escriben en sus propias tablas y en la cola de salida, así que Cotización y
 * Clientes siguen siendo el historial completo para auditoría.
 */
export default function NuevaCompra() {
  const navegar = useNavigate();
  const cotizacion = useLiveQuery(() => cotizacionVigente(), []);
  const clientes = useLiveQuery(
    () => db.clientes.filter((c) => c.activo).sortBy('nombre'),
    [],
  );

  const [clienteId, setClienteId] = useState('');
  const [fecha, setFecha] = useState(fechaHoy);
  const [observacion, setObservacion] = useState('');
  const [filas, setFilas] = useState<FilaBorrador[]>([filaVacia()]);
  const [guardando, setGuardando] = useState(false);

  // --- cotización en línea -------------------------------------------------
  const [editandoCotizacion, setEditandoCotizacion] = useState(false);
  const [borradorOnza, setBorradorOnza] = useState('');
  const [borradorTipoCambio, setBorradorTipoCambio] = useState('');
  const [guardandoCotizacion, setGuardandoCotizacion] = useState(false);

  // --- alta rápida de cliente ---------------------------------------------
  const [creandoCliente, setCreandoCliente] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoCi, setNuevoCi] = useState('');
  const [nuevoTelefono, setNuevoTelefono] = useState('');
  const [guardandoCliente, setGuardandoCliente] = useState(false);

  /** Escape cierra la capa abierta; primero la de encima. */
  useEffect(() => {
    if (!editandoCotizacion && !creandoCliente) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (creandoCliente) setCreandoCliente(false);
      else setEditandoCotizacion(false);
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [editandoCotizacion, creandoCliente]);

  const actualizarFila = (id: string, campo: keyof FilaBorrador, valor: string) =>
    setFilas((prev) =>
      prev.map((f) => (f.id === id ? { ...f, [campo]: valor } : f)),
    );

  /**
   * Liquidación en vivo. Se recalcula con cada tecla usando exactamente las
   * mismas funciones que el backend — de ahí el paquete compartido.
   */
  const liquidacion = useMemo(() => {
    if (!cotizacion) return { items: [], totalBs: '0', errores: [] as string[] };

    const items: (CompraItem & { filaId: string })[] = [];
    const errores: string[] = [];

    for (const fila of filas) {
      if (!fila.pesoDespuesFundirG || !fila.leyPorcentaje) continue;

      const ley = leyDesdePorcentaje(fila.leyPorcentaje);
      if (!ley) {
        errores.push('La ley debe ser un porcentaje mayor a 0 y hasta 100.');
        continue;
      }

      try {
        const r = calcularCompraItem({
          onzaCierreUsd: cotizacion.onzaCierreUsd,
          tipoCambio: cotizacion.tipoCambio,
          pesoAntesFundirG: fila.pesoAntesFundirG || null,
          pesoDespuesFundirG: fila.pesoDespuesFundirG,
          ley,
        });
        items.push({
          filaId: fila.id,
          id: fila.id,
          pesoAntesFundirG: fila.pesoAntesFundirG || null,
          pesoDespuesFundirG: fila.pesoDespuesFundirG,
          mermaG: r.mermaG?.toString() ?? null,
          ley: ley.toString(),
          bsPorGramo: r.bsPorGramo.toString(),
          totalBs: r.totalBs.toString(),
          pesoFinoG: r.pesoFinoG.toString(),
          observacion: fila.observacion || undefined,
        });
      } catch (e) {
        errores.push((e as Error).message);
      }
    }

    return {
      items,
      totalBs: calcularTotalCompra(items).toString(),
      errores,
    };
  }, [filas, cotizacion]);

  const puedeGuardar =
    !!cotizacion &&
    !!clienteId &&
    liquidacion.items.length > 0 &&
    liquidacion.errores.length === 0 &&
    !guardando;

  function abrirCotizacion() {
    setBorradorOnza(cotizacion?.onzaCierreUsd ?? '');
    setBorradorTipoCambio(cotizacion?.tipoCambio ?? '');
    setEditandoCotizacion(true);
  }

  /**
   * Guarda una cotización nueva, igual que el módulo Cotización: los registros
   * son inmutables e históricos, así que ajustar el valor desde aquí no altera
   * ninguna compra ya liquidada.
   */
  async function guardarCotizacion() {
    if (!borradorOnza || !borradorTipoCambio || guardandoCotizacion) return;
    setGuardandoCotizacion(true);
    try {
      const nueva = {
        id: crypto.randomUUID(),
        fecha: new Date().toISOString(),
        onzaCierreUsd: borradorOnza.trim(),
        tipoCambio: borradorTipoCambio.trim(),
        actualizadoEn: new Date().toISOString(),
        estadoSync: 'pendiente' as const,
      };
      await db.cotizaciones.add(nueva);
      await encolar('cotizacion', nueva.id, 'crear', nueva);
      setEditandoCotizacion(false);
    } finally {
      setGuardandoCotizacion(false);
    }
  }

  function abrirNuevoCliente() {
    setNuevoNombre('');
    setNuevoCi('');
    setNuevoTelefono('');
    setCreandoCliente(true);
  }

  /** Da de alta al cliente y lo deja seleccionado en esta misma compra. */
  async function guardarCliente() {
    if (!nuevoNombre.trim() || !nuevoCi.trim() || guardandoCliente) return;
    setGuardandoCliente(true);
    try {
      const cliente = {
        id: crypto.randomUUID(),
        nombre: nuevoNombre.trim(),
        ci: nuevoCi.trim(),
        telefono: nuevoTelefono.trim() || undefined,
        activo: true,
        actualizadoEn: new Date().toISOString(),
        estadoSync: 'pendiente' as const,
      };
      await db.clientes.add(cliente);
      await encolar('cliente', cliente.id, 'crear', cliente);
      setClienteId(cliente.id);
      setCreandoCliente(false);
    } finally {
      setGuardandoCliente(false);
    }
  }

  /**
   * Registra la compra y el lote que origina, en una sola transacción.
   * Con `venderAhora` (caso del cliente que vende el mismo día) pasa directo
   * a la venta con ese lote ya elegido.
   */
  async function guardar(venderAhora = false) {
    if (!puedeGuardar || !cotizacion) return;
    setGuardando(true);
    try {
      const cliente = await db.clientes.get(clienteId);
      const compra: Compra = {
        id: crypto.randomUUID(),
        numero: null,
        numeroLocal: numeroProvisional(),
        fecha,
        clienteId,
        clienteNombre: cliente?.nombre ?? '',
        onzaCierreUsd: cotizacion.onzaCierreUsd,
        tipoCambio: cotizacion.tipoCambio,
        totalBs: liquidacion.totalBs,
        estado: 'CONFIRMADA',
        observacion: observacion || undefined,
        items: liquidacion.items.map(({ filaId: _filaId, ...item }) => item),
        actualizadoEn: new Date().toISOString(),
        estadoSync: 'pendiente',
      };
      const lote = loteDeCompra(compra);

      await db.transaction('rw', db.compras, db.lotes, db.outbox, async () => {
        await db.compras.add(compra);
        await db.lotes.add(lote);
        await encolar('compra', compra.id, 'crear', { ...compra, lote });
      });
      navegar(venderAhora ? `/ventas/nueva?lotes=${lote.id}` : '/compras');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section>
      <header className="encabezado-pagina">
        <h2>Nueva compra</h2>

        <button
          type="button"
          className={`chip-cotizacion ${cotizacion ? '' : 'sin-definir'}`}
          onClick={abrirCotizacion}
        >
          <span>
            {cotizacion ? (
              <>
                Onza cierre <b>{importe(cotizacion.onzaCierreUsd)} USD</b> · T/C{' '}
                <b>{importe(cotizacion.tipoCambio)}</b>
              </>
            ) : (
              'Definir cotización'
            )}
          </span>
          <IconoLapiz />
        </button>

        {editandoCotizacion && (
          <>
            <div
              className="fondo-popover"
              onClick={() => setEditandoCotizacion(false)}
            />
            <div className="tarjeta-popover" role="dialog" aria-label="Cotización">
              <div className="campo-bloque">
                <span className="etiqueta">Onza cierre (USD)</span>
                <input
                  inputMode="decimal"
                  autoFocus
                  value={borradorOnza}
                  onChange={(e) => setBorradorOnza(e.target.value)}
                  placeholder="4867"
                />
              </div>
              <div className="campo-bloque">
                <span className="etiqueta">Tipo de cambio (Bs por USD)</span>
                <input
                  inputMode="decimal"
                  value={borradorTipoCambio}
                  onChange={(e) => setBorradorTipoCambio(e.target.value)}
                  placeholder="11.5"
                />
              </div>
              <p className="nota">
                Al guardar se crea una nueva cotización oficial, visible en el
                módulo Cotización para auditoría. Las compras ya registradas
                conservan la suya.
              </p>
              <div className="acciones">
                <button
                  type="button"
                  className="fantasma"
                  onClick={() => setEditandoCotizacion(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="primario"
                  disabled={
                    !borradorOnza || !borradorTipoCambio || guardandoCotizacion
                  }
                  onClick={guardarCotizacion}
                >
                  {guardandoCotizacion ? 'Guardando…' : 'Guardar cotización'}
                </button>
              </div>
            </div>
          </>
        )}
      </header>

      <div className="campos">
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

        <div className="ancho-cliente">
          <span className="etiqueta">Cliente</span>
          <div className="fila-cliente">
            <select
              aria-label="Cliente"
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
            >
              <option value="">— seleccionar —</option>
              {clientes?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="icono"
              title="Nuevo cliente"
              aria-label="Nuevo cliente"
              onClick={abrirNuevoCliente}
            >
              <IconoMas />
            </button>
          </div>
        </div>
      </div>

      <div className="piezas">
        <div className="rejilla-piezas cabecera">
          <span className="th">Peso A/F</span>
          <span className="th">Peso D/F</span>
          <span className="th">Merma</span>
          <span className="th">Ley %</span>
          <span className="th">Bs por gramo</span>
          <span className="th">Total Bs</span>
          <span className="th">Observación</span>
          <span />
        </div>

        {filas.map((fila) => {
          const calc = liquidacion.items.find((i) => i.filaId === fila.id);
          return (
            <div className="rejilla-piezas pieza" key={fila.id}>
              <input
                inputMode="decimal"
                aria-label="Peso antes de fundir"
                placeholder="opcional"
                value={fila.pesoAntesFundirG}
                onChange={(e) =>
                  actualizarFila(fila.id, 'pesoAntesFundirG', e.target.value)
                }
              />
              <input
                inputMode="decimal"
                aria-label="Peso después de fundir"
                value={fila.pesoDespuesFundirG}
                onChange={(e) =>
                  actualizarFila(fila.id, 'pesoDespuesFundirG', e.target.value)
                }
              />
              <span className="calculado">{calc?.mermaG ?? '—'}</span>
              <div className="campo-porcentaje">
                <input
                  inputMode="decimal"
                  aria-label="Ley en porcentaje"
                  placeholder=""
                  value={fila.leyPorcentaje}
                  onChange={(e) =>
                    actualizarFila(fila.id, 'leyPorcentaje', e.target.value)
                  }
                />
                <span aria-hidden="true">%</span>
              </div>
              <span className="calculado">{calc ? importe(calc.bsPorGramo) : '—'}</span>
              <span className="calculado importe">{calc ? importe(calc.totalBs) : '—'}</span>
              <input
                aria-label="Observación de la pieza"
                value={fila.observacion}
                onChange={(e) =>
                  actualizarFila(fila.id, 'observacion', e.target.value)
                }
              />
              <button
                type="button"
                className="quitar"
                aria-label="Quitar pieza"
                disabled={filas.length === 1}
                onClick={() =>
                  setFilas((prev) => prev.filter((f) => f.id !== fila.id))
                }
              >
                <IconoCruz tamano={14} />
              </button>
            </div>
          );
        })}

        <button
          type="button"
          className="fantasma"
          style={{ marginTop: 14 }}
          onClick={() => setFilas((prev) => [...prev, filaVacia()])}
        >
          + Agregar pieza
        </button>
      </div>

      {liquidacion.errores.length > 0 && (
        <ul className="errores">
          {liquidacion.errores.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}

      <label className="observacion-general">
        <span className="etiqueta">Observación</span>
        <textarea
          value={observacion}
          onChange={(e) => setObservacion(e.target.value)}
        />
      </label>

      <footer className="pie-compra">
        <div className="total">
          <span>Total a pagar</span>
          <strong>Bs {importe(liquidacion.totalBs)}</strong>
        </div>
        <div className="acciones">
          <button
            type="button"
            className="fantasma"
            onClick={() => navegar('/compras')}
          >
            Cancelar
          </button>
          <button
            type="button"
            title="Registra la compra y abre la venta con este lote"
            disabled={!puedeGuardar}
            onClick={() => guardar(true)}
          >
            Registrar y vender
          </button>
          <button
            type="button"
            className="primario"
            disabled={!puedeGuardar}
            onClick={() => guardar()}
          >
            {guardando ? 'Guardando…' : 'Registrar compra'}
          </button>
        </div>
      </footer>

      {creandoCliente && (
        <>
          <div
            className="fondo-modal"
            onClick={() => setCreandoCliente(false)}
          />
          <div className="tarjeta-modal" role="dialog" aria-label="Nuevo cliente">
            <div className="cabecera-modal">
              <h3>Nuevo cliente</h3>
              <button
                type="button"
                className="cerrar"
                aria-label="Cerrar"
                onClick={() => setCreandoCliente(false)}
              >
                <IconoCruz />
              </button>
            </div>

            <div className="campo-bloque">
              <span className="etiqueta">Nombre completo</span>
              <input
                autoFocus
                placeholder="Ej. Ana Torrico Guzmán"
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value)}
              />
            </div>

            <div className="fila-campos campo-bloque">
              <div>
                <span className="etiqueta">CI / NIT</span>
                <input
                  placeholder="0000000 LP"
                  value={nuevoCi}
                  onChange={(e) => setNuevoCi(e.target.value)}
                />
              </div>
              <div>
                <span className="etiqueta">Teléfono</span>
                <input
                  inputMode="tel"
                  placeholder="7XXXXXXX"
                  value={nuevoTelefono}
                  onChange={(e) => setNuevoTelefono(e.target.value)}
                />
              </div>
            </div>

            <p className="nota">
              Quedará disponible de inmediato en esta compra y en el módulo
              Clientes.
            </p>

            <div className="acciones">
              <button
                type="button"
                className="fantasma"
                onClick={() => setCreandoCliente(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="primario"
                disabled={
                  !nuevoNombre.trim() || !nuevoCi.trim() || guardandoCliente
                }
                onClick={guardarCliente}
              >
                {guardandoCliente ? 'Guardando…' : 'Guardar y usar cliente'}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
