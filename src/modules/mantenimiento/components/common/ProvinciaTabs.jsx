export const PROVINCIAS = [
  { id: 'T', label: 'Tucumán' },
  { id: 'S', label: 'Santiago del Estero' },
];

export function esDeProvincia(numeroInterno, provinciaId) {
  const num = (numeroInterno || '').toUpperCase();
  const prefijos = provinciaId === 'S' ? ['S-', 'SC-'] : ['T-'];
  return prefijos.some(p => num.startsWith(p));
}

export default function ProvinciaTabs({ value, onChange }) {
  return (
    <div style={styles.tabs}>
      {PROVINCIAS.map(p => (
        <button key={p.id} onClick={() => onChange(p.id)}
          style={{ ...styles.tab, ...(value === p.id ? styles.tabActive : {}) }}>
          {p.label}
        </button>
      ))}
    </div>
  );
}

const styles = {
  tabs: { display:'flex', gap:6, marginBottom:18, borderBottom:'1px solid #e2e8f0' },
  tab: { background:'transparent', border:'none', borderBottom:'3px solid transparent', color:'#64748b', padding:'9px 16px', cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:'system-ui, sans-serif' },
  tabActive: { color:'#1e40af', borderBottom:'3px solid #2563eb' },
};
