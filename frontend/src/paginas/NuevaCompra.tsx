import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { calcularCompraItem, calcularTotalCompra } from '@tesoro/dominio';
import {
  cotizacionVigente,
  db,
  encolar,
  fechaHoy,
  loteDeCompra,
  numeroProvisional,
  registrarCotizacion,
  type Compra,
  type CompraItem,
} from '../db/db';
import {
  avisoDeVariacion,
  claseError,
  leerLey,
  leerNumero,
  type Lectura,
} from '../entrada';
import Decimal from 'decimal.js';
import { importe, numero } from '../formato';
import { IconoCruz, IconoMas } from '../componentes/Iconos';

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

/** Lo que se entendió de cada campo numérico de una fila. */
interface LecturaFila {
  antes: Lectura;
  despues: Lectura;
  ley: Lectura;
}

const SIN_LECTURA: Lectura = { valor: null, error: null };

/** Pasado este tiempo, la cotización vigente se marca para revisar. */
const ANTIGUEDAD_REVISAR_MS = 2 * 60 * 60 * 1000;

/** Valor guardado ("11.5") tal como se escribe en el campo ("11,5"). */
const paraCampo = (valor: string) => valor.replace('.', ',');

/**
 * Diferencia relativa de `nuevo` respecto de `anterior` (0.009 = +0,9 %).
 * null si no hay con qué comparar o si el valor no cambió.
 */
function variacion(nuevo: string | null, anterior: string | undefined): Decimal | null {
  if (!nuevo || !anterior) return null;
  try {
    const previo = new Decimal(anterior);
    if (previo.isZero() || previo.equals(nuevo)) return null;
    return new Decimal(nuevo).minus(previo).dividedBy(previo);
  } catch {
    return null;
  }
}

/** "+0,9 %" / "−2,1 %". */
function textoVariacion(cambio: Decimal): string {
  const signo = cambio.isNegative() ? '−' : '+';
  return `${signo}${numero(cambio.abs().times(100), 1)} %`;
}

/** "hace un momento", "hace 25 min", "hace 3 h", "hace 2 días". */
function haceCuanto(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
}

/**
 * Onza o T/C de la compra. Viene con la cotización vigente; si el operador
 * lo cambia, se marca "Modificado" y muestra el valor anterior.
 */
function CampoCotizacion({
  etiqueta,
  placeholder,
  valor,
  lectura,
  cambio,
  anterior,
  antigua,
  onCambiar,
}: {
  etiqueta: string;
  placeholder: string;
  valor: string;
  lectura: Lectura;
  cambio: Decimal | null;
  anterior: string | undefined;
  antigua: boolean;
  onCambiar: (valor: string) => void;
}) {
  const modificado = cambio !== null;
  const clases = [
    claseError(lectura),
    modificado ? 'modificado' : antigua ? 'antiguo' : '',
  ].join(' ');

  return (
    <label className="campo-cotizacion">
      <span className="etiqueta">
        {etiqueta}
        {modificado && <span className="insignia">Modificado</span>}
      </span>
      <input
        inputMode="decimal"
        placeholder={placeholder}
        className={clases}
        aria-invalid={!!lectura.error}
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
      />
      {modificado && anterior && (
        <span className="antes">
          Antes {importe(anterior)} ({textoVariacion(cambio)})
        </span>
      )}
    </label>
  );
}

/** Hora actual, refrescada cada 30 s para que "hace X min" avance solo. */
function useAhora(): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const intervalo = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(intervalo);
  }, []);
  return ahora;
}

