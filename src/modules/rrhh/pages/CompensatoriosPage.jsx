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
  const soloMiDeposito = role?.rol === 'Supervisor'; // Gerencia ve todos los depósitos

  const [movimientos, setMovimientos] = useState([]);
  const [saldos, setSaldos]           = useState([]);
  const [usuarios, setUsuarios]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [formUso, setFormUso]         = useState({ fecha:'', dias:'', motivo:'' });
  const [formGen, setFormGen]         = useState({ usuario_id:'', fecha:'', dias:'', motivo:'' });
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    let usQuery = supabase.from('usuarios_roles').select('id, nombre, email');
    if (soloMiDeposito) usQuery = usQuery.eq('deposito_id', role.deposito_id);

    const [movRes, salRes, usRes] = await Promise.all([
      supabase.from('dias_compensatorios_movimientos').select('*, usuarios_roles(nombre, email)').order('fecha', { ascending:false }),
      supabase.from('dias_compensatorios_saldo').select('*'),
      verTodo ? usQuery : Promise.resolve({ data: [] }),
    ]);

    if (movRes.error || salRes.error || usRes.error) {
      setError((movRes.error || salRes.error || usRes.error).message);
    } else {
      setError(null);
    }

    const mov = movRes.data;
    const sal = salRes.data;
    const us = usRes.data;

    const idsVisibles = verTodo ? new Set(us?.map(u => u.id)) : null;
    const filtrados = verTodo
      ? (mov ?? []).filter(m => idsVisibles.has(m.usuario_id))
      : (mov ?? []).filter(m => m.usuario_id === role.id);

    setMovimientos(filtrados);
    setSaldos(sal ?? []);
    setUsuarios(us ?? []);
    setLoading(false);
  }, [verTodo, soloMiDeposito, role?.id, role?.deposito_id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const miSaldo = saldos.find(s => s.usuario_id === role.id)?.saldo_dias ?? 0;

  async function handleSubmitUso(e) {
    e.preventDefault();
    setError(null);
    const dias = parseFloat(formUso.dias);
    if (!formUso.fecha || !dias) return;
    if (dias > miSaldo) {
      setError(`No alcanza tu saldo disponible (${miSaldo} días).`);
      return;
    }
    setSaving(true);
    const { error: err } = await supabase.from('dias_compensatorios_movimientos').insert({
      usuario_id: role.id, tipo:'uso', fecha: formUso.fecha, dias, motivo: formUso.motivo || null,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setFormUso({ fecha:'', dias:'', motivo:'' });
    await fetchAll();
  }

  async function handleSubmitGeneracion(e) {
    e.preventDefault();
    setError(null);
    const dias = parseFloat(formGen.dias);
    if (!formGen.usuario_id || !formGen.fecha || !dias) return;
    setSaving(true);
    const { error: err } = await supabase.from('dias_compensatorios_movimientos').insert({
      usuario_id: formGen.usuario_id, tipo:'generado', fecha: formGen.fecha, dias, motivo: formGen.motivo || null,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setFormGen({ usuario_id:'', fecha:'', dias:'', motivo:'' });
    await fetchAll();
  }

  async function handleDecision(m, estado) {
    setError(null);
    if (estado === 'aprobado' && m.tipo === 'uso') {
      const saldoActual = saldos.find(s => s.usuario_id === m.usuario_id)?.saldo_dias ?? 0;
      if (m.dias > saldoActual) {
        setError('El saldo de esta persona ya no alcanza para aprobar esta solicitud.');
        return;
      }
    }
    await supabase.from('dias_compensatorios_movimientos').update({
      estado, aprobado_por: role.id, fecha_aprobacion: new Date().toISOString(),
    }).eq('id', m.id);

    if (estado === 'aprobado') {
      const saldoActual = saldos.find(s => s.usuario_id === m.usuario_id)?.saldo_dias ?? 0;
      const nuevoSaldo = m.tipo === 'generado' ? saldoActual + m.dias : saldoActual - m.dias;
      await supabase.from('dias_compensatorios_saldo').upsert({
        usuario_id: m.usuario_id, saldo_dias: nuevoSaldo, updated_at: new Date().toISOString(),
      });
    }
    await fetchAll();
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
        <input type="date" value={formUso.fecha} onChange={e => setFormUso(f => ({ ...f, fecha: e.target.value }))} required style={styles.input} />
        <input type="number" step="0.5" min="0" placeholder="Días" value={formUso.dias} onChange={e => setFormUso(f => ({ ...f, dias: e.target.value }))} required style={styles.input} />
        <input type="text" placeholder="Motivo (opcional)" value={formUso.motivo} onChange={e => setFormUso(f => ({ ...f, motivo: e.target.value }))} style={{ ...styles.input, flex:1 }} />
        <button type="submit" disabled={saving} style={styles.btnNew}>{saving ? 'Guardando...' : '+ Solicitar'}</button>
      </form>

      {puedeGenerar && (
        <form onSubmit={handleSubmitGeneracion} style={styles.form}>
          <span style={styles.formLabel}>Generar día (ej. trabajó feriado):</span>
          <select value={formGen.usuario_id} onChange={e => setFormGen(f => ({ ...f, usuario_id: e.target.value }))} required style={styles.input}>
            <option value="">Empleado...</option>
            {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre || u.email}</option>)}
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
                {[...(verTodo ? ['Empleado'] : []), 'Tipo','Fecha','Días','Motivo','Estado', ...(puedeAprobar ? ['Acciones'] : [])].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {movimientos.map(m => {
                const col = ESTADO_COLORS[m.estado] ?? {};
                return (
                  <tr key={m.id} style={styles.tr}>
                    {verTodo && <td style={styles.td}>{m.usuarios_roles?.nombre || m.usuarios_roles?.email}</td>}
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
