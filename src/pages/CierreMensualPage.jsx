import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export default function CierreMensualPage() {
  const [machines, setMachines]   = useState([]);
  const [depositos, setDepositos] = useState([]);
  const [selected, setSelected]   = useState(null);
  const [cierres, setCierres]     = useState([]);
  const [filterDep, setFilterDep] = useState('');
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState(null);

  const now = new Date();
  const [anio, setAnio]   = useState(now.getFullYear());
  const [mes, setMes]     = useState(now.getMonth() + 1);
  const [lectura, setLectura] = useState('');

  const fetchMachines = useCallback(async () => {
    setLoading(true);
    const [{ data: maq }, { data: dep }] = await Promise.all([
      supabase.from('maquinas').select('*').order('numero_interno'),
      supabase.from('depositos').select('*').order('code'),
    ]);
    setMachines(maq ?? []);
    setDepositos(dep ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchMachines(); }, [fetchMachines]);

  const fetchCierres = useCallback(async (maqId) => {
    const { data } = await supabase
      .from('cierres_mensuales')
      .select('*')
      .eq('maquina_id', maqId)
      .order('anio', { ascending: false })
      .order('mes',  { ascending: false });
    setCierres(data ?? []);
  }, []);

  useEffect(() => {
    if (selected) { fetchCierres(selected.id); setLectura(''); }
    else setCierres([]);
  }, [selected, fetchCierres]);

  async function handleGuardar(e) {
    e.preventDefault();
    setError(null);
    const lect = parseFloat(lectura);
    if (isNaN(lect) || lect <= 0) { setError('Ingresá una lectura válida.'); return; }

    // calcular horas de uso: lectura actual - lectura del mes anterior (o hora_inicial)
    const anterior = cierres.find(c => {
      if (mes === 1) return c.anio === anio - 1 && c.mes === 12;
      return c.anio === anio && c.mes === mes - 1;
    });
    const base = anterior
      ? Number(anterior.lectura)
      : (selected.hora_inicial ?? null);
    const horasUso = base !== null ? lect - base : null;

    if (horasUso !== null && horasUso < 0) {
      setError('La lectura debe ser mayor a la del mes anterior.'); return;
    }

    setSaving(true);
    const { error: err } = await supabase.from('cierres_mensuales').upsert({
      maquina_id: selected.id,
      anio, mes,
      lectura: lect,
      horas_uso: horasUso,
    }, { onConflict: 'maquina_id,anio,mes' });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setLectura('');
    await fetchCierres(selected.id);
  }

  const filtered = filterDep
    ? machines.filter(m => String(m.deposito_id) === String(filterDep))
    : machines;

  const unidad = selected?.tipo === 'Autoelevador' ? 'hs' : 'km';
  const yaExiste = cierres.some(c => c.anio === anio && c.mes === mes);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Cierre mensual de horómetro</h1>
        <p style={styles.subtitle}>Registrá la lectura al cierre de cada mes para calcular horas de uso</p>
      </div>

      <div style={styles.layout}>
        {/* Sidebar */}
        <div style={styles.sidebar}>
          <select value={filterDep} onChange={e => { setFilterDep(e.target.value); setSelected(null); }} style={styles.select}>
            <option value="">Todos los depósitos</option>
            {depositos.map(d => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
          </select>
          {loading ? <p style={styles.info}>Cargando...</p> : (
            <ul style={styles.list}>
              {filtered.map(m => (
                <li key={m.id} onClick={() => setSelected(m)}
                  style={{ ...styles.listItem, ...(selected?.id === m.id ? styles.listItemActive : {}) }}>
                  <span style={styles.listInterno}>{m.numero_interno}</span>
                  <span style={styles.listDep}>{depositos.find(d => d.id === m.deposito_id)?.code ?? '—'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Main */}
        <div style={styles.main}>
          {!selected ? (
            <div style={styles.placeholder}><p>← Seleccioná una máquina para registrar el cierre mensual.</p></div>
          ) : (
            <>
              {/* Info máquina */}
              <div style={styles.machineCard}>
                <div>
                  <strong>{selected.numero_interno}</strong> — {selected.marca ?? ''} {selected.modelo ?? ''}
                  <span style={styles.dep}> | {depositos.find(d => d.id === selected.deposito_id)?.code ?? '—'}</span>
                </div>
                {selected.hora_inicial != null
                  ? <div style={styles.horoInfo}>{unidad === 'hs' ? 'Horómetro' : 'Km'} inicial: <strong>{Number(selected.hora_inicial).toLocaleString('es-AR')} {unidad}</strong></div>
                  : <div style={styles.horoWarn}>Sin lectura inicial cargada — editá la máquina para agregarla</div>}
              </div>

              {/* Formulario cierre */}
              <form onSubmit={handleGuardar} style={styles.form}>
                <h3 style={styles.formTitle}>{yaExiste ? 'Actualizar cierre' : 'Registrar cierre'}</h3>
                <div style={styles.formRow}>
                  <div style={styles.field}>
                    <label style={styles.label}>Mes</label>
                    <select value={mes} onChange={e => setMes(Number(e.target.value))} style={styles.input}>
                      {MESES.map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
                    </select>
                  </div>
                  <div style={styles.field}>
                    <label style={styles.label}>Año</label>
                    <select value={anio} onChange={e => setAnio(Number(e.target.value))} style={styles.input}>
                      {[2024,2025,2026,2027].map(y => <option key={y}>{y}</option>)}
                    </select>
                  </div>
                  <div style={styles.field}>
                    <label style={styles.label}>Lectura al cierre ({unidad})</label>
                    <input type="number" step="0.1" min="0" value={lectura}
                      onChange={e => setLectura(e.target.value)}
                      placeholder={`Valor del ${unidad === 'hs' ? 'horómetro' : 'odómetro'}`}
                      style={styles.input} required />
                  </div>
                  <button type="submit" disabled={saving} style={styles.btn}>
                    {saving ? 'Guardando...' : yaExiste ? 'Actualizar' : 'Guardar cierre'}
                  </button>
                </div>
                {error && <p style={styles.error}>{error}</p>}
              </form>

              {/* Historial */}
              {cierres.length > 0 && (
                <div style={styles.historial}>
                  <h3 style={styles.formTitle}>Historial de cierres</h3>
                  <table style={styles.table}>
                    <thead><tr>
                      <th style={styles.th}>Mes / Año</th>
                      <th style={styles.th}>Lectura cierre</th>
                      <th style={styles.th}>Horas de uso</th>
                    </tr></thead>
                    <tbody>
                      {cierres.map(c => (
                        <tr key={c.id} style={styles.tr}>
                          <td style={{ ...styles.td, fontWeight:600 }}>{MESES[c.mes-1]} {c.anio}</td>
                          <td style={styles.td}>{Number(c.lectura).toLocaleString('es-AR')} {unidad}</td>
                          <td style={styles.td}>
                            {c.horas_uso != null
                              ? <span style={styles.uso}>{Number(c.horas_uso).toLocaleString('es-AR')} {unidad}</span>
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
  header: { marginBottom:24 },
  title: { margin:0, fontSize:26, color:'#1a1a2e', fontWeight:700 },
  subtitle: { margin:'4px 0 0', color:'#888', fontSize:14 },
  layout: { display:'grid', gridTemplateColumns:'220px 1fr', gap:24, alignItems:'start' },
  sidebar: { border:'1px solid #e2e8f0', borderRadius:10, overflow:'hidden', background:'#fff', position:'sticky', top:64 },
  select: { width:'100%', padding:'10px 12px', border:'none', borderBottom:'1px solid #f0f0f0', fontSize:13, background:'#f8fafc' },
  list: { listStyle:'none', margin:0, padding:0, maxHeight:'75vh', overflowY:'auto' },
  listItem: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 14px', cursor:'pointer', borderBottom:'1px solid #f8f8f8', fontSize:13 },
  listItemActive: { background:'#eff6ff' },
  listInterno: { fontWeight:700, color:'#1e40af' },
  listDep: { fontSize:11, color:'#94a3b8', background:'#f1f5f9', padding:'2px 6px', borderRadius:4 },
  main: { minHeight:300 },
  placeholder: { background:'#f8fafc', border:'2px dashed #e2e8f0', borderRadius:10, padding:40, textAlign:'center', color:'#94a3b8', fontSize:15 },
  machineCard: { background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:'14px 18px', marginBottom:20, fontSize:14 },
  dep: { color:'#64748b' },
  horoInfo: { marginTop:6, fontSize:13, color:'#374151' },
  horoWarn: { marginTop:6, fontSize:13, color:'#b45309' },
  form: { background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, padding:'18px 20px', marginBottom:20 },
  formTitle: { margin:'0 0 14px', fontSize:15, fontWeight:700, color:'#1a1a2e' },
  formRow: { display:'flex', gap:12, alignItems:'flex-end', flexWrap:'wrap' },
  field: { display:'flex', flexDirection:'column', gap:4 },
  label: { fontSize:13, fontWeight:600, color:'#444' },
  input: { padding:'8px 10px', border:'1px solid #ccc', borderRadius:6, fontSize:14, minWidth:160 },
  btn: { background:'#2563eb', color:'#fff', border:'none', borderRadius:6, padding:'9px 20px', fontSize:14, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' },
  error: { color:'#c0392b', fontSize:13, marginTop:8 },
  historial: { background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, padding:'18px 20px' },
  table: { width:'100%', borderCollapse:'collapse', fontSize:14 },
  th: { textAlign:'left', padding:'8px 12px', background:'#f8fafc', color:'#374151', fontWeight:700, borderBottom:'2px solid #e2e8f0' },
  tr: { borderBottom:'1px solid #f0f0f0' },
  td: { padding:'9px 12px' },
  uso: { fontWeight:700, color:'#2563eb' },
  info: { padding:16, color:'#94a3b8', fontSize:13 },
};
