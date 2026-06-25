import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../shared/lib/supabaseClient';
import { useRole, can } from '../../../shared/lib/RoleContext';

const ESTADO_COLORS = {
  'pendiente': { bg:'#fef9c3', text:'#854d0e' },
  'aprobado':  { bg:'#dcfce7', text:'#166534' },
  'rechazado': { bg:'#fee2e2', text:'#991b1b' },
};

export default function CompensatoriosPage() {
  const role = useRole();
  const puedeAprobar = can.aprobarSolicitudRRHH(role?.rol);
  const puedeGenerar = can.generarCompensatorio(role?.rol);
  const verTodo = puedeAprobar;
  const esEM = role?.rol === 'EM';
  const gestionaPersonal = esEM || verTodo;

  const [movimientos, setMovimientos] = useState([]);
  const [saldos, setSaldos]           = useState([]);
  const [usuarios, setUsuarios]       = useState([]);
  const [personal, setPersonal]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [formUso, setFormUso]         = useState({ target:'', fecha:'', dias:'', motivo:'' });
  const [formGen, setFormGen]         = useState({ target:'', fecha:'', dias:'', motivo:'' });
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);

    let depositosIds = null;
    if (esEM && !verTodo) {
      const { data: asig } = await supabase.from('usuarios_depositos').select('deposito_id').eq('usuario_id', role.id);
      depositosIds = (asig ?? []).map(a => a.deposito_id);
    }

    let personalQuery = supabase.from('personal').select('id, nombre, rubro_deposito_id').eq('activo', true);
    if (esEM && !verTodo) personalQuery = personalQuery.in('rubro_deposito_id', depositosIds.length ? depositosIds : [-1]);

    const [movRes, salRes, usRes, persRes] = await Promise.all([
      supabase.from('dias_compensatorios_movimientos').select('*, usuarios_roles!usuario_id(nombre, email), personal(nombre)').order('fecha', { ascending:false }),
      supabase.from('dias_compensatorios_saldo').select('*'),
      verTodo ? supabase.from('usuarios_roles').select('id, nombre, email') : Promise.resolve({ data: [] }),
      gestionaPersonal ? personalQuery : Promise.resolve({ data: [] }),
    ]);

    if (movRes.error || salRes.error || usRes.error || persRes.error) {
      setError((movRes.error || salRes.error || usRes.error || persRes.error).message);
    } else {
      setError(null);
    }

    const mov = movRes.data ?? [];
    const us = usRes.data ?? [];
    const pers = persRes.data ?? [];

    let filtrados;
    if (verTodo) {
      filtrados = mov;
    } else if (esEM) {
      const idsPersonal = new Set(pers.map(p => p.id));
      filtrados = mov.filter(m => m.usuario_id === role.id || idsPersonal.has(m.personal_id));
    } else {
      filtrados = mov.filter(m => m.usuario_id === role.id);
    }

    setMovimientos(filtrados);
    setSaldos(salRes.data ?? []);
    setUsuarios(us);
    setPersonal(pers);
    setLoading(false);
  }, [verTodo, esEM, gestionaPersonal, role?.id, role?.rubro_deposito_id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function saldoDe(target) {
    if (!target) return 0;
    const [tipo, id] = target.split(':');
    const s = tipo === 'p'
      ? saldos.find(s => s.personal_id === id)
      : saldos.find(s => s.usuario_id === id);
    return s?.saldo_dias ?? 0;
  }

  const miSaldo = saldoDe(`u:${role.id}`);

  function nombreDeTarget(target) {
    const [tipo, id] = target.split(':');
    if (tipo === 'p') return personal.find(p => p.id === id)?.nombre;
    return usuarios.find(u => u.id === id)?.nombre;
  }

  async function handleSubmitUso(e) {
    e.preventDefault();
    setError(null);
    const dias = parseFloat(formUso.dias);
    if (!formUso.fecha || !dias) return;
    if (gestionaPersonal && !formUso.target) { setError('Elegí para quién es esta solicitud.'); return; }

    const target = gestionaPersonal ? formUso.target : `u:${role.id}`;
    const saldoObjetivo = saldoDe(target);
    if (dias > saldoObjetivo) {
      setError(`No alcanza el saldo disponible (${saldoObjetivo} días).`);
      return;
    }
    const [tipo, id] = target.split(':');
    setSaving(true);
    const { error: err } = await supabase.from('dias_compensatorios_movimientos').insert({
      usuario_id: tipo === 'u' ? id : null,
      personal_id: tipo === 'p' ? id : null,
      tipo:'uso', fecha: formUso.fecha, dias, motivo: formUso.motivo || null,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setFormUso({ target:'', fecha:'', dias:'', motivo:'' });
    await fetchAll();
  }

  async function handleSubmitGeneracion(e) {
    e.preventDefault();
    setError(null);
    const dias = parseFloat(formGen.dias);
    if (!formGen.target || !formGen.fecha || !dias) return;
    const [tipo, id] = formGen.target.split(':');
    setSaving(true);
    const { error: err } = await supabase.from('dias_compensatorios_movimientos').insert({
      usuario_id: tipo === 'u' ? id : null,
      personal_id: tipo === 'p' ? id : null,
      tipo:'generado', fecha: formGen.fecha, dias, motivo: formGen.motivo || null,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setFormGen({ target:'', fecha:'', dias:'', motivo:'' });
    await fetchAll();
  }

  async function handleDecision(m, estado) {
    setError(null);
    const esPersonal = !!m.personal_id;
    const saldoActual = esPersonal
      ? saldos.find(s => s.personal_id === m.personal_id)?.saldo_dias ?? 0
      : saldos.find(s => s.usuario_id === m.usuario_id)?.saldo_dias ?? 0;

    if (estado === 'aprobado' && m.tipo === 'uso' && m.dias > saldoActual) {
      setError('El saldo de esta persona ya no alcanza para aprobar esta solicitud.');
      return;
    }
    await supabase.from('dias_compensatorios_movimientos').update({
      estado, aprobado_por: role.id, fecha_aprobacion: new Date().toISOString(),
    }).eq('id', m.id);

    if (estado === 'aprobado') {
      const nuevoSaldo = m.tipo === 'generado' ? saldoActual + m.dias : saldoActual - m.dias;
      await supabase.from('dias_compensatorios_saldo').upsert({
        usuario_id: esPersonal ? null : m.usuario_id,
        personal_id: esPersonal ? m.personal_id : null,
        saldo_dias: nuevoSaldo, updated_at: new Date().toISOString(),
      }, { onConflict: esPersonal ? 'personal_id' : 'usuario_id' });
    }
    await fetchAll();
  }

  function nombreDe(m) {
    return m.personal?.nombre || m.usuarios_roles?.nombre || m.usuarios_roles?.email || '—';
  }

  return (
    <div style={styles.page} className="page-padding">
      <div style={styles.header}>
        <h1 style={styles.title}>Días compensatorios</h1>
        <p style={styles.subtitle}>Tu saldo disponible: <b>{miSaldo}</b> día{miSaldo === 1 ? '' : 's'}</p>
      </div>

      {error && <p style={styles.error}>{error}</p>}

      <form onSubmit={handleSubmitUso} style={styles.form}>
        <span style={styles.formLabel}>Solicitar uso:</span>
        {gestionaPersonal && (
          <select value={formUso.target} onChange={e => setFormUso(f => ({ ...f, target: e.target.value }))} required style={styles.input}>
            <option value="">¿Para quién?</option>
            {!verTodo && <option value={`u:${role.id}`}>Para mí</option>}
            {personal.length > 0 && (
              <optgroup label="Personal / Maestranza">
                {personal.map(p => <option key={p.id} value={`p:${p.id}`}>{p.nombre}</option>)}
              </optgroup>
            )}
            {verTodo && usuarios.length > 0 && (
              <optgroup label="Empleados">
                {usuarios.map(u => <option key={u.id} value={`u:${u.id}`}>{u.nombre || u.email}</option>)}
              </optgroup>
            )}
          </select>
        )}
        <input type="date" value={formUso.fecha} onChange={e => setFormUso(f => ({ ...f, fecha: e.target.value }))} required style={styles.input} />
        <input type="number" step="0.5" min="0" placeholder="Días" value={formUso.dias} onChange={e => setFormUso(f => ({ ...f, dias: e.target.value }))} required style={styles.input} />
        <input type="text" placeholder="Motivo (opcional)" value={formUso.motivo} onChange={e => setFormUso(f => ({ ...f, motivo: e.target.value }))} style={{ ...styles.input, flex:1 }} />
        <button type="submit" disabled={saving} style={styles.btnNew}>{saving ? 'Guardando...' : '+ Solicitar'}</button>
      </form>
      {gestionaPersonal && formUso.target && (
        <p style={styles.hint}>Saldo de {nombreDeTarget(formUso.target) || 'esta persona'}: {saldoDe(formUso.target)} días.</p>
      )}

      {puedeGenerar && (
        <form onSubmit={handleSubmitGeneracion} style={styles.form}>
          <span style={styles.formLabel}>Generar día (ej. trabajó feriado):</span>
          <select value={formGen.target} onChange={e => setFormGen(f => ({ ...f, target: e.target.value }))} required style={styles.input}>
            <option value="">¿Para quién?</option>
            {personal.length > 0 && (
              <optgroup label="Personal / Maestranza">
                {personal.map(p => <option key={p.id} value={`p:${p.id}`}>{p.nombre}</option>)}
              </optgroup>
            )}
            {verTodo && usuarios.length > 0 && (
              <optgroup label="Empleados">
                {usuarios.map(u => <option key={u.id} value={`u:${u.id}`}>{u.nombre || u.email}</option>)}
              </optgroup>
            )}
          </select>
          <input type="date" value={formGen.fecha} onChange={e => setFormGen(f => ({ ...f, fecha: e.target.value }))} required style={styles.input} />
          <input type="number" step="0.5" min="0" placeholder="Días" value={formGen.dias} onChange={e => setFormGen(f => ({ ...f, dias: e.target.value }))} required style={styles.input} />
          <input type="text" placeholder="Motivo" value={formGen.motivo} onChange={e => setFormGen(f => ({ ...f, motivo: e.target.value }))} style={{ ...styles.input, flex:1 }} />
          <button type="submit" disabled={saving} style={styles.btnNew}>{saving ? 'Guardando...' : '+ Generar'}</button>
        </form>
      )}

      {loading ? <p style={styles.info}>Cargando...</p> : movimientos.length === 0 ? (
        <div style={styles.empty}>Sin movimientos.</div>
      ) : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {[...(verTodo || esEM ? ['Empleado'] : []), 'Tipo','Fecha','Días','Motivo','Estado', ...(puedeAprobar ? ['Acciones'] : [])].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {movimientos.map(m => {
                const col = ESTADO_COLORS[m.estado] ?? {};
                return (
                  <tr key={m.id} style={styles.tr}>
                    {(verTodo || esEM) && <td style={styles.td}>{nombreDe(m)}</td>}
                    <td style={styles.td}>{m.tipo === 'generado' ? 'Generado' : 'Uso'}</td>
                    <td style={styles.td}>{new Date(m.fecha).toLocaleDateString('es-AR')}</td>
                    <td style={styles.td}>{m.dias}</td>
                    <td style={styles.td}>{m.motivo || '—'}</td>
                    <td style={styles.td}><span style={{ ...styles.badge, background: col.bg, color: col.text }}>{m.estado}</span></td>
                    {puedeAprobar && (
                      <td style={styles.td}>
                        {m.estado === 'pendiente' ? (
                          <>
                            <button onClick={() => handleDecision(m, 'aprobado')} style={styles.btnOk}>Aprobar</button>
                            <button onClick={() => handleDecision(m, 'rechazado')} style={styles.btnDel}>Rechazar</button>
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
  hint: { fontSize:12, color:'#94a3b8', marginTop:-8, marginBottom:16 },
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
