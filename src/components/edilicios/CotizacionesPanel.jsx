import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';

export default function CotizacionesPanel({ solicitudId, puedeGestionar }) {
  const [cotizaciones, setCotizaciones] = useState([]);
  const [proveedor, setProveedor] = useState('');
  const [monto, setMonto]         = useState('');
  const [file, setFile]           = useState(null);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState(null);

  const fetchCotizaciones = useCallback(async () => {
    const { data } = await supabase
      .from('edilicios_cotizaciones')
      .select('*')
      .eq('solicitud_id', solicitudId)
      .order('created_at', { ascending: false });
    setCotizaciones(data ?? []);
  }, [solicitudId]);

  useEffect(() => { fetchCotizaciones(); }, [fetchCotizaciones]);

  async function handleAdd(e) {
    e.preventDefault();
    setError(null);
    const num = parseFloat(monto);
    if (!proveedor.trim()) { setError('Ingresá el proveedor.'); return; }
    if (isNaN(num) || num <= 0) { setError('Ingresá un monto válido.'); return; }

    setSaving(true);
    let archivo_url = null;

    if (file) {
      const ext = file.name.split('.').pop();
      const path = `${solicitudId}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from('edilicios-adjuntos').upload(path, file);
      if (uploadErr) { setSaving(false); setError(uploadErr.message); return; }
      const { data: urlData } = supabase.storage.from('edilicios-adjuntos').getPublicUrl(path);
      archivo_url = urlData.publicUrl;
    }

    const { error: insertErr } = await supabase.from('edilicios_cotizaciones').insert({
      solicitud_id: solicitudId, proveedor, monto: num, archivo_url,
    });
    setSaving(false);
    if (insertErr) { setError(insertErr.message); return; }
    setProveedor(''); setMonto(''); setFile(null);
    await fetchCotizaciones();
  }

  async function handleSeleccionar(c) {
    await supabase.from('edilicios_cotizaciones').update({ seleccionada: false }).eq('solicitud_id', solicitudId);
    await supabase.from('edilicios_cotizaciones').update({ seleccionada: true }).eq('id', c.id);
    await fetchCotizaciones();
  }

  async function handleEliminar(c) {
    if (!window.confirm(`¿Eliminar la cotización de "${c.proveedor}"?`)) return;
    await supabase.from('edilicios_cotizaciones').delete().eq('id', c.id);
    await fetchCotizaciones();
  }

  return (
    <div style={styles.wrap}>
      <h4 style={styles.title}>Cotizaciones</h4>

      {cotizaciones.length === 0 ? (
        <p style={styles.empty}>Sin cotizaciones todavía.</p>
      ) : (
        <ul style={styles.list}>
          {cotizaciones.map(c => (
            <li key={c.id} style={{ ...styles.item, ...(c.seleccionada ? styles.itemSelected : {}) }}>
              {puedeGestionar && (
                <input type="radio" checked={c.seleccionada} onChange={() => handleSeleccionar(c)} style={styles.radio} />
              )}
              <span style={styles.proveedor}>{c.proveedor}</span>
              <span style={styles.monto}>${Number(c.monto).toLocaleString('es-AR')}</span>
              {c.archivo_url && (
                <a href={c.archivo_url} target="_blank" rel="noopener noreferrer" style={styles.link}>Ver archivo</a>
              )}
              {c.seleccionada && <span style={styles.badge}>Seleccionada</span>}
              {puedeGestionar && (
                <button onClick={() => handleEliminar(c)} style={styles.btnDel}>Eliminar</button>
              )}
            </li>
          ))}
        </ul>
      )}

      {puedeGestionar && (
        <form onSubmit={handleAdd} style={styles.form}>
          <input value={proveedor} onChange={e => setProveedor(e.target.value)}
            placeholder="Proveedor" style={styles.input} />
          <input type="number" min="0" step="0.01" value={monto} onChange={e => setMonto(e.target.value)}
            placeholder="Monto $" style={{ ...styles.input, width:120 }} />
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setFile(e.target.files[0])} style={styles.fileInput} />
          <button type="submit" disabled={saving} style={styles.btn}>{saving ? 'Agregando...' : 'Agregar'}</button>
        </form>
      )}
      {error && <p style={styles.error}>{error}</p>}
    </div>
  );
}

const styles = {
  wrap: { marginTop: 20, paddingTop: 16, borderTop: '1px solid #e2e8f0' },
  title: { margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: '#1a1a2e' },
  empty: { color: '#94a3b8', fontSize: 13, fontStyle: 'italic' },
  list: { listStyle: 'none', margin: '0 0 12px', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  item: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, background: '#f8fafc', padding: '8px 10px', borderRadius: 6 },
  itemSelected: { background: '#dcfce7' },
  radio: { margin: 0 },
  proveedor: { fontWeight: 700, flex: 1 },
  monto: { color: '#1e40af', fontWeight: 700 },
  link: { color: '#2563eb', fontSize: 12, textDecoration: 'none' },
  badge: { fontSize: 11, fontWeight: 700, color: '#166534', background: '#bbf7d0', padding: '2px 8px', borderRadius: 20 },
  btnDel: { padding: '3px 9px', fontSize: 11, cursor: 'pointer', background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: 5, fontWeight: 600 },
  form: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  input: { padding: '7px 10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13, flex: 1, minWidth: 140 },
  fileInput: { fontSize: 12, minWidth: 140 },
  btn: { background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  error: { color: '#c0392b', fontSize: 12, marginTop: 8 },
};