/**
 * Registro de compra en una sola pantalla.
 *
 * El operador no debería tener que salir de aquí para atender al cliente que
 * tiene enfrente: la onza y el T/C vienen de la cotización vigente y se
 * corrigen en el mismo formulario, y un cliente nuevo se da de alta en la
 * ventana del selector. Ambas acciones escriben en sus propias tablas y en la
 * cola de salida, así que Cotización y Clientes siguen siendo el historial
 * completo para auditoría.
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

  // --- cotización en el formulario ----------------------------------------
  // Los campos arrancan con la cotización vigente. Mientras el operador no
  // los toque, siguen a la vigente (p. ej. si llega una nueva por sincronización).
  const [onza, setOnza] = useState('');
  const [tipoCambio, setTipoCambio] = useState('');
  const [cotizacionEditada, setCotizacionEditada] = useState(false);
  const ahora = useAhora();

  useEffect(() => {
    if (cotizacionEditada || !cotizacion) return;
    setOnza(paraCampo(cotizacion.onzaCierreUsd));
    setTipoCambio(paraCampo(cotizacion.tipoCambio));
  }, [cotizacion, cotizacionEditada]);

  function restablecerCotizacion() {
    setOnza(cotizacion ? paraCampo(cotizacion.onzaCierreUsd) : '');
    setTipoCambio(cotizacion ? paraCampo(cotizacion.tipoCambio) : '');
    setCotizacionEditada(false);
  }

  // --- alta rápida de cliente ---------------------------------------------
  const [creandoCliente, setCreandoCliente] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoCi, setNuevoCi] = useState('');
  const [nuevoTelefono, setNuevoTelefono] = useState('');
  const [guardandoCliente, setGuardandoCliente] = useState(false);

  /** Escape cierra la ventana de nuevo cliente. */
  useEffect(() => {
    if (!creandoCliente) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCreandoCliente(false);
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [creandoCliente]);

  const actualizarFila = (id: string, campo: keyof FilaBorrador, valor: string) =>
    setFilas((prev) =>
      prev.map((f) => (f.id === id ? { ...f, [campo]: valor } : f)),
    );

  const onzaLeida = leerNumero(onza, 'onza');
  const tcLeido = leerNumero(tipoCambio, 'tipoCambio');
  const cotizacionValida = !!onzaLeida.valor && !!tcLeido.valor;

  /** Cambio de cada campo respecto de la vigente; null si no cambió. */
  const cambioOnza = variacion(onzaLeida.valor, cotizacion?.onzaCierreUsd);
  const cambioTc = variacion(tcLeido.valor, cotizacion?.tipoCambio);
  /** Al registrar, se guarda también una cotización nueva. */
  const cotizacionNueva =
    cotizacionValida && (!cotizacion || cambioOnza !== null || cambioTc !== null);

  /**
   * Tiempo desde la última compra registrada en este dispositivo (sin contar
   * anuladas). Si pasó mucho, el precio pudo moverse y conviene revisarlo.
   */
  const ultimaCompra = useLiveQuery(async () => {
    let ultima = '';
    await db.compras.each((c) => {
      if (c.estado !== 'ANULADA' && c.actualizadoEn > ultima) ultima = c.actualizadoEn;
    });
    return ultima || null;
  }, []);
  const edadMs = ultimaCompra ? ahora - new Date(ultimaCompra).getTime() : 0;
  const cotizacionAntigua = !!ultimaCompra && edadMs > ANTIGUEDAD_REVISAR_MS;

  const avisosCotizacion = [
    avisoDeVariacion(onzaLeida.valor, cotizacion?.onzaCierreUsd, 'La onza'),
    avisoDeVariacion(tcLeido.valor, cotizacion?.tipoCambio, 'El tipo de cambio'),
  ].filter(Boolean);

  /**
   * Liquidación en vivo. Se recalcula con cada tecla usando exactamente las
   * mismas funciones que el backend — de ahí el paquete compartido.
   */
  const liquidacion = useMemo(() => {
    const items: (CompraItem & { filaId: string })[] = [];
    const errores: string[] = [];
    const lecturas = new Map<string, LecturaFila>();

    for (const l of [onzaLeida, tcLeido]) {
      if (l.error) errores.push(l.error);
    }

    filas.forEach((fila, i) => {
      const lectura: LecturaFila = {
        antes: leerNumero(fila.pesoAntesFundirG, 'peso'),
        despues: leerNumero(fila.pesoDespuesFundirG, 'peso'),
        ley: leerLey(fila.leyPorcentaje),
      };
      lecturas.set(fila.id, lectura);

      const pieza = filas.length > 1 ? `Pieza ${i + 1}: ` : '';
      const { antes, despues, ley } = lectura;
      for (const l of [antes, despues, ley]) {
        if (l.error) errores.push(pieza + l.error);
      }
      if (antes.error || despues.error || ley.error) return;

      // Una fila a medio llenar no se descarta en silencio: la compra se
      // guardaría con una pieza menos.
      const vacia = !fila.pesoAntesFundirG.trim() && !despues.valor && !ley.valor;
      if (vacia) return;
      if (!despues.valor) return void errores.push(`${pieza}falta el peso después de fundir.`);
      if (!ley.valor) return void errores.push(`${pieza}falta la ley.`);
      if (!onzaLeida.valor || !tcLeido.valor) return;

      try {
        const r = calcularCompraItem({
          onzaCierreUsd: onzaLeida.valor,
          tipoCambio: tcLeido.valor,
          pesoAntesFundirG: antes.valor,
          pesoDespuesFundirG: despues.valor,
          ley: ley.valor,
        });
        items.push({
          filaId: fila.id,
          id: fila.id,
          pesoAntesFundirG: antes.valor,
          pesoDespuesFundirG: despues.valor,
          mermaG: r.mermaG?.toString() ?? null,
          ley: ley.valor,
          bsPorGramo: r.bsPorGramo.toString(),
          totalBs: r.totalBs.toString(),
          pesoFinoG: r.pesoFinoG.toString(),
          observacion: fila.observacion || undefined,
        });
      } catch (e) {
        errores.push(pieza + (e as Error).message);
      }
    });

    return {
      items,
      totalBs: calcularTotalCompra(items).toString(),
      errores,
      lecturas,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, onzaLeida.valor, onzaLeida.error, tcLeido.valor, tcLeido.error]);

  const lecturaDe = (filaId: string) =>
    liquidacion.lecturas.get(filaId) ?? {
      antes: SIN_LECTURA,
      despues: SIN_LECTURA,
      ley: SIN_LECTURA,
    };

  const puedeGuardar =
    cotizacionValida &&
    !!clienteId &&
    liquidacion.items.length > 0 &&
    liquidacion.errores.length === 0 &&
    !guardando;

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
   * Si el operador cambió la onza o el T/C, en la misma transacción se guarda
   * una cotización oficial nueva: queda en el módulo Cotización para auditoría
   * y pasa a ser la vigente de las compras siguientes.
   * Con `venderAhora` (caso del cliente que vende el mismo día) pasa directo
   * a la venta con ese lote ya elegido.
   */
  async function guardar(venderAhora = false) {
    if (!puedeGuardar || !onzaLeida.valor || !tcLeido.valor) return;
    const onzaCierreUsd = onzaLeida.valor;
    const tc = tcLeido.valor;
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
        onzaCierreUsd,
        tipoCambio: tc,
        totalBs: liquidacion.totalBs,
        estado: 'CONFIRMADA',
        observacion: observacion || undefined,
        items: liquidacion.items.map(({ filaId: _filaId, ...item }) => item),
        actualizadoEn: new Date().toISOString(),
        estadoSync: 'pendiente',
      };
      const lote = loteDeCompra(compra);

      const tablas = [db.compras, db.lotes, db.cotizaciones, db.outbox];
      await db.transaction('rw', tablas, async () => {
        if (cotizacionNueva) await registrarCotizacion(onzaCierreUsd, tc);
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
      </header>

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

        <div className="grupo-cotizacion">
          <div className="campos-cotizacion">
            <CampoCotizacion
              etiqueta="Onza cierre (USD)"
              placeholder="4867"
              valor={onza}
              lectura={onzaLeida}
              cambio={cambioOnza}
              anterior={cotizacion?.onzaCierreUsd}
              antigua={cotizacionAntigua}
              onCambiar={(v) => {
                setOnza(v);
                setCotizacionEditada(true);
              }}
            />
            <CampoCotizacion
              etiqueta="T/C (Bs por USD)"
              placeholder="11,5"
              valor={tipoCambio}
              lectura={tcLeido}
              cambio={cambioTc}
              anterior={cotizacion?.tipoCambio}
              antigua={cotizacionAntigua}
              onCambiar={(v) => {
                setTipoCambio(v);
                setCotizacionEditada(true);
              }}
            />
          </div>

          {cotizacion && cotizacionNueva ? (
            <p className="estado-cotizacion modificada">
              <span className="punto" />
              <span>
                Se guardará como <b>nueva cotización</b> al registrar
              </span>
              <span aria-hidden="true">·</span>
              <button type="button" className="enlace" onClick={restablecerCotizacion}>
                Restablecer
              </button>
            </p>
          ) : cotizacion ? (
            <p className={`estado-cotizacion ${cotizacionAntigua ? 'antigua' : ''}`}>
              <span className="punto" />
              <span>
                {ultimaCompra ? (
                  <>
                    Última compra <b>{haceCuanto(edadMs)}</b>
                    {cotizacionAntigua && ': revise el precio antes de comprar'}
                  </>
                ) : (
                  'Primera compra: revise el precio antes de comprar'
                )}
              </span>
            </p>
          ) : (
            <p className="estado-cotizacion antigua">
              <span className="punto" />
              <span>No hay cotización registrada: escriba la onza y el T/C</span>
            </p>
          )}

          {avisosCotizacion.map((a) => (
            <p key={a} className="aviso-cotizacion">
              {a}
            </p>
          ))}
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
          const lectura = lecturaDe(fila.id);
          return (
            <div className="rejilla-piezas pieza" key={fila.id}>
              <input
                inputMode="decimal"
                aria-label="Peso antes de fundir"
                className={claseError(lectura.antes)}
                aria-invalid={!!lectura.antes.error}
                placeholder="opcional"
                value={fila.pesoAntesFundirG}
                onChange={(e) =>
                  actualizarFila(fila.id, 'pesoAntesFundirG', e.target.value)
                }
              />
              <input
                inputMode="decimal"
                aria-label="Peso después de fundir"
                className={claseError(lectura.despues)}
                aria-invalid={!!lectura.despues.error}
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
                  className={claseError(lectura.ley)}
                  aria-invalid={!!lectura.ley.error}
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
