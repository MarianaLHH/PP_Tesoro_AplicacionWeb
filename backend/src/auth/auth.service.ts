import {
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { ContenidoToken } from './sesion';

const MENSAJE_CREDENCIALES = 'Correo o contraseña incorrectos.';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly log = new Logger('Auth');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.crearAdministradorInicial();
  }

  /**
   * Sin usuarios no hay forma de entrar. Si la base está vacía, se crea un
   * ADMIN con ADMIN_EMAIL / ADMIN_PASSWORD. Una vez que existe alguien, estas
   * variables se ignoran: cambiarlas no altera ninguna cuenta.
   */
  private async crearAdministradorInicial() {
    if ((await this.prisma.usuario.count()) > 0) return;

    const email = this.config.get<string>('ADMIN_EMAIL')?.trim().toLowerCase();
    const password = this.config.get<string>('ADMIN_PASSWORD');
    if (!email || !password) {
      this.log.warn(
        'No hay usuarios. Defina ADMIN_EMAIL y ADMIN_PASSWORD para crear el administrador inicial.',
      );
      return;
    }
    if (password.length < 8) {
      this.log.error('ADMIN_PASSWORD debe tener al menos 8 caracteres. No se creó el administrador.');
      return;
    }

    await this.prisma.usuario.create({
      data: {
        nombre: this.config.get<string>('ADMIN_NOMBRE')?.trim() || 'Administrador',
        email,
        passwordHash: await argon2.hash(password),
        rol: 'ADMIN',
      },
    });
    this.log.log(`Administrador inicial creado: ${email}`);
  }

  async iniciarSesion(email: string, password: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    const valido =
      !!usuario &&
      usuario.activo &&
      (await argon2.verify(usuario.passwordHash, password));
    if (!usuario || !valido) throw new UnauthorizedException(MENSAJE_CREDENCIALES);

    const contenido: ContenidoToken = {
      sub: usuario.id,
      nombre: usuario.nombre,
      rol: usuario.rol,
    };
    return {
      token: await this.jwt.signAsync(contenido),
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
      },
    };
  }
}
