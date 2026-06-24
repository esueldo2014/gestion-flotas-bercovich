import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../shared/lib/supabaseClient';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const PROVINCIAS = [
  { id: 'T', label: 'Tucumán' },
  { id: 'S', label: 'Santiago del Estero' },
];

export default function DashboardPage() {
  const [raw, setRaw]         = useState(null);
  const [loading, setLoading] = useState(true);
  const [provincia, setProvincia] = useState('T');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: maq }, { data: corr }, { data: plan }, { data: ejec }, { data: lect }] = await Promise.all([
      supabase.from('maquinas').select('id, numero_interno, estado, deposito_id, hora_inicial, sucursales(code)'),
      supabase.from('correctivos').select('id, estado, costo_total, maquina_id, fecha_reporte'),
      supabase.from('plan_preventivo').select('id, maquina_id, frecuencia_horas, frecuencia_dias'),
      supabase.from('preventivos_ejecutados').select('id, plan_id, maquina_id, fecha, horometro_valor'),
      supabase.from('lecturas_horometro').select('maquina_id, valor, fecha'),
    ]);
    setRaw({
      maquinas: maq ?? [], correctivos: corr ?? [], planItems: plan ?? [],
      ejecutados: ejec ?? [], lecturas: lect ?? [],
    });
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading || !raw) return <div style={styles.page}><p style={styles.info}>Cargando...</p></div>;

  const prefijos = provincia === 'S' ? ['S-', 'SC-'] : ['T-'];
  const maquinasProv = raw.maquinas.filter(m => {
    const num = (m.numero_interno || '').toUpperCase();
    return prefijos.some(p => num.startsWith(p));
  });
  const idsProv       = new Set(maquinasProv.map(m => m.id));
  const correctivosP  = raw.correctivos.filter(c => idsProv.has(c.maquina_id));
  const planP         = raw.planItems.filter(p => idsProv.has(p.maquina_id));
  const ejecutadosP   = raw.ejecutados.filter(e => idsProv.has(e.maquina_id));
  const lecturasP     = raw.lecturas.filter(l => idsProv.has(l.maquina_id));

  const stats = calcularStats(maquinasProv, correctivosP, planP, ejecutadosP, lecturasP);

  return (
    <div style={styles.page} className="page-padding">
      <div style={styles.header}>
        <h1 style={styles.title}>Dashboard</h1>
        <p style={styles.subtitle}>Resumen general de la flota</p>
      </div>

      <div style={styles.tabs}>
        {PROVINCIAS.map(p => (
          <button key={p.id} onClick={() => setProvincia(p.id)}
            style={{ ...styles.tab, ...(provincia === p.id ? styles.tabActive : {}) }}>
            {p.label}
          </button>
        ))}
      </div>

      {maquinasProv.length === 0 ? (
        <div style={styles.empty}>No hay máquinas registradas en {PROVINCIAS.find(p => p.id === provincia)?.label}.</div>
      ) : (
        <DashboardContent stats={stats} />
      )}
    </div>
  );
}

