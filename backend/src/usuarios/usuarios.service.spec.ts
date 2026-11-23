import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { UsuariosService } from './usuarios.service';

interface Fila {
  id: string;
  nombre: string;
  email: string;
  rol: 'ADMIN' | 'OPERADOR' | 'AUDITOR';
  activo: boolean;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

const ADMIN = '00000000-0000-0000-0000-00000000000a';
const ADMIN2 = '00000000-0000-0000-0000-00000000000b';
const OPERADOR = '00000000-0000-0000-0000-00000000000c';

/** Prisma en memoria, con lo justo que usa el servicio. */
function prismaFalso(filas: Fila[]) {
  const auditoria: unknown[] = [];
  const publico = ({ passwordHash: _p, ...resto }: Fila) => resto;
  const tx = {
    usuario: {
      findUnique: async ({ where, select }: { where: { id: string }; select?: object }) => {
        const f = filas.find((u) => u.id === where.id);
        return f ? (select ? publico(f) : f) : null;
      },
      findMany: async () => filas.map(publico),
      count: async ({ where }: { where: { rol: string; activo: boolean; id: { not: string } } }) =>
        filas.filter(
          (u) => u.rol === where.rol && u.activo === where.activo && u.id !== where.id.not,
        ).length,
      create: async ({ data }: { data: Omit<Fila, 'id' | 'activo' | 'createdAt' | 'updatedAt'> }) => {
        if (filas.some((u) => u.email === data.email)) {
          throw new Prisma.PrismaClientKnownRequestError('único', {
            code: 'P2002',
            clientVersion: 'x',
          });
        }
        const fila: Fila = {
          ...data,
          id: `nuevo-${filas.length}`,
          activo: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        filas.push(fila);
        return publico(fila);
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Fila> }) => {
        if (data.email && filas.some((u) => u.email === data.email && u.id !== where.id)) {
          throw new Prisma.PrismaClientKnownRequestError('único', {
            code: 'P2002',
            clientVersion: 'x',
          });
        }
        const f = filas.find((u) => u.id === where.id)!;
        Object.assign(f, data);
        return publico(f);
      },
    },
    auditoria: { create: async ({ data }: { data: unknown }) => auditoria.push(data) },
  };
  const prisma = { ...tx, $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) };
  return { prisma: prisma as unknown as PrismaService, auditoria };
}

function fila(id: string, rol: Fila['rol'], activo = true, passwordHash = 'x'): Fila {
  return {
    id,
    nombre: id,
    email: `${id}@t.local`,
    rol,
    activo,
    passwordHash,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('UsuariosService', () => {
  it('no deja quitar el rol al último administrador activo', async () => {
    const { prisma } = prismaFalso([fila(ADMIN, 'ADMIN'), fila(ADMIN2, 'ADMIN', false)]);
    const s = new UsuariosService(prisma);
    // Un ADMIN inactivo no cuenta; el autor es otro usuario para aislar la regla.
    await expect(s.editar(ADMIN, { rol: 'OPERADOR' }, { id: ADMIN2 })).rejects.toThrow(
      'Debe quedar al menos un administrador activo.',
    );
    await expect(s.editar(ADMIN, { activo: false }, { id: ADMIN2 })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('permite desactivar a un administrador si queda otro activo', async () => {
    const { prisma, auditoria } = prismaFalso([fila(ADMIN, 'ADMIN'), fila(ADMIN2, 'ADMIN')]);
    const s = new UsuariosService(prisma);
    const r = await s.editar(ADMIN2, { activo: false }, { id: ADMIN });
    expect(r.activo).toBe(false);
    expect(auditoria).toHaveLength(1);
  });

  it('no deja que alguien cambie su propio rol o se desactive', async () => {
    const { prisma } = prismaFalso([fila(ADMIN, 'ADMIN'), fila(ADMIN2, 'ADMIN')]);
    const s = new UsuariosService(prisma);
    await expect(s.editar(ADMIN, { rol: 'AUDITOR' }, { id: ADMIN })).rejects.toThrow(
      'No puede cambiar su propio rol',
    );
    await expect(s.editar(ADMIN, { activo: false }, { id: ADMIN })).rejects.toThrow(
      BadRequestException,
    );
    // Cambiar solo el nombre propio sí se permite.
    await expect(s.editar(ADMIN, { nombre: 'Yo' }, { id: ADMIN })).resolves.toMatchObject({
      nombre: 'Yo',
    });
  });

  it('edita el correo normalizado y rechaza uno que ya usa otra cuenta', async () => {
    const { prisma, auditoria } = prismaFalso([fila(ADMIN, 'ADMIN'), fila(OPERADOR, 'OPERADOR')]);
    const s = new UsuariosService(prisma);
    await expect(
      s.editar(OPERADOR, { email: ' Nuevo@T.local ' }, { id: ADMIN }),
    ).resolves.toMatchObject({ email: 'nuevo@t.local' });
    expect(auditoria).toHaveLength(1);
    await expect(
      s.editar(OPERADOR, { email: `${ADMIN}@t.local` }, { id: ADMIN }),
    ).rejects.toThrow(ConflictException);
    // Guardar el mismo correo que ya tiene no es un conflicto.
    await expect(
      s.editar(OPERADOR, { email: 'nuevo@t.local' }, { id: ADMIN }),
    ).resolves.toMatchObject({ email: 'nuevo@t.local' });
  });

  it('crea usuarios con correo normalizado y sin exponer el hash', async () => {
    const { prisma } = prismaFalso([fila(ADMIN, 'ADMIN')]);
    const s = new UsuariosService(prisma);
    const u = await s.crear(
      { nombre: ' Ana ', email: ' ANA@T.local ', rol: 'OPERADOR', password: 'clave-segura' },
      { id: ADMIN },
    );
    expect(u).toMatchObject({ nombre: 'Ana', email: 'ana@t.local', rol: 'OPERADOR' });
    expect(u).not.toHaveProperty('passwordHash');
  });

  it('rechaza un correo repetido', async () => {
    const { prisma } = prismaFalso([fila(ADMIN, 'ADMIN')]);
    const s = new UsuariosService(prisma);
    await expect(
      s.crear(
        { nombre: 'Otro', email: `${ADMIN}@t.local`, rol: 'OPERADOR', password: 'clave-segura' },
        { id: ADMIN },
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('avisa si el usuario no existe', async () => {
    const { prisma } = prismaFalso([fila(ADMIN, 'ADMIN')]);
    const s = new UsuariosService(prisma);
    await expect(s.editar(OPERADOR, { nombre: 'x' }, { id: ADMIN })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('cambiar la clave propia exige la actual correcta', async () => {
    const hash = await argon2.hash('clave-vieja');
    const filas = [fila(OPERADOR, 'OPERADOR', true, hash)];
    const { prisma } = prismaFalso(filas);
    const s = new UsuariosService(prisma);
    await expect(
      s.cambiarClavePropia(OPERADOR, 'equivocada', 'clave-nueva', { id: OPERADOR }),
    ).rejects.toThrow('La contraseña actual no es correcta.');
    await s.cambiarClavePropia(OPERADOR, 'clave-vieja', 'clave-nueva', { id: OPERADOR });
    expect(await argon2.verify(filas[0].passwordHash, 'clave-nueva')).toBe(true);
  });
});
