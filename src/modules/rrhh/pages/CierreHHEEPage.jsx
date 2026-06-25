import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../shared/lib/supabaseClient';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const CATEGORIAS_INVENTARIO = ['PRE INVENTARIO', 'INVENTARIO'];
const esInventario = (cat) => CATEGORIAS_INVENTARIO.includes(cat);

export default function CierreHHEEPage() {
  const now = new Date();
  const [mes, setMes]     = useState(now.getMonth() + 1);
  const [anio, setAnio]   = useState(now.getFullYear());
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  const [valor50, setValor50]   = useState('');
  const [valor100, setValor100] = useState('');
  const [savingTarifa, setSavingTarifa] = useState(false);

  const fetchTarifa = useCallback(async () => {
    const { data } = await supabase
      .from('hhee_tarifas')
      .select('*')
      .eq('anio', anio)
      .eq('mes', mes)
      .maybeSingle();
    setValor50(data?.valor_hora_50 ?? '');
    setValor100(data?.valor_hora_100 ?? '');
  }, [mes, anio]);

  const fetchMes = useCallback(async () => {
    setLoading(true);
    setError(null);
    const desde = `${anio}-${String(mes).padStart(2,'0')}-01`;
    const hastaDate = new Date(anio, mes, 0); // último día del mes
    const hasta = hastaDate.toISOString().split('T')[0];

    const { data, error: err } = await supabase
      .from('hhee')
      .select('*, usuarios_roles!usuario_id(nombre, email), personal(nombre)')
      .eq('estado', 'aprobada')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha');

    if (err) { setError(err.message); setRegistros([]); }
    else { setRegistros(data ?? []); }
    setLoading(false);
  }, [mes, anio]);

  useEffect(() => { fetchMes(); fetchTarifa(); }, [fetchMes, fetchTarifa]);

  async function guardarTarifa(e) {
    e.preventDefault();
    setSavingTarifa(true);
    const { error: err } = await supabase.from('hhee_tarifas').upsert({
      anio, mes,
      valor_hora_50: parseFloat(valor50) || 0,
      valor_hora_100: parseFloat(valor100) || 0,
    }, { onConflict: 'anio,mes' });
    setSavingTarifa(false);
    if (err) setError(err.message);
  }

  const tarifa50  = parseFloat(valor50) || 0;
  const tarifa100 = parseFloat(valor100) || 0;

  // agrupar por empleado (cuenta o personal), separando Inventario (PRE INVENTARIO + INVENTARIO) del resto
  const porEmpleado = {};
  registros.forEach(r => {
    const key = r.personal_id ? `p:${r.personal_id}` : `u:${r.usuario_id}`;
    if (!porEmpleado[key]) {
      porEmpleado[key] = {
        nombre: r.personal?.nombre || r.usuarios_roles?.nombre || r.usuarios_roles?.email || 'Sin nombre',
        horas50: 0, horas100: 0,
        horas50Inv: 0, horas100Inv: 0,
        categorias: new Set(), categoriasInv: new Set(),
      };
    }
    const f = porEmpleado[key];
    const horas = Number(r.horas);
    if (esInventario(r.categoria)) {
      if (r.tipo === '100%') f.horas100Inv += horas; else f.horas50Inv += horas;
      if (r.categoria) f.categoriasInv.add(r.categoria);
    } else {
      if (r.tipo === '100%') f.horas100 += horas; else f.horas50 += horas;
      if (r.categoria) f.categorias.add(r.categoria);
    }
  });

  const filas = Object.values(porEmpleado)
    .map(f => ({
      ...f,
      monto50: f.horas50 * tarifa50,
      monto100: f.horas100 * tarifa100,
      monto50Inv: f.horas50Inv * tarifa50,
      monto100Inv: f.horas100Inv * tarifa100,
      observaciones: Array.from(f.categorias).join(' + '),
      observacionesInv: Array.from(f.categoriasInv).join(' + '),
    }))
    .sort((a,b) => a.nombre.localeCompare(b.nombre));

  const totalHoras50     = filas.reduce((s,f) => s + f.horas50, 0);
  const totalHoras100    = filas.reduce((s,f) => s + f.horas100, 0);
  const totalHoras50Inv  = filas.reduce((s,f) => s + f.horas50Inv, 0);
  const totalHoras100Inv = filas.reduce((s,f) => s + f.horas100Inv, 0);
  const totalMonto50     = filas.reduce((s,f) => s + f.monto50, 0);
  const totalMonto100    = filas.reduce((s,f) => s + f.monto100, 0);
  const totalMonto50Inv  = filas.reduce((s,f) => s + f.monto50Inv, 0);
  const totalMonto100Inv = filas.reduce((s,f) => s + f.monto100Inv, 0);
  const totalGeneral     = totalMonto50 + totalMonto100 + totalMonto50Inv + totalMonto100Inv;

  // agrupar por categoría
  const porCategoria = {};
  registros.forEach(r => {
    const key = r.categoria || 'Sin categoría';
    porCategoria[key] = (porCategoria[key] ?? 0) + Number(r.horas);
  });
  const filasCategoria = Object.entries(porCategoria).sort((a,b) => b[1]-a[1]);

  function money(n) { return n.toLocaleString('es-AR', { minimumFractionDigits:2, maximumFractionDigits:2 }); }

  function descargarExcel() {
    const filasCsv = [
      ['Empleado', 'HS EXT 50%', 'HS EXT 100%', 'INVENTARIO 50%', 'INVENTARIO 100%', 'TOTAL $', 'Observaciones'],
      ...filas.map(f => [
        f.nombre, money(f.monto50), money(f.monto100), money(f.monto50Inv), money(f.monto100Inv),
        money(f.monto50 + f.monto100 + f.monto50Inv + f.monto100Inv),
        [f.observaciones, f.observacionesInv].filter(Boolean).join(' + '),
      ]),
      ['TOTAL', money(totalMonto50), money(totalMonto100), money(totalMonto50Inv), money(totalMonto100Inv), money(totalGeneral), ''],
      [],
      ['Valor hora 50%', money(tarifa50)],
      ['Valor hora 100%', money(tarifa100)],
      [],
      ['Categoría', 'Horas'],
      ...filasCategoria.map(([cat, hs]) => [cat, hs]),
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

      <form onSubmit={guardarTarifa} style={styles.tarifaForm}>
        <span style={styles.formLabel}>Valor de la hora para {MESES[mes-1]} {anio}:</span>
        <label style={styles.tarifaLabel}>
          50% $
          <input type="number" step="0.01" min="0" value={valor50} onChange={e => setValor50(e.target.value)} style={styles.tarifaInput} placeholder="0.00" />
        </label>
        <label style={styles.tarifaLabel}>
          100% $
          <input type="number" step="0.01" min="0" value={valor100} onChange={e => setValor100(e.target.value)} style={styles.tarifaInput} placeholder="0.00" />
        </label>
        <button type="submit" disabled={savingTarifa} style={styles.btnNew}>{savingTarifa ? 'Guardando...' : 'Guardar valores'}</button>
      </form>

      {error && <p style={styles.error}>{error}</p>}

      {loading ? <p style={styles.info}>Cargando...</p> : filas.length === 0 ? (
        <div style={styles.empty}>Sin horas extra aprobadas en {MESES[mes-1]} {anio}.</div>
      ) : (
        <>
          <div className="table-scroll">
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th} rowSpan={2}>Empleado</th>
                  <th style={styles.th} colSpan={3}>HS EXT</th>
                  <th style={styles.th} colSpan={3}>INVENTARIO</th>
                  <th style={styles.th} rowSpan={2}>TOTAL $</th>
                  <th style={styles.th} rowSpan={2}>Observaciones</th>
                </tr>
                <tr>
                  <th style={styles.th}>Hs 50%</th><th style={styles.th}>Hs 100%</th><th style={styles.th}>$</th>
                  <th style={styles.th}>Hs 50%</th><th style={styles.th}>Hs 100%</th><th style={styles.th}>$</th>
                </tr>
              </thead>
              <tbody>
                {filas.map(f => (
                  <tr key={f.nombre} style={styles.tr}>
                    <td style={{ ...styles.td, fontWeight:700 }}>{f.nombre}</td>
                    <td style={styles.td}>{f.horas50}</td>
                    <td style={styles.td}>{f.horas100}</td>
                    <td style={styles.td}>${money(f.monto50 + f.monto100)}</td>
                    <td style={styles.td}>{f.horas50Inv}</td>
                    <td style={styles.td}>{f.horas100Inv}</td>
                    <td style={styles.td}>${money(f.monto50Inv + f.monto100Inv)}</td>
                    <td style={{ ...styles.td, fontWeight:700 }}>${money(f.monto50 + f.monto100 + f.monto50Inv + f.monto100Inv)}</td>
                    <td style={styles.td}>{[f.observaciones, f.observacionesInv].filter(Boolean).join(' + ') || '—'}</td>
                  </tr>
                ))}
                <tr style={styles.trTotal}>
                  <td style={styles.td}>TOTAL</td>
                  <td style={styles.td}>{totalHoras50}</td>
                  <td style={styles.td}>{totalHoras100}</td>
                  <td style={styles.td}>${money(totalMonto50 + totalMonto100)}</td>
                  <td style={styles.td}>{totalHoras50Inv}</td>
                  <td style={styles.td}>{totalHoras100Inv}</td>
                  <td style={styles.td}>${money(totalMonto50Inv + totalMonto100Inv)}</td>
                  <td style={styles.td}>${money(totalGeneral)}</td>
                  <td style={styles.td}></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Horas por categoría</h3>
            <div className="table-scroll">
              <table style={styles.table}>
                <thead><tr><th style={styles.th}>Categoría</th><th style={styles.th}>Horas</th></tr></thead>
                <tbody>
                  {filasCategoria.map(([cat, hs]) => (
                    <tr key={cat} style={styles.tr}>
                      <td style={{ ...styles.td, fontWeight:700 }}>{cat}</td>
                      <td style={styles.td}>{hs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
                    <th style={styles.th}>Categoría</th>
                    <th style={styles.th}>Horas</th>
                    <th style={styles.th}>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {registros.map(r => (
                    <tr key={r.id} style={styles.tr}>
                      <td style={styles.td}>{r.personal?.nombre || r.usuarios_roles?.nombre || r.usuarios_roles?.email}</td>
                      <td style={styles.td}>{new Date(r.fecha).toLocaleDateString('es-AR')}</td>
                      <td style={styles.td}>{r.tipo}</td>
                      <td style={styles.td}>{r.categoria || '—'}</td>
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
  page: { maxWidth:1200, margin:'0 auto', padding:'28px 20px', fontFamily:'system-ui, sans-serif' },
  header: { display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20, flexWrap:'wrap', gap:12 },
  title: { margin:0, fontSize:26, color:'#1a1a2e', fontWeight:700 },
  subtitle: { margin:'4px 0 0', fontSize:14, color:'#64748b' },
  btnDownload: { background:'#2563eb', color:'#fff', border:'none', borderRadius:7, padding:'10px 20px', fontSize:14, fontWeight:600, cursor:'pointer' },
  controls: { display:'flex', gap:10, marginBottom:16 },
  select: { padding:'9px 12px', border:'1px solid #ccc', borderRadius:7, fontSize:14 },
  tarifaForm: { display:'flex', gap:14, alignItems:'center', flexWrap:'wrap', marginBottom:20, background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:'12px 16px' },
  formLabel: { fontSize:13, fontWeight:600, color:'#475569' },
  tarifaLabel: { display:'flex', alignItems:'center', gap:6, fontSize:13, fontWeight:600, color:'#374151' },
  tarifaInput: { padding:'7px 10px', border:'1px solid #ccc', borderRadius:6, fontSize:13, width:110 },
  btnNew: { background:'#2563eb', color:'#fff', border:'none', borderRadius:7, padding:'8px 16px', fontSize:13, fontWeight:600, cursor:'pointer' },
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
