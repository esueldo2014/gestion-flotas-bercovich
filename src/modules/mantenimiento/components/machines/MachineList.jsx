const ESTADO_COLORS = {
  'Operativo':        { bg: '#dcfce7', text: '#166534' },
  'En taller':        { bg: '#fef9c3', text: '#854d0e' },
  'Fuera de servicio':{ bg: '#fee2e2', text: '#991b1b' },
};

export default function MachineList({ machines, depositos, filterDeposito, onFilterChange, onEdit, onDelete }) {
  const depositoMap = Object.fromEntries(depositos.map(d => [d.id, d]));

  const filtered = filterDeposito
    ? machines.filter(m => String(m.deposito_id) === String(filterDeposito))
    : machines;

  return (
    <div>
      <div style={styles.toolbar}>
        <div style={styles.count}>{filtered.length} máquina{filtered.length !== 1 ? 's' : ''}</div>
        <div style={styles.filterWrap}>
          <label style={styles.filterLabel}>Filtrar por depósito:</label>
          <select value={filterDeposito} onChange={e => onFilterChange(e.target.value)} style={styles.select}>
            <option value="">Todos los depósitos</option>
            {depositos.map(d => (
              <option key={d.id} value={d.id}>{d.code} — {d.name}</option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={styles.empty}>No hay máquinas registradas{filterDeposito ? ' en este depósito' : ''}.</div>
      ) : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {['N° interno','Tipo','Marca / Modelo','Depósito','Estado','Capacidad / Patente','Acciones'].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => {
                const dep = depositoMap[m.deposito_id];
                const estadoStyle = ESTADO_COLORS[m.estado] ?? {};
                return (
                  <tr key={m.id} style={styles.tr}>
                    <td style={{ ...styles.td, fontWeight: 700 }}>{m.numero_interno}</td>
                    <td style={styles.td}>{m.tipo}</td>
                    <td style={styles.td}>{[m.marca, m.modelo, m.anio].filter(Boolean).join(' ')}</td>
                    <td style={styles.td}>{dep ? dep.code : '—'}</td>
                    <td style={styles.td}>
                      <span style={{ ...styles.badge, background: estadoStyle.bg, color: estadoStyle.text }}>
                        {m.estado}
                      </span>
                    </td>
                    <td style={styles.td}>{m.capacidad_patente || '—'}</td>
                    <td style={styles.td}>
                      {onEdit   && <button onClick={() => onEdit(m)} style={styles.btnEdit}>Editar</button>}
                      {onDelete && <button onClick={() => onDelete(m)} style={styles.btnDelete}>Eliminar</button>}
                      {!onEdit && !onDelete && '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const styles = {
  toolbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  count: { fontSize: 14, color: '#666' },
  filterWrap: { display: 'flex', alignItems: 'center', gap: 8 },
  filterLabel: { fontSize: 13, color: '#444', fontWeight: 600 },
  select: { padding: '7px 10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13 },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: {
    textAlign: 'left', padding: '10px 12px', background: '#f1f5f9',
    color: '#374151', fontWeight: 700, borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap',
  },
  tr: { borderBottom: '1px solid #f0f0f0' },
  td: { padding: '10px 12px', verticalAlign: 'middle' },
  badge: {
    display: 'inline-block', padding: '3px 10px', borderRadius: 20,
    fontSize: 12, fontWeight: 600,
  },
  btnEdit: {
    marginRight: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer',
    background: '#e0f2fe', color: '#0369a1', border: 'none', borderRadius: 5, fontWeight: 600,
  },
  btnDelete: {
    padding: '5px 12px', fontSize: 12, cursor: 'pointer',
    background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: 5, fontWeight: 600,
  },
  empty: { textAlign: 'center', padding: 40, color: '#999', fontSize: 15 },
};
