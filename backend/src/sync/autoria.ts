import type { JwtService } from '@nestjs/jwt';
import type { Rol } from '@prisma/client';
import type { ContenidoToken } from '../auth/sesion';
import { OperacionRechazada } from './verificacion';

/**
 * Cuánto tiempo después de iniciar sesión se aceptan operaciones registradas
 * con ese token. Cubre largos períodos sin red; más allá, el autor debe volver
 * a entrar en el dispositivo antes de registrar.
 */
export const ANTIGUEDAD_MAXIMA_TOKEN_S = 90 * 24 * 60 * 60;

export interface DatosAutor {
  nombre: string;
  rol: Rol;
  activo: boolean;
}

/**
 * Decide a nombre de quién queda cada operación sincronizada.
 *
 * La PWA guarda en cada operación el token de quien la registró. Su firma
 * prueba la autoría aunque ya esté vencido: así una operación hecha por A sin
 * conexión no queda a nombre de B si B es quien entra después y la envía, y B
 * no puede atribuirle a A algo que A no hizo.
 *
 * Una instancia por petición: guarda los usuarios ya consultados.
 */
export class ResolutorAutoria {
  private readonly cache = new Map<string, Promise<DatosAutor | null>>();

  constructor(
    private readonly jwt: Pick<JwtService, 'verifyAsync'>,
    private readonly buscarUsuario: (id: string) => Promise<DatosAutor | null>,
    private readonly ahoraS: () => number = () => Math.floor(Date.now() / 1000),
  ) {}

  /** Devuelve el id del autor o lanza `OperacionRechazada`. */
  async autor(autorToken: string | undefined, enviadoPor: string): Promise<string> {
    const id = autorToken ? await this.leerToken(autorToken) : enviadoPor;

    const usuario = await this.usuario(id);
    if (!usuario) throw new OperacionRechazada('Quien registró la operación ya no existe.');
    if (!usuario.activo) {
      throw new OperacionRechazada(
        `La registró ${usuario.nombre}, cuya cuenta está desactivada. ` +
          'Un administrador debe reactivarla para poder enviarla.',
      );
    }
    if (usuario.rol === 'AUDITOR') {
      throw new OperacionRechazada(
        `La registró ${usuario.nombre}, con rol auditor, que no puede registrar operaciones.`,
      );
    }
    return id;
  }

  private async leerToken(token: string): Promise<string> {
    let contenido: ContenidoToken & { iat?: number };
    try {
      contenido = await this.jwt.verifyAsync(token, { ignoreExpiration: true });
    } catch {
      throw new OperacionRechazada('No se pudo comprobar quién registró la operación.');
    }
    if (!contenido.iat || this.ahoraS() - contenido.iat > ANTIGUEDAD_MAXIMA_TOKEN_S) {
      throw new OperacionRechazada(
        'La operación se registró con una sesión demasiado antigua. ' +
          'Quien la registró debe volver a entrar y cargarla de nuevo.',
      );
    }
    return contenido.sub;
  }

  private usuario(id: string) {
    let pendiente = this.cache.get(id);
    if (!pendiente) {
      pendiente = this.buscarUsuario(id);
      this.cache.set(id, pendiente);
    }
    return pendiente;
  }
}
