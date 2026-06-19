import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function LoginPage({ onLogin }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null); setLoading(true);
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) { setError(err.message); return; }
    onLogin(data.user);
  }

  return (
    <div style={styles.bg}>
      <form onSubmit={handleSubmit} style={styles.card}>
        <div style={styles.logo}>🏭</div>
        <h1 style={styles.title}>Gestión de Flotas</h1>
        <p style={styles.subtitle}>Grupo Bercovich / Tu Mundo Distribución</p>

        <div style={styles.field}>
          <label style={styles.label}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            required autoFocus style={styles.input} placeholder="usuario@empresa.com" />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Contraseña</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            required style={styles.input} placeholder="••••••••" />
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <button type="submit" disabled={loading} style={styles.btn}>
          {loading ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}

const styles = {
  bg: { minHeight:'100vh', background:'#f1f5f9', display:'flex', alignItems:'center', justifyContent:'center' },
  card: { background:'#fff', borderRadius:12, padding:'40px 36px', width:'100%', maxWidth:380, boxShadow:'0 8px 32px rgba(0,0,0,0.12)' },
  logo: { fontSize:40, textAlign:'center', marginBottom:8 },
  title: { margin:'0 0 4px', fontSize:22, fontWeight:700, color:'#1a1a2e', textAlign:'center', fontFamily:'system-ui, sans-serif' },
  subtitle: { margin:'0 0 28px', fontSize:13, color:'#94a3b8', textAlign:'center', fontFamily:'system-ui, sans-serif' },
  field: { display:'flex', flexDirection:'column', gap:4, marginBottom:16 },
  label: { fontSize:13, fontWeight:600, color:'#444', fontFamily:'system-ui, sans-serif' },
  input: { padding:'10px 12px', border:'1px solid #ccc', borderRadius:7, fontSize:14, fontFamily:'system-ui, sans-serif', outline:'none' },
  error: { color:'#c0392b', fontSize:13, marginBottom:12, fontFamily:'system-ui, sans-serif' },
  btn: { width:'100%', background:'#2563eb', color:'#fff', border:'none', borderRadius:7, padding:'11px', fontSize:15, fontWeight:700, cursor:'pointer', fontFamily:'system-ui, sans-serif' },
};
