import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import ProvinciaTabs, { esDeProvincia } from '../components/common/ProvinciaTabs';
import DepositoResumen from '../components/common/DepositoResumen';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export default function HorometroPage() {
  const [machines, setMachines]   = useState([]);
  const [depositos, setDepositos] = useState([]);
  const [selected, setSelected]   = useState(null);
  const [lecturas, setLecturas]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState(null);
  const [filterDep, setFilterDep] = useState('');
  const [provincia, setProvincia] = useState('T');

  // form nueva lectura
  const [valor, setValor]         = useState('');
  // edición
  const [editingId, setEditingId] = useState(null);
  const [editValor, setEditValor] = useState('');

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

  const fetchLecturas = useCallback(async (maqId) => {
    const { data } = await supabase
      .from('lecturas_horometro')
      .select('*')
      .eq('maquina_id', maqId)
      .order('fecha', { ascending: false });
    setLecturas(data ?? []);
  }, []);

  useEffect(() => {
    if (selected) { fetchLecturas(selected.id); setValor(''); setEditingId(null); }
    else setLecturas([]);
  }, [selected, fetchLecturas]);

  async function handleGuardar(e) {
    e.preventDefault();
    setError(null);
    const num = parseFloat(valor);
    if (isNaN(num) || num <= 0) { setError('Ingresá un valor válido mayor a cero.'); return; }
    const ultima = lecturas[0] ? Number(lecturas[0].valor) : null;
    if (ultima !== null && num <= ultima) {
      setError(`El valor debe ser mayor al último registrado (${ultima.toLocaleString('es-AR')} ${unidad}).`);
      return;
    }
    setSaving(true);
    const { error: err } = await supabase.from('lecturas_horometro').insert({
      maquina_id: selected.id, valor: num,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setValor('');
    await fetchLecturas(selected.id);
  }

  async function handleEditar(e) {
    e.preventDefault();
    setError(null);
    const num = parseFloat(editValor);
    if (isNaN(num) || num <= 0) { setError('Ingresá un valor válido.'); return; }
    setSaving(true);
    const { error: err } = await supabase
      .from('lecturas_horometro')
      .update({ valor: num })
      .eq('id', editingId);
    setSaving(false);
    if (err) { setError(err.message); return; }
    setEditingId(null);
    setEditValor('');
    await fetchLecturas(selected.id);
  }

  // Calcular horas de uso mensual desde las lecturas
  function calcularUsoMensual(lecturas, horaInicial) {
    if (lecturas.length === 0) return [];
    // ordenar de más antigua a más nueva
    const ordenadas = [...lecturas].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    // agrupar por mes/año: tomar la última lectura de cada mes
    const porMes = {};
    ordenadas.forEach(l => {
      const d = new Date(l.fecha);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      porMes[key] = { valor: Number(l.valor), anio: d.getFullYear(), mes: d.getMonth()+1 };
    });
    const meses = Object.keys(porMes).sort();
    return meses.map((key, i) => {
      const actual = porMes[key];
      let base = null;
      if (i === 0) base = horaInicial ?? null;
      else base = porMes[meses[i-1]].valor;
      const uso = base !== null ? actual.valor - base : null;
      return { key, anio: actual.anio, mes: actual.mes, lectura: actual.valor, uso };
    }).reverse(); // más reciente primero
  }

  const unidad = selected?.tipo === 'Autoelevador' ? 'hs' : 'km';
  const ultimaLectura = lecturas.length > 0 ? Number(lecturas[0].valor) : null;
  const usoMensual = selected ? calcularUsoMensual(lecturas, selected.hora_inicial) : [];
  const filtered = machines
    .filter(m => esDeProvincia(m.numero_interno, provincia))
    .filter(m => !filterDep || String(m.deposito_id) === String(filterDep));

  return (
    <div style={styles.page} className="page-padding">
      <div style={styles.header}>
        <h1 style={styles.title}>Horómetro / Kilometraje</h1>
        <p style={styles.subtitle}>Registro de uso por máquina — el sistema calcula automáticamente el uso mensual</p>
      </div>

      <ProvinciaTabs value={provincia} onChange={(p) => { setProvincia(p); setSelected(null); setFilterDep(''); }} />

      <DepositoResumen
        machines={machines.filter(m => esDeProvincia(m.numero_interno, provincia))}
        depositos={depositos}
        selected={filterDep}
        onSelect={(v) => { setFilterDep(v); setSelected(null); }}
      />

      <div style={styles.layout} className="layout-sidebar">
        {/* Sidebar */}
        <div style={styles.sidebar} className="sidebar-block">
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
                  <span style={styles.listTipo}>{m.tipo === 'Autoelevador' ? 'AE' : 'CAM'}</span>
                  <span style={styles.listNombre}>{[m.marca, m.modelo].filter(Boolean).join(' ') || '—'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Main */}
        <div style={styles.main}>
          {!selected ? (
            <div style={styles.placeholder}><p>← Seleccioná una máquina para registrar su lectura.</p></div>
          ) : (
            <>
              {/* Info máquina */}
              <div style={styles.machineCard}>
                <span style={styles.badge}>{selected.numero_interno}</span>
                <strong>{selected.marca} {selected.modelo}</strong> — {selected.tipo}
                {selected.hora_inicial != null &&
                  <span style={styles.horoInfo}> | {unidad === 'hs' ? 'Inicial' : 'Km inicial'}: {Number(selected.hora_inicial).toLocaleString('es-AR')} {unidad}</span>}
                {ultimaLectura !== null &&
                  <span style={styles.horoActual}> | Última lectura: <strong>{ultimaLectura.toLocaleString('es-AR')} {unidad}</strong></span>}
              </div>

              {/* Formulario nueva lectura */}
              <form onSubmit={handleGuardar} style={styles.form}>
                <label style={styles.label}>{unidad === 'hs' ? 'Horómetro (horas)' : 'Odómetro (kilómetros)'} *</label>
                <div style={styles.formRow}>
                  <input type="number" step="0.1" min="0" value={valor}
                    onChange={e => setValor(e.target.value)}
                    placeholder={ultimaLectura !== null ? `> ${ultimaLectura}` : '0'}
                    style={styles.input} required />
                  <button type="submit" disabled={saving} style={styles.btn}>
                    {saving ? 'Guardando...' : `Registrar ${unidad}`}
                  </button>
                </div>
                {error && <p style={styles.error}>{error}</p>}
              </form>

              {/* Historial de lecturas */}
              {lecturas.length > 0 && (
                <div style={styles.section}>
                  <h3 style={styles.sectionTitle}>Historial de lecturas</h3>
                  <div className="table-scroll">
                  <table style={styles.table}>
                    <thead><tr>
                      <th style={styles.th}>Fecha y hora</th>
                      <th style={styles.th}>Lectura</th>
                      <th style={styles.th}>Diferencia</th>
                      <th style={styles.th}>Acciones</th>
                    </tr></thead>
                    <tbody>
                      {lecturas.map((l, i) => {
                        const prev = lecturas[i + 1];
                        const diff = prev ? Number(l.valor) - Number(prev.valor) : null;
                        const isEditing = editingId === l.id;
                        return (
                          <tr key={l.id} style={styles.tr}>
                            <td style={styles.td}>{formatFecha(l.fecha)}</td>
                            <td style={{ ...styles.td, fontWeight:700 }}>
                              {isEditing ? (
                                <form onSubmit={handleEditar} style={styles.editRow}>
                                  <input type="number" step="0.1" value={editValor}
                                    onChange={e => setEditValor(e.target.value)}
                                    style={styles.editInput} autoFocus required />
                                  <button type="submit" disabled={saving} style={styles.btnSave}>Guardar</button>
                                  <button type="button" onClick={() => setEditingId(null)} style={styles.btnCancel}>Cancelar</button>
                                </form>
                              ) : (
                                `${Number(l.valor).toLocaleString('es-AR')} ${unidad}`
                              )}
                            </td>
                            <td style={{ ...styles.td, color:'#64748b' }}>
                              {diff !== null ? `+${diff.toLocaleString('es-AR')} ${unidad}` : '—'}
                            </td>
                            <td style={styles.td}>
                              {!isEditing && (
                                <button onClick={() => { setEditingId(l.id); setEditValor(l.valor); setError(null); }}
                                  style={styles.btnEdit}>Editar</button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}

              {/* Uso mensual calculado automáticamente */}
              {usoMensual.length > 0 && (
                <div style={styles.section}>
                  <h3 style={styles.sectionTitle}>Uso mensual calculado</h3>
                  <p style={styles.hint}>Calculado automáticamente en base a la última lectura de cada mes.</p>
                  <div className="table-scroll">
                  <table style={styles.table}>
                    <thead><tr>
                      <th style={styles.th}>Mes / Año</th>
                      <th style={styles.th}>Lectura cierre</th>
                      <th style={styles.th}>Horas de uso</th>
                    </tr></thead>
                    <tbody>
                      {usoMensual.map(m => (
                        <tr key={m.key} style={styles.tr}>
                          <td style={{ ...styles.td, fontWeight:600 }}>{MESES[m.mes-1]} {m.anio}</td>
                          <td style={styles.td}>{m.lectura.toLocaleString('es-AR')} {unidad}</td>
                          <td style={styles.td}>
                            {m.uso !== null
                              ? <span style={styles.uso}>{m.uso.toLocaleString('es-AR')} {unidad}</span>
                              : <span style={styles.sinBase}>Sin lectura inicial — editá la máquina para agregarla</span>}
                          </td>
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

function formatFecha(iso) {
  return new Date(iso).toLocaleString('es-AR', {
    day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit',
  });
}

const styles = {
  page: { maxWidth:1100, margin:'0 auto', padding:'28px 20px', fontFamily:'system-ui, sans-serif' },
  header: { marginBottom:24 },
  title: { margin:0, fontSize:26, color:'#1a1a2e', fontWeight:700 },
  subtitle: { margin:'4px 0 0', color:'#888', fontSize:14 },
  layout: { display:'grid', gridTemplateColumns:'240px 1fr', gap:24, alignItems:'start' },
  sidebar: { border:'1px solid #e2e8f0', borderRadius:10, overflow:'hidden', background:'#fff', position:'sticky', top:64 },
  select: { width:'100%', padding:'10px 12px', border:'none', borderBottom:'1px solid #f0f0f0', fontSize:13, background:'#f8fafc' },
  list: { listStyle:'none', margin:0, padding:0, maxHeight:'75vh', overflowY:'auto' },
  listItem: { display:'grid', gridTemplateColumns:'auto 30px 1fr', gap:8, padding:'10px 14px', cursor:'pointer', alignItems:'center', borderBottom:'1px solid #f8f8f8', fontSize:13 },
  listItemActive: { background:'#eff6ff' },
  listInterno: { fontWeight:700, color:'#1e40af' },
  listTipo: { fontSize:10, fontWeight:700, background:'#e0f2fe', color:'#0369a1', borderRadius:4, padding:'1px 4px', textAlign:'center' },
  listNombre: { color:'#555', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  main: { minHeight:300 },
  placeholder: { background:'#f8fafc', border:'2px dashed #e2e8f0', borderRadius:10, padding:40, textAlign:'center', color:'#94a3b8', fontSize:15 },
  machineCard: { background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:'12px 16px', marginBottom:16, fontSize:14, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' },
  badge: { background:'#2563eb', color:'#fff', borderRadius:6, padding:'2px 10px', fontSize:13, fontWeight:700 },
  horoInfo: { color:'#64748b', fontSize:13 },
  horoActual: { color:'#374151', fontSize:13 },
  form: { background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, padding:'16px 20px', marginBottom:20 },
  label: { fontSize:13, fontWeight:600, color:'#444', display:'block', marginBottom:8 },
  formRow: { display:'flex', gap:10, alignItems:'center' },
  input: { padding:'9px 12px', border:'1px solid #ccc', borderRadius:6, fontSize:15, width:200 },
  btn: { background:'#2563eb', color:'#fff', border:'none', borderRadius:6, padding:'9px 20px', fontSize:14, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' },
  error: { color:'#c0392b', fontSize:13, marginTop:8 },
  section: { background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, padding:'16px 20px', marginBottom:20 },
  sectionTitle: { margin:'0 0 4px', fontSize:15, fontWeight:700, color:'#1a1a2e' },
  hint: { margin:'0 0 12px', fontSize:12, color:'#94a3b8' },
  table: { width:'100%', borderCollapse:'collapse', fontSize:14 },
  th: { textAlign:'left', padding:'8px 12px', background:'#f8fafc', color:'#374151', fontWeight:700, borderBottom:'2px solid #e2e8f0' },
  tr: { borderBottom:'1px solid #f0f0f0' },
  td: { padding:'9px 12px', verticalAlign:'middle' },
  editRow: { display:'flex', gap:8, alignItems:'center' },
  editInput: { padding:'6px 10px', border:'1px solid #2563eb', borderRadius:6, fontSize:14, width:130 },
  btnSave: { padding:'5px 12px', fontSize:12, cursor:'pointer', background:'#2563eb', color:'#fff', border:'none', borderRadius:5, fontWeight:600 },
  btnCancel: { padding:'5px 12px', fontSize:12, cursor:'pointer', background:'#f1f5f9', color:'#333', border:'1px solid #ccc', borderRadius:5 },
  btnEdit: { padding:'4px 12px', fontSize:12, cursor:'pointer', background:'#e0f2fe', color:'#0369a1', border:'none', borderRadius:5, fontWeight:600 },
  uso: { fontWeight:700, color:'#2563eb' },
  sinBase: { fontSize:12, color:'#b45309', fontStyle:'italic' },
  info: { padding:16, color:'#94a3b8', fontSize:13 },
};
