import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../shared/lib/supabaseClient';

export default function EquipoPage() {
  const [usuarios, setUsuarios]   = useState([]);
  const [depositos, setDepositos] = useState([]);
  const [rubros, setRubros]       = useState([]);
  const [asignaciones, setAsignaciones] = useState([]); // usuarios_depositos
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(null);
  const [addRubro, setAddRubro]   = useState({}); // { [usuarioId]: rubroIdSeleccionado }

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [{ data: us }, { data: dep }, { data: rub }, { data: asig }] = await Promise.all([
      supabase.from('usuarios_roles').select('*').order('nombre'),
      supabase.from('sucursales').select('*').order('code'),
      supabase.from('depositos').select('*').order('nombre'),
      supabase.from('usuarios_depositos').select('*'),
    ]);
    setUsuarios(us ?? []);
    setDepositos(dep ?? []);
    setRubros(rub ?? []);
    setAsignaciones(asig ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function handleChange(u, deposito_id) {
    setSaving(u.id);
    await supabase.from('usuarios_roles').update({ deposito_id: deposito_id || null }).eq('id', u.id);
    // al cambiar de sucursal, los depósitos asignados de la sucursal anterior ya no aplican
    await supabase.from('usuarios_depositos').delete().eq('usuario_id', u.id);
    setSaving(null);
    await fetchAll();
  }

  async function handleAgregarRubro(u) {
    const rubroId = addRubro[u.id];
    if (!rubroId) return;
    setSaving(u.id);
    await supabase.from('usuarios_depositos').insert({ usuario_id: u.id, deposito_id: rubroId });
    setSaving(null);
    setAddRubro(a => ({ ...a, [u.id]: '' }));
    await fetchAll();
  }

  async function handleQuitarRubro(u, rubroId) {
    setSaving(u.id);
    await supabase.from('usuarios_depositos').delete().eq('usuario_id', u.id).eq('deposito_id', rubroId);
    setSaving(null);
    await fetchAll();
  }

  const rubroMap = Object.fromEntries(rubros.map(r => [r.id, r]));

  return (
    <div style={styles.page} className="page-padding">
      <div style={styles.header}>
        <h1 style={styles.title}>Equipo</h1>
        <p style={styles.subtitle}>Asigná la sucursal y los depósitos de cada persona (puede tener más de uno), para que los encargados aprueben solo a su gente.</p>
      </div>

      {loading ? <p style={styles.info}>Cargando...</p> : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {['Nombre','Email','Rol','Sucursal','Depósitos asignados'].map(h => <th key={h} style={styles.th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {usuarios.map(u => {
                const misAsignaciones = asignaciones.filter(a => a.usuario_id === u.id);
                const rubrosDeLaSucursal = rubros.filter(r => String(r.sucursal_id) === String(u.deposito_id));
                const rubrosDisponibles = rubrosDeLaSucursal.filter(r => !misAsignaciones.some(a => a.deposito_id === r.id));

                return (
                  <tr key={u.id} style={styles.tr}>
                    <td style={styles.td}>{u.nombre || '—'}</td>
                    <td style={styles.td}>{u.email}</td>
                    <td style={styles.td}>{u.rol}</td>
                    <td style={styles.td}>
                      <select
                        value={u.deposito_id ?? ''}
                        disabled={saving === u.id}
                        onChange={e => handleChange(u, e.target.value)}
                        style={styles.select}
                      >
                        <option value="">Sin asignar</option>
                        {depositos.map(d => <option key={d.id} value={d.id}>{d.code}</option>)}
                      </select>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.rubrosWrap}>
                        {misAsignaciones.map(a => (
                          <span key={a.deposito_id} style={styles.rubroBadge}>
                            {rubroMap[a.deposito_id]?.nombre ?? '?'}
                            <button onClick={() => handleQuitarRubro(u, a.deposito_id)} style={styles.btnX} disabled={saving === u.id}>×</button>
                          </span>
                        ))}
                      </div>
                      {u.deposito_id && rubrosDisponibles.length > 0 && (
                        <div style={styles.addRow}>
                          <select
                            value={addRubro[u.id] ?? ''}
                            onChange={e => setAddRubro(a => ({ ...a, [u.id]: e.target.value }))}
                            style={styles.selectSmall}
                          >
                            <option value="">+ Agregar depósito...</option>
                            {rubrosDisponibles.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                          </select>
                          <button onClick={() => handleAgregarRubro(u)} disabled={!addRubro[u.id] || saving === u.id} style={styles.btnAdd}>Agregar</button>
                        </div>
                      )}
                      {!u.deposito_id && <span style={styles.hint}>Elegí primero una sucursal</span>}
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
  page: { maxWidth:1100, margin:'0 auto', padding:'28px 20px', fontFamily:'system-ui, sans-serif' },
  header: { marginBottom:20 },
  title: { margin:0, fontSize:26, color:'#1a1a2e', fontWeight:700 },
  subtitle: { margin:'4px 0 0', fontSize:14, color:'#64748b' },
  tableWrap: { overflowX:'auto' },
  table: { width:'100%', borderCollapse:'collapse', fontSize:13 },
  th: { textAlign:'left', padding:'9px 12px', background:'#f1f5f9', color:'#374151', fontWeight:700, borderBottom:'2px solid #e2e8f0', whiteSpace:'nowrap' },
  tr: { borderBottom:'1px solid #f0f0f0' },
  td: { padding:'9px 12px', verticalAlign:'middle' },
  select: { padding:'6px 10px', border:'1px solid #ccc', borderRadius:6, fontSize:13 },
  selectSmall: { padding:'5px 8px', border:'1px solid #ccc', borderRadius:6, fontSize:12 },
  rubrosWrap: { display:'flex', flexWrap:'wrap', gap:6, marginBottom:6 },
  rubroBadge: { display:'inline-flex', alignItems:'center', gap:4, background:'#eff6ff', color:'#1e40af', padding:'3px 6px 3px 10px', borderRadius:20, fontSize:12, fontWeight:600 },
  btnX: { background:'none', border:'none', color:'#1e40af', cursor:'pointer', fontSize:14, fontWeight:700, padding:'0 4px', lineHeight:1 },
  addRow: { display:'flex', gap:6, alignItems:'center' },
  btnAdd: { padding:'5px 10px', fontSize:12, cursor:'pointer', background:'#2563eb', color:'#fff', border:'none', borderRadius:5, fontWeight:600 },
  hint: { fontSize:12, color:'#b45309', fontStyle:'italic' },
  info: { color:'#94a3b8', textAlign:'center', padding:40 },
};
