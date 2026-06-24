import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../shared/lib/supabaseClient';

export default function EquipoPage() {
  const [usuarios, setUsuarios]   = useState([]);
  const [depositos, setDepositos] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [{ data: us }, { data: dep }] = await Promise.all([
      supabase.from('usuarios_roles').select('*').order('nombre'),
      supabase.from('sucursales').select('*').order('code'),
    ]);
    setUsuarios(us ?? []);
    setDepositos(dep ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function handleChange(u, deposito_id) {
    setSaving(u.id);
    await supabase.from('usuarios_roles').update({ deposito_id: deposito_id || null }).eq('id', u.id);
    setSaving(null);
    await fetchAll();
  }

  return (
    <div style={styles.page} className="page-padding">
      <div style={styles.header}>
        <h1 style={styles.title}>Equipo</h1>
        <p style={styles.subtitle}>Asigná la sucursal de cada persona, para que los encargados aprueben solo a su gente.</p>
      </div>

      {loading ? <p style={styles.info}>Cargando...</p> : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {['Nombre','Email','Rol','Sucursal'].map(h => <th key={h} style={styles.th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {usuarios.map(u => (
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: { maxWidth:1000, margin:'0 auto', padding:'28px 20px', fontFamily:'system-ui, sans-serif' },
  header: { marginBottom:20 },
  title: { margin:0, fontSize:26, color:'#1a1a2e', fontWeight:700 },
  subtitle: { margin:'4px 0 0', fontSize:14, color:'#64748b' },
  tableWrap: { overflowX:'auto' },
  table: { width:'100%', borderCollapse:'collapse', fontSize:13 },
  th: { textAlign:'left', padding:'9px 12px', background:'#f1f5f9', color:'#374151', fontWeight:700, borderBottom:'2px solid #e2e8f0', whiteSpace:'nowrap' },
  tr: { borderBottom:'1px solid #f0f0f0' },
  td: { padding:'9px 12px', verticalAlign:'middle' },
  select: { padding:'6px 10px', border:'1px solid #ccc', borderRadius:6, fontSize:13 },
  info: { color:'#94a3b8', textAlign:'center', padding:40 },
};
