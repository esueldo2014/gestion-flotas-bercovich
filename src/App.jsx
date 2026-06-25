import { useState, useEffect, useCallback } from 'react';
import { supabase } from './shared/lib/supabaseClient';
import { RoleContext, can } from './shared/lib/RoleContext';
import LoginPage        from './shared/pages/LoginPage';
import ChangePasswordPage from './shared/pages/ChangePasswordPage';
import MachinesPage     from './modules/mantenimiento/pages/MachinesPage';
import HorometroPage    from './modules/mantenimiento/pages/HorometroPage';
import PlanPage         from './modules/mantenimiento/pages/PlanPage';
import CorrectivosPage  from './modules/mantenimiento/pages/CorrectivosPage';
import DashboardPage    from './modules/mantenimiento/pages/DashboardPage';
import HomePage          from './shared/pages/HomePage';
import InformePage       from './modules/mantenimiento/pages/InformePage';
import EdilicioPage      from './modules/mantenimiento/pages/EdilicioPage';
import CombustiblePage   from './modules/mantenimiento/pages/CombustiblePage';
import CapacitacionesPage from './modules/rrhh/pages/CapacitacionesPage';
import HHEEPage           from './modules/rrhh/pages/HHEEPage';
import CompensatoriosPage from './modules/rrhh/pages/CompensatoriosPage';
import VacacionesPage     from './modules/rrhh/pages/VacacionesPage';
import EquipoPage         from './modules/rrhh/pages/EquipoPage';
import CierreHHEEPage     from './modules/rrhh/pages/CierreHHEEPage';
import EstructuraPage     from './modules/rrhh/pages/EstructuraPage';

const NAV_MANTENIMIENTO = [
  { id:'dashboard',    label:'Dashboard',       show: (rol) => can.verDashboard(rol) },
  { id:'maquinas',     label:'Máquinas',        show: () => true },
  { id:'horometro',    label:'Horómetro / Km',  show: () => true },
  { id:'combustible',  label:'Combustible',     show: () => true },
  { id:'preventivo',   label:'Plan preventivo', show: () => true },
  { id:'correctivos',  label:'Correctivos',     show: () => true },
  { id:'edilicio',     label:'Edilicio',        show: () => true },
  { id:'informe',      label:'Informe mensual', show: (rol) => can.verDashboard(rol) },
];

const NAV_RRHH = [
  { id:'capacitaciones',  label:'Capacitaciones',       show: () => true },
  { id:'hhee',            label:'Horas extra',          show: () => true },
  { id:'cierre-hhee',     label:'Cierre HHEE',          show: (rol) => can.verCierreHHEE(rol) },
  { id:'compensatorios',  label:'Días compensatorios',  show: () => true },
  { id:'vacaciones',      label:'Vacaciones',           show: () => true },
  { id:'equipo',          label:'Equipo',               show: (rol) => can.gestionarEquipo(rol) },
  { id:'estructura',      label:'Estructura',           show: (rol) => can.gestionarEquipo(rol) },
];

const MODULOS = [
  { id:'mantenimiento', label:'Mantenimiento', nav: NAV_MANTENIMIENTO },
  { id:'rrhh',          label:'RRHH',          nav: NAV_RRHH },
];