function calcularStats(maquinas, correctivos, planItems, ejecutados, lecturas) {
  const now = new Date();
  const mesActual = now.getMonth() + 1;
  const anioActual = now.getFullYear();

  const total      = maquinas.length;
  const operativas = maquinas.filter(m => m.estado === 'Operativo').length;
  const enTaller    = maquinas.filter(m => m.estado === 'En taller').length;
  const fueraServ   = maquinas.filter(m => m.estado === 'Fuera de servicio').length;
  const dispPct     = total > 0 ? Math.round((operativas / total) * 100) : 0;

  const corrAbiertas = correctivos.filter(c => c.estado !== 'Cerrada').length;
  const costoTotal   = correctivos.reduce((s, c) => s + (c.costo_total ?? 0), 0);

  const corrPorMaq = {};
  correctivos.forEach(c => { corrPorMaq[c.maquina_id] = (corrPorMaq[c.maquina_id] ?? 0) + 1; });
  const ranking = Object.entries(corrPorMaq)
    .sort((a,b) => b[1]-a[1]).slice(0,5)
    .map(([id, count]) => {
      const m = maquinas.find(m => m.id === id);
      return { id, count, numero: m?.numero_interno ?? '?', deposito: m?.sucursales?.code ?? '?' };
    });

  const ejecutadosSet = new Set(ejecutados.map(e => e.plan_id));
  const cumplimiento  = planItems.length > 0
    ? Math.round((planItems.filter(p => ejecutadosSet.has(p.id)).length / planItems.length) * 100) : null;

  const depMap = {};
  maquinas.forEach(m => {
    const code = m.sucursales?.code ?? 'N/A';
    if (!depMap[code]) depMap[code] = { total:0, operativas:0 };
    depMap[code].total++;
    if (m.estado === 'Operativo') depMap[code].operativas++;
  });

  const horasPorDep = {};
  const horasAnualPorDep = {};

  maquinas.forEach(m => {
    const lecsMaq = lecturas
      .filter(l => l.maquina_id === m.id)
      .sort((a,b) => new Date(a.fecha) - new Date(b.fecha));
    if (lecsMaq.length === 0) return;

    const porMes = {};
    lecsMaq.forEach(l => {
      const d = new Date(l.fecha);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      porMes[key] = { valor: Number(l.valor), anio: d.getFullYear(), mes: d.getMonth()+1 };
    });

    const mesesKeys = Object.keys(porMes).sort();
    const depCode = m.sucursales?.code ?? 'N/A';

    mesesKeys.forEach((key, i) => {
      const actual = porMes[key];
      let base = i === 0 ? (m.hora_inicial ?? null) : porMes[mesesKeys[i-1]].valor;
      if (base === null) return;
      const uso = actual.valor - base;
      if (uso <= 0) return;
      if (actual.anio === anioActual && actual.mes === mesActual) {
        horasPorDep[depCode] = (horasPorDep[depCode] ?? 0) + uso;
      }
      if (actual.anio === anioActual) {
        horasAnualPorDep[depCode] = (horasAnualPorDep[depCode] ?? 0) + uso;
      }
    });
  });

  return { total, operativas, enTaller, fueraServ, dispPct, corrAbiertas, costoTotal, ranking, cumplimiento, depMap, horasPorDep, horasAnualPorDep, mesActual, anioActual };
}

