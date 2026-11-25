import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  IconoCompras,
  IconoEscudo,
  IconoFlecha,
  IconoGrafico,
  IconoInventario,
  IconoMas,
  IconoMenu,
  IconoPersonas,
  IconoReloj,
  IconoVentas,
} from './Iconos';

interface OpcionMas {
  ruta: string;
  texto: string;
  icono: ReactNode;
}

/**
 * Navegación de celular: barra fija abajo, al alcance del pulgar, con las tres
 * secciones de uso diario, un botón central para comprar y «Más» para el resto.
 * Solo se ve en pantallas angostas (estilos.css); en escritorio manda el menú
 * de la cabecera.
 */
export default function NavegacionMovil({ esAdmin }: { esAdmin: boolean }) {
  const { pathname } = useLocation();
  const [masAbierto, setMasAbierto] = useState(false);

  const opciones: OpcionMas[] = [
    { ruta: '/historial', texto: 'Historial', icono: <IconoReloj /> },
    { ruta: '/cotizacion', texto: 'Cotización', icono: <IconoGrafico /> },
    { ruta: '/clientes', texto: 'Clientes', icono: <IconoPersonas /> },
    ...(esAdmin ? [{ ruta: '/usuarios', texto: 'Usuarios', icono: <IconoEscudo /> }] : []),
  ];
  const enMas = opciones.some((o) => pathname.startsWith(o.ruta));

  // Al navegar se cierra la hoja.
  useEffect(() => setMasAbierto(false), [pathname]);

  useEffect(() => {
    if (!masAbierto) return;
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMasAbierto(false);
    };
    document.addEventListener('keydown', alTecla);
    return () => document.removeEventListener('keydown', alTecla);
  }, [masAbierto]);

  return (
    <>
      <nav className="nav-movil" aria-label="Principal">
        <NavLink to="/compras" end>
          <IconoCompras />
          <span>Compras</span>
        </NavLink>
        <NavLink to="/inventario">
          <IconoInventario />
          <span>Inventario</span>
        </NavLink>
        <Link to="/compras/nueva" className="nav-movil-nuevo" aria-label="Nueva compra">
          <IconoMas tamano={26} />
        </Link>
        <NavLink to="/ventas">
          <IconoVentas />
          <span>Ventas</span>
        </NavLink>
        <button
          type="button"
          className={enMas || masAbierto ? 'active' : ''}
          aria-haspopup="dialog"
          aria-expanded={masAbierto}
          onClick={() => setMasAbierto((a) => !a)}
        >
          <IconoMenu />
          <span>Más</span>
        </button>
      </nav>

      {masAbierto && (
        <>
          <div className="fondo-modal" onClick={() => setMasAbierto(false)} />
          <div className="hoja-inferior" role="dialog" aria-label="Más opciones">
            <span className="hoja-asa" aria-hidden="true" />
            {opciones.map((o) => (
              <NavLink key={o.ruta} to={o.ruta} className="hoja-opcion">
                <span className="hoja-opcion-icono">{o.icono}</span>
                <span className="hoja-opcion-texto">{o.texto}</span>
                {o.ruta === '/usuarios' && <span className="insignia">Admin</span>}
                <IconoFlecha />
              </NavLink>
            ))}
          </div>
        </>
      )}
    </>
  );
}
