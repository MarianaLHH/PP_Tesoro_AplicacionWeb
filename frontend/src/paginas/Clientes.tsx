import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, encolar } from '../db/db';

/** Personas naturales a las que se les compra el oro. */
export default function Clientes() {
  const clientes = useLiveQuery(() => db.clientes.orderBy('nombre').toArray(), []);

  const [nombre, setNombre] = useState('');
  const [ci, setCi] = useState('');
  const [telefono, setTelefono] = useState('');

  async function guardar() {
    if (!nombre.trim()) return;
    const cliente = {
      id: crypto.randomUUID(),
      nombre: nombre.trim(),
      ci: ci.trim() || undefined,
      telefono: telefono.trim() || undefined,
      activo: true,
      actualizadoEn: new Date().toISOString(),
      estadoSync: 'pendiente' as const,
    };
    await db.clientes.add(cliente);
    await encolar('cliente', cliente.id, 'crear', cliente);
    setNombre('');
    setCi('');
    setTelefono('');
  }

  return (
    <section>
      <header className="encabezado-pagina">
        <h2>Clientes</h2>
      </header>

      <div className="campos">
        <label>
          Nombre
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label>
          CI
          <input value={ci} onChange={(e) => setCi(e.target.value)} />
        </label>
        <label>
          Teléfono
          <input
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
          />
        </label>
      </div>

      <button className="primario" disabled={!nombre.trim()} onClick={guardar}>
        Agregar cliente
      </button>

      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>CI</th>
            <th>Teléfono</th>
            <th>Sync</th>
          </tr>
        </thead>
        <tbody>
          {clientes?.map((c) => (
            <tr key={c.id}>
              <td>{c.nombre}</td>
              <td>{c.ci ?? '—'}</td>
              <td>{c.telefono ?? '—'}</td>
              <td>{c.estadoSync === 'pendiente' ? '⏳' : '✓'}</td>
            </tr>
          ))}
          {clientes?.length === 0 && (
            <tr>
              <td colSpan={4}>Sin clientes registrados.</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
