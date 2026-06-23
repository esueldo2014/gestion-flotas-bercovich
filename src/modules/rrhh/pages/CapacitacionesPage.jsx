import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../shared/lib/supabaseClient';
import { useRole, can } from '../../../shared/lib/RoleContext';

function fechaVencimiento(cap) {
  if (!cap.vence || !cap.vigencia_meses) return null;
  const f = new Date(cap.fecha);
  f.setMonth(f.getMonth() + cap.vigencia_meses);
  return f;
}

export default function CapacitacionesPage() {
  const role = useRole();
  const puedeRegistrar = can.registrarCapacitacion(role?.rol);

  const [capacitaciones, setCapacitaciones] = useState([]);
  const [asistentes, setAsistentes]         = useState([]);
  const [usuarios, setUsuarios]             = useState([]);
  const [loading, setLoading]               = useState(true);
  const [showForm, setShowForm]             = useState(false);
  const [form, setForm] = useState({ tema:'', fecha:'', instructor:'', vence:false, vigencia_meses:'', asistentesIds:[] });
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [{ data: caps }, { data: asis }, { data: us }] = await Promise.all([
      supabase.from('capacitaciones').select('*').order('fecha', { ascending:false }),
      supabase.from('capacitaciones_asistentes').select('*, usuarios_roles(nombre, email)'),
      supabase.from('usuarios_roles').select('id, nombre, email'),
    ]);
    setCapacitaciones(caps ?? []);
    setAsistentes(asis ?? []);
    setUsuarios(us ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.tema || !form.fecha) return;
    setSaving(true);
    const { data: cap, error } = await supabase.from('capacitaciones').insert({
      tema: form.tema, fecha: form.fecha, instructor: form.instructor || null,
      vence: form.vence, vigencia_meses: form.vence ? parseInt(form.vigencia_meses, 10) : null,
    }).select().single();
    if (!error && form.asistentesIds.length) {
      await supabase.from('capacitaciones_asistentes').insert(
        form.asistentesIds.map(usuario_id => ({ capacitacion_id: cap.id, usuario_id, asistio: true }))
      );
    }
    setSaving(false);
    setShowForm(false);
    setForm({ tema:'', fecha:'', instructor:'', vence:false, vigencia_meses:'', asistentesIds:[] });
    await fetchAll();
  }

  // mis capacitaciones (cualquier rol ve las propias) + alertas de vencimiento
  const misAsistencias = asistentes.filter(a => a.usuario_id === role.id);
  const misCaps = misAsistencias
    .map(a => capacitaciones.find(c => c.id === a.capacitacion_id))
    .filter(Boolean);

  const hoy = new Date();
  const vencidasOProximas = misCaps
    .map(c => ({ cap: c, vencimiento: fechaVencimiento(c) }))
    .filter(x => x.vencimiento)
    .filter(x => (x.vencimiento - hoy) / 86400000 < 60); // vencidas o vencen en <60 días

  return (
    <div style={styles.page} className="page-padding">
      <div style={styles.header} className="header-flex">
        <div>
          <h1 style={styles.title}>Capacitaciones</h1>
          <p style={styles.subtitle}>{puedeRegistrar ? 'Registro general' : 'Tu historial de capacitaciones'}</p>
        </div>
        {puedeRegistrar && (
          <button onClick={() => setShowForm(true)} style={styles.btnNew}>+ Registrar capacitación</button>
        )}
      </div>

      {vencidasOProximas.length > 0 && (
        <div style={styles.alertBox}>
          {vencidasOProximas.map(({ cap, vencimiento }) => (
            <p key={cap.id} style={styles.alertLine}>
              {vencimiento < hoy ? '⚠️ Vencida' : '⏳ Vence pronto'}: <b>{cap.tema}</b> — {vencimiento.toLocaleDateString('es-AR')}
            </p>
          ))}
        </div>
      )}

      {loading ? <p style={styles.info}>Cargando...</p> : capacitaciones.length === 0 ? (
        <div style={styles.empty}>Sin capacitaciones registradas.</div>
      ) : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {['Tema','Fecha','Instructor','Vencimiento','Asistentes'].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(puedeRegistrar ? capacitaciones : misCaps).map(c => {
                const venc = fechaVencimiento(c);
                const asis = asistentes.filter(a => a.capacitacion_id === c.id);
                return (
                  <tr key={c.id} style={styles.tr}>
                    <td style={styles.td}>{c.tema}</td>
                    <td style={styles.td}>{new Date(c.fecha).toLocaleDateString('es-AR')}</td>
                    <td style={styles.td}>{c.instructor || '—'}</td>
                    <td style={styles.td}>{venc ? venc.toLocaleDateString('es-AR') : '—'}</td>
                    <td style={styles.td}>{asis.map(a => a.usuarios_roles?.nombre || a.usuarios_roles?.email).join(', ') || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div style={styles.modalBg}>
          <form onSubmit={handleSubmit} style={styles.modal}>
            <h2 style={styles.modalTitle}>Nueva capacitación</h2>
            <input type="text" placeholder="Tema" value={form.tema} onChange={e => setForm(f => ({ ...f, tema: e.target.value }))} required style={styles.input} />
            <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} required style={styles.input} />
            <input type="text" placeholder="Instructor (opcional)" value={form.instructor} onChange={e => setForm(f => ({ ...f, instructor: e.target.value }))} style={styles.input} />
            <label style={styles.checkLabel}>
              <input type="checkbox" checked={form.vence} onChange={e => setForm(f => ({ ...f, vence: e.target.checked }))} />
              Requiere recapacitación periódica
            </label>
            {form.vence && (
              <input type="number" min="1" placeholder="Vigencia en meses" value={form.vigencia_meses} onChange={e => setForm(f => ({ ...f, vigencia_meses: e.target.value }))} required style={styles.input} />
            )}
            <label style={styles.fieldLabel}>Asistentes</label>
            <select multiple value={form.asistentesIds} onChange={e => setForm(f => ({ ...f, asistentesIds: Array.from(e.target.selectedOptions, o => o.value) }))} style={styles.multiSelect}>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre || u.email}</option>)}
            </select>
            <div style={styles.modalActions}>
              <button type="button" onClick={() => setShowForm(false)} style={styles.btnCancel}>Cancelar</button>
              <button type="submit" disabled={saving} style={styles.btnNew}>{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: { maxWidth:1100, margin:'0 auto', padding:'28px 20px', fontFamily:'system-ui, sans-serif' },
  header: { display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 },
  title: { margin:0, fontSize:26, color:'#1a1a2e', fontWeight:700 },
  subtitle: { margin:'4px 0 0', fontSize:14, color:'#64748b' },
  btnNew: { background:'#2563eb', color:'#fff', border:'none', borderRadius:7, padding:'10px 20px', fontSize:14, fontWeight:600, cursor:'pointer' },
  alertBox: { background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:8, padding:'10px 14px', marginBottom:16 },
  alertLine: { margin:'4px 0', fontSize:13, color:'#9a3412' },
  tableWrap: { overflowX:'auto' },
  table: { width:'100%', borderCollapse:'collapse', fontSize:13 },
  th: { textAlign:'left', padding:'9px 12px', background:'#f1f5f9', color:'#374151', fontWeight:700, borderBottom:'2px solid #e2e8f0', whiteSpace:'nowrap' },
  tr: { borderBottom:'1px solid #f0f0f0' },
  td: { padding:'9px 12px', verticalAlign:'middle' },
  info: { color:'#94a3b8', textAlign:'center', padding:40 },
  empty: { textAlign:'center', padding:40, color:'#999', fontSize:15 },
  modalBg: { position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 },
  modal: { background:'#fff', borderRadius:12, padding:24, width:'100%', maxWidth:420, display:'flex', flexDirection:'column', gap:10 },
  modalTitle: { margin:'0 0 8px', fontSize:18, fontWeight:700, color:'#1a1a2e' },
  input: { padding:'9px 12px', border:'1px solid #ccc', borderRadius:7, fontSize:14, width:'100%' },
  checkLabel: { display:'flex', alignItems:'center', gap:8, fontSize:13, color:'#475569' },
  fieldLabel: { fontSize:13, fontWeight:600, color:'#444' },
  multiSelect: { padding:8, border:'1px solid #ccc', borderRadius:7, fontSize:13, minHeight:90 },
  modalActions: { display:'flex', justifyContent:'flex-end', gap:8, marginTop:8 },
  btnCancel: { background:'transparent', color:'#64748b', border:'none', padding:'10px 16px', fontSize:13, cursor:'pointer' },
};
