import { useState } from 'react';

const MODULE_ICONS = { mantenimiento: '🔧', rrhh: '👥' };

const TASK_ICONS = {
  dashboard:      '📊',
  horometro:      '⏱️',
  combustible:    '⛽',
  preventivo:     '🛠️',
  correctivos:    '🔧',
  edilicio:       '🏢',
  informe:        '📄',
  capacitaciones: '🎓',
  hhee:           '⏰',
  compensatorios: '📅',
  vacaciones:     '🏖️',
};

export default function HomePage({ modulos, onEnter }) {
  const [selected, setSelected] = useState(null);
  const modulo = modulos.find(m => m.id === selected);

  if (!modulo) {
    return (
      <div style={styles.page} className="page-padding">
        <div style={styles.header}>
          <h1 style={styles.title}>¿Qué querés hacer?</h1>
          <p style={styles.subtitle}>Elegí un módulo</p>
        </div>
        <div style={styles.grid}>
          {modulos.map(m => (
            <button key={m.id} onClick={() => setSelected(m.id)} style={styles.card}>
              <span style={styles.icon}>{MODULE_ICONS[m.id] ?? '📁'}</span>
              <span style={styles.label}>{m.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const tareas = modulo.nav.filter(n => n.id !== 'inicio');

  return (
    <div style={styles.page} className="page-padding">
      <div style={styles.header}>
        <button onClick={() => setSelected(null)} style={styles.back}>← Módulos</button>
        <h1 style={styles.title}>{modulo.label}</h1>
        <p style={styles.subtitle}>Tocá una sección para entrar</p>
      </div>
      <div style={styles.grid}>
        {tareas.map(n => (
          <button key={n.id} onClick={() => onEnter(modulo.id, n.id)} style={styles.card}>
            {n.id === 'maquinas'
              ? <img src="/icono-maquinas.jpg" alt="Máquinas" style={styles.iconImg} />
              : <span style={styles.icon}>{TASK_ICONS[n.id] ?? '📋'}</span>}
            <span style={styles.label}>{n.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const styles = {
  page: { maxWidth:1000, margin:'0 auto', padding:'40px 20px', fontFamily:'system-ui, sans-serif' },
  header: { marginBottom:32, textAlign:'center', position:'relative' },
  back: { position:'absolute', left:0, top:0, background:'transparent', border:'none', color:'#2563eb', fontSize:14, fontWeight:600, cursor:'pointer' },
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
  iconImg: { height:44, objectFit:'contain' },
  label: { fontSize:15, fontWeight:700, color:'#1e293b', textAlign:'center' },
};
