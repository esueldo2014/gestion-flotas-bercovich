import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function ChangePasswordPage({ user, forced, onDone, onCancel }) {
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    const { error: authErr } = await supabase.auth.updateUser({ password });
    if (authErr) {
      setLoading(false);
      setError(authErr.message);
      return;
    }

    const { error: dbErr } = await supabase
      .from('usuarios_roles')
      .update({ password_changed_at: new Date().toISOString() })
      .eq('id', user.id);

    setLoading(false);
    if (dbErr) { setError(dbErr.message); return; }
    onDone();
  }

  return (
    <div style={styles.bg}>
      <form onSubmit={handleSubmit} style={styles.card}>
        <h1 style={styles.title}>Cambiar contraseña</h1>
        {forced && (
          <p style={styles.forcedMsg}>
            Por seguridad, tenés que actualizar tu contraseña (han pasado más de 90 días desde el último cambio).
          </p>
        )}

        <div style={styles.field}>
          <label style={styles.label}>Nueva contraseña</label>
          <div style={styles.passwordWrap}>
            <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
              required autoFocus style={{ ...styles.input, paddingRight: 44 }} placeholder="••••••••" />
            <button type="button" onClick={() => setShowPassword(s => !s)} style={styles.eyeBtn}>
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Confirmar contraseña</label>
          <div style={styles.passwordWrap}>
            <input type={showPassword ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)}
              required style={{ ...styles.input, paddingRight: 44 }} placeholder="••••••••" />
            <button type="button" onClick={() => setShowPassword(s => !s)} style={styles.eyeBtn}>
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <button type="submit" disabled={loading} style={styles.btn}>
          {loading ? 'Guardando...' : 'Guardar contraseña'}
        </button>
        {!forced && (
          <button type="button" onClick={onCancel} style={styles.cancelBtn}>
            Cancelar
          </button>
        )}
      </form>
    </div>
  );
}

const styles = {
  bg: { minHeight:'100vh', background:'#f1f5f9', display:'flex', alignItems:'center', justifyContent:'center' },
  card: { background:'#fff', borderRadius:12, padding:'40px 36px', width:'100%', maxWidth:380, boxShadow:'0 8px 32px rgba(0,0,0,0.12)' },
  title: { margin:'0 0 12px', fontSize:22, fontWeight:700, color:'#1a1a2e', textAlign:'center', fontFamily:'system-ui, sans-serif' },
  forcedMsg: { margin:'0 0 20px', fontSize:13, color:'#b45309', background:'#fef3c7', padding:'10px 12px', borderRadius:8, fontFamily:'system-ui, sans-serif' },
  field: { display:'flex', flexDirection:'column', gap:4, marginBottom:16 },
  label: { fontSize:13, fontWeight:600, color:'#444', fontFamily:'system-ui, sans-serif' },
  input: { padding:'10px 12px', border:'1px solid #ccc', borderRadius:7, fontSize:14, fontFamily:'system-ui, sans-serif', outline:'none', width:'100%' },
  passwordWrap: { position:'relative', display:'flex' },
  eyeBtn: { position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', fontSize:16, padding:4 },
  error: { color:'#c0392b', fontSize:13, marginBottom:12, fontFamily:'system-ui, sans-serif' },
  btn: { width:'100%', background:'#2563eb', color:'#fff', border:'none', borderRadius:7, padding:'11px', fontSize:15, fontWeight:700, cursor:'pointer', fontFamily:'system-ui, sans-serif' },
  cancelBtn: { width:'100%', background:'transparent', color:'#64748b', border:'none', padding:'10px', fontSize:13, cursor:'pointer', marginTop:8, fontFamily:'system-ui, sans-serif' },
};
