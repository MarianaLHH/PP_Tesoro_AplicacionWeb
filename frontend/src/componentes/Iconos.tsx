/** Iconos de línea del diseño. Se dibujan inline para no depender de fuentes. */

interface Props {
  tamano?: number;
}

const comunes = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function IconoLapiz({ tamano = 13 }: Props) {
  return (
    <svg width={tamano} height={tamano} {...comunes}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export function IconoMas({ tamano = 18 }: Props) {
  return (
    <svg width={tamano} height={tamano} {...comunes}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function IconoCruz({ tamano = 16 }: Props) {
  return (
    <svg width={tamano} height={tamano} {...comunes}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function IconoUsuario({ tamano = 28 }: Props) {
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 4a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Zm0 14a8 8 0 0 1-6.16-2.9C7.1 15.5 9.4 14.5 12 14.5s4.9 1 6.16 2.6A8 8 0 0 1 12 20Z" />
    </svg>
  );
}

export function IconoSol({ tamano = 22 }: Props) {
  return (
    <svg width={tamano} height={tamano} {...comunes}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

export function IconoLuna({ tamano = 22 }: Props) {
  return (
    <svg width={tamano} height={tamano} {...comunes}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  );
}

export function IconoSalir({ tamano = 22 }: Props) {
  return (
    <svg width={tamano} height={tamano} {...comunes}>
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <polyline points="10 17 15 12 10 7" />
      <line x1="15" y1="12" x2="3" y2="12" />
    </svg>
  );
}

export function IconoOjo({ tamano = 18 }: Props) {
  return (
    <svg width={tamano} height={tamano} {...comunes}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconoOjoTachado({ tamano = 18 }: Props) {
  return (
    <svg width={tamano} height={tamano} {...comunes}>
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.16 3.19" />
      <path d="M6.61 6.61A17.6 17.6 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}
