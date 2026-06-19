import { useState, useEffect } from 'react';
import AdjuntosPanel from './AdjuntosPanel';

const CATEGORIAS = ['Motor','Hidráulico','Eléctrico','Neumáticos','Frenos','Transmisión','Estructura','Otro'];
const ESTADOS    = ['Abierta','En proceso','Cerrada'];

const empty = {
  descripcion:'', categoria:'', reportado_por:'', asignado_a:'',
  repuestos:'', costo_total:'', estado:'Abierta', fecha_cierre:'',
};

export default function CorrectivoForm({ machines, initial, onSave, onCancel, verCostos = true, soloLectura = false }) {
  const [form, setForm] = useState({ maquina_id:'', ...empty, ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  useEffect(() => { setForm({ maquina_id:'', ...empty, ...initial }); }, [initial]);

  function handle(e) { setForm(f => ({ ...f, [e.target.name]: e.target.value })); }

  async function submit(e) {
    e.preventDefault(); setError(null); setSaving(true);
    try { await onSave(form); } catch(err) { setError(err.message); }
    setSaving(false);
  }

  const isEdit = !!initial?.id;

  return (
    <div style={styles.overlay}>
      <form onSubmit={submit} style={styles.card}>
        <h3 style={styles.title}>{isEdit ? 'Editar orden de trabajo' : 'Nueva orden de trabajo'}</h3>

        <div style={styles.grid}>
          {!isEdit && (
            <div style={{ ...styles.field, gridColumn:'1/-1' }}>
              <label style={styles.label}>Máquina *</label>
              <select name="maquina_id" value={form.maquina_id} onChange={handle} style={styles.input} required disabled={soloLectura}>
                <option value="">Seleccionar...</option>
                {machines.map(m => <option key={m.id} value={m.id}>{m.numero_interno} — {m.marca} {m.modelo}</option>)}
              </select>
            </div>
          )}

          <div style={{ ...styles.field, gridColumn:'1/-1' }}>
            <label style={styles.label}>Descripción de la falla *</label>
            <textarea name="descripcion" value={form.descripcion} onChange={handle} required disabled={soloLectura}
              rows={3} style={{ ...styles.input, resize:'vertical' }}
              placeholder="Describí qué falla o problema se detectó..." />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Categoría</label>
            <select name="categoria" value={form.categoria} onChange={handle} style={styles.input} disabled={soloLectura}>
              <option value="">Sin categoría</option>
              {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Estado *</label>
            <select name="estado" value={form.estado} onChange={handle} style={styles.input} required disabled={soloLectura}>
              {ESTADOS.map(e => <option key={e}>{e}</option>)}
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Reportado por</label>
            <input name="reportado_por" value={form.reportado_por} onChange={handle} style={styles.input} placeholder="Nombre del operario" disabled={soloLectura} />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Asignado a</label>
            <input name="asignado_a" value={form.asignado_a} onChange={handle} style={styles.input} placeholder="Mecánico o taller" disabled={soloLectura} />
          </div>

          <div style={{ ...styles.field, gridColumn:'1/-1' }}>
            <label style={styles.label}>Repuestos utilizados</label>
            <input name="repuestos" value={form.repuestos} onChange={handle} style={styles.input} placeholder="Ej: Filtro de aceite x1, correa x2..." disabled={soloLectura} />
          </div>

          {verCostos && (
            <div style={styles.field}>
              <label style={styles.label}>Costo total ($)</label>
              <input name="costo_total" type="number" min="0" step="0.01" value={form.costo_total} onChange={handle} style={styles.input} placeholder="0.00" disabled={soloLectura} />
            </div>
          )}

          {(form.estado === 'Cerrada') && (
            <div style={styles.field}>
              <label style={styles.label}>Fecha de cierre</label>
              <input name="fecha_cierre" type="datetime-local" value={form.fecha_cierre} onChange={handle} style={styles.input} disabled={soloLectura} />
            </div>
          )}
        </div>

        {error && <p style={styles.error}>{error}</p>}

        {isEdit && <AdjuntosPanel correctivoId={initial.id} />}

        <div style={styles.actions}>
          <button type="button" onClick={onCancel} style={styles.btnSecondary}>{soloLectura ? 'Cerrar' : 'Cancelar'}</button>
          {!soloLectura && (
            <button type="submit" disabled={saving} style={styles.btnPrimary}>
              {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear OT'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

const styles = {
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 },
  card: { background:'#fff', borderRadius:10, padding:28, width:'100%', maxWidth:640, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 8px 32px rgba(0,0,0,0.18)' },
  title: { margin:'0 0 18px', fontSize:18, color:'#1a1a2e' },
  grid: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px 20px' },
  field: { display:'flex', flexDirection:'column', gap:4 },
  label: { fontSize:13, fontWeight:600, color:'#444' },
  input: { padding:'8px 10px', border:'1px solid #ccc', borderRadius:6, fontSize:14, fontFamily:'inherit' },
  error: { color:'#c0392b', fontSize:13, marginTop:8 },
  actions: { display:'flex', justifyContent:'flex-end', gap:10, marginTop:20 },
  btnPrimary: { background:'#2563eb', color:'#fff', border:'none', borderRadius:6, padding:'9px 22px', fontSize:14, fontWeight:600, cursor:'pointer' },
  btnSecondary: { background:'#f1f5f9', color:'#333', border:'1px solid #ccc', borderRadius:6, padding:'9px 22px', fontSize:14, cursor:'pointer' },
};
