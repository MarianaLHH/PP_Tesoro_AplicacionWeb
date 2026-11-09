import { useState, type FormEvent } from 'react';
import { iniciarSesion, type Sesion } from '../sesion';

/**
 * Entrada al sistema. Se usa al abrir la app por primera vez en el
 * dispositivo y cuando la sesión vence (`anterior`), para reanudar el envío.
 */
export default function Login({
  anterior,
  onCancelar,
}: {
  anterior?: Sesion | null;
  onCancelar?: () => void;
}) {
  const [email, setEmail] = useState(anterior?.usuario.email ?? '');
  const [password, setPassword] = useState('');
  const [entrando, setEntrando] = useState(false);
  const [error, setError] = useState('');

  async function entrar(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password || entrando) return;
    setEntrando(true);
    setError('');
    try {
      await iniciarSesion(email.trim(), password);
    } catch (err) {
      setError((err as Error).message);
      setEntrando(false);
    }
  }

  return (
    <div className="pantalla-login">
      <form className="tarjeta-login" onSubmit={entrar}>
        <h1>Tesoro</h1>
        <p className="nota">
          {anterior
            ? 'La sesión venció. Vuelva a entrar para enviar las operaciones pendientes.'
            : 'Entre con su cuenta. La primera vez se necesita conexión a internet.'}
        </p>

        <label className="campo-bloque">
          <span className="etiqueta">Correo</span>
          <input
            type="email"
            autoComplete="username"
            autoFocus={!anterior}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className="campo-bloque">
          <span className="etiqueta">Contraseña</span>
          <input
            type="password"
            autoComplete="current-password"
            autoFocus={!!anterior}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && <p className="error-login">{error}</p>}

        <div className="acciones">
          {onCancelar && (
            <button type="button" className="fantasma" onClick={onCancelar}>
              Seguir sin enviar
            </button>
          )}
          <button
            type="submit"
            className="primario"
            disabled={!email.trim() || !password || entrando}
          >
            {entrando ? 'Entrando…' : 'Entrar'}
          </button>
        </div>
      </form>
    </div>
  );
}
