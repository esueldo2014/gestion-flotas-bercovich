export default function HomePage({ nav, onNavigate }) {
  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>¿Qué querés hacer?</h1>
        <p style={styles.subtitle}>Tocá una sección para entrar</p>
      </div>

      <div style={styles.grid}>
        {nav.map(n => (
          <button key={n.id} onClick={() => onNavigate(n.id)} style={styles.card}>
            <span style={styles.icon}>{ICONS[n.id] ?? '📋'}</span>
            <span style={styles.label}>{n.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const ICONS = {
  dashboard:   '📊',
  maquinas:    '🚜',
  horometro:   '⏱️',
  preventivo:  '🛠️',
  correctivos: '🔧',
};

const styles = {
  page: { maxWidth:1000, margin:'0 auto', padding:'40px 20px', fontFamily:'system-ui, sans-serif' },
  header: { marginBottom:32, textAlign:'center' },
  title: { margin:0, fontSize:28, color:'#1a1a2e', fontWeight:700 },
  subtitle: { margin:'6px 0 0', color:'#888', fontSize:15 },
  grid: { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:18 },
  card: {
    display:'flex', flexDirection:'column', alignItems:'center', gap:12,
    background:'#fff', border:'1px solid #e2e8f0', borderRadius:14,
    padding:'32px 16px', cursor:'pointer', fontFamily:'system-ui, sans-serif',
    transition:'transform 0.1s, box-shadow 0.1s', boxShadow:'0 1px 3px rgba(0,0,0,0.05)',
  },
  icon: { fontSize:40 },
  label: { fontSize:15, fontWeight:700, color:'#1e293b', textAlign:'center' },
};
