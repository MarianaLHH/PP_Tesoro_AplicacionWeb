import { useCallback, useEffect, useState } from 'react';
import { LARGO_MINIMO_CLAVE } from '../componentes/CambiarClave';
import Modal from '../componentes/Modal';
import { actualizarUsuarioSesion, pedirApi, useSesion } from '../sesion';

type Rol = 'ADMIN' | 'OPERADOR' | 'AUDITOR';

interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
}

const ROLES: { valor: Rol; nombre: string; ayuda: string }[] = [
  { valor: 'OPERADOR', nombre: 'Operador', ayuda: 'Registra compras, ventas y fundiciones.' },
  { valor: 'ADMIN', nombre: 'Administrador', ayuda: 'Todo lo anterior y además maneja las cuentas.' },
  { valor: 'AUDITOR', nombre: 'Auditor', ayuda: 'Solo consulta; no puede registrar operaciones.' },
];
const nombreRol = (rol: Rol) => ROLES.find((r) => r.valor === rol)?.nombre ?? rol;

type Dialogo =
  | { tipo: 'crear' }
  | { tipo: 'editar'; usuario: Usuario }
  | { tipo: 'clave'; usuario: Usuario };

/**
 * Cuentas de acceso. Solo para administradores y solo con conexión: a
 * diferencia de las operaciones, no se guarda nada en el dispositivo.
 */
