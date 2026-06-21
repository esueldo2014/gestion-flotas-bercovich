import { useState, useEffect, useCallback } from 'react';
import { supabase } from './lib/supabaseClient';
import { RoleContext, can } from './lib/RoleContext';
import LoginPage        from './pages/LoginPage';
import MachinesPage     from './pages/MachinesPage';
import HorometroPage    from './pages/HorometroPage';
import PlanPage         from './pages/PlanPage';
import CorrectivosPage  from './pages/CorrectivosPage';
import DashboardPage    from './pages/DashboardPage';
import HomePage          from './pages/HomePage';
import InformePage       from './pages/InformePage';
import EdilicioPage      from './pages/EdilicioPage';

const NAV = [
  { id:'inicio',       label:'Inicio',          show: () => true },
  { id:'dashboard',    label:'Dashboard',       show: (rol) => can.verDashboard(rol) },
  { id:'maquinas',     label:'Máquinas',        show: () => true },
  { id:'horometro',    label:'Horómetro / Km',  show: () => true },
  { id:'preventivo',   label:'Plan preventivo', show: () => true },
  { id:'correctivos',  label:'Correctivos',     show: () => true },
  { id:'edilicio',     label:'Edilicio',        show: () => true },
  { id:'informe',      label:'Informe mensual', show: (rol) => can.verDashboard(rol) },
];

export default function App() {
  const [user, setUser]         = useState(null);
  const [role, setRole]         = useState(null);
  const [page, setPage]         = useState('inicio');
  const [checking, setChecking] = useState(true);

  const fetchRole = useCallback(async (currentUser) => {
    if (!currentUser) { setRole(null); return; }
    const { data } = await supabase
      .from('usuarios_roles')
      .select('*')
      .eq('id', currentUser.id)
      .single();
    setRole(data ?? null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const u = data.session?.user ?? null;
      setUser(u);
      await fetchRole(u);
      setChecking(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_e, session) => {
      const u = session?.user ?? null;
      setUser(u);
      await fetchRole(u);
    });
    return () => subscription.unsubscribe();
  }, [fetchRole]);

  async function handleLogin(loggedUser) {
    setUser(loggedUser);
    await fetchRole(loggedUser);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setPage('inicio');
  }

  if (checking) return <div style={styles.loading}>Cargando...</div>;
  if (!user)    return <LoginPage onLogin={handleLogin} />;

  if (!role) {
    return (
      <div style={styles.noRole}>
        <p>Tu usuario todavía no tiene un rol asignado.</p>
        <p style={styles.noRoleSub}>Pedile a Gerencia que te asigne un rol en Supabase → tabla usuarios_roles.</p>
        <button onClick={handleLogout} style={styles.logoutBtn}>Salir</button>
      </div>
    );
  }

  const visibleNav = NAV.filter(n => n.show(role.rol));
  // si la página actual no es visible para este rol, mostrar la primera disponible
  const currentPage = visibleNav.some(n => n.id === page) ? page : visibleNav[0]?.id;

  return (
    <RoleContext.Provider value={role}>
      <div>
        <nav style={styles.nav} className="no-print">
          <button onClick={() => setPage('inicio')} style={styles.brand}>
            <img src="/logo-bercovich.jpg" alt="Grupo Bercovich" style={styles.logo} />
          </button>
          <div style={styles.navLinks}>
            {visibleNav.map(n => (
              <button key={n.id} onClick={() => setPage(n.id)}
                style={{ ...styles.navBtn, ...(currentPage === n.id ? styles.navBtnActive : {}) }}>
                {n.label}
              </button>
            ))}
          </div>
          <div style={styles.userArea}>
            <span style={styles.userRol}>{role.rol}</span>
            <span style={styles.userEmail}>{user.email}</span>
            <button onClick={handleLogout} style={styles.logoutBtn}>Salir</button>
          </div>
        </nav>

        {currentPage === 'inicio'      && <HomePage nav={visibleNav.filter(n => n.id !== 'inicio')} onNavigate={setPage} />}
        {currentPage === 'dashboard'   && <DashboardPage />}
        {currentPage === 'maquinas'    && <MachinesPage />}
        {currentPage === 'horometro'   && <HorometroPage />}
        {currentPage === 'preventivo'  && <PlanPage />}
        {currentPage === 'correctivos' && <CorrectivosPage />}
        {currentPage === 'edilicio'    && <EdilicioPage />}
        {currentPage === 'informe'     && <InformePage />}
      </div>
    </RoleContext.Provider>
  );
}

const styles = {
  loading: { display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', fontFamily:'system-ui, sans-serif', color:'#94a3b8' },
  noRole: { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh', fontFamily:'system-ui, sans-serif', gap:10, color:'#475569' },
  noRoleSub: { fontSize:13, color:'#94a3b8', marginBottom:10 },
  nav: { display:'flex', alignItems:'center', gap:24, padding:'12px 24px', background:'#1e293b', position:'sticky', top:0, zIndex:50, flexWrap:'wrap' },
  brand: { background:'transparent', border:'none', cursor:'pointer', padding:0, display:'flex', alignItems:'center' },
  logo: { height:32, display:'block' },
  navLinks: { display:'flex', gap:2, flex:1 },
  navBtn: { background:'transparent', border:'none', color:'#94a3b8', padding:'7px 14px', borderRadius:6, cursor:'pointer', fontSize:13, fontFamily:'system-ui, sans-serif', fontWeight:500 },
  navBtnActive: { background:'#334155', color:'#f1f5f9' },
  userArea: { display:'flex', alignItems:'center', gap:10, marginLeft:'auto' },
  userRol: { background:'#2563eb', color:'#fff', fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:20, fontFamily:'system-ui, sans-serif' },
  userEmail: { color:'#94a3b8', fontSize:12, fontFamily:'system-ui, sans-serif' },
  logoutBtn: { background:'#334155', color:'#cbd5e1', border:'none', borderRadius:6, padding:'6px 12px', fontSize:12, cursor:'pointer', fontFamily:'system-ui, sans-serif' },
};
