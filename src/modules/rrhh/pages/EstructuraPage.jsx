import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../shared/lib/supabaseClient';

export default function EstructuraPage() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterSucursal, setFilterSucursal] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [{ data: sucursales }, { data: depositos }, { data: usuarios }, { data: personal }] = await Promise.all([
      supabase.from('sucursales').select('*').order('code'),
      supabase.from('depositos').select('*').order('nombre'),
      supabase.from('usuarios_roles').select('id, nombre, email, rol, deposito_id, rubro_deposito_id'),
      supabase.from('personal').select('id, nombre, deposito_id, rubro_deposito_id').eq('activo', true),
    ]);
    setData({ sucursales: sucursales ?? [], depositos: depositos ?? [], usuarios: usuarios ?? [], personal: personal ?? [] });
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (loading || !data) return <div style={styles.page} className="page-padding"><p style={styles.info}>Cargando...</p></div>;

  const { sucursales, depositos, usuarios, personal } = data;
  const sucursalesFiltradas = filterSucursal ? sucursales.filter(s => String(s.id) === filterSucursal) : sucursales;

  return (
    <div style={styles.page} className="page-padding">
      <div style={styles.header}>
        <h1 style={styles.title}>Estructura organizativa</h1>
        <p style={styles.subtitle}>Jefes (EM) y personal asignado por sucursal y depósito</p>
      </div>

      <select value={filterSucursal} onChange={e => setFilterSucursal(e.target.value)} style={styles.select}>
        <option value="">Todas las sucursales</option>
        {sucursales.map(s => <option key={s.id} value={s.id}>{s.code} — {s.nombre}</option>)}
      </select>

      {sucursalesFiltradas.map(suc => {
        const depsDeSucursal = depositos.filter(d => d.sucursal_id === suc.id);
        const usuariosSinDeposito = usuarios.filter(u => u.deposito_id === suc.id && !u.rubro_deposito_id);
        if (depsDeSucursal.length === 0 && usuariosSinDeposito.length === 0) return null;

        return (
          <div key={suc.id} style={styles.sucursalCard}>
            <h2 style={styles.sucursalTitle}>{suc.code} — {suc.nombre}</h2>

            {usuariosSinDeposito.length > 0 && (
              <div style={styles.sinDeposito}>
                {usuariosSinDeposito.map(u => (
                  <span key={u.id} style={styles.jefeBadgeLoose}>{u.nombre || u.email} ({u.rol})</span>
                ))}
              </div>
            )}

            <div style={styles.depGrid}>
              {depsDeSucursal.map(dep => {
                const jefes = usuarios.filter(u => u.rubro_deposito_id === dep.id);
                const gente = personal.filter(p => p.rubro_deposito_id === dep.id);
                if (jefes.length === 0 && gente.length === 0) return null;

                return (
                  <div key={dep.id} style={styles.depCard}>
                    <h3 style={styles.depTitle}>{dep.nombre}</h3>

                    {jefes.length === 0 ? (
                      <p style={styles.sinJefe}>Sin jefe asignado</p>
                    ) : (
                      jefes.map(j => (
                        <div key={j.id} style={styles.jefeRow}>
                          <span style={styles.jefeBadge}>{j.rol}</span>
                          <span style={styles.jefeNombre}>{j.nombre || j.email}</span>
                        </div>
                      ))
                    )}

                    {gente.length > 0 && (
                      <ul style={styles.personalList}>
                        {gente.map(p => <li key={p.id} style={styles.personalItem}>{p.nombre}</li>)}
                      </ul>
                    )}
                    {gente.length === 0 && <p style={styles.sinGente}>Sin personal asignado</p>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  page: { maxWidth:1200, margin:'0 auto', padding:'28px 20px', fontFamily:'system-ui, sans-serif' },
  header: { marginBottom:16 },
  title: { margin:0, fontSize:26, color:'#1a1a2e', fontWeight:700 },
  subtitle: { margin:'4px 0 0', fontSize:14, color:'#64748b' },
  select: { padding:'9px 12px', border:'1px solid #ccc', borderRadius:7, fontSize:14, marginBottom:20 },
  sucursalCard: { marginBottom:28 },
  sucursalTitle: { fontSize:19, fontWeight:700, color:'#1a1a2e', marginBottom:12, borderBottom:'2px solid #e2e8f0', paddingBottom:8 },
  sinDeposito: { display:'flex', gap:8, flexWrap:'wrap', marginBottom:12 },
  jefeBadgeLoose: { fontSize:12, background:'#eff6ff', color:'#1e40af', padding:'4px 10px', borderRadius:20, fontWeight:600 },
  depGrid: { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))', gap:14 },
  depCard: { background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, padding:'14px 16px' },
  depTitle: { fontSize:14, fontWeight:700, color:'#1a1a2e', margin:'0 0 10px' },
  jefeRow: { display:'flex', alignItems:'center', gap:8, marginBottom:8 },
  jefeBadge: { fontSize:10, fontWeight:700, background:'#2563eb', color:'#fff', padding:'2px 8px', borderRadius:20 },
  jefeNombre: { fontSize:13, fontWeight:600, color:'#1e293b' },
  sinJefe: { fontSize:12, color:'#b45309', fontStyle:'italic', margin:'0 0 8px' },
  personalList: { listStyle:'none', margin:'8px 0 0', padding:0, borderTop:'1px solid #f1f5f9', paddingTop:8 },
  personalItem: { fontSize:13, color:'#475569', padding:'3px 0' },
  sinGente: { fontSize:12, color:'#94a3b8', fontStyle:'italic', marginTop:8 },
  info: { color:'#94a3b8', textAlign:'center', padding:40 },
};
