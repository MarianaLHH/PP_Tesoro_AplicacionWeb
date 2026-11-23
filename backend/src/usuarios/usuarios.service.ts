import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { CrearUsuarioDto, EditarUsuarioDto } from './usuarios.dto';

type Tx = Prisma.TransactionClient;

/** Lo que se expone de un usuario. Nunca incluye `passwordHash`. */
const CAMPOS_PUBLICOS = {
  id: true,
  nombre: true,
  email: true,
  rol: true,
  activo: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UsuarioSelect;

export type UsuarioPublico = Prisma.UsuarioGetPayload<{ select: typeof CAMPOS_PUBLICOS }>;

/** Quién hace el cambio, para la auditoría. */
export interface Autor {
  id: string;
  dispositivoId?: string | null;
}

/**
 * Altas, cambios y desactivación de cuentas. Los usuarios no se borran:
 * compras, ventas y auditoría los referencian.
 */
@Injectable()
export class UsuariosService {
  constructor(private readonly prisma: PrismaService) {}

  listar(): Promise<UsuarioPublico[]> {
    return this.prisma.usuario.findMany({
      select: CAMPOS_PUBLICOS,
      orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
    });
  }

  async crear(dto: CrearUsuarioDto, autor: Autor): Promise<UsuarioPublico> {
    const passwordHash = await argon2.hash(dto.password);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const usuario = await tx.usuario.create({
          data: {
            nombre: dto.nombre.trim(),
            email: normalizarEmail(dto.email),
            rol: dto.rol,
            passwordHash,
          },
          select: CAMPOS_PUBLICOS,
        });
        await auditar(tx, autor, usuario.id, 'CREAR', null, usuario);
        return usuario;
      });
    } catch (e) {
      throw correoRepetido(e);
    }
  }

  async editar(id: string, dto: EditarUsuarioDto, autor: Autor): Promise<UsuarioPublico> {
    try {
      return await this.editarEnTransaccion(id, dto, autor);
    } catch (e) {
      throw correoRepetido(e);
    }
  }

  private editarEnTransaccion(
    id: string,
    dto: EditarUsuarioDto,
    autor: Autor,
  ): Promise<UsuarioPublico> {
    return this.prisma.$transaction(async (tx) => {
      const antes = await buscar(tx, id);

      const quitaRol = dto.rol !== undefined && dto.rol !== antes.rol;
      const desactiva = dto.activo === false && antes.activo;
      if (id === autor.id && (quitaRol || desactiva)) {
        throw new BadRequestException(
          'No puede cambiar su propio rol ni desactivarse. Pídaselo a otro administrador.',
        );
      }
      const dejaDeSerAdminActivo =
        antes.rol === 'ADMIN' && antes.activo && (quitaRol || desactiva);
      if (dejaDeSerAdminActivo) await exigirOtroAdmin(tx, id);

      const despues = await tx.usuario.update({
        where: { id },
        data: {
          ...(dto.nombre !== undefined && { nombre: dto.nombre.trim() }),
          ...(dto.email !== undefined && { email: normalizarEmail(dto.email) }),
          ...(dto.rol !== undefined && { rol: dto.rol }),
          ...(dto.activo !== undefined && { activo: dto.activo }),
        },
        select: CAMPOS_PUBLICOS,
      });
      await auditar(tx, autor, id, 'EDITAR', antes, despues);
      return despues;
    });
  }

  /** El administrador asigna una clave nueva (reemplaza la recuperación por correo). */
  async restablecerClave(id: string, password: string, autor: Autor): Promise<void> {
    const passwordHash = await argon2.hash(password);
    await this.prisma.$transaction(async (tx) => {
      await buscar(tx, id);
      await tx.usuario.update({ where: { id }, data: { passwordHash } });
      await auditar(tx, autor, id, 'EDITAR', null, { claveRestablecida: true });
    });
  }

  /** Cualquier usuario cambia su propia clave, confirmando la actual. */
  async cambiarClavePropia(
    id: string,
    actual: string,
    nueva: string,
    autor: Autor,
  ): Promise<void> {
    const usuario = await this.prisma.usuario.findUnique({ where: { id } });
    if (!usuario?.activo) throw new UnauthorizedException('El usuario no está habilitado.');
    if (!(await argon2.verify(usuario.passwordHash, actual))) {
      throw new BadRequestException('La contraseña actual no es correcta.');
    }
    if (actual === nueva) {
      throw new BadRequestException('La contraseña nueva debe ser distinta de la actual.');
    }
    const passwordHash = await argon2.hash(nueva);
    await this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({ where: { id }, data: { passwordHash } });
      await auditar(tx, autor, id, 'EDITAR', null, { claveCambiada: true });
    });
  }
}

function normalizarEmail(email: string) {
  return email.trim().toLowerCase();
}

/** El índice único de `email` se traduce a un mensaje para el administrador. */
function correoRepetido(e: unknown): unknown {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    return new ConflictException('Ya existe un usuario con ese correo.');
  }
  return e;
}

async function buscar(tx: Tx, id: string): Promise<UsuarioPublico> {
  const usuario = await tx.usuario.findUnique({ where: { id }, select: CAMPOS_PUBLICOS });
  if (!usuario) throw new NotFoundException('El usuario no existe.');
  return usuario;
}

/** Sin al menos un ADMIN activo nadie podría administrar las cuentas. */
async function exigirOtroAdmin(tx: Tx, excepto: string) {
  const otros = await tx.usuario.count({
    where: { rol: 'ADMIN', activo: true, id: { not: excepto } },
  });
  if (otros === 0) {
    throw new BadRequestException('Debe quedar al menos un administrador activo.');
  }
}

function auditar(
  tx: Tx,
  autor: Autor,
  usuarioAfectado: string,
  accion: 'CREAR' | 'EDITAR',
  antes: object | null,
  despues: object,
) {
  return tx.auditoria.create({
    data: {
      entidad: 'usuario',
      entidadId: usuarioAfectado,
      accion,
      datosAntes: antes ? (JSON.parse(JSON.stringify(antes)) as Prisma.InputJsonValue) : Prisma.JsonNull,
      datosDespues: JSON.parse(JSON.stringify(despues)) as Prisma.InputJsonValue,
      usuarioId: autor.id,
      dispositivoId: autor.dispositivoId ?? null,
    },
  });
}
