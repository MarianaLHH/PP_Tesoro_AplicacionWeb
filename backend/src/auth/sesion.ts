import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Rol } from '@prisma/client';

/** Lo que el token dice de quien hace la petición. */
export interface UsuarioSesion {
  id: string;
  nombre: string;
  rol: Rol;
}

/** Contenido firmado dentro del JWT. */
export interface ContenidoToken {
  sub: string;
  nombre: string;
  rol: Rol;
}

export const ES_PUBLICO = 'esPublico';

/** Marca una ruta que no exige sesión (login, salud). */
export const Publico = () => SetMetadata(ES_PUBLICO, true);

/** Inyecta el usuario de la sesión en un parámetro del controlador. */
export const UsuarioActual = createParamDecorator(
  (_dato: unknown, ctx: ExecutionContext): UsuarioSesion =>
    ctx.switchToHttp().getRequest<{ usuario: UsuarioSesion }>().usuario,
);
