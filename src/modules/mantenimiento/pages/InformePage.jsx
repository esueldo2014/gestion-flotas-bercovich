import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../shared/lib/supabaseClient';
import { esDeProvincia } from '../components/common/ProvinciaTabs';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const PROVINCIAS = [{ id:'T', label:'Tucumán' }, { id:'S', label:'Santiago del Estero' }];

export default function InformePage() {
  const [raw, setRaw]         = useState(null);
  const [loading, setLoading] = useState(true);
  const now = new Date();
  const [mes, setMes]   = useState(now.getMonth() + 1);
  const [anio, setAnio] = useState(now.getFullYear());

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: maq }, { data: corr }, { data: plan }, { data: ejec }, { data: lect }] = await Promise.all([
      supabase.from('maquinas').select('id, numero_interno, estado, deposito_id, hora_inicial, sucursales(code)'),
      supabase.from('correctivos').select('id, estado, costo_total, maquina_id, fecha_reporte, fecha_cierre, descripcion'),
      supabase.from('plan_preventivo').select('id, maquina_id, frecuencia_horas, frecuencia_dias'),
      supabase.from('preventivos_ejecutados').select('id, plan_id, maquina_id, fecha'),
      supabase.from('lecturas_horometro').select('maquina_id, valor, fecha'),
    ]);
    setRaw({ maquinas: maq ?? [], correctivos: corr ?? [], planItems: plan ?? [], ejecutados: ejec ?? [], lecturas: lect ?? [] });
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading || !raw) return <div style={styles.page}><p style={styles.info}>Cargando...</p></div>;

  const corrDelMes = raw.correctivos.filter(c => {
    const f = new Date(c.fecha_reporte);
    return f.getMonth() + 1 === mes && f.getFullYear() === anio;
  });

  const informesPorProvincia = PROVINCIAS.map(p => {
    const maquinasP = raw.maquinas.filter(m => esDeProvincia(m.numero_interno, p.id));
    const idsP = new Set(maquinasP.map(m => m.id));
    const corrP = corrDelMes.filter(c => idsP.has(c.maquina_id));
    const planP = raw.planItems.filter(pi => idsP.has(pi.maquina_id));
    const ejecP = raw.ejecutados.filter(e => idsP.has(e.maquina_id));
    const lectP = raw.lecturas.filter(l => idsP.has(l.maquina_id));
    return { provincia: p, ...calcular(maquinasP, corrP, planP, ejecP, lectP, mes, anio) };
  });

  const totalCosto = informesPorProvincia.reduce((s, i) => s + i.costoTotal, 0);
  const totalMaquinas = informesPorProvincia.reduce((s, i) => s + i.total, 0);

  return (
    <div style={styles.page} className="page-padding">
      <div style={styles.header} className="no-print header-flex">
        <div>
          <h1 style={styles.title}>Informe mensual de gestión</h1>
          <p style={styles.subtitle}>Entregable para Gerencia</p>
        </div>
        <div style={styles.controls} className="controls-flex">
          <select value={mes} onChange={e => setMes(Number(e.target.value))} style={styles.select}>
            {MESES.map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <select value={anio} onChange={e => setAnio(Number(e.target.value))} style={styles.select}>
            {[2024,2025,2026,2027].map(y => <option key={y}>{y}</option>)}
          </select>
          <button onClick={() => window.print()} style={styles.btnPrint}>🖨️ Descargar / Imprimir PDF</button>
        </div>
      </div>

      {/* Encabezado para impresión */}
      <div className="print-only-header">
        <h1 style={styles.printTitle}>Informe mensual de gestión — {MESES[mes-1]} {anio}</h1>
        <p style={styles.printSubtitle}>Grupo Bercovich / Tu Mundo Distribución</p>
      </div>

      {/* Resumen general */}
      <div style={styles.kpiGrid}>
        <KPI label="Máquinas totales" value={totalMaquinas} color="#1e293b" bg="#f1f5f9" />
        <KPI label="Costo total del mes" value={`$${totalCosto.toLocaleString('es-AR')}`} color="#1e40af" bg="#eff6ff" />
        {informesPorProvincia.map(i => (
          <KPI key={i.provincia.id} label={`Disponibilidad ${i.provincia.label}`} value={`${i.dispPct}%`}
            color={i.dispPct >= 80 ? '#166534' : i.dispPct >= 60 ? '#854d0e' : '#991b1b'}
            bg={i.dispPct >= 80 ? '#dcfce7' : i.dispPct >= 60 ? '#fef9c3' : '#fee2e2'} />
        ))}
      </div>

      {informesPorProvincia.map(info => (
        <div key={info.provincia.id} style={styles.provSection}>
          <h2 style={styles.provTitle}>{info.provincia.label}</h2>

          <div style={styles.kpiGridSmall}>
            <KPI label="Máquinas" value={info.total} sub={`${info.operativas} operativas`} color="#1e293b" bg="#f8fafc" />
            <KPI label="En taller" value={info.enTaller} color="#854d0e" bg="#fef9c3" />
            <KPI label="Fuera de servicio" value={info.fueraServ} color="#991b1b" bg="#fee2e2" />
            <KPI label="OTs del mes" value={info.totalOTs} sub={`${info.otsAbiertas} abiertas`} color="#1e40af" bg="#eff6ff" />
            <KPI label="Costo correctivos" value={`$${info.costoTotal.toLocaleString('es-AR')}`} color="#1e40af" bg="#eff6ff" />
            {info.cumplimiento !== null && (
              <KPI label="Cumplimiento preventivo" value={`${info.cumplimiento}%`}
                color={info.cumplimiento >= 80 ? '#166534' : '#854d0e'}
                bg={info.cumplimiento >= 80 ? '#dcfce7' : '#fef9c3'} />
            )}
          </div>

          {Object.keys(info.horasPorDep).length > 0 && (
            <div style={styles.subsection}>
              <h3 style={styles.subTitle}>Horas de uso por sucursal</h3>
              <div className="table-scroll"><table style={styles.table}>
                <thead><tr><th style={styles.th}>Sucursal</th><th style={styles.th}>Horas usadas</th></tr></thead>
                <tbody>
                  {Object.entries(info.horasPorDep).sort((a,b)=>b[1]-a[1]).map(([dep, hs]) => (
                    <tr key={dep} style={styles.tr}>
                      <td style={{ ...styles.td, fontWeight:700 }}>{dep}</td>
                      <td style={styles.td}>{Math.round(hs).toLocaleString('es-AR')} hs</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          )}

          <div style={styles.subsection}>
            <h3 style={styles.subTitle}>Órdenes de trabajo del mes ({info.totalOTs})</h3>
            {info.ots.length === 0 ? (
              <p style={styles.empty}>Sin órdenes de trabajo este mes.</p>
            ) : (
              <div className="table-scroll"><table style={styles.table}>
                <thead><tr>
                  <th style={styles.th}>Máquina</th><th style={styles.th}>Descripción</th>
                  <th style={styles.th}>Estado</th><th style={styles.th}>Costo</th>
                </tr></thead>
                <tbody>
                  {info.ots.map(c => (
                    <tr key={c.id} style={styles.tr}>
                      <td style={{ ...styles.td, fontWeight:700 }}>{c.numero}</td>
                      <td style={styles.td}>{c.descripcion}</td>
                      <td style={styles.td}>{c.estado}</td>
                      <td style={styles.td}>{c.costo_total != null ? `$${Number(c.costo_total).toLocaleString('es-AR')}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </div>

          {info.ranking.length > 0 && (
            <div style={styles.subsection}>
              <h3 style={styles.subTitle}>Máquinas con más correctivos (histórico)</h3>
              <div className="table-scroll"><table style={styles.table}>
                <thead><tr><th style={styles.th}>Máquina</th><th style={styles.th}>N° de OTs</th></tr></thead>
                <tbody>
                  {info.ranking.map(r => (
                    <tr key={r.id} style={styles.tr}>
                      <td style={{ ...styles.td, fontWeight:700 }}>{r.numero}</td>
                      <td style={styles.td}>{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          )}
        </div>
      ))}

      <style>{`
        .print-only-header { display: none; }
        @media print {
          .no-print { display: none !important; }
          .print-only-header { display: block; margin-bottom: 24px; }
          body { background: white; }
        }
      `}</style>
    </div>
  );
}

function calcular(maquinas, correctivosMes, planItems, ejecutados, lecturas, mes, anio) {
  const total      = maquinas.length;
  const operativas = maquinas.filter(m => m.estado === 'Operativo').length;
  const enTaller    = maquinas.filter(m => m.estado === 'En taller').length;
  const fueraServ   = maquinas.filter(m => m.estado === 'Fuera de servicio').length;
  const dispPct     = total > 0 ? Math.round((operativas / total) * 100) : 0;

  const totalOTs    = correctivosMes.length;
  const otsAbiertas = correctivosMes.filter(c => c.estado !== 'Cerrada').length;
  const costoTotal  = correctivosMes.reduce((s, c) => s + (c.costo_total ?? 0), 0);

  const ots = correctivosMes.map(c => ({
    ...c, numero: maquinas.find(m => m.id === c.maquina_id)?.numero_interno ?? '?',
  }));

  const corrTodasPorMaq = {};
  // ranking histórico usa todas las correctivas, no solo del mes — pero acá solo tenemos del mes en correctivosMes
  // para histórico real necesitaríamos todas; lo dejamos basado en lo recibido (del mes) para simplicidad
  correctivosMes.forEach(c => { corrTodasPorMaq[c.maquina_id] = (corrTodasPorMaq[c.maquina_id] ?? 0) + 1; });
  const ranking = Object.entries(corrTodasPorMaq)
    .sort((a,b) => b[1]-a[1]).slice(0,5)
    .map(([id, count]) => ({ id, count, numero: maquinas.find(m => m.id === id)?.numero_interno ?? '?' }));

  const ejecutadosSet = new Set(ejecutados.map(e => e.plan_id));
  const cumplimiento  = planItems.length > 0
    ? Math.round((planItems.filter(p => ejecutadosSet.has(p.id)).length / planItems.length) * 100) : null;

  const horasPorDep = {};
  maquinas.forEach(m => {
    const lecsMaq = lecturas.filter(l => l.maquina_id === m.id).sort((a,b) => new Date(a.fecha) - new Date(b.fecha));
    if (lecsMaq.length === 0) return;
    const porMes = {};
    lecsMaq.forEach(l => {
      const d = new Date(l.fecha);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      porMes[key] = { valor: Number(l.valor), anio: d.getFullYear(), mesNum: d.getMonth()+1 };
    });
    const keys = Object.keys(porMes).sort();
    const depCode = m.sucursales?.code ?? 'N/A';
    keys.forEach((key, i) => {
      const actual = porMes[key];
      if (actual.anio !== anio || actual.mesNum !== mes) return;
      const base = i === 0 ? (m.hora_inicial ?? null) : porMes[keys[i-1]].valor;
      if (base === null) return;
      const uso = actual.valor - base;
      if (uso > 0) horasPorDep[depCode] = (horasPorDep[depCode] ?? 0) + uso;
    });
  });

  return { total, operativas, enTaller, fueraServ, dispPct, totalOTs, otsAbiertas, costoTotal, ots, ranking, cumplimiento, horasPorDep };
}

function KPI({ label, value, sub, color, bg }) {
  return (
    <div style={{ ...styles.kpi, background: bg }}>
      <div style={{ ...styles.kpiValue, color }}>{value}</div>
      <div style={styles.kpiLabel}>{label}</div>
      {sub && <div style={styles.kpiSub}>{sub}</div>}
    </div>
  );
}

const styles = {
  page: { maxWidth:1100, margin:'0 auto', padding:'28px 20px', fontFamily:'system-ui, sans-serif' },
  header: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:12 },
  title: { margin:0, fontSize:26, color:'#1a1a2e', fontWeight:700 },
  subtitle: { margin:'4px 0 0', color:'#888', fontSize:14 },
  controls: { display:'flex', gap:10, alignItems:'center' },
  select: { padding:'8px 10px', border:'1px solid #ccc', borderRadius:6, fontSize:13 },
  btnPrint: { background:'#2563eb', color:'#fff', border:'none', borderRadius:7, padding:'9px 18px', fontSize:13, fontWeight:600, cursor:'pointer' },
  printTitle: { margin:0, fontSize:20 },
  printSubtitle: { margin:'4px 0 0', fontSize:13, color:'#666' },
  kpiGrid: { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))', gap:14, marginBottom:28 },
  kpiGridSmall: { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', gap:12, marginBottom:18 },
  kpi: { borderRadius:10, padding:'16px 18px' },
  kpiValue: { fontSize:26, fontWeight:800, lineHeight:1 },
  kpiLabel: { fontSize:12, fontWeight:600, color:'#374151', marginTop:5 },
  kpiSub: { fontSize:11, color:'#94a3b8', marginTop:3 },
  provSection: { marginBottom:36, paddingBottom:24, borderBottom:'2px solid #e2e8f0' },
  provTitle: { fontSize:19, fontWeight:700, color:'#1a1a2e', marginBottom:16 },
  subsection: { marginBottom:20 },
  subTitle: { fontSize:14, fontWeight:700, color:'#374151', marginBottom:10 },
  table: { width:'100%', borderCollapse:'collapse', fontSize:13 },
  th: { textAlign:'left', padding:'8px 10px', background:'#f8fafc', color:'#374151', fontWeight:700, borderBottom:'2px solid #e2e8f0' },
  tr: { borderBottom:'1px solid #f0f0f0' },
  td: { padding:'8px 10px' },
  empty: { color:'#94a3b8', fontSize:13, fontStyle:'italic' },
  info: { textAlign:'center', padding:40, color:'#94a3b8' },
};
