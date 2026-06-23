export default function DepositoResumen({ machines, depositos, selected, onSelect }) {
  const counts = {};
  machines.forEach(m => {
    counts[m.deposito_id] = (counts[m.deposito_id] ?? 0) + 1;
  });

  const cards = depositos
    .filter(d => counts[d.id])
    .map(d => ({
      ...d,
      total: counts[d.id],
      operativas: machines.filter(m => m.deposito_id === d.id && m.estado === 'Operativo').length,
    }));

  if (cards.length === 0) return null;

  return (
    <div style={styles.grid}>
      {cards.map(d => (
        <button key={d.id} onClick={() => onSelect(String(selected) === String(d.id) ? '' : d.id)}
          style={{ ...styles.card, ...(String(selected) === String(d.id) ? styles.cardActive : {}) }}>
          <div style={styles.code}>{d.code}</div>
          <div style={styles.total}>{d.total}</div>
          <div style={styles.sub}>{d.operativas} operativas</div>
        </button>
      ))}
    </div>
  );
}

const styles = {
  grid: { display:'flex', gap:12, flexWrap:'wrap', marginBottom:20 },
  card: {
    background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, padding:'14px 18px',
    minWidth:110, cursor:'pointer', textAlign:'left', fontFamily:'system-ui, sans-serif',
  },
  cardActive: { borderColor:'#2563eb', background:'#eff6ff' },
  code: { fontSize:12, fontWeight:700, color:'#64748b' },
  total: { fontSize:24, fontWeight:800, color:'#1e293b', marginTop:2 },
  sub: { fontSize:11, color:'#94a3b8', marginTop:2 },
};
