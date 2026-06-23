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
  const maquinaInfo = initial?.maquinas
    ?? machines.find(m => m.id === form.maquina_id);

  function handlePrint() { window.print(); }

  return (
    <>
      {isEdit && (
        <div className="print-only" style={printStyles.wrap}>
          <h2 style={printStyles.h1}>Orden de trabajo — Correctivo</h2>
          <p style={printStyles.sub}>Grupo Bercovich / Tu Mundo Distribución</p>
          <table style={printStyles.table}>
            <tbody>
              <tr><td style={printStyles.tdLabel}>Máquina</td><td style={printStyles.td}>{maquinaInfo ? `${maquinaInfo.numero_interno} — ${maquinaInfo.marca ?? ''} ${maquinaInfo.modelo ?? ''}` : '—'}</td></tr>
              <tr><td style={printStyles.tdLabel}>Fecha de reporte</td><td style={printStyles.td}>{initial.fecha_reporte ? new Date(initial.fecha_reporte).toLocaleString('es-AR') : '—'}</td></tr>
              <tr><td style={printStyles.tdLabel}>Estado</td><td style={printStyles.td}>{form.estado}</td></tr>
              <tr><td style={printStyles.tdLabel}>Categoría</td><td style={printStyles.td}>{form.categoria || '—'}</td></tr>
              <tr><td style={printStyles.tdLabel}>Descripción de la falla</td><td style={printStyles.td}>{form.descripcion}</td></tr>
              <tr><td style={printStyles.tdLabel}>Reportado por</td><td style={printStyles.td}>{form.reportado_por || '—'}</td></tr>
              <tr><td style={printStyles.tdLabel}>Asignado a</td><td style={printStyles.td}>{form.asignado_a || '—'}</td></tr>
              <tr><td style={printStyles.tdLabel}>Repuestos utilizados</td><td style={printStyles.td}>{form.repuestos || '—'}</td></tr>
              {verCostos && (
                <tr><td style={printStyles.tdLabel}>Costo total</td><td style={printStyles.td}>{form.costo_total ? `$${Number(form.costo_total).toLocaleString('es-AR')}` : '—'}</td></tr>
              )}
            </tbody>
          </table>
          <div style={printStyles.firma}>
            <div style={printStyles.firmaLine}>Firma operario</div>
            <div style={printStyles.firmaLine}>Firma mecánico / supervisor</div>
          </div>
        </div>
      )}

      <div style={styles.overlay} className="no-print">
      <form onSubmit={submit} style={styles.card} className="modal-card">
        <h3 style={styles.title}>{isEdit ? 'Editar orden de trabajo' : 'Nueva orden de trabajo'}</h3>

        <div style={styles.grid} className="grid-2">
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
          {isEdit && (
            <button type="button" onClick={handlePrint} style={styles.btnPrint}>🖨️ Imprimir OT</button>
          )}
          <button type="button" onClick={onCancel} style={styles.btnSecondary}>{soloLectura ? 'Cerrar' : 'Cancelar'}</button>
          {!soloLectura && (
            <button type="submit" disabled={saving} style={styles.btnPrimary}>
              {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear OT'}
            </button>
          )}
        </div>
      </form>
      </div>
    </>
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
  btnPrint: { background:'#f1f5f9', color:'#1e293b', border:'1px solid #cbd5e1', borderRadius:6, padding:'9px 16px', fontSize:14, fontWeight:600, cursor:'pointer', marginRight:'auto' },
};

const printStyles = {
  wrap: { maxWidth:700, margin:'30px auto', fontFamily:'system-ui, sans-serif', padding:'0 20px' },
  h1: { margin:'0 0 4px', fontSize:20 },
  sub: { margin:'0 0 20px', fontSize:13, color:'#666' },
  table: { width:'100%', borderCollapse:'collapse', fontSize:14 },
  tdLabel: { padding:'8px 10px', fontWeight:700, width:'30%', verticalAlign:'top', border:'1px solid #ccc', background:'#f5f5f5' },
  td: { padding:'8px 10px', border:'1px solid #ccc', verticalAlign:'top' },
  firma: { display:'flex', justifyContent:'space-between', marginTop:60 },
  firmaLine: { borderTop:'1px solid #333', paddingTop:6, width:'45%', textAlign:'center', fontSize:13 },
};
