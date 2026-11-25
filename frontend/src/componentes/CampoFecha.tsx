import { useEffect, useId, useRef, useState } from 'react';
import { IconoCalendario, IconoFlecha } from './Iconos';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const DIAS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
const DIAS_LARGOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

const aTexto = (anio: number, mes: number, dia: number) =>
  `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

function hoy(): string {
  const d = new Date();
  return aTexto(d.getFullYear(), d.getMonth(), d.getDate());
}

/** `YYYY-MM-DD` → [año, mes 0-11, día], sin pasar por husos horarios. */
function partes(valor: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  return m ? [Number(m[1]), Number(m[2]) - 1, Number(m[3])] : null;
}

/** "mié 25/11/2026" */
function legible(valor: string): string {
  const p = partes(valor);
  if (!p) return 'Elegir fecha';
  const [anio, mes, dia] = p;
  const semana = DIAS_LARGOS[new Date(anio, mes, dia).getDay()];
  return `${semana} ${String(dia).padStart(2, '0')}/${String(mes + 1).padStart(2, '0')}/${anio}`;
}

/**
 * Selector de fecha en español.
 *
 * Reemplaza a `<input type="date">`, cuyo calendario sale en el idioma del
 * navegador (inglés en muchos equipos) aunque la página esté en español.
 * Trabaja con el mismo formato `YYYY-MM-DD`.
 */
export default function CampoFecha({
  etiqueta,
  valor,
  onCambiar,
}: {
  etiqueta: string;
  valor: string;
  onCambiar: (valor: string) => void;
}) {
  const id = useId();
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const seleccion = partes(valor);
  const [vista, setVista] = useState<[number, number]>(() => {
    const base = seleccion ?? partes(hoy())!;
    return [base[0], base[1]];
  });

  // Al abrir, el calendario muestra el mes de la fecha elegida.
  useEffect(() => {
    if (abierto && seleccion) setVista([seleccion[0], seleccion[1]]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

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

  const [anio, mes] = vista;
  const mover = (delta: number) => {
    const d = new Date(anio, mes + delta, 1);
    setVista([d.getFullYear(), d.getMonth()]);
  };

  // Semanas de lunes a domingo; huecos antes del día 1.
  const primerDia = (new Date(anio, mes, 1).getDay() + 6) % 7;
  const diasMes = new Date(anio, mes + 1, 0).getDate();
  const celdas: (number | null)[] = [
    ...Array<null>(primerDia).fill(null),
    ...Array.from({ length: diasMes }, (_, i) => i + 1),
  ];
  const textoHoy = hoy();

  function elegir(texto: string) {
    onCambiar(texto);
    setAbierto(false);
  }

  return (
    <div className="campo-fecha" ref={contenedor}>
      <span className="etiqueta" id={`${id}-etiqueta`}>
        {etiqueta}
      </span>
      <button
        type="button"
        className="campo-fecha-boton"
        aria-labelledby={`${id}-etiqueta ${id}-valor`}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
      >
        <span id={`${id}-valor`}>{legible(valor)}</span>
        <IconoCalendario />
      </button>

      {abierto && (
        <div className="calendario" role="dialog" aria-label={`Calendario: ${etiqueta}`}>
          <div className="calendario-cabecera">
            <button type="button" aria-label="Mes anterior" onClick={() => mover(-1)}>
              <span className="girar">
                <IconoFlecha />
              </span>
            </button>
            <strong>
              {MESES[mes]} {anio}
            </strong>
            <button type="button" aria-label="Mes siguiente" onClick={() => mover(1)}>
              <IconoFlecha />
            </button>
          </div>

          <div className="calendario-rejilla">
            {DIAS.map((d) => (
              <span key={d} className="calendario-dia-semana" aria-hidden="true">
                {d}
              </span>
            ))}
            {celdas.map((dia, i) => {
              if (dia === null) return <span key={`v${i}`} />;
              const texto = aTexto(anio, mes, dia);
              const clases = [
                'calendario-dia',
                texto === valor ? 'elegido' : '',
                texto === textoHoy ? 'hoy' : '',
              ].join(' ');
              return (
                <button
                  type="button"
                  key={texto}
                  className={clases}
                  aria-label={legible(texto)}
                  aria-pressed={texto === valor}
                  onClick={() => elegir(texto)}
                >
                  {dia}
                </button>
              );
            })}
          </div>

          <div className="calendario-pie">
            <button type="button" className="fantasma" onClick={() => elegir(textoHoy)}>
              Hoy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
