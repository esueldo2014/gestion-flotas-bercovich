import { useState, useEffect } from 'react';
import CotizacionesPanel from './CotizacionesPanel';

const PROVINCIAS = [{ id: 'T', label: 'Tucumán' }, { id: 'S', label: 'Santiago del Estero' }];
const CATEGORIAS = ['Eléctrico','Plomería','Techos / Goteras','Pintura','Seguridad','Estructural','Otro'];
const PRIORIDADES = ['Baja','Media','Alta','Urgente'];
const ESTADOS_FLOW = ['Detectado','En cotización','Pendiente de aprobación','Aprobado','Rechazado','En ejecución','Cerrado'];

const empty = {
  provincia: 'T', deposito_id: '', titulo: '', descripcion: '', categoria: '',
  prioridad: 'Media', estado: 'Detectado', reportado_por: '', observaciones_gerencia: '',
};

export default function EdilicioForm({ depositos, initial, permisos, onSave, onCancel }) {
  const [form, setForm] = useState({ ...empty, ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { setForm({ ...empty, ...initial }); }, [initial]);

  function handle(e) { setForm(f => ({ ...f, [e.target.name]: e.target.value })); }

  async function submit(e) {
    e.preventDefault(); setError(null); setSaving(true);
    try { await onSave(form); } catch (err) { setError(err.message); }
    setSaving(false);
  }

  const isEdit = !!initial?.id;
  const { puedeCrearEditar, puedeGestionarCotizaciones, puedeAprobar, puedeEjecutarCerrar } = permisos;
  const soloLectura = isEdit && !puedeCrearEditar;

  return (
    <div style={styles.overlay}>
      <form onSubmit={submit} style={styles.card} className="modal-card">
        <h3 style={styles.title}>{isEdit ? 'Editar solicitud' : 'Nueva necesidad detectada'}</h3>

        <div style={styles.grid} className="grid-2">
          <div style={styles.field}>
            <label style={styles.label}>Provincia *</label>
            <select name="provincia" value={form.provincia} onChange={handle} style={styles.input} required disabled={soloLectura}>
              {PROVINCIAS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Depósito / Sede</label>
            <select name="deposito_id" value={form.deposito_id} onChange={handle} style={styles.input} disabled={soloLectura}>
              <option value="">Seleccionar...</option>
              {depositos.map(d => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
            </select>
          </div>

          <div style={{ ...styles.field, gridColumn:'1/-1' }}>
            <label style={styles.label}>Título *</label>
            <input name="titulo" value={form.titulo} onChange={handle} required disabled={soloLectura}
              style={styles.input} placeholder="Ej: Filtración en techo del depósito" />
          </div>

          <div style={{ ...styles.field, gridColumn:'1/-1' }}>
            <label style={styles.label}>Descripción *</label>
            <textarea name="descripcion" value={form.descripcion} onChange={handle} required disabled={soloLectura}
              rows={3} style={{ ...styles.input, resize:'vertical' }} placeholder="Detalle de la necesidad detectada..." />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Categoría</label>
            <select name="categoria" value={form.categoria} onChange={handle} style={styles.input} disabled={soloLectura}>
              <option value="">Sin categoría</option>
              {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Prioridad *</label>
            <select name="prioridad" value={form.prioridad} onChange={handle} style={styles.input} required disabled={soloLectura}>
              {PRIORIDADES.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Reportado por</label>
            <input name="reportado_por" value={form.reportado_por} onChange={handle} style={styles.input} placeholder="Nombre" disabled={soloLectura} />
          </div>

          {isEdit && (
            <div style={styles.field}>
              <label style={styles.label}>Estado *</label>
              <select name="estado" value={form.estado} onChange={handle} style={styles.input}
                disabled={!puedeCambiarEstado(form.estado, permisos)}>
                {ESTADOS_FLOW.map(e => <option key={e}>{e}</option>)}
              </select>
            </div>
          )}

          {isEdit && form.estado === 'Rechazado' && puedeAprobar && (
            <div style={{ ...styles.field, gridColumn:'1/-1' }}>
              <label style={styles.label}>Motivo del rechazo</label>
              <textarea name="observaciones_gerencia" value={form.observaciones_gerencia} onChange={handle}
                rows={2} style={{ ...styles.input, resize:'vertical' }} />
            </div>
          )}
        </div>

        {error && <p style={styles.error}>{error}</p>}

        {isEdit && (puedeGestionarCotizaciones || form.estado !== 'Detectado') && (
          <CotizacionesPanel solicitudId={initial.id} puedeGestionar={puedeGestionarCotizaciones} />
        )}

        <div style={styles.actions}>
          <button type="button" onClick={onCancel} style={styles.btnSecondary}>{soloLectura ? 'Cerrar' : 'Cancelar'}</button>
          {!soloLectura && (
            <button type="submit" disabled={saving} style={styles.btnPrimary}>
              {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Reportar necesidad'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function puedeCambiarEstado(estadoActual, permisos) {
  const { puedeCrearEditar, puedeGestionarCotizaciones, puedeAprobar, puedeEjecutarCerrar } = permisos;
  if (estadoActual === 'Pendiente de aprobación') return puedeAprobar;
  if (['En ejecución', 'Aprobado'].includes(estadoActual)) return puedeEjecutarCerrar;
  return puedeGestionarCotizaciones || puedeCrearEditar;
}

const styles = {
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100, overflowY:'auto', padding:'20px 0' },
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
