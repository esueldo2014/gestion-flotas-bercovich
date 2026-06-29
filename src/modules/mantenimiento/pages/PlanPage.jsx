import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../shared/lib/supabaseClient';
import { useRole, can } from '../../../shared/lib/RoleContext';
import PlanForm from '../components/preventivo/PlanForm';
import ProvinciaTabs, { esDeProvincia } from '../components/common/ProvinciaTabs';
import DepositoResumen from '../components/common/DepositoResumen';

const SEMAFORO = {
  rojo:     { bg:'#fee2e2', text:'#991b1b', label:'VENCIDO' },
  amarillo: { bg:'#fef9c3', text:'#854d0e', label:'PRÓXIMO' },
  verde:    { bg:'#dcfce7', text:'#166534', label:'AL DÍA' },
  sin:      { bg:'#f1f5f9', text:'#64748b', label:'SIN DATOS' },
};

function calcSemaforo(tarea, ultimaEjecucion, horoActual) {
  const ALERTA = 0.10;
  let estadoHoras = null;
  let estadoDias  = null;

  if (tarea.frecuencia_horas && horoActual !== null && ultimaEjecucion) {
    const proximo = Number(ultimaEjecucion.horometro_valor) + Number(tarea.frecuencia_horas);
    const restantes = proximo - horoActual;
    if (restantes <= 0) estadoHoras = 'rojo';
    else if (restantes <= tarea.frecuencia_horas * ALERTA) estadoHoras = 'amarillo';
    else estadoHoras = 'verde';
  }

  if (tarea.frecuencia_dias && ultimaEjecucion) {
    const fechaUlt = new Date(ultimaEjecucion.fecha);
    const proximo  = new Date(fechaUlt);
    proximo.setDate(proximo.getDate() + Number(tarea.frecuencia_dias));
    const hoy = new Date();
    const diasRestantes = Math.floor((proximo - hoy) / 86400000);
    if (diasRestantes <= 0) estadoDias = 'rojo';
    else if (diasRestantes <= tarea.frecuencia_dias * ALERTA) estadoDias = 'amarillo';
    else estadoDias = 'verde';
  }

  const orden = { rojo:3, amarillo:2, verde:1, sin:0 };
  const peor = [estadoHoras, estadoDias].filter(Boolean)
    .sort((a,b) => orden[b]-orden[a])[0];
  return peor ?? 'sin';
}

