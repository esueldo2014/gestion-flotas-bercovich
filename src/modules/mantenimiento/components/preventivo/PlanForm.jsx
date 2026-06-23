import { useState, useEffect } from 'react';

const empty = { tarea: '', frecuencia_horas: '', frecuencia_dias: '' };

export default function PlanForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial ?? empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { setForm(initial ?? empty); }, [initial]);

  function handle(e) { setForm(f => ({ ...f, [e.target.name]: e.target.value })); }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (!form.frecuencia_horas && !form.frecuencia_dias) {
      setError('Ingresá al menos una frecuencia (horas o días).'); return;
    }
    setSaving(true);
    try { await onSave(form); } catch (err) { setError(err.message); }
    setSaving(false);
  }

  return (
    <div style={styles.overlay}>
      <form onSubmit={submit} style={styles.card} className="modal-card">
        <h3 style={styles.title}>{initial ? 'Editar tarea' : 'Nueva tarea preventiva'}</h3>

        <div style={styles.field}>
          <label style={styles.label}>Tarea *</label>
          <input name="tarea" value={form.tarea} onChange={handle} required
            placeholder="Ej: Cambio de aceite de motor" style={styles.input} />
        </div>

        <p style={styles.hint}>Definí la frecuencia por horas, por días, o ambas (se alerta por la que venza primero).</p>

        <div style={styles.row}>
          <div style={styles.field}>
            <label style={styles.label}>Cada X horas</label>
            <input name="frecuencia_horas" type="number" min="1" value={form.frecuencia_horas}
              onChange={handle} placeholder="Ej: 250" style={styles.input} />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Cada X días</label>
            <input name="frecuencia_dias" type="number" min="1" value={form.frecuencia_dias}
              onChange={handle} placeholder="Ej: 180" style={styles.input} />
          </div>
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <div style={styles.actions}>
          <button type="button" onClick={onCancel} style={styles.btnSecondary}>Cancelar</button>
          <button type="submit" disabled={saving} style={styles.btnPrimary}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  );
}

const styles = {
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 },
  card: { background:'#fff', borderRadius:10, padding:28, width:'100%', maxWidth:520, boxShadow:'0 8px 32px rgba(0,0,0,0.18)' },
  title: { margin:'0 0 18px', fontSize:18, color:'#1a1a2e' },
  hint: { fontSize:12, color:'#94a3b8', margin:'4px 0 12px' },
  row: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 },
  field: { display:'flex', flexDirection:'column', gap:4, marginBottom:14 },
  label: { fontSize:13, fontWeight:600, color:'#444' },
  input: { padding:'8px 10px', border:'1px solid #ccc', borderRadius:6, fontSize:14 },
  error: { color:'#c0392b', fontSize:13, marginTop:4 },
  actions: { display:'flex', justifyContent:'flex-end', gap:10, marginTop:20 },
  btnPrimary: { background:'#2563eb', color:'#fff', border:'none', borderRadius:6, padding:'9px 22px', fontSize:14, fontWeight:600, cursor:'pointer' },
  btnSecondary: { background:'#f1f5f9', color:'#333', border:'1px solid #ccc', borderRadius:6, padding:'9px 22px', fontSize:14, cursor:'pointer' },
};