export default function Usuarios() {
  const sesion = useSesion();
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [error, setError] = useState('');
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);

  const cargar = useCallback(async () => {
    try {
      setUsuarios(await pedirApi<Usuario[]>('/usuarios'));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  function cerrar(recargar: boolean) {
    setDialogo(null);
    if (recargar) void cargar();
  }

  return (
    <section>
      <header className="encabezado-pagina">
        <h2>Usuarios</h2>
        <button
          type="button"
          className="primario boton"
          disabled={!usuarios}
          onClick={() => setDialogo({ tipo: 'crear' })}
        >
          Nuevo usuario
        </button>
      </header>

      {error && (
        <p className="error-login">
          {error}{' '}
          <button type="button" className="fantasma compacto" onClick={() => void cargar()}>
            Reintentar
          </button>
        </p>
      )}

      {usuarios && (
        <div className="rejilla-scroll">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Rol</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className={u.activo ? undefined : 'fila-inactiva'}>
                  <td>
                    {u.nombre}
                    {u.id === sesion?.usuario.id && <span className="nota-inline"> (usted)</span>}
                  </td>
                  <td>{u.email}</td>
                  <td>
                    <span className="insignia">{nombreRol(u.rol)}</span>
                  </td>
                  <td className={u.activo ? 'estado-ok' : 'estado-error'}>
                    {u.activo ? 'Activo' : 'Desactivado'}
                  </td>
                  <td className="acciones-fila">
                    <button
                      type="button"
                      className="fantasma compacto"
                      onClick={() => setDialogo({ tipo: 'editar', usuario: u })}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="fantasma compacto"
                      onClick={() => setDialogo({ tipo: 'clave', usuario: u })}
                    >
                      Restablecer clave
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!usuarios && !error && <div className="vacio">Cargando…</div>}

      {dialogo?.tipo === 'crear' && <FormularioUsuario onCerrar={cerrar} />}
      {dialogo?.tipo === 'editar' && (
        <FormularioUsuario
          usuario={dialogo.usuario}
          esUsted={dialogo.usuario.id === sesion?.usuario.id}
          onCerrar={cerrar}
        />
      )}
      {dialogo?.tipo === 'clave' && (
        <RestablecerClave usuario={dialogo.usuario} onCerrar={() => cerrar(false)} />
      )}
    </section>
  );
}

/** Alta (sin `usuario`) o edición. */
function FormularioUsuario({
  usuario,
  esUsted = false,
  onCerrar,
}: {
  usuario?: Usuario;
  esUsted?: boolean;
  onCerrar: (recargar: boolean) => void;
}) {
  const [nombre, setNombre] = useState(usuario?.nombre ?? '');
  const [email, setEmail] = useState(usuario?.email ?? '');
  const [rol, setRol] = useState<Rol>(usuario?.rol ?? 'OPERADOR');
  const [activo, setActivo] = useState(usuario?.activo ?? true);
  const [password, setPassword] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const creando = !usuario;
  const valido =
    !!nombre.trim() &&
    /^\S+@\S+\.\S+$/.test(email.trim()) &&
    (!creando || password.length >= LARGO_MINIMO_CLAVE);

  async function guardar() {
    if (!valido || guardando) return;
    setGuardando(true);
    setError('');
    try {
      if (creando) {
        await pedirApi('/usuarios', {
          method: 'POST',
          body: { nombre: nombre.trim(), email: email.trim(), rol, password },
        });
      } else {
        const editado = await pedirApi<Usuario>(`/usuarios/${usuario.id}`, {
          method: 'PATCH',
          body: { nombre: nombre.trim(), email: email.trim(), ...(!esUsted && { rol, activo }) },
        });
        if (esUsted) actualizarUsuarioSesion({ nombre: editado.nombre, email: editado.email });
      }
      onCerrar(true);
    } catch (e) {
      setError((e as Error).message);
      setGuardando(false);
    }
  }

  return (
    <Modal
      titulo={creando ? 'Nuevo usuario' : 'Editar usuario'}
      onCerrar={() => onCerrar(false)}
      onEnviar={guardar}
    >
      <label className="campo-bloque">
        <span className="etiqueta">Nombre</span>
        <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </label>

      <label className="campo-bloque">
        <span className="etiqueta">Correo</span>
        <input
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {!creando && email.trim().toLowerCase() !== usuario.email && (
          <p className="nota">
            {esUsted ? 'Desde ahora entrará' : 'Desde ahora deberá entrar'} con el correo nuevo.
          </p>
        )}
      </label>

      <label className="campo-bloque">
        <span className="etiqueta">Rol</span>
        <select
          value={rol}
          disabled={esUsted}
          onChange={(e) => setRol(e.target.value as Rol)}
        >
          {ROLES.map((r) => (
            <option key={r.valor} value={r.valor}>
              {r.nombre}
            </option>
          ))}
        </select>
        <p className="nota">
          {esUsted
            ? 'No puede cambiar su propio rol. Pídaselo a otro administrador.'
            : ROLES.find((r) => r.valor === rol)?.ayuda}
        </p>
      </label>

      {creando ? (
        <label className="campo-bloque">
          <span className="etiqueta">Contraseña temporal</span>
          <input
            type="text"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="nota">
            Al menos {LARGO_MINIMO_CLAVE} caracteres. Entréguesela a la persona y pídale que la
            cambie desde su menú.
          </p>
        </label>
      ) : (
        !esUsted && (
          <label className="campo-casilla">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            <span>Cuenta activa</span>
          </label>
        )
      )}
      {!creando && !esUsted && usuario.activo && !activo && (
        <p className="aviso">
          No podrá entrar ni enviar operaciones. Lo que dejó sin enviar en un dispositivo será
          rechazado hasta que se reactive la cuenta.
        </p>
      )}

      {error && <p className="error-login">{error}</p>}

      <div className="acciones">
        <button type="button" className="fantasma" onClick={() => onCerrar(false)}>
          Cancelar
        </button>
        <button type="submit" className="primario" disabled={!valido || guardando}>
          {guardando ? 'Guardando…' : creando ? 'Crear' : 'Guardar'}
        </button>
      </div>
    </Modal>
  );
}

function RestablecerClave({ usuario, onCerrar }: { usuario: Usuario; onCerrar: () => void }) {
  const [password, setPassword] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [listo, setListo] = useState(false);

  const valido = password.length >= LARGO_MINIMO_CLAVE;

  async function guardar() {
    if (!valido || guardando) return;
    setGuardando(true);
    setError('');
    try {
      await pedirApi(`/usuarios/${usuario.id}/restablecer-clave`, {
        method: 'POST',
        body: { password },
      });
      setListo(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  if (listo) {
    return (
      <Modal titulo="Contraseña restablecida" onCerrar={onCerrar} onEnviar={onCerrar}>
        <p className="nota">
          Entréguele la contraseña nueva a {usuario.nombre} y pídale que la cambie desde su menú.
        </p>
        <div className="acciones">
          <button type="submit" className="primario" autoFocus>
            Aceptar
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal titulo="Restablecer contraseña" onCerrar={onCerrar} onEnviar={guardar}>
      <p className="nota">
        Asigna una contraseña nueva a <strong>{usuario.nombre}</strong> ({usuario.email}). La
        anterior deja de servir.
      </p>
      <label className="campo-bloque">
        <span className="etiqueta">Contraseña nueva</span>
        <input
          type="text"
          autoComplete="off"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="nota">Al menos {LARGO_MINIMO_CLAVE} caracteres.</p>
      </label>

      {error && <p className="error-login">{error}</p>}

      <div className="acciones">
        <button type="button" className="fantasma" onClick={onCerrar}>
          Cancelar
        </button>
        <button type="submit" className="primario" disabled={!valido || guardando}>
          {guardando ? 'Guardando…' : 'Restablecer'}
        </button>
      </div>
    </Modal>
  );
}
