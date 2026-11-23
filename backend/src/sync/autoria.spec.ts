import { JwtService } from '@nestjs/jwt';
import { ANTIGUEDAD_MAXIMA_TOKEN_S, DatosAutor, ResolutorAutoria } from './autoria';

const A = 'aaaaaaaa-0000-0000-0000-000000000000';
const B = 'bbbbbbbb-0000-0000-0000-000000000000';
const AUDITOR = 'cccccccc-0000-0000-0000-000000000000';
const INACTIVO = 'dddddddd-0000-0000-0000-000000000000';

const usuarios: Record<string, DatosAutor> = {
  [A]: { nombre: 'Ana', rol: 'OPERADOR', activo: true },
  [B]: { nombre: 'Beto', rol: 'OPERADOR', activo: true },
  [AUDITOR]: { nombre: 'Ciro', rol: 'AUDITOR', activo: true },
  [INACTIVO]: { nombre: 'Dora', rol: 'OPERADOR', activo: false },
};

const jwt = new JwtService({ secret: 'secreto-de-prueba' });
const ahora = Math.floor(Date.now() / 1000);

function token(sub: string, opciones: { iat?: number; exp?: number; secreto?: string } = {}) {
  const iat = opciones.iat ?? ahora;
  return jwt.sign(
    { sub, nombre: 'x', rol: 'OPERADOR', iat, exp: opciones.exp ?? iat + 8 * 3600 },
    opciones.secreto ? { secret: opciones.secreto } : {},
  );
}

function resolutor() {
  const consultas: string[] = [];
  const r = new ResolutorAutoria(jwt, async (id) => {
    consultas.push(id);
    return usuarios[id] ?? null;
  });
  return { r, consultas };
}

describe('ResolutorAutoria', () => {
  it('atribuye la operación a quien la registró, no a quien la envía', async () => {
    const { r } = resolutor();
    await expect(r.autor(token(A), B)).resolves.toBe(A);
  });

  it('acepta el token aunque esté vencido (se registró sin conexión)', async () => {
    const { r } = resolutor();
    const vencido = token(A, { iat: ahora - 5 * 24 * 3600 });
    await expect(r.autor(vencido, B)).resolves.toBe(A);
  });

  it('rechaza un token con firma ajena (no se puede suplantar al autor)', async () => {
    const { r } = resolutor();
    await expect(r.autor(token(A, { secreto: 'otro' }), B)).rejects.toThrow(
      'No se pudo comprobar quién registró la operación.',
    );
    await expect(r.autor('basura', B)).rejects.toThrow('No se pudo comprobar');
  });

  it('rechaza una sesión más antigua que el límite', async () => {
    const { r } = resolutor();
    const viejo = token(A, { iat: ahora - ANTIGUEDAD_MAXIMA_TOKEN_S - 60 });
    await expect(r.autor(viejo, B)).rejects.toThrow('sesión demasiado antigua');
  });

  it('sin token (operaciones encoladas antes del cambio) el autor es quien envía', async () => {
    const { r } = resolutor();
    await expect(r.autor(undefined, B)).resolves.toBe(B);
  });

  it('rechaza autores desactivados, auditores o inexistentes', async () => {
    const { r } = resolutor();
    await expect(r.autor(token(INACTIVO), B)).rejects.toThrow('Dora, cuya cuenta está desactivada');
    await expect(r.autor(token(AUDITOR), B)).rejects.toThrow('rol auditor');
    await expect(r.autor(token('eeeeeeee-0000-0000-0000-000000000000'), B)).rejects.toThrow(
      'ya no existe',
    );
  });

  it('consulta cada usuario una sola vez por envío', async () => {
    const { r, consultas } = resolutor();
    await r.autor(token(A), B);
    await r.autor(token(A), B);
    await r.autor(undefined, B);
    expect(consultas).toEqual([A, B]);
  });
});
