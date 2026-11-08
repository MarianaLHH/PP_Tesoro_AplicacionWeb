import { NavLink, Route, Routes, Navigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db } from './db/db';
import Compras from './paginas/Compras';
import NuevaCompra from './paginas/NuevaCompra';
import Cotizacion from './paginas/Cotizacion';
import Clientes from './paginas/Clientes';
import Historial from './paginas/Historial';
import Ventas from './paginas/Ventas';
import NuevaVenta from './paginas/NuevaVenta';
import Inventario from './paginas/Inventario';
import Fundicion from './paginas/Fundicion';

/** Indicador de conexión y de operaciones pendientes de enviar. */
function EstadoConexion() {
  const [enLinea, setEnLinea] = useState(navigator.onLine);
  const pendientes = useLiveQuery(() => db.outbox.count(), [], 0);

  useEffect(() => {
    const actualizar = () => setEnLinea(navigator.onLine);
    window.addEventListener('online', actualizar);
    window.addEventListener('offline', actualizar);
    return () => {
      window.removeEventListener('online', actualizar);
      window.removeEventListener('offline', actualizar);
    };
  }, []);

  return (
    <div className={`estado-conexion ${enLinea ? 'en-linea' : 'sin-conexion'}`}>
      <span className="punto" />
      <span>{enLinea ? 'En línea' : 'Sin conexión'}</span>
      {pendientes > 0 && <span className="pendientes">{pendientes} por enviar</span>}
    </div>
  );
}

export default function App() {
  return (
    <div className="app">
      <header className="barra">
        <h1>Tesoro</h1>
        <nav>
          <NavLink to="/compras">Compras</NavLink>
          <NavLink to="/historial">Historial</NavLink>
          <NavLink to="/inventario">Inventario</NavLink>
          <NavLink to="/ventas">Ventas</NavLink>
          <NavLink to="/cotizacion">Cotización</NavLink>
          <NavLink to="/clientes">Clientes</NavLink>
        </nav>
        <EstadoConexion />
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