function DashboardContent({ stats }) {
  return (
    <>
      <div style={styles.kpiGrid}>
        <KPI label="Disponibilidad de flota" value={`${stats.dispPct}%`}
          sub={`${stats.operativas} de ${stats.total} máquinas operativas`}
          color={stats.dispPct >= 80 ? '#166534' : stats.dispPct >= 60 ? '#854d0e' : '#991b1b'}
          bg={stats.dispPct >= 80 ? '#dcfce7' : stats.dispPct >= 60 ? '#fef9c3' : '#fee2e2'} />
        <KPI label="En taller" value={stats.enTaller}
          sub="máquinas en reparación" color="#854d0e" bg="#fef9c3" />
        <KPI label="Fuera de servicio" value={stats.fueraServ}
          sub="máquinas inactivas" color="#991b1b" bg="#fee2e2" />
        <KPI label="OTs abiertas" value={stats.corrAbiertas}
          sub="correctivos pendientes" color={stats.corrAbiertas > 0 ? '#854d0e' : '#166534'}
          bg={stats.corrAbiertas > 0 ? '#fef9c3' : '#dcfce7'} />
        <KPI label="Costo total mantenimiento" value={`$${stats.costoTotal.toLocaleString('es-AR')}`}
          sub="suma de todos los correctivos cerrados" color="#1e40af" bg="#eff6ff" />
        {stats.cumplimiento !== null && (
          <KPI label="Cumplimiento preventivo" value={`${stats.cumplimiento}%`}
            sub="tareas con al menos 1 ejecución registrada"
            color={stats.cumplimiento >= 80 ? '#166534' : '#854d0e'}
            bg={stats.cumplimiento >= 80 ? '#dcfce7' : '#fef9c3'} />
        )}
      </div>

      {Object.keys(stats.horasPorDep).length > 0 && (
        <div style={{ ...styles.section, marginBottom:24 }}>
          <h2 style={styles.sectionTitle}>
            Horas de uso por sucursal — {MESES[stats.mesActual-1]} {stats.anioActual}
          </h2>
          <div style={styles.horasGrid}>
            {Object.entries(stats.horasPorDep).sort((a,b) => b[1]-a[1]).map(([dep, hs]) => (
              <div key={dep} style={styles.horasCard}>
                <div style={styles.horasValue}>{Math.round(hs).toLocaleString('es-AR')}</div>
                <div style={styles.horasLabel}>hs — {dep}</div>
                {stats.horasAnualPorDep[dep] && (
                  <div style={styles.horasSub}>Acum. {stats.anioActual}: {Math.round(stats.horasAnualPorDep[dep]).toLocaleString('es-AR')} hs</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={styles.bottomGrid} className="grid-2">
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Disponibilidad por sucursal</h2>
          <div className="table-scroll">
          <table style={styles.table}>
            <thead><tr>
              <th style={styles.th}>Sucursal</th>
              <th style={styles.th}>Total</th>
              <th style={styles.th}>Operativas</th>
              <th style={styles.th}>Disponibilidad</th>
            </tr></thead>
            <tbody>
              {Object.entries(stats.depMap).map(([code, d]) => {
                const pct = Math.round((d.operativas / d.total) * 100);
                return (
                  <tr key={code} style={styles.tr}>
                    <td style={{ ...styles.td, fontWeight:700 }}>{code}</td>
                    <td style={styles.td}>{d.total}</td>
                    <td style={styles.td}>{d.operativas}</td>
                    <td style={styles.td}>
                      <span style={{ ...styles.badge,
                        background: pct >= 80 ? '#dcfce7' : pct >= 60 ? '#fef9c3' : '#fee2e2',
                        color:      pct >= 80 ? '#166534' : pct >= 60 ? '#854d0e' : '#991b1b',
                      }}>{pct}%</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Máquinas con más correctivos</h2>
          {stats.ranking.length === 0 ? (
            <p style={styles.empty}>Sin datos de correctivos aún.</p>
          ) : (
            <div className="table-scroll">
            <table style={styles.table}>
              <thead><tr>
                <th style={styles.th}>Puesto</th>
                <th style={styles.th}>Máquina</th>
                <th style={styles.th}>Sucursal</th>
                <th style={styles.th}>N° de OTs</th>
              </tr></thead>
              <tbody>
                {stats.ranking.map((r, i) => (
                  <tr key={r.id} style={styles.tr}>
                    <td style={{ ...styles.td, fontWeight:700, color:'#94a3b8' }}>#{i+1}</td>
                    <td style={{ ...styles.td, fontWeight:700 }}>{r.numero}</td>
                    <td style={styles.td}>{r.deposito}</td>
                    <td style={{ ...styles.td, fontWeight:700, color:'#991b1b' }}>{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function KPI({ label, value, sub, color, bg }) {
  return (
    <div style={{ ...styles.kpi, background: bg }}>
      <div style={{ ...styles.kpiValue, color }}>{value}</div>
      <div style={styles.kpiLabel}>{label}</div>
      <div style={styles.kpiSub}>{sub}</div>
    </div>
  );
}

const styles = {
  page: { maxWidth:1200, margin:'0 auto', padding:'28px 20px', fontFamily:'system-ui, sans-serif' },
  header: { marginBottom:18 },
  title: { margin:0, fontSize:26, color:'#1a1a2e', fontWeight:700 },
  subtitle: { margin:'4px 0 0', color:'#888', fontSize:14 },
  tabs: { display:'flex', gap:6, marginBottom:24, borderBottom:'1px solid #e2e8f0', paddingBottom:0 },
  tab: { background:'transparent', border:'none', borderBottom:'3px solid transparent', color:'#64748b', padding:'10px 18px', cursor:'pointer', fontSize:14, fontWeight:600, fontFamily:'system-ui, sans-serif' },
  tabActive: { color:'#1e40af', borderBottom:'3px solid #2563eb' },
  kpiGrid: { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:16, marginBottom:28 },
  kpi: { borderRadius:10, padding:'20px 22px' },
  kpiValue: { fontSize:32, fontWeight:800, lineHeight:1 },
  kpiLabel: { fontSize:13, fontWeight:600, color:'#374151', marginTop:6 },
  kpiSub: { fontSize:12, color:'#94a3b8', marginTop:4 },
  bottomGrid: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:24 },
  section: { background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, padding:20 },
  sectionTitle: { margin:'0 0 14px', fontSize:15, fontWeight:700, color:'#1a1a2e' },
  table: { width:'100%', borderCollapse:'collapse', fontSize:13 },
  th: { textAlign:'left', padding:'8px 10px', background:'#f8fafc', color:'#374151', fontWeight:700, borderBottom:'2px solid #e2e8f0' },
  tr: { borderBottom:'1px solid #f0f0f0' },
  td: { padding:'8px 10px' },
  badge: { display:'inline-block', padding:'3px 10px', borderRadius:20, fontSize:12, fontWeight:700 },
  empty: { color:'#94a3b8', fontSize:14, textAlign:'center', padding:40, background:'#f8fafc', borderRadius:10, border:'2px dashed #e2e8f0' },
  info: { textAlign:'center', padding:40, color:'#94a3b8' },
  horasGrid: { display:'flex', gap:12, flexWrap:'wrap' },
  horasCard: { background:'#eff6ff', borderRadius:8, padding:'14px 20px', minWidth:140 },
  horasValue: { fontSize:28, fontWeight:800, color:'#1e40af' },
  horasLabel: { fontSize:13, fontWeight:600, color:'#374151', marginTop:4 },
  horasSub: { fontSize:11, color:'#64748b', marginTop:3 },
};
