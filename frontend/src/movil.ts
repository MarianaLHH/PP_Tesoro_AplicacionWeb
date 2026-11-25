import { useEffect, useState } from 'react';

/**
 * Ancho hasta el que se usa la interfaz de celular (barra inferior, tarjetas,
 * hojas inferiores). Debe coincidir con el @media de estilos.css.
 */
export const CONSULTA_MOVIL = '(max-width: 720px)';

export function useEsMovil(): boolean {
  const [movil, setMovil] = useState(() => window.matchMedia(CONSULTA_MOVIL).matches);
  useEffect(() => {
    const consulta = window.matchMedia(CONSULTA_MOVIL);
    const actualizar = () => setMovil(consulta.matches);
    consulta.addEventListener('change', actualizar);
    return () => consulta.removeEventListener('change', actualizar);
  }, []);
  return movil;
}
