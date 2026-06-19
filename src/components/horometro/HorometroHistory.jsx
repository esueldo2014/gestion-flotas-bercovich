export default function HorometroHistory({ lecturas, maquina }) {
  const unidad = maquina.tipo === 'Autoelevador' ? 'hs' : 'km';

  if (lecturas.length === 0) {
    return <p style={styles.empty}>Sin lecturas registradas todavía.</p>;
  }

  return (
    <div style={styles.wrap}>
      <h4 style={styles.title}>Historial de lecturas</h4>
      <table style={styles.table}>
        <thead>
          <tr>
            {['Fecha', 'Valor', 'Diferencia', 'Usuario'].map(h => (
              <th key={h} style={styles.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lecturas.map((l, i) => {
            const prev = lecturas[i + 1];
            const diff = prev ? (l.valor - prev.valor) : null;
            return (
              <tr key={l.id} style={styles.tr}>
                <td style={styles.td}>{formatFecha(l.fecha)}</td>
                <td style={{ ...styles.td, fontWeight: 700 }}>
                  {Number(l.valor).toLocaleString('es-AR')} {unidad}
                </td>
                <td style={{ ...styles.td, color: '#64748b' }}>
                  {diff !== null ? `+${diff.toLocaleString('es-AR')} ${unidad}` : '—'}
                </td>
                <td style={{ ...styles.td, color: '#94a3b8' }}>{l.usuario || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatFecha(iso) {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const styles = {
  wrap: { marginTop: 8 },
  title: { margin: '0 0 10px', fontSize: 14, color: '#475569', fontWeight: 600 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: {
    textAlign: 'left', padding: '8px 12px', background: '#f1f5f9',
    color: '#374151', fontWeight: 700, borderBottom: '2px solid #e2e8f0',
  },
  tr: { borderBottom: '1px solid #f0f0f0' },
  td: { padding: '8px 12px' },
  empty: { color: '#94a3b8', fontSize: 14, fontStyle: 'italic', margin: '8px 0 0' },
};
