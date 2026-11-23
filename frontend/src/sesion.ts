import { useSyncExternalStore } from 'react';

/**
 * Sesión del operador, guardada en el dispositivo.
 *
 * Entrar exige conexión una vez. Después la app sigue funcionando sin red
 * aunque el token venza: el registro local no se bloquea, solo el envío al
 * servidor, que pide volver a entrar (`vencida`).
 */
export interface Sesion {
  token: string;
  usuario: { id: string; nombre: string; email: string; rol: string };
  vencida?: boolean;
}

const CLAVE_SESION = 'tesoro.sesion';
const CLAVE_DISPOSITIVO = 'tesoro.dispositivo';

function leer(): Sesion | null {
  try {
    const texto = localStorage.getItem(CLAVE_SESION);
    return texto ? (JSON.parse(texto) as Sesion) : null;
  } catch {
    return null;
  }
}

let actual = leer();
const oyentes = new Set<() => void>();

function escribir(sesion: Sesion | null) {
  actual = sesion;
  try {
    if (sesion) localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
    else localStorage.removeItem(CLAVE_SESION);
  } catch {
    // Sin almacenamiento la sesión dura lo que la pestaña.
  }
  oyentes.forEach((avisar) => avisar());
}

export const obtenerSesion = () => actual;

export function cerrarSesion() {
  escribir(null);
}

/** Refleja en la sesión guardada un cambio de los propios datos. */
export function actualizarUsuarioSesion(datos: Partial<Pick<Sesion['usuario'], 'nombre' | 'email'>>) {
  if (actual) escribir({ ...actual, usuario: { ...actual.usuario, ...datos } });
}

/** El servidor respondió 401: se deja de enviar hasta que vuelva a entrar. */
export function marcarSesionVencida() {
  if (actual && !actual.vencida) escribir({ ...actual, vencida: true });
}

export function useSesion(): Sesion | null {
  return useSyncExternalStore(
    (avisar) => {
      oyentes.add(avisar);
      return () => oyentes.delete(avisar);
    },
    obtenerSesion,
  );
}

/** Mensaje legible de una respuesta de error de NestJS. */
export async function mensajeDeError(resp: Response): Promise<string> {
  try {
    const cuerpo = (await resp.json()) as { message?: string | string[] };
    const m = Array.isArray(cuerpo.message) ? cuerpo.message[0] : cuerpo.message;
    if (m) return m;
  } catch {
    // Cuerpo vacío o no JSON.
  }
  return `El servidor respondió ${resp.status}.`;
}

export async function iniciarSesion(email: string, password: string): Promise<void> {
  let resp: Response;
  try {
    resp = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new Error('Sin conexión con el servidor. Para entrar se necesita internet.');
  }
  if (!resp.ok) throw new Error(await mensajeDeError(resp));
  escribir((await resp.json()) as Sesion);
}

/** Identificador estable de este navegador, para la auditoría. */
export function dispositivoId(): string {
  try {
    let id = localStorage.getItem(CLAVE_DISPOSITIVO);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(CLAVE_DISPOSITIVO, id);
    }
    return id;
  } catch {
    return 'sin-almacenamiento';
  }
}

/**
 * Llamada autenticada a la API, para lo que necesita conexión (la gestión de
 * usuarios). Lanza `Error` con un mensaje para mostrar tal cual.
 */
export async function pedirApi<T = void>(
  ruta: string,
  opciones: { method?: 'GET' | 'POST' | 'PATCH'; body?: unknown } = {},
): Promise<T> {
  const sesion = obtenerSesion();
  if (!sesion || sesion.vencida) {
    throw new Error('La sesión venció. Vuelva a entrar para continuar.');
  }
  let resp: Response;
  try {
    resp = await fetch(`/api${ruta}`, {
      method: opciones.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${sesion.token}`,
        ...(opciones.body !== undefined && { 'Content-Type': 'application/json' }),
      },
      body: opciones.body !== undefined ? JSON.stringify(opciones.body) : undefined,
    });
  } catch {
    throw new Error('Sin conexión con el servidor. Esta acción necesita internet.');
  }
  if (resp.status === 401) {
    const mensaje = await mensajeDeError(resp);
    marcarSesionVencida();
    throw new Error(mensaje);
  }
  if (!resp.ok) throw new Error(await mensajeDeError(resp));
  return (resp.status === 204 ? undefined : await resp.json()) as T;
}
