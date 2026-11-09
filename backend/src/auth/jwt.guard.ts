import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { ContenidoToken, ES_PUBLICO, UsuarioSesion } from './sesion';

/**
 * Guard global: toda ruta de la API exige un JWT válido salvo las marcadas
 * con `@Publico()`. La PWA servida como estáticos no pasa por aquí.
 */
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const publico = this.reflector.getAllAndOverride<boolean>(ES_PUBLICO, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (publico) return true;

    const req = ctx
      .switchToHttp()
      .getRequest<Request & { usuario?: UsuarioSesion }>();
    const [tipo, token] = req.headers.authorization?.split(' ') ?? [];
    if (tipo !== 'Bearer' || !token) {
      throw new UnauthorizedException('Debe iniciar sesión.');
    }

    try {
      const contenido = await this.jwt.verifyAsync<ContenidoToken>(token);
      req.usuario = {
        id: contenido.sub,
        nombre: contenido.nombre,
        rol: contenido.rol,
      };
    } catch {
      throw new UnauthorizedException('La sesión venció o no es válida.');
    }
    return true;
  }
}
