import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../shared/lib/supabaseClient';
import { useRole, can } from '../../../shared/lib/RoleContext';
import CorrectivoForm from '../components/correctivos/CorrectivoForm';
import ProvinciaTabs, { esDeProvincia } from '../components/common/ProvinciaTabs';
import DepositoResumen from '../components/common/DepositoResumen';

const ESTADO_COLORS = {
  'Abierta':    { bg:'#fee2e2', text:'#991b1b' },
  'En proceso': { bg:'#fef9c3', text:'#854d0e' },
  'Cerrada':    { bg:'#dcfce7', text:'#166534' },
};

export default function CorrectivosPage() {
  const role = useRole();
  const verCostos = can.verCostos(role?.rol);
  const puedeGestionar = can.cerrarOT(role?.rol); // editar/cerrar/eliminar
  const esEM = role?.rol === 'EM';
  const esMecanico = role?.rol === 'Mecánico';
  const scopeSucursal = (esEM || esMecanico) ? role?.deposito_id : null;
  const scopeProvincia = role?.rol === 'Jefe' && role?.provincia_alcance ? role.provincia_alcance : null;
  const [correctivos, setCorrectivos] = useState([]);
  const [fotoMap, setFotoMap]         = useState({});
  const [machines, setMachines]       = useState([]);
  const [depositos, setDepositos]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showForm, setShowForm]       = useState(false);
  const [editing, setEditing]         = useState(null);
  const [filterEstado, setFilterEstado] = useState('');
  const [filterMaquina, setFilterMaquina] = useState('');
  const [filterDeposito, setFilterDeposito] = useState('');
  const [provincia, setProvincia] = useState('T');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [{ data: corr }, { data: maq }, { data: dep }, { data: fotos }] = await Promise.all([
      supabase.from('correctivos').select('*, maquinas(numero_interno, marca, modelo, tipo)').order('fecha_reporte', { ascending: false }),
      supabase.from('maquinas').select('*').order('numero_interno'),
      supabase.from('sucursales').select('*').order('code'),
      supabase.from('correctivos_adjuntos').select('correctivo_id, url').eq('tipo', 'Foto de la rotura'),
    ]);
    setCorrectivos(corr ?? []);
    setMachines(maq ?? []);
    setDepositos(dep ?? []);
    const map = {};
    for (const f of fotos ?? []) { if (!map[f.correctivo_id]) map[f.correctivo_id] = f.url; }
    setFotoMap(map);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (scopeSucursal) {
      const suc = depositos.find(d => d.id === scopeSucursal);
      if (suc?.provincia) setProvincia(suc.provincia);
    } else if (scopeProvincia) {
      setProvincia(scopeProvincia);
    }
  }, [scopeSucursal, scopeProvincia, depositos]);

  async function handleSave(form) {
    const payload = {
      maquina_id:   form.maquina_id || editing?.maquina_id,
      descripcion:  form.descripcion,
      categoria:    form.categoria || null,
      reportado_por: form.reportado_por || null,
      asignado_a:   form.asignado_a || null,
      repuestos:    form.repuestos || null,
      costo_total:  form.costo_total ? parseFloat(form.costo_total) : null,
      estado:       form.estado,
      fecha_cierre: form.estado === 'Cerrada' && form.fecha_cierre ? form.fecha_cierre : null,
    };
    if (editing) {
      const { error } = await supabase.from('correctivos').update(payload).eq('id', editing.id);
      if (error) throw error;
      setShowForm(false); setEditing(null);
    } else {
      const { data, error } = await supabase.from('correctivos').insert(payload).select().single();
      if (error) throw error;
      // dejamos el formulario abierto en modo edición para poder sacar la foto de la rotura
      setEditing(data);
    }
    await fetchAll();
  }

  async function handleEliminar(c) {
    if (!window.confirm('¿Eliminar esta orden de trabajo?')) return;
    const { data: adjuntos } = await supabase
      .from('correctivos_adjuntos')
      .select('url')
      .eq('correctivo_id', c.id);
    if (adjuntos?.length) {
      const paths = adjuntos
        .map(a => a.url.split('/correctivos-adjuntos/')[1])
        .filter(Boolean);
      if (paths.length) await supabase.storage.from('correctivos-adjuntos').remove(paths);
      await supabase.from('correctivos_adjuntos').delete().eq('correctivo_id', c.id);
    }
    await supabase.from('correctivos').delete().eq('id', c.id);
    await fetchAll();
  }

  const depositosVisibles = scopeSucursal
    ? depositos.filter(d => d.id === scopeSucursal)
    : scopeProvincia
      ? depositos.filter(d => d.provincia === scopeProvincia)
      : depositos;
  const idsDepositosVisibles = new Set(depositosVisibles.map(d => d.id));

  const machinesProv = machines
    .filter(m => esDeProvincia(m.numero_interno, provincia))
    .filter(m => (!scopeSucursal && !scopeProvincia) ? true : idsDepositosVisibles.has(m.deposito_id))
    .filter(m => !filterDeposito || String(m.deposito_id) === String(filterDeposito));
  const idsProv = new Set(machinesProv.map(m => m.id));

  const filtered = correctivos
    .filter(c => idsProv.has(c.maquina_id))
    .filter(c => !filterEstado  || c.estado === filterEstado)
    .filter(c => !filterMaquina || c.maquina_id === filterMaquina);

  const pendientes = correctivos.filter(c => c.estado !== 'Cerrada').length;

  return (
    <div style={styles.page} className="page-padding">
      <div style={styles.header} className="header-flex">
        <div>
          <h1 style={styles.title}>Correctivos — Órdenes de trabajo</h1>
          <p style={styles.subtitle}>
            {pendientes > 0
              ? <span style={styles.alert}>{pendientes} OT{pendientes > 1 ? 's' : ''} abiertas o en proceso</span>
              : 'Sin órdenes pendientes'}
          </p>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true); }} style={styles.btnNew}>+ Nueva OT</button>
      </div>

      {!scopeSucursal && !scopeProvincia && (
        <ProvinciaTabs value={provincia} onChange={(p) => { setProvincia(p); setFilterMaquina(''); setFilterDeposito(''); }} />
      )}

      <DepositoResumen
        machines={machines.filter(m => esDeProvincia(m.numero_interno, provincia)).filter(m => (!scopeSucursal && !scopeProvincia) ? true : idsDepositosVisibles.has(m.deposito_id))}
        depositos={depositosVisibles}
        selected={filterDeposito}
        onSelect={(v) => { setFilterDeposito(v); setFilterMaquina(''); }}
      />

      <div style={styles.filters}>
        <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} style={styles.select}>
          <option value="">Todos los estados</option>
          <option>Abierta</option><option>En proceso</option><option>Cerrada</option>
        </select>
        <select value={filterMaquina} onChange={e => setFilterMaquina(e.target.value)} style={styles.select}>
          <option value="">Todas las máquinas</option>
          {machinesProv.map(m => <option key={m.id} value={m.id}>{m.numero_interno} — {m.marca} {m.modelo}</option>)}
        </select>
        <span style={styles.count}>{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? <p style={styles.info}>Cargando...</p> : filtered.length === 0 ? (
        <div style={styles.empty}>Sin órdenes de trabajo{filterEstado || filterMaquina ? ' con estos filtros' : ''}.</div>
      ) : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {['Estado','Máquina','Descripción','Categoría','Reportado','Asignado', ...(verCostos ? ['Costo'] : []), 'Fecha reporte','Acciones','Foto'].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const col = ESTADO_COLORS[c.estado] ?? {};
                const maq = c.maquinas;
                return (
                  <tr key={c.id} style={styles.tr}>
                    <td style={styles.td}>
                      <span style={{ ...styles.badge, background: col.bg, color: col.text }}>{c.estado}</span>
                    </td>
                    <td style={{ ...styles.td, fontWeight:700 }}>{maq?.numero_interno ?? '—'}</td>
                    <td style={{ ...styles.td, maxWidth:220 }}>
                      <div style={styles.descText}>{c.descripcion}</div>
                    </td>
                    <td style={styles.td}>{c.categoria || '—'}</td>
                    <td style={styles.td}>{c.reportado_por || '—'}</td>
                    <td style={styles.td}>{c.asignado_a || '—'}</td>
                    {verCostos && (
                      <td style={styles.td}>{c.costo_total != null ? `$${Number(c.costo_total).toLocaleString('es-AR')}` : '—'}</td>
                    )}
                    <td style={styles.td}>{new Date(c.fecha_reporte).toLocaleDateString('es-AR')}</td>
                    <td style={styles.td}>
                      {puedeGestionar ? (
                        <>
                          <button onClick={() => { setEditing(c); setShowForm(true); }} style={styles.btnEdit}>Editar</button>
                          <button onClick={() => handleEliminar(c)} style={styles.btnDel}>Eliminar</button>
                        </>
                      ) : '—'}
                    </td>
                    <td style={styles.td}>
                      {fotoMap[c.id]
                        ? <a href={fotoMap[c.id]} target="_blank" rel="noopener noreferrer" style={styles.btnFoto} title="Ver foto de la rotura">📷 Ver</a>
                        : <span style={styles.sinFoto}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <CorrectivoForm
          machines={machinesProv}
          initial={editing}
          verCostos={verCostos}
          soloLectura={editing && !puedeGestionar}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

const styles = {
  page: { maxWidth:1200, margin:'0 auto', padding:'28px 20px', fontFamily:'system-ui, sans-serif' },
  header: { display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 },
  title: { margin:0, fontSize:26, color:'#1a1a2e', fontWeight:700 },
  subtitle: { margin:'4px 0 0', fontSize:14 },
  alert: { color:'#b45309', fontWeight:600 },
  btnNew: { background:'#2563eb', color:'#fff', border:'none', borderRadius:7, padding:'10px 20px', fontSize:14, fontWeight:600, cursor:'pointer' },
  filters: { display:'flex', gap:12, alignItems:'center', marginBottom:16 },
  select: { padding:'7px 10px', border:'1px solid #ccc', borderRadius:6, fontSize:13 },
  count: { fontSize:13, color:'#94a3b8', marginLeft:'auto' },
  tableWrap: { overflowX:'auto' },
  table: { width:'100%', borderCollapse:'collapse', fontSize:13 },
  th: { textAlign:'left', padding:'9px 12px', background:'#f1f5f9', color:'#374151', fontWeight:700, borderBottom:'2px solid #e2e8f0', whiteSpace:'nowrap' },
  tr: { borderBottom:'1px solid #f0f0f0' },
  td: { padding:'9px 12px', verticalAlign:'middle' },
  badge: { display:'inline-block', padding:'3px 10px', borderRadius:20, fontSize:12, fontWeight:600 },
  descText: { maxWidth:220, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  btnEdit: { marginRight:4, padding:'4px 10px', fontSize:12, cursor:'pointer', background:'#e0f2fe', color:'#0369a1', border:'none', borderRadius:5, fontWeight:600 },
  btnDel: { padding:'4px 10px', fontSize:12, cursor:'pointer', background:'#fee2e2', color:'#991b1b', border:'none', borderRadius:5, fontWeight:600 },
  btnFoto: { padding:'4px 10px', fontSize:12, background:'#f0fdf4', color:'#166534', border:'1px solid #bbf7d0', borderRadius:5, fontWeight:600, textDecoration:'none', display:'inline-block' },
  sinFoto: { color:'#94a3b8' },
  info: { color:'#94a3b8', textAlign:'center', padding:40 },
  empty: { textAlign:'center', padding:40, color:'#999', fontSize:15 },
};
