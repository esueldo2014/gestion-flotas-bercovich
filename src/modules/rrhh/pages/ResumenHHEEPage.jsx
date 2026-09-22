import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../shared/lib/supabaseClient';
import * as XLSX from 'xlsx';

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const MESES_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const CATEGORIAS_INVENTARIO = ['PRE INVENTARIO', 'INVENTARIO'];
const esInventario = (cat) => CATEGORIAS_INVENTARIO.includes(cat);

const ANIOS = [2024, 2025, 2026, 2027];
const FORM_VACIO = { mes: 1, op_hs_50: '', op_hs_100: '', inv_hs_50: '', inv_hs_100: '' };

export default function ResumenHHEEPage() {
  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [datos, setDatos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formHist, setFormHist] = useState(FORM_VACIO);
  const [savingHist, setSavingHist] = useState(false);
  const [errorHist, setErrorHist] = useState(null);

  const fetchAnio = useCallback(async () => {
    setLoading(true);

    const desde = `${anio}-01-01`;
    const hasta = `${anio}-12-31`;
    const [{ data: hhee }, { data: tarifas }, { data: historico }] = await Promise.all([
      supabase.from('hhee').select('fecha, tipo, horas, categoria, usuario_id, personal_id').eq('estado', 'aprobada').gte('fecha', desde).lte('fecha', hasta),
      supabase.from('hhee_tarifas').select('mes, valor_hora_50, valor_hora_100').eq('anio', anio),
      supabase.from('hhee_historico').select('*').eq('anio', anio),
    ]);

    const tarifaMap = {};
    (tarifas ?? []).forEach(t => { tarifaMap[t.mes] = t; });

    // meses con datos reales en hhee
    const mesesConDatos = new Set();
    (hhee ?? []).forEach(r => {
      mesesConDatos.add(new Date(r.fecha + 'T00:00:00').getMonth() + 1);
    });

    // historico indexado por mes
    const histMap = {};
    (historico ?? []).forEach(h => { histMap[h.mes] = h; });

    const meses = Array.from({ length: 12 }, (_, i) => ({
      mes: i + 1, op50: 0, op100: 0, inv50: 0, inv100: 0, total50: 0, total100: 0, esHistorico: false,
      invParticipantes: new Set(),
    }));

    // cargar datos reales de hhee
    (hhee ?? []).forEach(r => {
      const m = new Date(r.fecha + 'T00:00:00').getMonth();
      const obj = meses[m];
      const hs = r.horas || 0;
      const inv = esInventario(r.categoria);
      if (r.tipo === '50%') { obj.total50 += hs; if (inv) obj.inv50 += hs; else obj.op50 += hs; }
      else { obj.total100 += hs; if (inv) obj.inv100 += hs; else obj.op100 += hs; }
      if (inv) obj.invParticipantes.add(r.personal_id ? `p:${r.personal_id}` : `u:${r.usuario_id}`);
    });

    // para meses sin datos reales, usar historico
    meses.forEach(m => {
      if (!mesesConDatos.has(m.mes) && histMap[m.mes]) {
        const h = histMap[m.mes];
        m.op50  = parseFloat(h.op_hs_50)  || 0;
        m.op100 = parseFloat(h.op_hs_100) || 0;
        m.inv50  = parseFloat(h.inv_hs_50)  || 0;
        m.inv100 = parseFloat(h.inv_hs_100) || 0;
        m.total50  = m.op50  + m.inv50;
        m.total100 = m.op100 + m.inv100;
        m.esHistorico = true;
      }
    });

    const resultado = meses.map(m => {
      const tar = tarifaMap[m.mes] || {};
      const v50  = parseFloat(tar.valor_hora_50)  || 0;
      const v100 = parseFloat(tar.valor_hora_100) || 0;
      return { ...m, v50, v100, $op: m.op50 * v50 + m.op100 * v100, $inv: m.inv50 * v50 + m.inv100 * v100, $total: m.total50 * v50 + m.total100 * v100, invCount: m.invParticipantes.size };
    });

    setDatos(resultado);
    setLoading(false);
  }, [anio]);

  useEffect(() => { fetchAnio(); }, [fetchAnio]);

  const totales = datos.reduce((acc, m) => ({
    op50:   acc.op50   + m.op50,
    op100:  acc.op100  + m.op100,
    inv50:  acc.inv50  + m.inv50,
    inv100: acc.inv100 + m.inv100,
    total50:  acc.total50  + m.total50,
    total100: acc.total100 + m.total100,
    $op:    acc.$op    + m.$op,
    $inv:   acc.$inv   + m.$inv,
    $total: acc.$total + m.$total,
  }), { op50:0, op100:0, inv50:0, inv100:0, total50:0, total100:0, $op:0, $inv:0, $total:0 });

  const mesActual = now.getMonth(); // 0-based
  const maxTotal = Math.max(...datos.map(m => m.$total), 1);

  async function guardarHistorico(e) {
    e.preventDefault();
    setErrorHist(null);
    setSavingHist(true);
    const { error } = await supabase.from('hhee_historico').upsert({
      anio,
      mes: parseInt(formHist.mes),
      op_hs_50:  parseFloat(formHist.op_hs_50)  || 0,
      op_hs_100: parseFloat(formHist.op_hs_100) || 0,
      inv_hs_50:  parseFloat(formHist.inv_hs_50)  || 0,
      inv_hs_100: parseFloat(formHist.inv_hs_100) || 0,
    }, { onConflict: 'anio,mes' });
    setSavingHist(false);
    if (error) { setErrorHist(error.message); return; }
    setShowForm(false);
    setFormHist(FORM_VACIO);
    fetchAnio();
  }

  function fmt$(n) { return n > 0 ? `$${Math.round(n).toLocaleString('es-AR')}` : '—'; }
  function fmtHs(n) { return n > 0 ? n.toLocaleString('es-AR', { maximumFractionDigits: 1 }) : '—'; }

  function descargarExcel() {
    const wb = XLSX.utils.book_new();

    // ── helpers ──────────────────────────────────────────────────────────────
    function addSheet(name, rows) {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, name);
      return ws;
    }
    function setWidths(ws, widths) {
      ws['!cols'] = widths.map(w => ({ wch: w }));
    }
    function mergeCells(ws, merges) {
      ws['!merges'] = merges;
    }

    // ── Hoja 1: Evolución ────────────────────────────────────────────────────
    const evRows = [
      [`EVOLUCIÓN HHEE ${anio}`],
      [],
      ['', 'OPERATIVAS', '', '', 'INVENTARIO / PRE-INVENTARIO', '', '', 'TOTAL', '', ''],
      ['Mes', 'Hs 50%', 'Hs 100%', '$', 'Hs 50%', 'Hs 100%', '$', 'Hs 50%', 'Hs 100%', '$'],
      ...datos.map((m, i) => [
        MESES_FULL[i],
        m.op50 || 0, m.op100 || 0, Math.round(m.$op),
        m.inv50 || 0, m.inv100 || 0, Math.round(m.$inv),
        m.total50 || 0, m.total100 || 0, Math.round(m.$total),
      ]),
      ['TOTAL ANUAL',
        totales.op50, totales.op100, Math.round(totales.$op),
        totales.inv50, totales.inv100, Math.round(totales.$inv),
        totales.total50, totales.total100, Math.round(totales.$total),
      ],
    ];
    const wsEv = addSheet('Evolución', evRows);
    setWidths(wsEv, [14, 9, 9, 12, 9, 9, 12, 9, 9, 13]);
    mergeCells(wsEv, [
      { s: { r: 2, c: 1 }, e: { r: 2, c: 3 } },
      { s: { r: 2, c: 4 }, e: { r: 2, c: 6 } },
      { s: { r: 2, c: 7 }, e: { r: 2, c: 9 } },
    ]);

    // ── Hoja 2: Participantes ────────────────────────────────────────────────
    const invDatos = datos.filter(m => m.invCount > 0 || m.inv50 > 0 || m.inv100 > 0);
    const partRows = [
      [`PARTICIPANTES EN INVENTARIOS ${anio}`],
      [],
      ['Mes', 'Participantes', 'Hs 50% inv.', 'Hs 100% inv.', '$ inventario'],
      ...invDatos.map(m => {
        const i = datos.indexOf(m);
        return [
          MESES_FULL[i],
          m.invCount || 0,
          m.inv50 || 0,
          m.inv100 || 0,
          m.$inv > 0 ? Math.round(m.$inv) : 0,
        ];
      }),
    ];
    if (invDatos.length > 0) {
      const totPart = invDatos.reduce((a, m) => ({ inv50: a.inv50 + m.inv50, inv100: a.inv100 + m.inv100, $inv: a.$inv + m.$inv }), { inv50: 0, inv100: 0, $inv: 0 });
      partRows.push(['TOTAL', '', totPart.inv50, totPart.inv100, Math.round(totPart.$inv)]);
    }
    const wsPart = addSheet('Participantes', partRows);
    setWidths(wsPart, [14, 14, 13, 14, 14]);

    // ── Hoja 3: Valor hora ───────────────────────────────────────────────────
    const tarifaRows = [
      [`VALOR HORA MENSUAL ${anio}`],
      [],
      ['Mes', 'Valor hora 50%', 'Valor hora 100%', 'Variación 50%', 'Variación 100%'],
      ...datos.map((m, i) => {
        const prev = i > 0 ? datos[i - 1] : null;
        const var50  = prev && prev.v50  > 0 ? parseFloat(((m.v50  - prev.v50)  / prev.v50  * 100).toFixed(1)) : null;
        const var100 = prev && prev.v100 > 0 ? parseFloat(((m.v100 - prev.v100) / prev.v100 * 100).toFixed(1)) : null;
        return [
          MESES_FULL[i],
          m.v50  > 0 ? Math.round(m.v50)  : '',
          m.v100 > 0 ? Math.round(m.v100) : '',
          var50  != null ? `${var50  >= 0 ? '+' : ''}${var50}%`  : '',
          var100 != null ? `${var100 >= 0 ? '+' : ''}${var100}%` : '',
        ];
      }),
    ];
    const wsTar = addSheet('Valor hora', tarifaRows);
    setWidths(wsTar, [14, 15, 16, 14, 15]);

    // ── Hoja 4: Análisis ────────────────────────────────────────────────────
    const mesesConDatos = datos.filter(m => m.$total > 0 || m.total50 > 0 || m.total100 > 0);
    const mesMayorCosto = mesesConDatos.length
      ? mesesConDatos.reduce((a, b) => b.$total > a.$total ? b : a)
      : null;
    const mesMayorPartic = datos.filter(m => m.invCount > 0).length
      ? datos.filter(m => m.invCount > 0).reduce((a, b) => b.invCount > a.invCount ? b : a)
      : null;
    const totalHs50  = totales.total50;
    const totalHs100 = totales.total100;
    const totalHs    = totalHs50 + totalHs100;
    const pctInvHs   = totalHs > 0 ? ((totales.inv50 + totales.inv100) / totalHs * 100).toFixed(1) : '—';
    const pctOpHs    = totalHs > 0 ? ((totales.op50  + totales.op100)  / totalHs * 100).toFixed(1) : '—';
    const primerTarifa = datos.find(m => m.v50 > 0);
    const ultimaTarifa = [...datos].reverse().find(m => m.v50 > 0);
    const varAnual50 = primerTarifa && ultimaTarifa && primerTarifa !== ultimaTarifa
      ? `${((ultimaTarifa.v50 - primerTarifa.v50) / primerTarifa.v50 * 100).toFixed(1)}%`
      : '—';

    const analRows = [
      [`ANÁLISIS HHEE ${anio}`],
      [],
      ['RESUMEN GENERAL', ''],
      ['Total horas 50%', totalHs50],
      ['Total horas 100%', totalHs100],
      ['Total horas combinadas', totalHs],
      ['Total $ pagado', Math.round(totales.$total)],
      [],
      ['DISTRIBUCIÓN DE HORAS', ''],
      ['% Operativas', `${pctOpHs}%`],
      ['% Inventario / Pre-inventario', `${pctInvHs}%`],
      [],
      ['DESTACADOS', ''],
      ['Mes con mayor costo', mesMayorCosto ? `${MESES_FULL[mesMayorCosto.mes - 1]} ($${Math.round(mesMayorCosto.$total).toLocaleString('es-AR')})` : '—'],
      ['Mes con más participantes en inv.', mesMayorPartic ? `${MESES_FULL[mesMayorPartic.mes - 1]} (${mesMayorPartic.invCount} personas)` : '—'],
      [],
      ['VARIACIÓN TARIFARIA', ''],
      ['Variación anual valor hora 50%', varAnual50],
      ['Valor hora 50% inicio del año', primerTarifa ? `$${Math.round(primerTarifa.v50).toLocaleString('es-AR')}` : '—'],
      ['Valor hora 50% último mes con tarifa', ultimaTarifa ? `$${Math.round(ultimaTarifa.v50).toLocaleString('es-AR')}` : '—'],
    ];
    const wsAnal = addSheet('Análisis', analRows);
    setWidths(wsAnal, [34, 28]);

    // ── descargar ─────────────────────────────────────────────────────────────
    XLSX.writeFile(wb, `evolucion_hhee_${anio}.xlsx`);
  }

  function imprimirPDF() { window.print(); }

  return (
    <div style={s.page} className="page-padding">
      <style>{`@media print { .no-print { display:none!important; } body { background:#fff; } }`}</style>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Evolución HHEE</h1>
          <p style={s.subtitle}>Horas aprobadas — operativas e inventario</p>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }} className="no-print">
          <select value={anio} onChange={e => setAnio(Number(e.target.value))} style={s.select}>
            {ANIOS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <button onClick={() => setShowForm(true)} style={s.btnHist}>+ Cargar histórico</button>
          <button onClick={descargarExcel} disabled={loading} style={s.btnExcel}>⬇ Excel</button>
          <button onClick={imprimirPDF}    disabled={loading} style={s.btnPdf}>🖨 PDF</button>
        </div>
      </div>

      {loading ? <p style={s.info}>Cargando...</p> : (
        <>
          {/* barras visuales */}
          <div style={s.barsWrap}>
            {datos.map((m, i) => {
              const pct = m.$total / maxTotal;
              const esFuturo = anio === now.getFullYear() && i > mesActual;
              return (
                <div key={m.mes} style={{ ...s.barCol, opacity: esFuturo ? 0.35 : 1 }}>
                  <div style={s.barTrack}>
                    <div style={{ ...s.barFill, height: `${Math.round(pct * 100)}%` }} />
                  </div>
                  <span style={s.barLabel}>{MESES[i]}</span>
                  {m.$total > 0 && (
                    <span style={s.barVal}>{fmt$(m.$total)}</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* tabla detalle */}
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th} rowSpan={2}>Mes</th>
                  <th style={{ ...s.th, ...s.thGroup }} colSpan={3}>Operativas</th>
                  <th style={{ ...s.th, ...s.thGroupInv }} colSpan={3}>Inventario / Pre-inventario</th>
                  <th style={{ ...s.th, ...s.thTotal }} colSpan={3}>Total</th>
                </tr>
                <tr>
                  <th style={s.th2}>Hs 50%</th>
                  <th style={s.th2}>Hs 100%</th>
                  <th style={s.th2}>$</th>
                  <th style={s.th2}>Hs 50%</th>
                  <th style={s.th2}>Hs 100%</th>
                  <th style={s.th2}>$</th>
                  <th style={s.th2}>Hs 50%</th>
                  <th style={s.th2}>Hs 100%</th>
                  <th style={{ ...s.th2, fontWeight: 700 }}>$</th>
                </tr>
              </thead>
              <tbody>
                {datos.map((m, i) => {
                  const esFuturo = anio === now.getFullYear() && i > mesActual;
                  const esMesActual = anio === now.getFullYear() && i === mesActual;
                  return (
                    <tr key={m.mes} style={{
                      ...s.tr,
                      opacity: esFuturo ? 0.4 : 1,
                      background: esMesActual ? '#eff6ff' : undefined,
                    }}>
                      <td style={{ ...s.td, fontWeight: esMesActual ? 700 : 400 }}>
                        {MESES_FULL[i]}
                        {esMesActual && <span style={s.pill}>actual</span>}
                        {m.esHistorico && <span style={s.pillHist}>histórico</span>}
                      </td>
                      <td style={s.tdNum}>{fmtHs(m.op50)}</td>
                      <td style={s.tdNum}>{fmtHs(m.op100)}</td>
                      <td style={s.tdNum}>{fmt$(m.$op)}</td>
                      <td style={{ ...s.tdNum, color: '#7c3aed' }}>{fmtHs(m.inv50)}</td>
                      <td style={{ ...s.tdNum, color: '#7c3aed' }}>{fmtHs(m.inv100)}</td>
                      <td style={{ ...s.tdNum, color: '#7c3aed' }}>{fmt$(m.$inv)}</td>
                      <td style={s.tdNum}>{fmtHs(m.total50)}</td>
                      <td style={s.tdNum}>{fmtHs(m.total100)}</td>
                      <td style={{ ...s.tdNum, fontWeight: 700 }}>{fmt$(m.$total)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={s.trTotal}>
                  <td style={{ ...s.td, fontWeight: 700 }}>TOTAL {anio}</td>
                  <td style={s.tdNum}>{fmtHs(totales.op50)}</td>
                  <td style={s.tdNum}>{fmtHs(totales.op100)}</td>
                  <td style={s.tdNum}>{fmt$(totales.$op)}</td>
                  <td style={{ ...s.tdNum, color: '#7c3aed' }}>{fmtHs(totales.inv50)}</td>
                  <td style={{ ...s.tdNum, color: '#7c3aed' }}>{fmtHs(totales.inv100)}</td>
                  <td style={{ ...s.tdNum, color: '#7c3aed' }}>{fmt$(totales.$inv)}</td>
                  <td style={s.tdNum}>{fmtHs(totales.total50)}</td>
                  <td style={s.tdNum}>{fmtHs(totales.total100)}</td>
                  <td style={{ ...s.tdNum, fontWeight: 700, fontSize: 15 }}>{fmt$(totales.$total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* aviso si faltan tarifas */}
          {datos.some(m => m.$total === 0 && (m.total50 > 0 || m.total100 > 0)) && (
            <p style={s.warn}>
              Algunos meses tienen horas pero sin tarifa cargada — el $ aparece en $0. Cargá los valores en Cierre HHEE.
            </p>
          )}

          {/* tabla participantes inventario */}
          {datos.some(m => m.invCount > 0) && (
            <div style={{ marginTop: 36 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', marginBottom: 4 }}>Participantes en inventarios</h2>
              <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>Empleados con HHEE de Inventario o Pre-inventario aprobadas (50% o 100%)</p>
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Mes</th>
                      <th style={{ ...s.th, textAlign:'right' }}>Participantes</th>
                      <th style={{ ...s.th, textAlign:'right' }}>Hs 50% inv.</th>
                      <th style={{ ...s.th, textAlign:'right' }}>Hs 100% inv.</th>
                      <th style={{ ...s.th, textAlign:'right' }}>$ inventario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.filter(m => m.invCount > 0 || m.inv50 > 0 || m.inv100 > 0).map((m, _, arr) => {
                      const i = datos.indexOf(m);
                      return (
                        <tr key={m.mes} style={s.tr}>
                          <td style={s.td}>{MESES_FULL[i]}</td>
                          <td style={{ ...s.tdNum, fontWeight: 700, color: '#7c3aed' }}>{m.invCount > 0 ? m.invCount : '—'}</td>
                          <td style={s.tdNum}>{fmtHs(m.inv50)}</td>
                          <td style={s.tdNum}>{fmtHs(m.inv100)}</td>
                          <td style={{ ...s.tdNum, fontWeight: 600 }}>{fmt$(m.$inv)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* tabla de tarifas históricas */}
          <div style={{ marginTop: 36 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', marginBottom: 12 }}>Valor hora mensual</h2>
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Mes</th>
                    <th style={{ ...s.th, textAlign:'right' }}>Valor hora 50%</th>
                    <th style={{ ...s.th, textAlign:'right' }}>Valor hora 100%</th>
                    <th style={{ ...s.th, textAlign:'right' }}>Variación 50%</th>
                    <th style={{ ...s.th, textAlign:'right' }}>Variación 100%</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.map((m, i) => {
                    const prev = i > 0 ? datos[i - 1] : null;
                    const var50  = prev && prev.v50  > 0 ? ((m.v50  - prev.v50)  / prev.v50  * 100) : null;
                    const var100 = prev && prev.v100 > 0 ? ((m.v100 - prev.v100) / prev.v100 * 100) : null;
                    const sinTarifa = m.v50 === 0 && m.v100 === 0;
                    return (
                      <tr key={m.mes} style={s.tr}>
                        <td style={s.td}>{MESES_FULL[i]}</td>
                        <td style={{ ...s.tdNum, color: sinTarifa ? '#94a3b8' : undefined }}>{m.v50 > 0 ? fmt$(m.v50) : '—'}</td>
                        <td style={{ ...s.tdNum, color: sinTarifa ? '#94a3b8' : undefined }}>{m.v100 > 0 ? fmt$(m.v100) : '—'}</td>
                        <td style={{ ...s.tdNum, color: var50 == null ? '#94a3b8' : var50 >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                          {var50 != null ? `${var50 >= 0 ? '+' : ''}${var50.toFixed(1)}%` : '—'}
                        </td>
                        <td style={{ ...s.tdNum, color: var100 == null ? '#94a3b8' : var100 >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                          {var100 != null ? `${var100 >= 0 ? '+' : ''}${var100.toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {showForm && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <h3 style={{ margin:'0 0 4px', fontSize:17, fontWeight:700 }}>Cargar datos históricos</h3>
            <p style={{ margin:'0 0 16px', fontSize:13, color:'#64748b' }}>Año {anio} — ingresá las horas totales del mes</p>
            {errorHist && <p style={{ color:'#c0392b', fontSize:13, marginBottom:10 }}>{errorHist}</p>}
            <form onSubmit={guardarHistorico} style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <label style={s.label}>Mes
                <select value={formHist.mes} onChange={e => setFormHist(f => ({ ...f, mes: e.target.value }))} style={s.input}>
                  {MESES_FULL.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                </select>
              </label>
              <p style={{ margin:0, fontSize:12, fontWeight:700, color:'#374151' }}>Operativas</p>
              <div style={{ display:'flex', gap:10 }}>
                <label style={s.label}>Hs 50%
                  <input type="number" step="0.5" min="0" placeholder="0" value={formHist.op_hs_50} onChange={e => setFormHist(f => ({ ...f, op_hs_50: e.target.value }))} style={s.input} />
                </label>
                <label style={s.label}>Hs 100%
                  <input type="number" step="0.5" min="0" placeholder="0" value={formHist.op_hs_100} onChange={e => setFormHist(f => ({ ...f, op_hs_100: e.target.value }))} style={s.input} />
                </label>
              </div>
              <p style={{ margin:0, fontSize:12, fontWeight:700, color:'#6d28d9' }}>Inventario / Pre-inventario</p>
              <div style={{ display:'flex', gap:10 }}>
                <label style={s.label}>Hs 50%
                  <input type="number" step="0.5" min="0" placeholder="0" value={formHist.inv_hs_50} onChange={e => setFormHist(f => ({ ...f, inv_hs_50: e.target.value }))} style={s.input} />
                </label>
                <label style={s.label}>Hs 100%
                  <input type="number" step="0.5" min="0" placeholder="0" value={formHist.inv_hs_100} onChange={e => setFormHist(f => ({ ...f, inv_hs_100: e.target.value }))} style={s.input} />
                </label>
              </div>
              <p style={{ margin:0, fontSize:11, color:'#94a3b8' }}>El $ se calcula automáticamente con la tarifa del mes (Cierre HHEE).</p>
              <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:4 }}>
                <button type="button" onClick={() => { setShowForm(false); setErrorHist(null); }} style={s.btnCancel}>Cancelar</button>
                <button type="submit" disabled={savingHist} style={s.btnExcel}>{savingHist ? 'Guardando...' : 'Guardar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  page: { maxWidth: 1100, margin: '0 auto', padding: '28px 20px', fontFamily: 'system-ui, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  title: { margin: 0, fontSize: 26, color: '#1a1a2e', fontWeight: 700 },
  subtitle: { margin: '4px 0 0', fontSize: 14, color: '#64748b' },
  select: { padding: '7px 12px', border: '1px solid #ccc', borderRadius: 7, fontSize: 14 },
  btnExcel:  { background:'#16a34a', color:'#fff', border:'none', borderRadius:7, padding:'8px 16px', fontSize:13, fontWeight:600, cursor:'pointer' },
  btnPdf:    { background:'#dc2626', color:'#fff', border:'none', borderRadius:7, padding:'8px 16px', fontSize:13, fontWeight:600, cursor:'pointer' },
  btnHist:   { background:'#7c3aed', color:'#fff', border:'none', borderRadius:7, padding:'8px 16px', fontSize:13, fontWeight:600, cursor:'pointer' },
  btnCancel: { padding:'8px 16px', fontSize:13, cursor:'pointer', background:'#f1f5f9', color:'#374151', border:'1px solid #e2e8f0', borderRadius:7, fontWeight:600 },
  overlay:   { position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 },
  modal:     { background:'#fff', borderRadius:12, padding:28, width:380, boxShadow:'0 8px 32px rgba(0,0,0,0.18)' },
  label:     { display:'flex', flexDirection:'column', gap:4, fontSize:13, color:'#374151', fontWeight:600, flex:1 },
  input:     { padding:'9px 12px', border:'1px solid #ccc', borderRadius:7, fontSize:14, fontFamily:'inherit' },
  pillHist:  { marginLeft:6, background:'#ede9fe', color:'#6d28d9', fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:10 },
  info: { color: '#94a3b8', textAlign: 'center', padding: 60 },

  barsWrap: { display: 'flex', gap: 6, alignItems: 'flex-end', height: 120, marginBottom: 32, padding: '0 4px' },
  barCol: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  barTrack: { width: '100%', background: '#f1f5f9', borderRadius: 4, height: 72, display: 'flex', alignItems: 'flex-end' },
  barFill: { width: '100%', background: '#2563eb', borderRadius: 4, minHeight: 2, transition: 'height 0.3s' },
  barLabel: { fontSize: 11, color: '#64748b', fontWeight: 600 },
  barVal: { fontSize: 10, color: '#2563eb', fontWeight: 600, whiteSpace: 'nowrap' },

  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '8px 12px', background: '#f1f5f9', color: '#374151', fontWeight: 700, borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap', borderRight: '1px solid #e2e8f0' },
  thGroup: { background: '#eff6ff', color: '#1d4ed8' },
  thGroupInv: { background: '#f5f3ff', color: '#6d28d9' },
  thTotal: { background: '#f0fdf4', color: '#166534' },
  th2: { textAlign: 'right', padding: '6px 12px', background: '#f8fafc', color: '#64748b', fontWeight: 600, borderBottom: '2px solid #e2e8f0', fontSize: 12, borderRight: '1px solid #f0f0f0', fontVariantNumeric: 'tabular-nums' },
  tr: { borderBottom: '1px solid #f0f0f0' },
  trTotal: { borderTop: '2px solid #e2e8f0', background: '#f8fafc' },
  td: { padding: '9px 12px', verticalAlign: 'middle', borderRight: '1px solid #f5f5f5' },
  tdNum: { padding: '9px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderRight: '1px solid #f5f5f5' },
  pill: { marginLeft: 6, background: '#dbeafe', color: '#1d4ed8', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 10 },
  warn: { marginTop: 16, fontSize: 12, color: '#b45309', background: '#fef9c3', padding: '8px 14px', borderRadius: 7 },
};