export default function PlanPage() {
  const role = useRole();
  const puedeEditar = can.editarPlan(role?.rol);
  const esEM = role?.rol === 'EM';
  const esMecanico = role?.rol === 'Mecánico';
  const scopeSucursal = (esEM || esMecanico) ? role?.deposito_id : null;
  const scopeProvincia = role?.rol === 'Jefe' && role?.provincia_alcance ? role.provincia_alcance : null;
  const [machines, setMachines]     = useState([]);
  const [depositos, setDepositos]   = useState([]);
  const [selected, setSelected]     = useState(null);
  const [tareas, setTareas]         = useState([]);
  const [ejecutados, setEjecutados] = useState({});
  const [horoActual, setHoroActual] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [editing, setEditing]       = useState(null);
  const [filterDep, setFilterDep]   = useState('');
  const [provincia, setProvincia]   = useState('T');

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

  const fetchTareas = useCallback(async (maqId) => {
    const [{ data: plan }, { data: ej }, { data: lect }] = await Promise.all([
      supabase.from('plan_preventivo').select('*').eq('maquina_id', maqId).eq('activo', true).order('frecuencia_horas'),
      supabase.from('preventivos_ejecutados').select('*').eq('maquina_id', maqId).order('fecha', { ascending: false }),
      supabase.from('lecturas_horometro').select('valor').eq('maquina_id', maqId).order('fecha', { ascending: false }).limit(1),
    ]);
    setTareas(plan ?? []);
    setHoroActual(lect?.[0] ? Number(lect[0].valor) : null);
    const map = {};
    (ej ?? []).forEach(e => { if (!map[e.plan_id]) map[e.plan_id] = e; });
    setEjecutados(map);
  }, []);

  useEffect(() => {
    if (selected) fetchTareas(selected.id);
    else { setTareas([]); setEjecutados({}); setHoroActual(null); }
  }, [selected, fetchTareas]);

  async function handleSave(form) {
    const payload = {
      maquina_id: selected.id,
      tarea: form.tarea,
      frecuencia_horas: form.frecuencia_horas || null,
      frecuencia_dias: form.frecuencia_dias || null,
    };
    if (editing) {
      const { error } = await supabase.from('plan_preventivo').update(payload).eq('id', editing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('plan_preventivo').insert(payload);
      if (error) throw error;
    }
    setShowForm(false); setEditing(null);
    await fetchTareas(selected.id);
  }

  async function handleEliminar(t) {
    if (!window.confirm(`¿Eliminar la tarea "${t.tarea}"?`)) return;
    await supabase.from('plan_preventivo').update({ activo: false }).eq('id', t.id);
    await fetchTareas(selected.id);
  }

  async function handleMarcarHecho(t) {
    const obs = window.prompt(`Observaciones para "${t.tarea}" (opcional):`);
    if (obs === null) return;
    const { error } = await supabase.from('preventivos_ejecutados').insert({
      plan_id: t.id,
      maquina_id: selected.id,
      horometro_valor: horoActual,
      observaciones: obs || null,
    });
    if (error) { alert(error.message); return; }
    await fetchTareas(selected.id);
  }

  // contadores de semáforo para resaltar máquinas con alertas
  function alertasParaMaquina(maqId) {
    // no tenemos los datos de cada máquina precargados, solo indicamos si tiene tareas
    return null;
  }

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
  const unidad = selected?.tipo === 'Autoelevador' ? 'hs' : 'km';

  return (
    <div style={styles.page} className="page-padding">
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Plan de mantenimiento preventivo</h1>
          <p style={styles.subtitle}>Semáforo de vencimientos por máquina</p>
        </div>
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
                  <span style={styles.listNombre}>{[m.marca, m.modelo].filter(Boolean).join(' ') || '—'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={styles.main}>
          {!selected ? (
            <div style={styles.placeholder}><p>← Seleccioná una máquina para ver su plan preventivo.</p></div>
          ) : (
            <>
              <div style={styles.mainHeader}>
                <div>
                  <strong>{selected.numero_interno}</strong>
                  {selected.marca && ` — ${selected.marca} ${selected.modelo ?? ''}`}
                  {horoActual !== null
                    ? <span style={styles.horo}> | Horómetro actual: {horoActual.toLocaleString('es-AR')} {unidad}</span>
                    : <span style={styles.horoWarn}> | Sin horómetro cargado</span>}
                </div>
                {puedeEditar && (
                  <button onClick={() => { setEditing(null); setShowForm(true); }} style={styles.btnNew}>
                    + Nueva tarea
                  </button>
                )}
              </div>

              {tareas.length === 0 ? (
                <div style={styles.placeholder}><p>Sin tareas preventivas definidas. Hacé clic en "+ Nueva tarea".</p></div>
              ) : (
                <div className="table-scroll">
                <table style={styles.table}>
                  <thead>
                    <tr>
                      {['Estado','Tarea','Frecuencia','Última ejecución','Próximo vencimiento','Acciones'].map(h => (
                        <th key={h} style={styles.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tareas.map(t => {
                      const ult    = ejecutados[t.id] ?? null;
                      const estado = calcSemaforo(t, ult, horoActual);
                      const sem    = SEMAFORO[estado];
                      const proxHoras = ult && t.frecuencia_horas
                        ? Number(ult.horometro_valor) + Number(t.frecuencia_horas) : null;
                      const proxFecha = ult && t.frecuencia_dias
                        ? (() => { const d = new Date(ult.fecha); d.setDate(d.getDate() + Number(t.frecuencia_dias)); return d; })()
                        : null;

                      return (
                        <tr key={t.id} style={styles.tr}>
                          <td style={styles.td}>
                            <span style={{ ...styles.badge, background: sem.bg, color: sem.text }}>{sem.label}</span>
                          </td>
                          <td style={{ ...styles.td, fontWeight:600 }}>{t.tarea}</td>
                          <td style={styles.td}>
                            {t.frecuencia_horas && <div>c/ {t.frecuencia_horas} {unidad}</div>}
                            {t.frecuencia_dias  && <div>c/ {t.frecuencia_dias} días</div>}
                          </td>
                          <td style={styles.td}>
                            {ult ? (
                              <>
                                <div>{new Date(ult.fecha).toLocaleDateString('es-AR')}</div>
                                {ult.horometro_valor && <div style={styles.small}>{Number(ult.horometro_valor).toLocaleString('es-AR')} {unidad}</div>}
                                {ult.observaciones  && <div style={styles.obs}>{ult.observaciones}</div>}
                              </>
                            ) : '—'}
                          </td>
                          <td style={styles.td}>
                            {proxHoras && <div>{proxHoras.toLocaleString('es-AR')} {unidad}</div>}
                            {proxFecha && <div>{proxFecha.toLocaleDateString('es-AR')}</div>}
                            {!proxHoras && !proxFecha && '—'}
                          </td>
                          <td style={styles.td}>
                            <button onClick={() => handleMarcarHecho(t)} style={styles.btnDone}>✓ Hecho</button>
                            {puedeEditar && (
                              <>
                                <button onClick={() => { setEditing(t); setShowForm(true); }} style={styles.btnEdit}>Editar</button>
                                <button onClick={() => handleEliminar(t)} style={styles.btnDel}>Eliminar</button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showForm && (
        <PlanForm
          initial={editing}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

const styles = {
  page: { maxWidth:1200, margin:'0 auto', padding:'28px 20px', fontFamily:'system-ui, sans-serif' },
  header: { marginBottom:24 },
  title: { margin:0, fontSize:26, color:'#1a1a2e', fontWeight:700 },
  subtitle: { margin:'4px 0 0', color:'#888', fontSize:14 },
  layout: { display:'grid', gridTemplateColumns:'220px 1fr', gap:24, alignItems:'start' },
  sidebar: { border:'1px solid #e2e8f0', borderRadius:10, overflow:'hidden', background:'#fff', position:'sticky', top:64 },
  select: { width:'100%', padding:'10px 12px', border:'none', borderBottom:'1px solid #f0f0f0', fontSize:13, background:'#f8fafc' },
  list: { listStyle:'none', margin:0, padding:0, maxHeight:'75vh', overflowY:'auto' },
  listItem: { display:'flex', flexDirection:'column', padding:'9px 14px', cursor:'pointer', borderBottom:'1px solid #f8f8f8', fontSize:13 },
  listItemActive: { background:'#eff6ff' },
  listInterno: { fontWeight:700, color:'#1e40af', fontSize:13 },
  listNombre: { color:'#888', fontSize:11, marginTop:1 },
  main: { minHeight:300 },
  mainHeader: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 },
  horo: { color:'#64748b', fontSize:13 },
  horoWarn: { color:'#b45309', fontSize:13 },
  btnNew: { background:'#2563eb', color:'#fff', border:'none', borderRadius:6, padding:'8px 18px', fontSize:13, fontWeight:600, cursor:'pointer' },
  placeholder: { background:'#f8fafc', border:'2px dashed #e2e8f0', borderRadius:10, padding:40, textAlign:'center', color:'#94a3b8', fontSize:15 },
  table: { width:'100%', borderCollapse:'collapse', fontSize:13 },
  th: { textAlign:'left', padding:'9px 12px', background:'#f1f5f9', color:'#374151', fontWeight:700, borderBottom:'2px solid #e2e8f0', whiteSpace:'nowrap' },
  tr: { borderBottom:'1px solid #f0f0f0' },
  td: { padding:'9px 12px', verticalAlign:'middle' },
  badge: { display:'inline-block', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700 },
  small: { fontSize:11, color:'#94a3b8', marginTop:2 },
  obs: { fontSize:11, color:'#64748b', fontStyle:'italic', marginTop:2 },
  btnDone: { marginRight:4, padding:'4px 10px', fontSize:12, cursor:'pointer', background:'#dcfce7', color:'#166534', border:'none', borderRadius:5, fontWeight:600 },
  btnEdit: { marginRight:4, padding:'4px 10px', fontSize:12, cursor:'pointer', background:'#e0f2fe', color:'#0369a1', border:'none', borderRadius:5, fontWeight:600 },
  btnDel: { padding:'4px 10px', fontSize:12, cursor:'pointer', background:'#fee2e2', color:'#991b1b', border:'none', borderRadius:5, fontWeight:600 },
  info: { padding:16, color:'#94a3b8', fontSize:13 },
};
