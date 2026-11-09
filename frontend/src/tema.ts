import { useEffect, useState } from 'react';

/**
 * Tema visual (oscuro por defecto). Se guarda por dispositivo y se aplica
 * como `data-tema` en <html>, donde estilos.css redefine los tokens.
 */
export type Tema = 'oscuro' | 'claro';

const CLAVE_TEMA = 'tesoro.tema';

function leer(): Tema {
  try {
    return localStorage.getItem(CLAVE_TEMA) === 'claro' ? 'claro' : 'oscuro';
  } catch {
    return 'oscuro';
  }
}

function aplicar(tema: Tema) {
  document.documentElement.dataset.tema = tema;
}

// Antes del primer render, para que no parpadee el tema equivocado.
aplicar(leer());

export function useTema() {
  const [tema, setTema] = useState<Tema>(leer);

  useEffect(() => {
    aplicar(tema);
    try {
      localStorage.setItem(CLAVE_TEMA, tema);
    } catch {
      // Sin almacenamiento el tema dura lo que la pestaña.
    }
  }, [tema]);

  const alternar = () => setTema((t) => (t === 'oscuro' ? 'claro' : 'oscuro'));
  return { tema, alternar };
}
