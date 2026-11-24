import { useState } from 'react';
import { pedirApi } from '../sesion';
import Modal from './Modal';
import CampoClave from './CampoClave';

export const LARGO_MINIMO_CLAVE = 8;

/** Cualquier usuario cambia su propia contraseña. Necesita conexión. */
export default function CambiarClave({ onCerrar }: { onCerrar: () => void }) {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [listo, setListo] = useState(false);

  const corta = nueva.length > 0 && nueva.length < LARGO_MINIMO_CLAVE;
  const distinta = repetida.length > 0 && repetida !== nueva;
  const valido = !!actual && nueva.length >= LARGO_MINIMO_CLAVE && repetida === nueva;

  async function guardar() {
    if (!valido || guardando) return;
    setGuardando(true);
    setError('');
    try {
      await pedirApi('/auth/cambiar-clave', { method: 'POST', body: { actual, nueva } });
      setListo(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  if (listo) {
    return (
      <Modal titulo="Contraseña cambiada" onCerrar={onCerrar} onEnviar={onCerrar}>
        <p className="nota">Use la contraseña nueva la próxima vez que entre.</p>
        <div className="acciones">
          <button type="submit" className="primario" autoFocus>
            Aceptar
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal titulo="Cambiar contraseña" onCerrar={onCerrar} onEnviar={guardar}>
      <label className="campo-bloque">
        <span className="etiqueta">Contraseña actual</span>
        <CampoClave
          autoComplete="current-password"
          autoFocus
          value={actual}
          onChange={(e) => setActual(e.target.value)}
        />
      </label>
      <label className="campo-bloque">
        <span className="etiqueta">Contraseña nueva</span>
        <CampoClave
          autoComplete="new-password"
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
        />
        {corta && <p className="error-campo">Al menos {LARGO_MINIMO_CLAVE} caracteres.</p>}
      </label>
      <label className="campo-bloque">
        <span className="etiqueta">Repita la contraseña nueva</span>
        <CampoClave
          autoComplete="new-password"
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
        />
        {distinta && <p className="error-campo">No coincide con la contraseña nueva.</p>}
      </label>

      {error && <p className="error-login">{error}</p>}

      <div className="acciones">
        <button type="button" className="fantasma" onClick={onCerrar}>
          Cancelar
        </button>
        <button type="submit" className="primario" disabled={!valido || guardando}>
          {guardando ? 'Guardando…' : 'Cambiar'}
        </button>
      </div>
    </Modal>
  );
}
