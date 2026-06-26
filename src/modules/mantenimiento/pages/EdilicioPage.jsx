import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../shared/lib/supabaseClient';
import { useRole, can } from '../../../shared/lib/RoleContext';
import EdilicioForm from '../components/edilicios/EdilicioForm';
import ProvinciaTabs from '../components/common/ProvinciaTabs';

const ESTADO_COLORS = {
  'Detectado':               { bg:'#f1f5f9', text:'#475569' },
  'En cotización':           { bg:'#fef9c3', text:'#854d0e' },
  'Pendiente de aprobación': { bg:'#fde68a', text:'#92400e' },
  'Aprobado':                { bg:'#dbeafe', text:'#1e40af' },
  'Rechazado':               { bg:'#fee2e2', text:'#991b1b' },
  'En ejecución':            { bg:'#e0f2fe', text:'#0369a1' },
  'Cerrado':                 { bg:'#dcfce7', text:'#166534' },
};

const PRIORIDAD_COLORS = {
  'Baja':'#94a3b8', 'Media':'#0369a1', 'Alta':'#b45309', 'Urgente':'#991b1b',
};

export default function EdilicioPage() {
  const role = useRole();
  const verCostos = can.gestionarCotizaciones(role?.rol);
  const esEM = role?.rol === 'EM';
  const esMecanico = role?.rol === 'Mecánico';
  const scopeSucursal = (esEM || esMecanico) ? role?.deposito_id : null;
  const scopeProvincia = role?.rol === 'Supervisor' && role?.provincia_alcance ? role.provincia_alcance : null;
  const permisos = {
    puedeCrearEditar: true, // todos pueden reportar
    puedeGestionarCotizaciones: can.gestionarCotizaciones(role?.rol),
    puedeAprobar: can.aprobarEdilicio(role?.rol),
    puedeEjecutarCerrar: can.ejecutarCerrarEdilicio(role?.rol),
  };

  const [solicitudes, setSolicitudes] = useState([]);
  const [depositos, setDepositos]     = useState([]); // sucursales
  const [rubros, setRubros]           = useState([]); // depositos por rubro
  const [loading, setLoading]         = useState(true);
  const [showForm, setShowForm]       = useState(false);
  const [editing, setEditing]         = useState(null);
  const [provincia, setProvincia]     = useState('T');
  const [filterEstado, setFilterEstado] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [{ data: sol }, { data: dep }, { data: rub }] = await Promise.all([
      supabase.from('edilicios_solicitudes').select('*, sucursales(code, nombre), depositos(nombre)').order('fecha_reporte', { ascending: false }),
      supabase.from('sucursales').select('*').order('code'),
      supabase.from('depositos').select('*').order('nombre'),
    ]);
    setSolicitudes(sol ?? []);
    setDepositos(dep ?? []);
    setRubros(rub ?? []);
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
      provincia: form.provincia,
      deposito_id: form.deposito_id ? parseInt(form.deposito_id) : null,
      rubro_deposito_id: form.rubro_deposito_id ? parseInt(form.rubro_deposito_id) : null,
      titulo: form.titulo,
      descripcion: form.descripcion,
      categoria: form.categoria || null,
      prioridad: form.prioridad,
      reportado_por: form.reportado_por || null,
      observaciones_gerencia: form.observaciones_gerencia || null,
    };
    if (editing) {
      payload.estado = form.estado;
      if (form.estado === 'Cerrado' && editing.estado !== 'Cerrado') payload.fecha_cierre = new Date().toISOString();
      if (form.estado === 'Aprobado' && editing.estado !== 'Aprobado') {
        const { data: cot } = await supabase
          .from('edilicios_cotizaciones')
          .select('monto')
          .eq('solicitud_id', editing.id)
          .eq('seleccionada', true)
          .maybeSingle();
        if (cot) payload.monto_aprobado = cot.monto;
      }
      const { error } = await supabase.from('edilicios_solicitudes').update(payload).eq('id', editing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('edilicios_solicitudes').insert(payload);
      if (error) throw error;
    }
    setShowForm(false); setEditing(null);
    await fetchAll();
  }

  async function handleEliminar(s) {
    if (!window.confirm('¿Eliminar esta solicitud?')) return;
    await supabase.from('edilicios_solicitudes').delete().eq('id', s.id);
    await fetchAll();
  }

  const filtered = solicitudes
    .filter(s => s.provincia === provincia)
    .filter(s => !scopeSucursal || s.deposito_id === scopeSucursal)
    .filter(s => !filterEstado || s.estado === filterEstado);

  const pendientesAprobacion = solicitudes.filter(s => s.provincia === provincia && s.estado === 'Pendiente de aprobación').length;

  return (
    <div style={styles.page} className="page-padding">
      <div style={styles.header} className="header-flex">
        <div>
          <h1 style={styles.title}>Mantenimiento edilicio</h1>
          <p style={styles.subtitle}>
            {pendientesAprobacion > 0
              ? <span style={styles.alert}>{pendientesAprobacion} solicitud{pendientesAprobacion > 1 ? 'es' : ''} pendiente{pendientesAprobacion > 1 ? 's' : ''} de aprobación</span>
              : 'Reporte y seguimiento de necesidades edilicias'}
          </p>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true); }} style={styles.btnNew}>+ Reportar necesidad</button>
      </div>

      {!scopeSucursal && !scopeProvincia && (
        <ProvinciaTabs value={provincia} onChange={(p) => { setProvincia(p); setFilterEstado(''); }} />
      )}

      <div style={styles.filters}>
        <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} style={styles.select}>
          <option value="">Todos los estados</option>
          {Object.keys(ESTADO_COLORS).map(e => <option key={e}>{e}</option>)}
        </select>
        <span style={styles.count}>{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? <p style={styles.info}>Cargando...</p> : filtered.length === 0 ? (
        <div style={styles.empty}>Sin solicitudes{filterEstado ? ' con este filtro' : ''}.</div>
      ) : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {['Estado','Prioridad','Título','Sucursal','Depósito','Categoría','Reportado','Fecha', ...(verCostos ? ['Monto aprobado'] : []), 'Acciones'].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const col = ESTADO_COLORS[s.estado] ?? {};
                return (
                  <tr key={s.id} style={styles.tr}>
                    <td style={styles.td}>
                      <span style={{ ...styles.badge, background: col.bg, color: col.text }}>{s.estado}</span>
                    </td>
                    <td style={styles.td}>
                      <span style={{ color: PRIORIDAD_COLORS[s.prioridad], fontWeight:700 }}>{s.prioridad}</span>
                    </td>
                    <td style={{ ...styles.td, maxWidth:220 }}>
                      <div style={styles.tituloText}>{s.titulo}</div>
                    </td>
                    <td style={styles.td}>{s.sucursales?.code ?? '—'}</td>
                    <td style={styles.td}>{s.depositos?.nombre ?? '—'}</td>
                    <td style={styles.td}>{s.categoria || '—'}</td>
                    <td style={styles.td}>{s.reportado_por || '—'}</td>
                    <td style={styles.td}>{new Date(s.fecha_reporte).toLocaleDateString('es-AR')}</td>
                    {verCostos && (
                      <td style={styles.td}>{s.monto_aprobado != null ? `$${Number(s.monto_aprobado).toLocaleString('es-AR')}` : '—'}</td>
                    )}
                    <td style={styles.td}>
                      <button onClick={() => { setEditing(s); setShowForm(true); }} style={styles.btnEdit}>Abrir</button>
                      {permisos.puedeGestionarCotizaciones && (
                        <button onClick={() => handleEliminar(s)} style={styles.btnDel}>Eliminar</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <EdilicioForm
          depositos={depositos}
          rubros={rubros}
          initial={editing}
          permisos={permisos}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

const styles = {
  page: { maxWidth:1200, margin:'0 auto', padding:'28px 20px', fontFamily:'system-ui, sans-serif' },
  header: { display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20, flexWrap:'wrap', gap:12 },
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
  badge: { display:'inline-block', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, whiteSpace:'nowrap' },
  tituloText: { maxWidth:220, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight:600 },
  btnEdit: { marginRight:4, padding:'4px 10px', fontSize:12, cursor:'pointer', background:'#e0f2fe', color:'#0369a1', border:'none', borderRadius:5, fontWeight:600 },
  btnDel: { padding:'4px 10px', fontSize:12, cursor:'pointer', background:'#fee2e2', color:'#991b1b', border:'none', borderRadius:5, fontWeight:600 },
  info: { color:'#94a3b8', textAlign:'center', padding:40 },
  empty: { textAlign:'center', padding:40, color:'#999', fontSize:15 },
};
