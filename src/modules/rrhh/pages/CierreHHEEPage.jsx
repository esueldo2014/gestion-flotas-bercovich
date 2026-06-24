import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../shared/lib/supabaseClient';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export default function CierreHHEEPage() {
  const now = new Date();
  const [mes, setMes]     = useState(now.getMonth() + 1);
  const [anio, setAnio]   = useState(now.getFullYear());
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  const fetchMes = useCallback(async () => {
    setLoading(true);
    setError(null);
    const desde = `${anio}-${String(mes).padStart(2,'0')}-01`;
    const hastaDate = new Date(anio, mes, 0); // último día del mes
    const hasta = hastaDate.toISOString().split('T')[0];

    const { data, error: err } = await supabase
      .from('hhee')
      .select('*, usuarios_roles!usuario_id(nombre, email)')
      .eq('estado', 'aprobada')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha');

    if (err) { setError(err.message); setRegistros([]); }
    else { setRegistros(data ?? []); }
    setLoading(false);
  }, [mes, anio]);

  useEffect(() => { fetchMes(); }, [fetchMes]);

  // agrupar por empleado
  const porEmpleado = {};
  registros.forEach(r => {
    const key = r.usuario_id;
    if (!porEmpleado[key]) {
      porEmpleado[key] = {
        nombre: r.usuarios_roles?.nombre || r.usuarios_roles?.email || 'Sin nombre',
        horas50: 0, horas100: 0,
      };
    }
    if (r.tipo === '100%') porEmpleado[key].horas100 += Number(r.horas);
    else porEmpleado[key].horas50 += Number(r.horas);
  });

  const filas = Object.values(porEmpleado).sort((a,b) => a.nombre.localeCompare(b.nombre));
  const totalHoras50  = filas.reduce((s,f) => s + f.horas50, 0);
  const totalHoras100 = filas.reduce((s,f) => s + f.horas100, 0);

  function descargarExcel() {
    const filasCsv = [
      ['Empleado', 'Horas 50%', 'Horas 100%', 'Total horas'],
      ...filas.map(f => [f.nombre, f.horas50, f.horas100, f.horas50 + f.horas100]),
      ['TOTAL', totalHoras50, totalHoras100, totalHoras50 + totalHoras100],
    ];
    const csv = filasCsv.map(fila => fila.map(c => `"${c}"`).join(';')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cierre_hhee_${MESES[mes-1]}_${anio}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={styles.page} className="page-padding">
      <div style={styles.header} className="header-flex">
        <div>
          <h1 style={styles.title}>Cierre mensual de horas extra</h1>
          <p style={styles.subtitle}>Para liquidación — solo se cuentan las horas aprobadas</p>
        </div>
        <button onClick={descargarExcel} style={styles.btnDownload} disabled={filas.length === 0}>
          ⬇️ Descargar Excel
        </button>
      </div>

      <div style={styles.controls} className="controls-flex">
        <select value={mes} onChange={e => setMes(Number(e.target.value))} style={styles.select}>
          {MESES.map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
        </select>
        <select value={anio} onChange={e => setAnio(Number(e.target.value))} style={styles.select}>
          {[2024,2025,2026,2027].map(y => <option key={y}>{y}</option>)}
        </select>
      </div>

      {error && <p style={styles.error}>{error}</p>}

      {loading ? <p style={styles.info}>Cargando...</p> : filas.length === 0 ? (
        <div style={styles.empty}>Sin horas extra aprobadas en {MESES[mes-1]} {anio}.</div>
      ) : (
        <>
          <div className="table-scroll">
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Empleado</th>
                  <th style={styles.th}>Horas 50%</th>
                  <th style={styles.th}>Horas 100%</th>
                  <th style={styles.th}>Total</th>
                </tr>
              </thead>
              <tbody>
                {filas.map(f => (
                  <tr key={f.nombre} style={styles.tr}>
                    <td style={{ ...styles.td, fontWeight:700 }}>{f.nombre}</td>
                    <td style={styles.td}>{f.horas50}</td>
                    <td style={styles.td}>{f.horas100}</td>
                    <td style={{ ...styles.td, fontWeight:700 }}>{f.horas50 + f.horas100}</td>
                  </tr>
                ))}
                <tr style={styles.trTotal}>
                  <td style={styles.td}>TOTAL</td>
                  <td style={styles.td}>{totalHoras50}</td>
                  <td style={styles.td}>{totalHoras100}</td>
                  <td style={styles.td}>{totalHoras50 + totalHoras100}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Detalle del mes ({registros.length} registros)</h3>
            <div className="table-scroll">
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Empleado</th>
                    <th style={styles.th}>Fecha</th>
                    <th style={styles.th}>Tipo</th>
                    <th style={styles.th}>Horas</th>
                    <th style={styles.th}>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {registros.map(r => (
                    <tr key={r.id} style={styles.tr}>
                      <td style={styles.td}>{r.usuarios_roles?.nombre || r.usuarios_roles?.email}</td>
                      <td style={styles.td}>{new Date(r.fecha).toLocaleDateString('es-AR')}</td>
                      <td style={styles.td}>{r.tipo}</td>
                      <td style={styles.td}>{r.horas}</td>
                      <td style={styles.td}>{r.motivo || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  page: { maxWidth:1100, margin:'0 auto', padding:'28px 20px', fontFamily:'system-ui, sans-serif' },
  header: { display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20, flexWrap:'wrap', gap:12 },
  title: { margin:0, fontSize:26, color:'#1a1a2e', fontWeight:700 },
  subtitle: { margin:'4px 0 0', fontSize:14, color:'#64748b' },
  btnDownload: { background:'#2563eb', color:'#fff', border:'none', borderRadius:7, padding:'10px 20px', fontSize:14, fontWeight:600, cursor:'pointer' },
  controls: { display:'flex', gap:10, marginBottom:20 },
  select: { padding:'9px 12px', border:'1px solid #ccc', borderRadius:7, fontSize:14 },
  error: { color:'#c0392b', fontSize:13, marginBottom:12 },
  table: { width:'100%', borderCollapse:'collapse', fontSize:14, marginBottom:24 },
  th: { textAlign:'left', padding:'9px 12px', background:'#f1f5f9', color:'#374151', fontWeight:700, borderBottom:'2px solid #e2e8f0', whiteSpace:'nowrap' },
  tr: { borderBottom:'1px solid #f0f0f0' },
  trTotal: { borderTop:'2px solid #cbd5e1', background:'#f8fafc', fontWeight:700 },
  td: { padding:'9px 12px', verticalAlign:'middle' },
  section: { marginTop:8 },
  sectionTitle: { fontSize:15, fontWeight:700, color:'#1a1a2e', marginBottom:10 },
  info: { color:'#94a3b8', textAlign:'center', padding:40 },
  empty: { textAlign:'center', padding:40, color:'#999', fontSize:15, background:'#f8fafc', borderRadius:10, border:'2px dashed #e2e8f0' },
};
