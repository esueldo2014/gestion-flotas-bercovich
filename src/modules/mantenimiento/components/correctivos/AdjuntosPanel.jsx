import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../../shared/lib/supabaseClient';

const TIPOS = ['Foto de la rotura', 'Presupuesto', 'Factura', 'Otro'];

const BADGE_COLORS = {
  'Foto de la rotura': { background: '#fee2e2', color: '#991b1b' },
  'Factura':           { background: '#dcfce7', color: '#166534' },
  'Presupuesto':       { background: '#fef9c3', color: '#854d0e' },
};

export default function AdjuntosPanel({ correctivoId }) {
  const [adjuntos, setAdjuntos] = useState([]);
  const [tipo, setTipo]         = useState('Foto de la rotura');
  const [file, setFile]         = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError]       = useState(null);

  const fetchAdjuntos = useCallback(async () => {
    const { data } = await supabase
      .from('correctivos_adjuntos')
      .select('*')
      .eq('correctivo_id', correctivoId)
      .order('created_at', { ascending: false });
    setAdjuntos(data ?? []);
  }, [correctivoId]);

  useEffect(() => { fetchAdjuntos(); }, [fetchAdjuntos]);

  async function handleUpload(e) {
    e.preventDefault();
    setError(null);
    if (!file) { setError('Seleccioná un archivo.'); return; }
    setUploading(true);

    const ext = file.name.split('.').pop();
    const path = `${correctivoId}/${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('correctivos-adjuntos')
      .upload(path, file);

    if (uploadErr) { setUploading(false); setError(uploadErr.message); return; }

    const { data: urlData } = supabase.storage
      .from('correctivos-adjuntos')
      .getPublicUrl(path);

    const { error: insertErr } = await supabase.from('correctivos_adjuntos').insert({
      correctivo_id: correctivoId,
      tipo,
      nombre_archivo: file.name,
      url: urlData.publicUrl,
    });

    setUploading(false);
    if (insertErr) { setError(insertErr.message); return; }
    setFile(null);
    e.target.reset?.();
    await fetchAdjuntos();
  }

  async function handleEliminar(a) {
    if (!window.confirm(`¿Eliminar "${a.nombre_archivo}"?`)) return;
    await supabase.from('correctivos_adjuntos').delete().eq('id', a.id);
    await fetchAdjuntos();
  }

  return (
    <div style={styles.wrap}>
      <h4 style={styles.title}>Fotos y archivos</h4>

      <form onSubmit={handleUpload} style={styles.form}>
        <select value={tipo} onChange={e => setTipo(e.target.value)} style={styles.select}>
          {TIPOS.map(t => <option key={t}>{t}</option>)}
        </select>
        <label style={styles.fileBtn}>
          📷 Sacar foto
          <input type="file" accept="image/*" capture="environment"
            onChange={e => setFile(e.target.files[0])} style={styles.fileInputHidden} />
        </label>
        <label style={styles.fileBtn}>
          📎 Elegir archivo
          <input type="file" accept=".pdf,.jpg,.jpeg,.png"
            onChange={e => setFile(e.target.files[0])} style={styles.fileInputHidden} />
        </label>
        {file && <span style={styles.fileName}>{file.name}</span>}
        <button type="submit" disabled={uploading} style={styles.btn}>
          {uploading ? 'Subiendo...' : 'Subir'}
        </button>
      </form>
      {error && <p style={styles.error}>{error}</p>}

      {adjuntos.length === 0 ? (
        <p style={styles.empty}>Sin archivos adjuntos todavía.</p>
      ) : (
        <ul style={styles.list}>
          {adjuntos.map(a => (
            <li key={a.id} style={styles.item}>
              <span style={{ ...styles.tipoBadge, ...(BADGE_COLORS[a.tipo] ?? styles.presupuesto) }}>
                {a.tipo}
              </span>
              <a href={a.url} target="_blank" rel="noopener noreferrer" style={styles.link}>
                {a.nombre_archivo}
              </a>
              <span style={styles.fecha}>{new Date(a.created_at).toLocaleDateString('es-AR')}</span>
              <button onClick={() => handleEliminar(a)} style={styles.btnDel}>Eliminar</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const styles = {
  wrap: { marginTop: 20, paddingTop: 16, borderTop: '1px solid #e2e8f0' },
  title: { margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: '#1a1a2e' },
  form: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' },
  select: { padding: '7px 10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13 },
  fileInput: { fontSize: 13, flex: 1, minWidth: 160 },
  fileBtn: { display:'inline-flex', alignItems:'center', gap:6, background:'#f1f5f9', color:'#334155', border:'1px solid #cbd5e1', borderRadius:6, padding:'7px 12px', fontSize:13, fontWeight:600, cursor:'pointer' },
  fileInputHidden: { display:'none' },
  fileName: { fontSize:12, color:'#64748b', fontStyle:'italic' },
  btn: { background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  error: { color: '#c0392b', fontSize: 12, marginBottom: 8 },
  empty: { color: '#94a3b8', fontSize: 13, fontStyle: 'italic' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  item: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, background: '#f8fafc', padding: '7px 10px', borderRadius: 6 },
  tipoBadge: { fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20 },
  presupuesto: { background: '#fef9c3', color: '#854d0e' },
  factura: { background: '#dcfce7', color: '#166534' },
  link: { color: '#2563eb', textDecoration: 'none', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  fecha: { color: '#94a3b8', fontSize: 11 },
  btnDel: { padding: '3px 9px', fontSize: 11, cursor: 'pointer', background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: 5, fontWeight: 600 },
};
