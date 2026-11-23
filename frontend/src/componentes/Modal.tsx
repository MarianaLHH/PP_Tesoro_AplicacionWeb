import { useEffect, type FormEvent, type ReactNode } from 'react';
import { IconoCruz } from './Iconos';

/**
 * Ventana con formulario. Se cierra con la cruz, con Escape o al hacer clic
 * fuera; `onEnviar` recibe el submit (Enter incluido).
 */
export default function Modal({
  titulo,
  onCerrar,
  onEnviar,
  children,
}: {
  titulo: string;
  onCerrar: () => void;
  onEnviar: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    document.addEventListener('keydown', alTecla);
    return () => document.removeEventListener('keydown', alTecla);
  }, [onCerrar]);

  function enviar(e: FormEvent) {
    e.preventDefault();
    onEnviar();
  }

  return (
    <>
      <div className="fondo-modal" onClick={onCerrar} />
      <form className="tarjeta-modal" role="dialog" aria-label={titulo} onSubmit={enviar}>
        <div className="cabecera-modal">
          <h3>{titulo}</h3>
          <button type="button" className="cerrar" aria-label="Cerrar" onClick={onCerrar}>
            <IconoCruz />
          </button>
        </div>
        {children}
      </form>
    </>
  );
}
