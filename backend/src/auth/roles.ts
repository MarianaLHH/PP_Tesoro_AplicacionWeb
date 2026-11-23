import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Rol } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsuarioSesion } from './sesion';

export const ROLES = 'roles';

/** Restringe una ruta (o un controlador entero) a ciertos roles. */
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES, roles);

/**
 * Se aplica con `@UseGuards(RolesGuard)` y corre después del `JwtGuard` global.
 *
 * El rol y el estado se leen de la base, no del token: el token puede haberse
 * emitido antes de que el administrador cambiara el rol o desactivara la cuenta.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const permitidos = this.reflector.getAllAndOverride<Rol[] | undefined>(ROLES, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!permitidos?.length) return true;

    const sesion = ctx.switchToHttp().getRequest<{ usuario?: UsuarioSesion }>().usuario;
    if (!sesion) throw new UnauthorizedException('Debe iniciar sesión.');

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: sesion.id },
      select: { rol: true, activo: true },
    });
    if (!usuario?.activo) throw new UnauthorizedException('El usuario no está habilitado.');
    if (!permitidos.includes(usuario.rol)) {
      throw new ForbiddenException('No tiene permiso para esta acción.');
    }
    return true;
  }
}
