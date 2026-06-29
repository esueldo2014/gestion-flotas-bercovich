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
  const esJefeEquipo = role?.rol === 'Jefe' && !role?.provincia_alcance; // Jefe sin alcance de provincia: solo su equipo
  const verTodo = puedeAprobar && !esJefeEquipo;
  const esEM = role?.rol === 'EM';
  const teamScoped = esEM || esJefeEquipo;
  const gestionaPersonal = teamScoped || verTodo;
  const scopeProvincia = role?.rol === 'Jefe' && role?.provincia_alcance ? role.provincia_alcance : null;
  const anioActual = new Date().getFullYear();

  const [solicitudes, setSolicitudes] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);
  const [usuarios, setUsuarios]       = useState([]);
  const [personal, setPersonal]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [formSol, setFormSol] = useState({ target:'', fecha_desde:'', fecha_hasta:'' });
  const [formAsig, setFormAsig] = useState({ target:'', anio: anioActual, dias_asignados:'' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);

    let depositosIds = null;
    if (teamScoped) {
      const { data: asig } = await supabase.from('usuarios_depositos').select('deposito_id').eq('usuario_id', role.id);
      depositosIds = (asig ?? []).map(a => a.deposito_id);
    }

    let sucursalIdsScope = null;
    if (scopeProvincia) {
      const { data: sucs } = await supabase.from('sucursales').select('id').eq('provincia', scopeProvincia);
      sucursalIdsScope = new Set((sucs ?? []).map(s => s.id));
    }

    let personalQuery = supabase.from('personal').select('id, nombre, rubro_deposito_id, deposito_id, funcion').eq('activo', true);
    if (teamScoped) personalQuery = personalQuery.in('rubro_deposito_id', depositosIds.length ? depositosIds : [-1]);
    if (sucursalIdsScope) personalQuery = personalQuery.in('deposito_id', Array.from(sucursalIdsScope));

    let usQuery = supabase.from('usuarios_roles').select('id, nombre, email, deposito_id');
    if (sucursalIdsScope) usQuery = usQuery.in('deposito_id', Array.from(sucursalIdsScope));

    let solQuery = supabase.from('vacaciones_solicitudes').select('*, usuarios_roles!usuario_id(nombre, email, deposito_id), personal(nombre, deposito_id, funcion)').order('fecha_desde', { ascending:false });
    if (!verTodo && !teamScoped) solQuery = solQuery.eq('usuario_id', role.id);

    const [solRes, asigRes, usRes, persRes] = await Promise.all([
      solQuery,
      supabase.from('vacaciones_asignacion').select('*').eq('anio', anioActual),
      verTodo ? usQuery : Promise.resolve({ data: [] }),
      gestionaPersonal ? personalQuery : Promise.resolve({ data: [] }),
    ]);
    if (solRes.error || asigRes.error || usRes.error || persRes.error) {
      setError((solRes.error || asigRes.error || usRes.error || persRes.error).message);
    } else {
      setError(null);
    }

    let sol = solRes.data ?? [];
    const pers = persRes.data ?? [];
    if (teamScoped) {
      const idsPersonal = new Set(pers.map(p => p.id));
      sol = sol.filter(s => s.usuario_id === role.id || idsPersonal.has(s.personal_id));
    } else if (verTodo && sucursalIdsScope) {
      sol = sol.filter(s => sucursalIdsScope.has(s.usuarios_roles?.deposito_id) || sucursalIdsScope.has(s.personal?.deposito_id));
    }

    let asigData = asigRes.data ?? [];
    if (teamScoped) {
      const idsPersonal = new Set(pers.map(p => p.id));
      asigData = asigData.filter(a => a.usuario_id === role.id || idsPersonal.has(a.personal_id));
    }

    setSolicitudes(sol);
    setAsignaciones(asigData);
    setUsuarios(usRes.data ?? []);
    setPersonal(pers);
    setLoading(false);
  }, [verTodo, esEM, teamScoped, gestionaPersonal, scopeProvincia, role?.id, anioActual]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function diasUsadosOPendientes(target) {
    const [tipo, id] = target.split(':');
    return solicitudes
      .filter(s => (tipo === 'p' ? s.personal_id === id : s.usuario_id === id))
      .filter(s => s.estado !== 'rechazado')
      .filter(s => new Date(s.fecha_desde).getFullYear() === anioActual)
      .reduce((acc, s) => acc + s.dias, 0);
  }

  function asignacionDe(target) {
    const [tipo, id] = target.split(':');
    const a = tipo === 'p'
      ? asignaciones.find(a => a.personal_id === id)
      : asignaciones.find(a => a.usuario_id === id);
    return a?.dias_asignados ?? 0;
  }

  function nombreDeTarget(target) {
    const [tipo, id] = target.split(':');
    if (tipo === 'p') return personal.find(p => p.id === id)?.nombre;
    return usuarios.find(u => u.id === id)?.nombre;
  }

  const miAsignacion = asignacionDe(`u:${role.id}`);
  const miUsado = diasUsadosOPendientes(`u:${role.id}`);
  const miDisponible = miAsignacion - miUsado;

  async function handleSubmitSolicitud(e) {
    e.preventDefault();
    setError(null);
    const { fecha_desde, fecha_hasta } = formSol;
    if (!fecha_desde || !fecha_hasta) return;
    if (gestionaPersonal && !formSol.target) { setError('Elegí para quién es esta solicitud.'); return; }
    const dias = diasEntre(fecha_desde, fecha_hasta);
    if (dias <= 0) { setError('El rango de fechas no es válido.'); return; }

    const target = gestionaPersonal ? formSol.target : `u:${role.id}`;
    const disponible = asignacionDe(target) - diasUsadosOPendientes(target);
    if (dias > disponible) {
      setError(`No alcanza el saldo disponible (${disponible} días).`);
      return;
    }
    const [tipo, id] = target.split(':');
    setSaving(true);
    const { error: err } = await supabase.from('vacaciones_solicitudes').insert({
      usuario_id: tipo === 'u' ? id : null,
      personal_id: tipo === 'p' ? id : null,
      fecha_desde, fecha_hasta, dias,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setFormSol({ target:'', fecha_desde:'', fecha_hasta:'' });
    await fetchAll();
  }

  async function handleSubmitAsignacion(e) {
    e.preventDefault();
    setError(null);
    const dias = parseFloat(formAsig.dias_asignados);
    if (!formAsig.target || !dias) return;
    const [tipo, id] = formAsig.target.split(':');
    setSaving(true);

    const filterCol = tipo === 'u' ? 'usuario_id' : 'personal_id';
    const { data: existente, error: errSel } = await supabase
      .from('vacaciones_asignacion').select('id').eq(filterCol, id).eq('anio', formAsig.anio).maybeSingle();
    if (errSel) { setSaving(false); setError(errSel.message); return; }

    const { error: err } = existente
      ? await supabase.from('vacaciones_asignacion').update({ dias_asignados: dias }).eq('id', existente.id)
      : await supabase.from('vacaciones_asignacion').insert({
          usuario_id: tipo === 'u' ? id : null,
          personal_id: tipo === 'p' ? id : null,
          anio: formAsig.anio, dias_asignados: dias,
        });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setFormAsig({ target:'', anio: anioActual, dias_asignados:'' });
    await fetchAll();
  }

  async function handleDecision(s, estado) {
    setError(null);
    const target = s.personal_id ? `p:${s.personal_id}` : `u:${s.usuario_id}`;
    if (estado === 'aprobado') {
      const asignado = asignacionDe(target);
      const usado = diasUsadosOPendientes(target); // ya incluye esta solicitud pendiente
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

  function nombreDe(s) {
    return s.personal?.nombre || s.usuarios_roles?.nombre || s.usuarios_roles?.email || '—';
  }

  const FUNCION_LABEL = { Analista: 'Analistas', Controlador: 'Controladores' };
  const gruposPersonal = personal.reduce((acc, p) => {
    const key = FUNCION_LABEL[p.funcion] || 'Personal / Maestranza';
    (acc[key] ??= []).push(p);
    return acc;
  }, {});

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
        {gestionaPersonal && (
          <select value={formSol.target} onChange={e => setFormSol(f => ({ ...f, target: e.target.value }))} required style={styles.input}>
            <option value="">¿Para quién?</option>
            {!verTodo && <option value={`u:${role.id}`}>Para mí</option>}
            {Object.entries(gruposPersonal).map(([grupo, lista]) => (
              <optgroup key={grupo} label={grupo}>
                {lista.map(p => <option key={p.id} value={`p:${p.id}`}>{p.nombre}</option>)}
              </optgroup>
            ))}
            {verTodo && usuarios.length > 0 && (
              <optgroup label="Empleados">
                {usuarios.map(u => <option key={u.id} value={`u:${u.id}`}>{u.nombre || u.email}</option>)}
              </optgroup>
            )}
          </select>
        )}
        <input type="date" value={formSol.fecha_desde} onChange={e => setFormSol(f => ({ ...f, fecha_desde: e.target.value }))} required style={styles.input} />
        <span style={styles.formLabel}>al</span>
        <input type="date" value={formSol.fecha_hasta} onChange={e => setFormSol(f => ({ ...f, fecha_hasta: e.target.value }))} required style={styles.input} />
        <button type="submit" disabled={saving} style={styles.btnNew}>{saving ? 'Guardando...' : '+ Solicitar'}</button>
      </form>

      {puedeAsignar && (
        <form onSubmit={handleSubmitAsignacion} style={styles.form}>
          <span style={styles.formLabel}>Asignar días {anioActual}:</span>
          <select value={formAsig.target} onChange={e => setFormAsig(f => ({ ...f, target: e.target.value }))} required style={styles.input}>
            <option value="">¿Para quién?</option>
            {Object.entries(gruposPersonal).map(([grupo, lista]) => (
              <optgroup key={grupo} label={grupo}>
                {lista.map(p => <option key={p.id} value={`p:${p.id}`}>{p.nombre}</option>)}
              </optgroup>
            ))}
            {usuarios.length > 0 && (
              <optgroup label="Empleados">
                {usuarios.map(u => <option key={u.id} value={`u:${u.id}`}>{u.nombre || u.email}</option>)}
              </optgroup>
            )}
          </select>
          <input type="number" min="0" placeholder="Días asignados" value={formAsig.dias_asignados} onChange={e => setFormAsig(f => ({ ...f, dias_asignados: e.target.value }))} required style={styles.input} />
          <button type="submit" disabled={saving} style={styles.btnNew}>{saving ? 'Guardando...' : '+ Asignar'}</button>
        </form>
      )}

      {puedeAsignar && asignaciones.length > 0 && (
        <div style={styles.tableWrap}>
          <h3 style={styles.sectionTitle}>Días asignados {anioActual}</h3>
          <table style={styles.table}>
            <thead>
              <tr><th style={styles.th}>Empleado</th><th style={styles.th}>Asignados</th><th style={styles.th}>Usados/pendientes</th><th style={styles.th}>Disponibles</th></tr>
            </thead>
            <tbody>
              {asignaciones.map(a => {
                const target = a.personal_id ? `p:${a.personal_id}` : `u:${a.usuario_id}`;
                const usado = diasUsadosOPendientes(target);
                return (
                  <tr key={a.id} style={styles.tr}>
                    <td style={styles.td}>{nombreDeTarget(target) || '—'}</td>
                    <td style={styles.td}>{a.dias_asignados}</td>
                    <td style={styles.td}>{usado}</td>
                    <td style={styles.td}>{a.dias_asignados - usado}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {loading ? <p style={styles.info}>Cargando...</p> : solicitudes.length === 0 ? (
        <div style={styles.empty}>Sin solicitudes.</div>
      ) : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {[...(verTodo || teamScoped ? ['Empleado'] : []), ...(teamScoped ? ['Función'] : []), 'Desde','Hasta','Días','Estado', ...(puedeAprobar ? ['Acciones'] : [])].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {solicitudes.map(s => {
                const col = ESTADO_COLORS[s.estado] ?? {};
                return (
                  <tr key={s.id} style={styles.tr}>
                    {(verTodo || teamScoped) && <td style={styles.td}>{nombreDe(s)}</td>}
                    {teamScoped && <td style={styles.td}>{s.personal?.funcion || '—'}</td>}
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
  sectionTitle: { fontSize:15, fontWeight:700, color:'#1a1a2e', margin:'0 0 8px' },
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
