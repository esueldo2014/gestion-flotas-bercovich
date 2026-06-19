import { useState, useEffect } from 'react';
import { supabase } from './lib/supabaseClient';
import LoginPage        from './pages/LoginPage';
import MachinesPage     from './pages/MachinesPage';
import HorometroPage    from './pages/HorometroPage';
import PlanPage         from './pages/PlanPage';
import CorrectivosPage  from './pages/CorrectivosPage';
import DashboardPage    from './pages/DashboardPage';
const NAV = [
  { id:'dashboard',    label:'Dashboard' },
  { id:'maquinas',     label:'Máquinas' },
  { id:'horometro',    label:'Horómetro / Km' },
  { id:'preventivo',   label:'Plan preventivo' },
  { id:'correctivos',  label:'Correctivos' },
];

export default function App() {
  const [user, setUser]   = useState(null);
  const [page, setPage]   = useState('dashboard');
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setChecking(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    setPage('dashboard');
  }

  if (checking) return <div style={styles.loading}>Cargando...</div>;
  if (!user)    return <LoginPage onLogin={setUser} />;

  return (
    <div>
      <nav style={styles.nav}>
        <span style={styles.brand}>🏭 Grupo Bercovich</span>
        <div style={styles.navLinks}>
          {NAV.map(n => (
            <button key={n.id} onClick={() => setPage(n.id)}
              style={{ ...styles.navBtn, ...(page === n.id ? styles.navBtnActive : {}) }}>
              {n.label}
            </button>
          ))}
        </div>
        <div style={styles.userArea}>
          <span style={styles.userEmail}>{user.email}</span>
          <button onClick={handleLogout} style={styles.logoutBtn}>Salir</button>
        </div>
      </nav>

      {page === 'dashboard'   && <DashboardPage />}
      {page === 'maquinas'    && <MachinesPage />}
      {page === 'horometro'   && <HorometroPage />}

      {page === 'preventivo'  && <PlanPage />}
      {page === 'correctivos' && <CorrectivosPage />}
    </div>
  );
}

const styles = {
  loading: { display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', fontFamily:'system-ui, sans-serif', color:'#94a3b8' },
  nav: { display:'flex', alignItems:'center', gap:24, padding:'12px 24px', background:'#1e293b', position:'sticky', top:0, zIndex:50, flexWrap:'wrap' },
  brand: { color:'#f1f5f9', fontWeight:700, fontSize:15, fontFamily:'system-ui, sans-serif', whiteSpace:'nowrap' },
  navLinks: { display:'flex', gap:2, flex:1 },
  navBtn: { background:'transparent', border:'none', color:'#94a3b8', padding:'7px 14px', borderRadius:6, cursor:'pointer', fontSize:13, fontFamily:'system-ui, sans-serif', fontWeight:500 },
  navBtnActive: { background:'#334155', color:'#f1f5f9' },
  userArea: { display:'flex', alignItems:'center', gap:10, marginLeft:'auto' },
  userEmail: { color:'#94a3b8', fontSize:12, fontFamily:'system-ui, sans-serif' },
  logoutBtn: { background:'#334155', color:'#cbd5e1', border:'none', borderRadius:6, padding:'6px 12px', fontSize:12, cursor:'pointer', fontFamily:'system-ui, sans-serif' },
};
