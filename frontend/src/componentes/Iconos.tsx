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
