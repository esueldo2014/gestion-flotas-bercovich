import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../shared/lib/supabaseClient';
import { useRole, can } from '../../../shared/lib/RoleContext';

const ESTADO_COLORS = {
  'pendiente': { bg:'#fef9c3', text:'#854d0e' },
  'aprobada':  { bg:'#dcfce7', text:'#166534' },
  'rechazada': { bg:'#fee2e2', text:'#991b1b' },
};

const CATEGORIAS = [
  'PRE INVENTARIO', 'INVENTARIO', 'ATENCION CLIENTES', 'DESCARGA PROVEEDORES',
  'PREPARACION PHR', 'COBERTURA VACACIONES', 'TAREAS DE MANTENIMIENTO', 'OTROS',
];

export default function HHEEPage() {
  const role = useRole();
  const puedeAprobar = can.aprobarSolicitudRRHH(role?.rol);
  const esJefeEquipo = role?.rol === 'Jefe' && !role?.provincia_alcance; // Jefe sin alcance de provincia: solo su equipo
  const verTodo = puedeAprobar && !esJefeEquipo;
  const esEM = role?.rol === 'EM';
  const teamScoped = esEM || esJefeEquipo;
  const gestionaPersonal = teamScoped || verTodo;
  const scopeProvincia = role?.rol === 'Jefe' && role?.provincia_alcance ? role.provincia_alcance : null;

  const [registros, setRegistros] = useState([]);
  const [usuarios, setUsuarios]   = useState([]);
  const [personal, setPersonal]   = useState([]);
  const [controladores, setControladores] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [form, setForm] = useState({ target:'', fecha:'', tipo:'50%', categoria:'', horas:'', motivo:'' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [filterEstado, setFilterEstado] = useState('');
  const [filterCategoria, setFilterCategoria] = useState('');

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

    // a todos los EM de Tucumán se les permite cargar HHEE también a los Controladores
    let ctrl = [];
    if (esEM) {
      const { data: misuc } = await supabase.from('sucursales').select('provincia').eq('id', role.deposito_id).maybeSingle();
      if (misuc?.provincia === 'T') {
        const { data: ctrlData } = await supabase.from('personal')
          .select('id, nombre, rubro_deposito_id, deposito_id').eq('activo', true).eq('funcion', 'Controlador');
        ctrl = ctrlData ?? [];
      }
    }

    const [hheeRes, usRes, persRes] = await Promise.all([
      supabase.from('hhee').select('*, usuarios_roles!usuario_id(nombre, email, deposito_id), personal(nombre, deposito_id, funcion)').order('fecha', { ascending:false }),
      verTodo ? usQuery : Promise.resolve({ data: [] }),
      gestionaPersonal ? personalQuery : Promise.resolve({ data: [] }),
    ]);

    if (hheeRes.error || usRes.error || persRes.error) {
      setError((hheeRes.error || usRes.error || persRes.error).message);
    } else {
      setError(null);
    }

    const hhee = hheeRes.data ?? [];
    const us = usRes.data ?? [];
    const pers = persRes.data ?? [];

    let filtrados;
    if (verTodo) {
      filtrados = sucursalIdsScope
        ? hhee.filter(r => sucursalIdsScope.has(r.usuarios_roles?.deposito_id) || sucursalIdsScope.has(r.personal?.deposito_id))
        : hhee;
    } else if (teamScoped) {
      const idsPersonal = new Set([...pers.map(p => p.id), ...ctrl.map(c => c.id)]);
      filtrados = hhee.filter(r => r.usuario_id === role.id || idsPersonal.has(r.personal_id));
    } else {
      filtrados = hhee.filter(r => r.usuario_id === role.id);
    }

    setRegistros(filtrados);
    setUsuarios(us);
    setPersonal(pers);
    setControladores(ctrl);
    setLoading(false);
  }, [verTodo, esEM, teamScoped, gestionaPersonal, scopeProvincia, role?.id, role?.deposito_id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function handleFechaChange(fecha) {
    const dia = fecha ? new Date(fecha + 'T00:00:00').getDay() : null; // 0=domingo, 6=sabado
    const tipoSugerido = dia === 0 ? '100%' : '50%';
    setForm(f => ({ ...f, fecha, tipo: tipoSugerido }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!form.fecha || !form.horas) return;
    if (gestionaPersonal && !form.target) { setError('Elegí para quién es esta hora extra.'); return; }
    if (!form.categoria) { setError('Elegí una categoría.'); return; }

    let usuario_id = null, personal_id = null;
    if (gestionaPersonal) {
      const [tipo, id] = form.target.split(':');
      if (tipo === 'p') personal_id = id; else usuario_id = id;
    } else {
      usuario_id = role.id;
    }

    setSaving(true);
    const { error: err } = await supabase.from('hhee').insert({
      usuario_id, personal_id,
      fecha: form.fecha,
      tipo: form.tipo,
      categoria: form.categoria,
      horas: parseFloat(form.horas),
      motivo: form.motivo || null,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setForm({ target:'', fecha:'', tipo:'50%', categoria:'', horas:'', motivo:'' });
    await fetchAll();
  }

  async function handleDecision(r, estado) {
    await supabase.from('hhee').update({
      estado,
      aprobado_por: role.id,
      fecha_aprobacion: new Date().toISOString(),
    }).eq('id', r.id);
    await fetchAll();
  }

  const filtered = registros
    .filter(r => !filterEstado || r.estado === filterEstado)
    .filter(r => !filterCategoria || r.categoria === filterCategoria);

  function nombreDe(r) {
    return r.personal?.nombre || r.usuarios_roles?.nombre || r.usuarios_roles?.email || '—';
  }

  // agrupar el personal por función (Analista/Controlador) cuando esté cargada; sino, un solo grupo
  const FUNCION_LABEL = { Analista: 'Analistas', Controlador: 'Controladores' };
  const gruposPersonal = personal.reduce((acc, p) => {
    const key = FUNCION_LABEL[p.funcion] || 'Personal / Maestranza';
    (acc[key] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div style={styles.page} className="page-padding">
      <div style={styles.header}>
        <h1 style={styles.title}>Horas extra</h1>
        <p style={styles.subtitle}>{verTodo ? 'Todas las solicitudes' : teamScoped ? 'Tuyas y de tu equipo' : 'Tus horas extra cargadas'}</p>
      </div>

      {error && <p style={styles.error}>{error}</p>}

      <form onSubmit={handleSubmit} style={styles.form}>
        {gestionaPersonal && (
          <select value={form.target} onChange={e => setForm(f => ({ ...f, target: e.target.value }))} required style={styles.input}>
            <option value="">¿Para quién?</option>
            {!verTodo && <option value={`u:${role.id}`}>Para mí</option>}
            {Object.entries(gruposPersonal).map(([grupo, lista]) => (
              <optgroup key={grupo} label={grupo}>
                {lista.map(p => <option key={p.id} value={`p:${p.id}`}>{p.nombre}</option>)}
              </optgroup>
            ))}
            {controladores.length > 0 && (
              <optgroup label="Controladores">
                {controladores.map(c => <option key={c.id} value={`p:${c.id}`}>{c.nombre}</option>)}
              </optgroup>
            )}
            {verTodo && usuarios.length > 0 && (
              <optgroup label="Empleados">
                {usuarios.map(u => <option key={u.id} value={`u:${u.id}`}>{u.nombre || u.email}</option>)}
              </optgroup>
            )}
          </select>
        )}
        <input type="date" value={form.fecha} onChange={e => handleFechaChange(e.target.value)} required style={styles.input} />
        <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} style={styles.input}>
          <option value="50%">50%</option>
          <option value="100%">100%</option>
        </select>
        <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} required style={styles.input}>
          <option value="">Categoría...</option>
          {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="number" step="0.5" min="0" placeholder="Horas" value={form.horas} onChange={e => setForm(f => ({ ...f, horas: e.target.value }))} required style={styles.input} />
        <input type="text" placeholder="Motivo (opcional)" value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))} style={{ ...styles.input, flex:1 }} />
        <button type="submit" disabled={saving} style={styles.btnNew}>{saving ? 'Guardando...' : '+ Cargar'}</button>
      </form>
      <p style={styles.hint}>50%: hasta el sábado 13hs. 100%: desde el sábado 13hs hasta el domingo 24hs. El sistema sugiere el tipo según la fecha — revisalo si cargás un sábado.</p>

      <div style={styles.filters}>
        <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} style={styles.select}>
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="aprobada">Aprobada</option>
          <option value="rechazada">Rechazada</option>
        </select>
        <select value={filterCategoria} onChange={e => setFilterCategoria(e.target.value)} style={styles.select}>
          <option value="">Todas las categorías</option>
          {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span style={styles.count}>{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? <p style={styles.info}>Cargando...</p> : filtered.length === 0 ? (
        <div style={styles.empty}>Sin registros.</div>
      ) : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {[...(verTodo || teamScoped ? ['Empleado'] : []), ...(teamScoped ? ['Función'] : []), 'Fecha','Tipo','Categoría','Horas','Motivo','Estado', ...(puedeAprobar ? ['Acciones'] : [])].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const col = ESTADO_COLORS[r.estado] ?? {};
                return (
                  <tr key={r.id} style={styles.tr}>
                    {(verTodo || teamScoped) && <td style={styles.td}>{nombreDe(r)}</td>}
                    {teamScoped && <td style={styles.td}>{r.personal?.funcion || '—'}</td>}
                    <td style={styles.td}>{new Date(r.fecha).toLocaleDateString('es-AR')}</td>
                    <td style={styles.td}>{r.tipo || '—'}</td>
                    <td style={styles.td}>{r.categoria || '—'}</td>
                    <td style={styles.td}>{r.horas}</td>
                    <td style={styles.td}>{r.motivo || '—'}</td>
                    <td style={styles.td}><span style={{ ...styles.badge, background: col.bg, color: col.text }}>{r.estado}</span></td>
                    {puedeAprobar && (
                      <td style={styles.td}>
                        {r.estado === 'pendiente' ? (
                          <>
                            <button onClick={() => handleDecision(r, 'aprobada')} style={styles.btnOk}>Aprobar</button>
                            <button onClick={() => handleDecision(r, 'rechazada')} style={styles.btnDel}>Rechazar</button>
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
  form: { display:'flex', gap:10, marginBottom:8, flexWrap:'wrap' },
  hint: { fontSize:12, color:'#94a3b8', marginBottom:20 },
  error: { color:'#c0392b', fontSize:13, marginBottom:12 },
  input: { padding:'9px 12px', border:'1px solid #ccc', borderRadius:7, fontSize:14 },
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
  btnOk: { marginRight:4, padding:'4px 10px', fontSize:12, cursor:'pointer', background:'#dcfce7', color:'#166534', border:'none', borderRadius:5, fontWeight:600 },
  btnDel: { padding:'4px 10px', fontSize:12, cursor:'pointer', background:'#fee2e2', color:'#991b1b', border:'none', borderRadius:5, fontWeight:600 },
  info: { color:'#94a3b8', textAlign:'center', padding:40 },
  empty: { textAlign:'center', padding:40, color:'#999', fontSize:15 },
};
