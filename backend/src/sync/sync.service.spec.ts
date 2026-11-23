import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { SyncService } from './sync.service';

const ENVIA = 'aaaaaaaa-0000-0000-0000-000000000000';
const AUTOR = 'bbbbbbbb-0000-0000-0000-000000000000';
const COMPRA = 'cccccccc-0000-0000-0000-000000000000';

const jwt = new JwtService({ secret: 'secreto-de-prueba' });

describe('SyncService · reintentos', () => {
  it('confirma una compra ya guardada aunque su autor se haya desactivado después', async () => {
    const usuarios: Record<string, { nombre: string; rol: string; activo: boolean }> = {
      [ENVIA]: { nombre: 'Envía', rol: 'OPERADOR', activo: true },
      [AUTOR]: { nombre: 'Autor', rol: 'OPERADOR', activo: false },
    };
    const prisma = {
      usuario: { findUnique: async ({ where }: { where: { id: string } }) => usuarios[where.id] ?? null },
      compra: {
        findUnique: async ({ where }: { where: { id: string } }) =>
          where.id === COMPRA ? { numero: 17 } : null,
      },
      $transaction: () => {
        throw new Error('No debería volver a escribir nada.');
      },
    } as unknown as PrismaService;

    const sync = new SyncService(prisma, jwt);
    const autorToken = jwt.sign({ sub: AUTOR, nombre: 'Autor', rol: 'OPERADOR' });
    const op = {
      id: 'dddddddd-0000-0000-0000-000000000000',
      entidad: 'compra' as const,
      entidadId: COMPRA,
      accion: 'crear' as const,
      payload: { id: COMPRA },
      autorToken,
    };

    await expect(
      sync.procesar([op], { id: ENVIA, nombre: 'Envía', rol: 'OPERADOR' }),
    ).resolves.toEqual([{ id: op.id, estado: 'ok', numero: 17 }]);
  });
});