export default function App() {
  const [user, setUser]         = useState(null);
  const [role, setRole]         = useState(null);
  const [modulo, setModulo]     = useState('mantenimiento');
  const [page, setPage]         = useState('home');
  const [checking, setChecking] = useState(true);
  const [showChangePw, setShowChangePw] = useState(false);

  const PASSWORD_MAX_AGE_DAYS = 90;

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
    setPage('home');
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

  const passwordExpired = !role.password_changed_at ||
    (Date.now() - new Date(role.password_changed_at).getTime()) > PASSWORD_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

  if (passwordExpired || showChangePw) {
    return (
      <ChangePasswordPage
        user={user}
        forced={passwordExpired}
        onDone={async () => { setShowChangePw(false); await fetchRole(user); }}
        onCancel={() => setShowChangePw(false)}
      />
    );
  }

  const modulosConNav = MODULOS.map(m => ({ ...m, nav: m.nav.filter(n => n.show(role.rol)) }));
  const moduloActual = modulosConNav.find(m => m.id === modulo) ?? modulosConNav[0];
  const visibleNav = moduloActual.nav;
  // si la página actual no es visible para este rol/módulo, mostrar la primera disponible
  const currentPage = page === 'home' ? 'home' : (visibleNav.some(n => n.id === page) ? page : visibleNav[0]?.id);

  function handleSetModulo(id) {
    setModulo(id);
    setPage(modulosConNav.find(m => m.id === id)?.nav[0]?.id);
  }

  return (
    <RoleContext.Provider value={role}>
      <div>
        <nav style={styles.nav} className="no-print">
          <button onClick={() => setPage('home')} style={styles.brand}>
            <img src="/logo-bercovich.jpg" alt="Grupo Bercovich" style={styles.logo} />
          </button>
          <div style={styles.moduloSwitch}>
            {modulosConNav.map(m => (
              <button key={m.id} onClick={() => handleSetModulo(m.id)}
                style={{ ...styles.moduloBtn, ...(modulo === m.id && page !== 'home' ? styles.moduloBtnActive : {}) }}>
                {m.label}
              </button>
            ))}
          </div>
          <div style={styles.navLinks} className="nav-links-wrap">
            <button onClick={() => setPage('home')}
              style={{ ...styles.navBtn, ...(currentPage === 'home' ? styles.navBtnActive : {}) }}>
              Inicio
            </button>
            {visibleNav.map(n => (
              <button key={n.id} onClick={() => setPage(n.id)}
                style={{ ...styles.navBtn, ...(currentPage === n.id ? styles.navBtnActive : {}) }}>
                {n.label}
              </button>
            ))}
          </div>
          <div style={styles.userArea}>
            <span style={styles.userRol}>{role.rol}</span>
            <span style={styles.userEmail} className="hide-mobile">{user.email}</span>
            <button onClick={() => setShowChangePw(true)} style={styles.logoutBtn}>Contraseña</button>
            <button onClick={handleLogout} style={styles.logoutBtn}>Salir</button>
          </div>
        </nav>

        {currentPage === 'home' ? (
          <HomePage modulos={modulosConNav} onEnter={(modId, pageId) => { setModulo(modId); setPage(pageId); }} />
        ) : modulo === 'mantenimiento' ? (
          <>
            {currentPage === 'dashboard'   && <DashboardPage />}
            {currentPage === 'maquinas'    && <MachinesPage />}
            {currentPage === 'horometro'   && <HorometroPage />}
            {currentPage === 'combustible' && <CombustiblePage />}
            {currentPage === 'preventivo'  && <PlanPage />}
            {currentPage === 'correctivos' && <CorrectivosPage />}
            {currentPage === 'edilicio'    && <EdilicioPage />}
            {currentPage === 'informe'     && <InformePage />}
          </>
        ) : (
          <>
            {currentPage === 'capacitaciones' && <CapacitacionesPage />}
            {currentPage === 'hhee'           && <HHEEPage />}
            {currentPage === 'cierre-hhee'    && <CierreHHEEPage />}
            {currentPage === 'compensatorios' && <CompensatoriosPage />}
            {currentPage === 'vacaciones'     && <VacacionesPage />}
            {currentPage === 'equipo'         && <EquipoPage />}
            {currentPage === 'estructura'     && <EstructuraPage />}
          </>
        )}
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
  moduloSwitch: { display:'flex', gap:4, background:'#0f172a', borderRadius:8, padding:3 },
  moduloBtn: { background:'transparent', border:'none', color:'#94a3b8', padding:'6px 14px', borderRadius:6, cursor:'pointer', fontSize:12, fontFamily:'system-ui, sans-serif', fontWeight:600 },
  moduloBtnActive: { background:'#2563eb', color:'#fff' },
  navLinks: { display:'flex', gap:2, flex:1 },
  navBtn: { background:'transparent', border:'none', color:'#94a3b8', padding:'7px 14px', borderRadius:6, cursor:'pointer', fontSize:13, fontFamily:'system-ui, sans-serif', fontWeight:500 },
  navBtnActive: { background:'#334155', color:'#f1f5f9' },
  userArea: { display:'flex', alignItems:'center', gap:10, marginLeft:'auto' },
  userRol: { background:'#2563eb', color:'#fff', fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:20, fontFamily:'system-ui, sans-serif' },
  userEmail: { color:'#94a3b8', fontSize:12, fontFamily:'system-ui, sans-serif' },
  logoutBtn: { background:'#334155', color:'#cbd5e1', border:'none', borderRadius:6, padding:'6px 12px', fontSize:12, cursor:'pointer', fontFamily:'system-ui, sans-serif' },
};
