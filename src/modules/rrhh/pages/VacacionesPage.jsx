import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../shared/lib/supabaseClient';
import { useRole, can } from '../../../shared/lib/RoleContext';

const ESTADO_COLORS = {
  'pendiente': { bg:'#fef9c3', text:'#854d0e' },
  'aprobado':  { bg:'#dcfce7', text:'#166534' },
  'rechazado': { bg:'#fee2e2', text:'#991b1b' },
};

function diasEntre(desde, hasta) {
  const d1 = new Date(desde), d2 = new Date(hasta);
  return Math.round((d2 - d1) / 86400000) + 1;
}

export default function VacacionesPage() {
  const role = useRole();
  const puedeAprobar = can.aprobarSolicitudRRHH(role?.rol);
  const puedeAsignar = can.asignarVacaciones(role?.rol);
  const verTodo = puedeAprobar;
  const anioActual = new Date().getFullYear();

  const [solicitudes, setSolicitudes] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);
  const [usuarios, setUsuarios]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [formSol, setFormSol] = useState({ fecha_desde:'', fecha_hasta:'' });
  const [formAsig, setFormAsig] = useState({ usuario_id:'', anio: anioActual, dias_asignados:'' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    let solQuery = supabase.from('vacaciones_solicitudes').select('*, usuarios_roles!usuario_id(nombre, email)').order('fecha_desde', { ascending:false });
    if (!verTodo) solQuery = solQuery.eq('usuario_id', role.id);
    const [solRes, asigRes, usRes] = await Promise.all([
      solQuery,
      supabase.from('vacaciones_asignacion').select('*').eq('anio', anioActual),
      verTodo ? supabase.from('usuarios_roles').select('id, nombre, email') : Promise.resolve({ data: [] }),
    ]);
    if (solRes.error || asigRes.error || usRes.error) {
      setError((solRes.error || asigRes.error || usRes.error).message);
    } else {
      setError(null);
    }
    setSolicitudes(solRes.data ?? []);
    setAsignaciones(asigRes.data ?? []);
    setUsuarios(usRes.data ?? []);
    setLoading(false);
  }, [verTodo, role?.id, anioActual]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function diasUsadosOPendientes(usuarioId) {
    return solicitudes
      .filter(s => s.usuario_id === usuarioId && s.estado !== 'rechazado')
      .filter(s => new Date(s.fecha_desde).getFullYear() === anioActual)
      .reduce((acc, s) => acc + s.dias, 0);
  }

  const miAsignacion = asignaciones.find(a => a.usuario_id === role.id)?.dias_asignados ?? 0;
  const miUsado = diasUsadosOPendientes(role.id);
  const miDisponible = miAsignacion - miUsado;

  async function handleSubmitSolicitud(e) {
    e.preventDefault();
    setError(null);
    const { fecha_desde, fecha_hasta } = formSol;
    if (!fecha_desde || !fecha_hasta) return;
    const dias = diasEntre(fecha_desde, fecha_hasta);
    if (dias <= 0) { setError('El rango de fechas no es válido.'); return; }
    if (dias > miDisponible) {
      setError(`No alcanza tu saldo disponible (${miDisponible} días).`);
      return;
    }
    setSaving(true);
    await supabase.from('vacaciones_solicitudes').insert({
      usuario_id: role.id, fecha_desde, fecha_hasta, dias,
    });
    setSaving(false);
    setFormSol({ fecha_desde:'', fecha_hasta:'' });
    await fetchAll();
  }

  async function handleSubmitAsignacion(e) {
    e.preventDefault();
    setError(null);
    const dias = parseFloat(formAsig.dias_asignados);
    if (!formAsig.usuario_id || !dias) return;
    setSaving(true);
    await supabase.from('vacaciones_asignacion').upsert({
      usuario_id: formAsig.usuario_id, anio: formAsig.anio, dias_asignados: dias,
    }, { onConflict: 'usuario_id,anio' });
    setSaving(false);
    setFormAsig({ usuario_id:'', anio: anioActual, dias_asignados:'' });
    await fetchAll();
  }

  async function handleDecision(s, estado) {
    setError(null);
    if (estado === 'aprobado') {
      const asignado = asignaciones.find(a => a.usuario_id === s.usuario_id)?.dias_asignados ?? 0;
      const usado = diasUsadosOPendientes(s.usuario_id) ; // ya incluye esta solicitud pendiente
      if (usado > asignado) {
        setError('El saldo de esta persona ya no alcanza para aprobar esta solicitud.');
        return;
      }
    }
    await supabase.from('vacaciones_solicitudes').update({
      estado, aprobado_por: role.id, fecha_aprobacion: new Date().toISOString(),
    }).eq('id', s.id);
    await fetchAll();
  }

  return (
    <div style={styles.page} className="page-padding">
      <div style={styles.header}>
        <h1 style={styles.title}>Vacaciones</h1>
        <p style={styles.subtitle}>
          Año {anioActual} — asignados: <b>{miAsignacion}</b>, usados/pendientes: <b>{miUsado}</b>, disponibles: <b>{miDisponible}</b>
        </p>
      </div>

      {error && <p style={styles.error}>{error}</p>}

      <form onSubmit={handleSubmitSolicitud} style={styles.form}>
        <span style={styles.formLabel}>Solicitar:</span>
        <input type="date" value={formSol.fecha_desde} onChange={e => setFormSol(f => ({ ...f, fecha_desde: e.target.value }))} required style={styles.input} />
        <span style={styles.formLabel}>al</span>
        <input type="date" value={formSol.fecha_hasta} onChange={e => setFormSol(f => ({ ...f, fecha_hasta: e.target.value }))} required style={styles.input} />
        <button type="submit" disabled={saving} style={styles.btnNew}>{saving ? 'Guardando...' : '+ Solicitar'}</button>
      </form>

      {puedeAsignar && (
        <form onSubmit={handleSubmitAsignacion} style={styles.form}>
          <span style={styles.formLabel}>Asignar días {anioActual}:</span>
          <select value={formAsig.usuario_id} onChange={e => setFormAsig(f => ({ ...f, usuario_id: e.target.value }))} required style={styles.input}>
            <option value="">Empleado...</option>
            {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre || u.email}</option>)}
          </select>
          <input type="number" min="0" placeholder="Días asignados" value={formAsig.dias_asignados} onChange={e => setFormAsig(f => ({ ...f, dias_asignados: e.target.value }))} required style={styles.input} />
          <button type="submit" disabled={saving} style={styles.btnNew}>{saving ? 'Guardando...' : '+ Asignar'}</button>
        </form>
      )}

      {loading ? <p style={styles.info}>Cargando...</p> : solicitudes.length === 0 ? (
        <div style={styles.empty}>Sin solicitudes.</div>
      ) : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {[...(verTodo ? ['Empleado'] : []), 'Desde','Hasta','Días','Estado', ...(puedeAprobar ? ['Acciones'] : [])].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {solicitudes.map(s => {
                const col = ESTADO_COLORS[s.estado] ?? {};
                return (
                  <tr key={s.id} style={styles.tr}>
                    {verTodo && <td style={styles.td}>{s.usuarios_roles?.nombre || s.usuarios_roles?.email}</td>}
                    <td style={styles.td}>{new Date(s.fecha_desde).toLocaleDateString('es-AR')}</td>
                    <td style={styles.td}>{new Date(s.fecha_hasta).toLocaleDateString('es-AR')}</td>
                    <td style={styles.td}>{s.dias}</td>
                    <td style={styles.td}><span style={{ ...styles.badge, background: col.bg, color: col.text }}>{s.estado}</span></td>
                    {puedeAprobar && (
                      <td style={styles.td}>
                        {s.estado === 'pendiente' ? (
                          <>
                            <button onClick={() => handleDecision(s, 'aprobado')} style={styles.btnOk}>Aprobar</button>
                            <button onClick={() => handleDecision(s, 'rechazado')} style={styles.btnDel}>Rechazar</button>
                          </>
                        ) : '—'}
                      </td>
                    )}
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
  error: { color:'#c0392b', fontSize:13, marginBottom:12 },
  form: { display:'flex', gap:10, marginBottom:16, flexWrap:'wrap', alignItems:'center' },
  formLabel: { fontSize:13, fontWeight:600, color:'#475569' },
  input: { padding:'9px 12px', border:'1px solid #ccc', borderRadius:7, fontSize:14 },
  btnNew: { background:'#2563eb', color:'#fff', border:'none', borderRadius:7, padding:'10px 20px', fontSize:14, fontWeight:600, cursor:'pointer' },
  tableWrap: { overflowX:'auto', marginTop:20 },
  table: { width:'100%', borderCollapse:'collapse', fontSize:13 },
  th: { textAlign:'left', padding:'9px 12px', background:'#f1f5f9', color:'#374151', fontWeight:700, borderBottom:'2px solid #e2e8f0', whiteSpace:'nowrap' },
  tr: { borderBottom:'1px solid #f0f0f0' },
  td: { padding:'9px 12px', verticalAlign:'middle' },
  badge: { display:'inline-block', padding:'3px 10px', borderRadius:20, fontSize:12, fontWeight:600 },
  btnOk: { marginRight:4, padding:'4px 10px', fontSize:12, cursor:'pointer', background:'#dcfce7', color:'#166534', border:'none', borderRadius:5, fontWeight:600 },
  btnDel: { padding:'4px 10px', fontSize:12, cursor:'pointer', background:'#fee2e2', color:'#991b1b', border:'none', borderRadius:5, fontWeight:600 },
  info: { color:'#94a3b8', textAlign:'center', padding:40 },
  empty: { textAlign:'center', padding:40, color:'#999', fontSize:15 },
};
