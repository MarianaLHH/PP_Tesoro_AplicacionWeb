import { NavLink, Route, Routes, Navigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { useTema } from './tema';
import { IconoLuna, IconoSalir, IconoSol, IconoUsuario } from './componentes/Iconos';
import { db } from './db/db';
import { sincronizar } from './db/sincronizar';
import { cerrarSesion, useSesion, type Sesion } from './sesion';
import Compras from './paginas/Compras';
import NuevaCompra from './paginas/NuevaCompra';
import Cotizacion from './paginas/Cotizacion';
import Clientes from './paginas/Clientes';
import Historial from './paginas/Historial';
import Ventas from './paginas/Ventas';
import NuevaVenta from './paginas/NuevaVenta';
import Inventario from './paginas/Inventario';
import Fundicion from './paginas/Fundicion';
import Login from './paginas/Login';

/** Cada cuánto se reintenta el envío mientras haya algo en la cola. */
const INTERVALO_SYNC_MS = 30_000;

function useEnLinea() {
  const [enLinea, setEnLinea] = useState(navigator.onLine);
  useEffect(() => {
    const actualizar = () => setEnLinea(navigator.onLine);
    window.addEventListener('online', actualizar);
    window.addEventListener('offline', actualizar);
    return () => {
      window.removeEventListener('online', actualizar);
      window.removeEventListener('offline', actualizar);
    };
  }, []);
  return enLinea;
}

/**
 * Envía la cola al servidor: al abrir, al recuperar la red, cuando se encola
 * algo nuevo y, por si acaso, cada 30 s.
 */
function useSincronizacion(sesion: Sesion, enLinea: boolean, pendientes: number) {
  const puedeEnviar = enLinea && !sesion.vencida;

  useEffect(() => {
    if (!puedeEnviar) return;
    const ejecutar = () => void sincronizar();
    ejecutar();
    const intervalo = setInterval(ejecutar, INTERVALO_SYNC_MS);
    return () => clearInterval(intervalo);
  }, [puedeEnviar, sesion.token]);

  useEffect(() => {
    if (puedeEnviar && pendientes > 0) void sincronizar();
  }, [puedeEnviar, pendientes]);
}

/** Conexión, operaciones por enviar y rechazadas. */
function EstadoConexion({
  sesion,
  enLinea,
  pendientes,
  onReentrar,
}: {
  sesion: Sesion;
  enLinea: boolean;
  pendientes: number;
  onReentrar: () => void;
}) {
  const rechazada = useLiveQuery(
    () => db.outbox.filter((o) => !!o.rechazada).first(),
    [],
  );

  return (
    <div className={`estado-conexion ${enLinea ? 'en-linea' : 'sin-conexion'}`}>
      <span className="punto" />
      <span>{enLinea ? 'En línea' : 'Sin conexión'}</span>
      {pendientes > 0 && <span className="pendientes">{pendientes} por enviar</span>}
      {rechazada && (
        <span className="pendientes rechazada" title={rechazada.ultimoError}>
          ⚠ Envío detenido: {rechazada.ultimoError}
        </span>
      )}
      {sesion.vencida && (
        <button type="button" className="fantasma compacto" onClick={onReentrar}>
          Sesión vencida · Entrar
        </button>
      )}
    </div>
  );
}

function Usuario({ sesion, pendientes }: { sesion: Sesion; pendientes: number }) {
  function salir() {
    const aviso =
      pendientes > 0
        ? `Hay ${pendientes} operaciones sin enviar. Quedarán guardadas en este dispositivo y se enviarán cuando alguien vuelva a entrar. ¿Salir?`
        : '¿Cerrar la sesión?';
    if (window.confirm(aviso)) cerrarSesion();
  }

  const { tema, alternar } = useTema();
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  // Se cierra al hacer clic fuera o con Escape.
  useEffect(() => {
    if (!abierto) return;
    const alClic = (e: MouseEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    };
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('mousedown', alClic);
    document.addEventListener('keydown', alTecla);
    return () => {
      document.removeEventListener('mousedown', alClic);
      document.removeEventListener('keydown', alTecla);
    };
  }, [abierto]);

  const oscuro = tema === 'oscuro';

  return (
    <div className="menu-usuario" ref={contenedor}>
      <button
        type="button"
        className="menu-usuario-boton"
        aria-label={`Usuario: ${sesion.usuario.nombre}`}
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
      >
        <IconoUsuario />
      </button>

      {abierto && (
        <div className="menu-usuario-panel" role="menu">
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={oscuro}
            className="menu-usuario-tema"
            onClick={alternar}
          >
            <span>{oscuro ? 'Modo oscuro' : 'Modo claro'}</span>
            {oscuro ? <IconoLuna /> : <IconoSol />}
          </button>

          <div className="menu-usuario-nombre">
            <strong>{sesion.usuario.nombre}</strong>
            <span>{sesion.usuario.email}</span>
          </div>

          <button
            type="button"
            role="menuitem"
            className="menu-usuario-salir"
            onClick={salir}
          >
            <IconoSalir />
            <span>Salir</span>
          </button>
        </div>
      )}
    </div>
  );
}

function Principal({ sesion }: { sesion: Sesion }) {
  const enLinea = useEnLinea();
  const pendientes = useLiveQuery(() => db.outbox.count(), [], 0);
  const [reentrando, setReentrando] = useState(false);
  useSincronizacion(sesion, enLinea, pendientes);

  useEffect(() => {
    if (!sesion.vencida) setReentrando(false);
  }, [sesion.vencida]);

  if (reentrando && sesion.vencida) {
    return <Login anterior={sesion} onCancelar={() => setReentrando(false)} />;
  }

  return (
    <div className="app">
      <header className="barra">
        <h1>Tesoro</h1>
        <nav>
          <NavLink to="/compras">Compras</NavLink>
          <NavLink to="/inventario">Inventario</NavLink>
          <NavLink to="/ventas">Ventas</NavLink>
          <NavLink to="/historial">Historial</NavLink>
          <NavLink to="/cotizacion">Cotización</NavLink>
          <NavLink to="/clientes">Clientes</NavLink>
        </nav>
        <EstadoConexion
          sesion={sesion}
          enLinea={enLinea}
          pendientes={pendientes}
          onReentrar={() => setReentrando(true)}
        />
        <Usuario sesion={sesion} pendientes={pendientes} />
      </header>

      <div className="separador-barra">
        <span />
      </div>

      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/compras" replace />} />
          <Route path="/compras" element={<Compras />} />
          <Route path="/compras/nueva" element={<NuevaCompra />} />
          <Route path="/historial" element={<Historial />} />
          <Route path="/inventario" element={<Inventario />} />
          <Route path="/inventario/fundir" element={<Fundicion />} />
          <Route path="/ventas" element={<Ventas />} />
          <Route path="/ventas/nueva" element={<NuevaVenta />} />
          <Route path="/cotizacion" element={<Cotizacion />} />
          <Route path="/clientes" element={<Clientes />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  const sesion = useSesion();
  return sesion ? <Principal sesion={sesion} /> : <Login />;
}
