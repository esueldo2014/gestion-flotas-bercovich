import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../shared/lib/supabaseClient';
import { useRole } from '../../../shared/lib/RoleContext';
import ProvinciaTabs, { esDeProvincia } from '../components/common/ProvinciaTabs';
import DepositoResumen from '../components/common/DepositoResumen';

export default function CombustiblePage() {
  const role = useRole();
  const esEM = role?.rol === 'EM';
  const esMecanico = role?.rol === 'Mecánico';
  const scopeSucursal = (esEM || esMecanico) ? role?.deposito_id : null;
  const scopeProvincia = role?.rol === 'Jefe' && role?.provincia_alcance ? role.provincia_alcance : null;
  const [machines, setMachines]   = useState([]);
  const [depositos, setDepositos] = useState([]);
  const [selected, setSelected]   = useState(null);
  const [cargas, setCargas]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState(null);
  const [filterDep, setFilterDep] = useState('');
  const [provincia, setProvincia] = useState('T');

  const [litros, setLitros]       = useState('');
  const [costo, setCosto]         = useState('');
  const [horometro, setHorometro] = useState('');
  const [proveedor, setProveedor] = useState('');

  const fetchMachines = useCallback(async () => {
    setLoading(true);
    const [{ data: maq }, { data: dep }] = await Promise.all([
      supabase.from('maquinas').select('*').order('numero_interno'),
      supabase.from('sucursales').select('*').order('code'),
    ]);
    setMachines(maq ?? []);
    setDepositos(dep ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchMachines(); }, [fetchMachines]);

  useEffect(() => {
    if (scopeSucursal) {
      const suc = depositos.find(d => d.id === scopeSucursal);
      if (suc?.provincia) setProvincia(suc.provincia);
    } else if (scopeProvincia) {
      setProvincia(scopeProvincia);
    }
  }, [scopeSucursal, scopeProvincia, depositos]);

  const fetchCargas = useCallback(async (maqId) => {
    const { data } = await supabase
      .from('cargas_combustible')
      .select('*')
      .eq('maquina_id', maqId)
      .order('fecha', { ascending: false });
    setCargas(data ?? []);
  }, []);

  useEffect(() => {
    if (selected) { fetchCargas(selected.id); setLitros(''); setCosto(''); setHorometro(''); setProveedor(''); }
    else setCargas([]);
  }, [selected, fetchCargas]);

  async function handleGuardar(e) {
    e.preventDefault();
    setError(null);
    const numLitros = parseFloat(litros);
    if (isNaN(numLitros) || numLitros <= 0) { setError('Ingresá una cantidad de litros válida.'); return; }

    setSaving(true);
    const { error: err } = await supabase.from('cargas_combustible').insert({
      maquina_id: selected.id,
      litros: numLitros,
      costo_total: costo ? parseFloat(costo) : null,
      horometro_valor: horometro ? parseFloat(horometro) : null,
      proveedor: proveedor || null,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setLitros(''); setCosto(''); setHorometro(''); setProveedor('');
    await fetchCargas(selected.id);
  }

  const unidad = selected?.tipo === 'Autoelevador' ? 'hs' : 'km';
  const depositosVisibles = scopeSucursal
    ? depositos.filter(d => d.id === scopeSucursal)
    : scopeProvincia
      ? depositos.filter(d => d.provincia === scopeProvincia)
      : depositos;
  const idsVisibles = new Set(depositosVisibles.map(d => d.id));

  const filtered = machines
    .filter(m => esDeProvincia(m.numero_interno, provincia))
    .filter(m => (!scopeSucursal && !scopeProvincia) ? true : idsVisibles.has(m.deposito_id))
    .filter(m => !filterDep || String(m.deposito_id) === String(filterDep));

  // calcular rendimiento entre cargas consecutivas con horómetro registrado
  const cargasConRendimiento = cargas.map((c, i) => {
    const anterior = cargas.slice(i + 1).find(a => a.horometro_valor != null);
    if (!c.horometro_valor || !anterior) return { ...c, rendimiento: null };
    const diff = Number(c.horometro_valor) - Number(anterior.horometro_valor);
    if (diff <= 0) return { ...c, rendimiento: null };
    const rendimiento = Number(c.litros) / diff * (unidad === 'km' ? 100 : 1);
    return { ...c, rendimiento };
  });

  const totalLitrosMes = cargas
    .filter(c => {
      const d = new Date(c.fecha);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((s, c) => s + Number(c.litros), 0);

  return (
    <div style={styles.page} className="page-padding">
      <div style={styles.header}>
        <h1 style={styles.title}>Combustible</h1>
        <p style={styles.subtitle}>Registro de cargas de gasoil por máquina</p>
      </div>

      {!scopeSucursal && !scopeProvincia && (
        <ProvinciaTabs value={provincia} onChange={(p) => { setProvincia(p); setSelected(null); setFilterDep(''); }} />
      )}

      <DepositoResumen
        machines={machines.filter(m => esDeProvincia(m.numero_interno, provincia)).filter(m => (!scopeSucursal && !scopeProvincia) ? true : idsVisibles.has(m.deposito_id))}
        depositos={depositosVisibles}
        selected={filterDep}
        onSelect={(v) => { setFilterDep(v); setSelected(null); }}
      />

      <div style={styles.layout} className="layout-sidebar">
        <div style={styles.sidebar} className="sidebar-block">
          <select value={filterDep} onChange={e => { setFilterDep(e.target.value); setSelected(null); }} style={styles.select}>
            <option value="">Todas las sucursales</option>
            {depositosVisibles.map(d => <option key={d.id} value={d.id}>{d.code} — {d.nombre}</option>)}
          </select>
          {loading ? <p style={styles.info}>Cargando...</p> : (
            <ul style={styles.list}>
              {filtered.map(m => (
                <li key={m.id} onClick={() => setSelected(m)}
                  style={{ ...styles.listItem, ...(selected?.id === m.id ? styles.listItemActive : {}) }}>
                  <span style={styles.listInterno}>{m.numero_interno}</span>
                  <span style={styles.listTipo}>{m.tipo === 'Autoelevador' ? 'AE' : 'CAM'}</span>
                  <span style={styles.listNombre}>{[m.marca, m.modelo].filter(Boolean).join(' ') || '—'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={styles.main}>
          {!selected ? (
            <div style={styles.placeholder}><p>← Seleccioná una máquina para registrar una carga.</p></div>
          ) : (
            <>
              <div style={styles.machineCard}>
                <span style={styles.badge}>{selected.numero_interno}</span>
                <strong>{selected.marca} {selected.modelo}</strong> — {selected.tipo}
                {totalLitrosMes > 0 && <span style={styles.totalMes}> | {totalLitrosMes.toLocaleString('es-AR')} L este mes</span>}
              </div>

              <form onSubmit={handleGuardar} style={styles.form}>
                <div style={styles.formRow}>
                  <div style={styles.field}>
                    <label style={styles.label}>Litros *</label>
                    <input type="number" step="0.1" min="0" value={litros} onChange={e => setLitros(e.target.value)}
                      style={styles.input} required placeholder="0" />
                  </div>
                  <div style={styles.field}>
                    <label style={styles.label}>Costo total ($)</label>
                    <input type="number" step="0.01" min="0" value={costo} onChange={e => setCosto(e.target.value)}
                      style={styles.input} placeholder="0.00" />
                  </div>
                  <div style={styles.field}>
                    <label style={styles.label}>{unidad === 'hs' ? 'Horómetro' : 'Odómetro'} al cargar</label>
                    <input type="number" step="0.1" min="0" value={horometro} onChange={e => setHorometro(e.target.value)}
                      style={styles.input} placeholder={`Valor en ${unidad}`} />
                  </div>
                  <div style={styles.field}>
                    <label style={styles.label}>Proveedor / Estación</label>
                    <input value={proveedor} onChange={e => setProveedor(e.target.value)} style={styles.input} placeholder="Opcional" />
                  </div>
                  <button type="submit" disabled={saving} style={styles.btn}>
                    {saving ? 'Guardando...' : 'Registrar carga'}
                  </button>
                </div>
                {error && <p style={styles.error}>{error}</p>}
              </form>

              {cargas.length > 0 && (
                <div style={styles.section}>
                  <h3 style={styles.sectionTitle}>Historial de cargas</h3>
                  <p style={styles.hint}>
                    Rendimiento calculado automáticamente entre cargas con {unidad === 'hs' ? 'horómetro' : 'odómetro'} registrado.
                  </p>
                  <div className="table-scroll">
                  <table style={styles.table}>
                    <thead><tr>
                      <th style={styles.th}>Fecha</th>
                      <th style={styles.th}>Litros</th>
                      <th style={styles.th}>Costo</th>
                      <th style={styles.th}>{unidad === 'hs' ? 'Horómetro' : 'Odómetro'}</th>
                      <th style={styles.th}>Rendimiento</th>
                      <th style={styles.th}>Proveedor</th>
                    </tr></thead>
                    <tbody>
                      {cargasConRendimiento.map(c => (
                        <tr key={c.id} style={styles.tr}>
                          <td style={styles.td}>{new Date(c.fecha).toLocaleDateString('es-AR')}</td>
                          <td style={{ ...styles.td, fontWeight:700 }}>{Number(c.litros).toLocaleString('es-AR')} L</td>
                          <td style={styles.td}>{c.costo_total != null ? `$${Number(c.costo_total).toLocaleString('es-AR')}` : '—'}</td>
                          <td style={styles.td}>{c.horometro_valor != null ? `${Number(c.horometro_valor).toLocaleString('es-AR')} ${unidad}` : '—'}</td>
                          <td style={styles.td}>
                            {c.rendimiento != null
                              ? <span style={styles.rendimiento}>{c.rendimiento.toFixed(2)} L/{unidad === 'km' ? '100km' : 'hs'}</span>
                              : '—'}
                          </td>
                          <td style={styles.td}>{c.proveedor || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { maxWidth:1100, margin:'0 auto', padding:'28px 20px', fontFamily:'system-ui, sans-serif' },
  header: { marginBottom:18 },
  title: { margin:0, fontSize:26, color:'#1a1a2e', fontWeight:700 },
  subtitle: { margin:'4px 0 0', color:'#888', fontSize:14 },
  layout: { display:'grid', gridTemplateColumns:'240px 1fr', gap:24, alignItems:'start' },
  sidebar: { border:'1px solid #e2e8f0', borderRadius:10, overflow:'hidden', background:'#fff', position:'sticky', top:64 },
  select: { width:'100%', padding:'10px 12px', border:'none', borderBottom:'1px solid #f0f0f0', fontSize:13, background:'#f8fafc' },
  list: { listStyle:'none', margin:0, padding:0, maxHeight:'70vh', overflowY:'auto' },
  listItem: { display:'grid', gridTemplateColumns:'auto 30px 1fr', gap:8, padding:'10px 14px', cursor:'pointer', alignItems:'center', borderBottom:'1px solid #f8f8f8', fontSize:13 },
  listItemActive: { background:'#eff6ff' },
  listInterno: { fontWeight:700, color:'#1e40af' },
  listTipo: { fontSize:10, fontWeight:700, background:'#e0f2fe', color:'#0369a1', borderRadius:4, padding:'1px 4px', textAlign:'center' },
  listNombre: { color:'#555', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  main: { minHeight:300 },
  placeholder: { background:'#f8fafc', border:'2px dashed #e2e8f0', borderRadius:10, padding:40, textAlign:'center', color:'#94a3b8', fontSize:15 },
  machineCard: { background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:'12px 16px', marginBottom:16, fontSize:14, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' },
  badge: { background:'#2563eb', color:'#fff', borderRadius:6, padding:'2px 10px', fontSize:13, fontWeight:700 },
  totalMes: { color:'#64748b', fontSize:13 },
  form: { background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, padding:'16px 20px', marginBottom:20 },
  formRow: { display:'flex', gap:12, alignItems:'flex-end', flexWrap:'wrap' },
  field: { display:'flex', flexDirection:'column', gap:4 },
  label: { fontSize:13, fontWeight:600, color:'#444' },
  input: { padding:'8px 10px', border:'1px solid #ccc', borderRadius:6, fontSize:14, minWidth:140 },
  btn: { background:'#2563eb', color:'#fff', border:'none', borderRadius:6, padding:'9px 20px', fontSize:14, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' },
  error: { color:'#c0392b', fontSize:13, marginTop:8 },
  section: { background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, padding:'16px 20px' },
  sectionTitle: { margin:'0 0 4px', fontSize:15, fontWeight:700, color:'#1a1a2e' },
  hint: { margin:'0 0 12px', fontSize:12, color:'#94a3b8' },
  table: { width:'100%', borderCollapse:'collapse', fontSize:13 },
  th: { textAlign:'left', padding:'8px 12px', background:'#f8fafc', color:'#374151', fontWeight:700, borderBottom:'2px solid #e2e8f0' },
  tr: { borderBottom:'1px solid #f0f0f0' },
  td: { padding:'9px 12px', verticalAlign:'middle' },
  rendimiento: { fontWeight:700, color:'#2563eb' },
  info: { padding:16, color:'#94a3b8', fontSize:13 },
};
