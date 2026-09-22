import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../shared/lib/supabaseClient';
import ExcelJS from 'exceljs';

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

  async function descargarExcel() {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Gestión de Flotas';

    // ── paleta de colores ────────────────────────────────────────────────────
    const C = {
      azulOsc:  '1E3A5F',
      azulMed:  '2563EB',
      azulClar: 'DBEAFE',
      violeta:  '6D28D9',
      violClar: 'EDE9FE',
      verde:    '166534',
      verdeCl:  'DCFCE7',
      gris:     'F1F5F9',
      grisMed:  '94A3B8',
      negro:    '1A1A2E',
      blanco:   'FFFFFF',
    };

    const fmtPeso  = '"$"#,##0';
    const fmtHs    = '#,##0.0';
    const fmtNum   = '#,##0';
    const aln      = (h, v = 'middle') => ({ horizontal: h, vertical: v });
    const border   = { style: 'thin', color: { argb: 'E2E8F0' } };
    const borders  = { top: border, left: border, bottom: border, right: border };

    function titleFont(color = C.blanco)  { return { name: 'Arial', bold: true, size: 13, color: { argb: color } }; }
    function headerFont(color = C.blanco) { return { name: 'Arial', bold: true, size: 10, color: { argb: color } }; }
    function dataFont(bold = false)        { return { name: 'Arial', size: 10, bold }; }
    function fill(argb)                    { return { type: 'pattern', pattern: 'solid', fgColor: { argb } }; }

    function applyHeader(row, bg, fontColor = C.blanco) {
      row.eachCell(cell => {
        cell.font      = headerFont(fontColor);
        cell.fill      = fill(bg);
        cell.border    = borders;
        cell.alignment = aln('center');
      });
      row.height = 22;
    }

    function applyData(row, numCols = [], currCols = [], bold = false) {
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.font      = dataFont(bold);
        cell.border    = borders;
        cell.alignment = col === 1 ? aln('left') : aln('right');
        if (currCols.includes(col)) cell.numFmt = fmtPeso;
        else if (numCols.includes(col)) cell.numFmt = fmtHs;
      });
      row.height = 18;
    }

    // ── Hoja 1: Evolución ────────────────────────────────────────────────────
    const ws1 = wb.addWorksheet('Evolución');
    ws1.columns = [
      { width: 16 }, { width: 9 }, { width: 9 }, { width: 13 },
      { width: 9 },  { width: 9 }, { width: 13 },
      { width: 9 },  { width: 9 }, { width: 14 },
    ];

    // Título
    ws1.mergeCells('A1:J1');
    const t1 = ws1.getCell('A1');
    t1.value = `EVOLUCIÓN HHEE ${anio}`;
    t1.font = titleFont(); t1.fill = fill(C.azulOsc); t1.alignment = aln('center');
    ws1.getRow(1).height = 28;

    ws1.addRow([]);

    // Fila grupos
    ws1.mergeCells('B3:D3'); ws1.mergeCells('E3:G3'); ws1.mergeCells('H3:J3');
    const rGrupo = ws1.getRow(3);
    rGrupo.getCell(1).value = '';
    rGrupo.getCell(2).value = 'OPERATIVAS';
    rGrupo.getCell(5).value = 'INVENTARIO / PRE-INVENTARIO';
    rGrupo.getCell(8).value = 'TOTAL';
    rGrupo.getCell(2).fill = fill(C.azulMed); rGrupo.getCell(2).font = headerFont(); rGrupo.getCell(2).alignment = aln('center');
    rGrupo.getCell(5).fill = fill(C.violeta); rGrupo.getCell(5).font = headerFont(); rGrupo.getCell(5).alignment = aln('center');
    rGrupo.getCell(8).fill = fill(C.verde);   rGrupo.getCell(8).font = headerFont(); rGrupo.getCell(8).alignment = aln('center');
    rGrupo.height = 20;

    // Fila subencabezado
    const rSub = ws1.addRow(['Mes', 'Hs 50%', 'Hs 100%', '$', 'Hs 50%', 'Hs 100%', '$', 'Hs 50%', 'Hs 100%', '$']);
    applyHeader(rSub, C.gris, C.negro);

    // Datos
    datos.forEach((m, i) => {
      const r = ws1.addRow([
        MESES_FULL[i],
        m.op50 || 0, m.op100 || 0, Math.round(m.$op),
        m.inv50 || 0, m.inv100 || 0, Math.round(m.$inv),
        m.total50 || 0, m.total100 || 0, Math.round(m.$total),
      ]);
      applyData(r, [2,3,5,6,8,9], [4,7,10]);
      [5,6,7].forEach(c => { r.getCell(c).font = { ...dataFont(), color: { argb: C.violeta } }; });
    });

    // Total
    const rTot = ws1.addRow([
      'TOTAL ANUAL',
      totales.op50, totales.op100, Math.round(totales.$op),
      totales.inv50, totales.inv100, Math.round(totales.$inv),
      totales.total50, totales.total100, Math.round(totales.$total),
    ]);
    applyData(rTot, [2,3,5,6,8,9], [4,7,10], true);
    rTot.eachCell(c => { c.fill = fill(C.gris); });

    // ── Hoja 2: Participantes ────────────────────────────────────────────────
    const ws2 = wb.addWorksheet('Participantes');
    ws2.columns = [{ width: 16 }, { width: 14 }, { width: 13 }, { width: 14 }, { width: 14 }];

    ws2.mergeCells('A1:E1');
    const t2 = ws2.getCell('A1');
    t2.value = `PARTICIPANTES EN INVENTARIOS ${anio}`;
    t2.font = titleFont(); t2.fill = fill(C.violeta); t2.alignment = aln('center');
    ws2.getRow(1).height = 28;
    ws2.addRow([]);

    const rPH = ws2.addRow(['Mes', 'Participantes', 'Hs 50% inv.', 'Hs 100% inv.', '$ inventario']);
    applyHeader(rPH, C.violeta);

    const invDatos = datos.filter(m => m.invCount > 0 || m.inv50 > 0 || m.inv100 > 0);
    invDatos.forEach(m => {
      const i = datos.indexOf(m);
      const r = ws2.addRow([MESES_FULL[i], m.invCount || 0, m.inv50 || 0, m.inv100 || 0, m.$inv > 0 ? Math.round(m.$inv) : 0]);
      applyData(r, [3,4], [5]);
      r.getCell(2).numFmt = fmtNum;
    });

    if (invDatos.length > 0) {
      const totP = invDatos.reduce((a, m) => ({ inv50: a.inv50+m.inv50, inv100: a.inv100+m.inv100, $inv: a.$inv+m.$inv }), { inv50:0, inv100:0, $inv:0 });
      const rTP = ws2.addRow(['TOTAL', '', totP.inv50, totP.inv100, Math.round(totP.$inv)]);
      applyData(rTP, [3,4], [5], true);
      rTP.eachCell(c => { c.fill = fill(C.gris); });
    }

    // ── Hoja 3: Valor hora ───────────────────────────────────────────────────
    const ws3 = wb.addWorksheet('Valor hora');
    ws3.columns = [{ width: 16 }, { width: 15 }, { width: 16 }, { width: 14 }, { width: 15 }];

    ws3.mergeCells('A1:E1');
    const t3 = ws3.getCell('A1');
    t3.value = `VALOR HORA MENSUAL ${anio}`;
    t3.font = titleFont(); t3.fill = fill(C.azulOsc); t3.alignment = aln('center');
    ws3.getRow(1).height = 28;
    ws3.addRow([]);

    const rVH = ws3.addRow(['Mes', 'Valor hora 50%', 'Valor hora 100%', 'Variación 50%', 'Variación 100%']);
    applyHeader(rVH, C.azulOsc);

    datos.forEach((m, i) => {
      const prev = i > 0 ? datos[i-1] : null;
      const var50  = prev && prev.v50  > 0 ? parseFloat(((m.v50  - prev.v50)  / prev.v50  * 100).toFixed(1)) : null;
      const var100 = prev && prev.v100 > 0 ? parseFloat(((m.v100 - prev.v100) / prev.v100 * 100).toFixed(1)) : null;
      const r = ws3.addRow([
        MESES_FULL[i],
        m.v50  > 0 ? Math.round(m.v50)  : '',
        m.v100 > 0 ? Math.round(m.v100) : '',
        var50  != null ? `${var50  >= 0 ? '+' : ''}${var50}%`  : '',
        var100 != null ? `${var100 >= 0 ? '+' : ''}${var100}%` : '',
      ]);
      applyData(r, [], [2,3]);
      if (var50  != null) r.getCell(4).font = { name:'Arial', size:10, bold:true, color:{ argb: var50  >= 0 ? '16A34A' : 'DC2626' } };
      if (var100 != null) r.getCell(5).font = { name:'Arial', size:10, bold:true, color:{ argb: var100 >= 0 ? '16A34A' : 'DC2626' } };
    });

    // ── Hoja 4: Análisis ────────────────────────────────────────────────────
    const ws4 = wb.addWorksheet('Análisis');
    ws4.columns = [{ width: 34 }, { width: 28 }];

    ws4.mergeCells('A1:B1');
    const t4 = ws4.getCell('A1');
    t4.value = `ANÁLISIS HHEE ${anio}`;
    t4.font = titleFont(); t4.fill = fill(C.azulOsc); t4.alignment = aln('center');
    ws4.getRow(1).height = 28;
    ws4.addRow([]);

    const totalHs = totales.total50 + totales.total100;
    const pctOp  = totalHs > 0 ? ((totales.op50  + totales.op100)  / totalHs * 100).toFixed(1) + '%' : '—';
    const pctInv = totalHs > 0 ? ((totales.inv50 + totales.inv100) / totalHs * 100).toFixed(1) + '%' : '—';
    const mesesConDatos2 = datos.filter(m => m.$total > 0);
    const mesMayor = mesesConDatos2.length ? mesesConDatos2.reduce((a,b) => b.$total > a.$total ? b : a) : null;
    const mesMayorP = datos.filter(m => m.invCount > 0).length ? datos.filter(m => m.invCount > 0).reduce((a,b) => b.invCount > a.invCount ? b : a) : null;
    const primerT = datos.find(m => m.v50 > 0);
    const ultimoT = [...datos].reverse().find(m => m.v50 > 0);
    const varAnual = primerT && ultimoT && primerT !== ultimoT ? `${((ultimoT.v50 - primerT.v50) / primerT.v50 * 100).toFixed(1)}%` : '—';

    const secciones = [
      { titulo: 'RESUMEN GENERAL', color: C.azulMed, filas: [
        ['Total horas 50%',      totales.total50],
        ['Total horas 100%',     totales.total100],
        ['Total horas combinadas', totalHs],
        ['Total $ pagado',       Math.round(totales.$total)],
      ]},
      { titulo: 'DISTRIBUCIÓN DE HORAS', color: C.azulMed, filas: [
        ['% Operativas',                  pctOp],
        ['% Inventario / Pre-inventario', pctInv],
      ]},
      { titulo: 'DESTACADOS', color: C.verde, filas: [
        ['Mes con mayor costo',              mesMayor  ? `${MESES_FULL[mesMayor.mes-1]} ($${Math.round(mesMayor.$total).toLocaleString('es-AR')})` : '—'],
        ['Mes con más participantes en inv.', mesMayorP ? `${MESES_FULL[mesMayorP.mes-1]} (${mesMayorP.invCount} personas)` : '—'],
      ]},
      { titulo: 'VARIACIÓN TARIFARIA', color: C.violeta, filas: [
        ['Variación anual valor hora 50%',         varAnual],
        ['Valor hora 50% inicio del año',          primerT ? `$${Math.round(primerT.v50).toLocaleString('es-AR')}` : '—'],
        ['Valor hora 50% último mes con tarifa',   ultimoT ? `$${Math.round(ultimoT.v50).toLocaleString('es-AR')}` : '—'],
      ]},
    ];

    secciones.forEach(({ titulo, color, filas }) => {
      ws4.addRow([]);
      ws4.mergeCells(`A${ws4.lastRow.number + 1}:B${ws4.lastRow.number + 1}`);
      const rT = ws4.addRow([titulo, '']);
      rT.getCell(1).font = headerFont();
      rT.getCell(1).fill = fill(color);
      rT.getCell(1).alignment = aln('left');
      rT.getCell(2).fill = fill(color);
      rT.height = 20;
      filas.forEach(([label, val]) => {
        const r = ws4.addRow([label, val]);
        r.getCell(1).font = dataFont(); r.getCell(1).fill = fill(C.gris); r.getCell(1).border = borders;
        r.getCell(2).font = dataFont(true); r.getCell(2).border = borders; r.getCell(2).alignment = aln('right');
        r.height = 18;
      });
    });

    // ── descargar ─────────────────────────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `evolucion_hhee_${anio}.xlsx`; a.click();
    URL.revokeObjectURL(url);
  }

  function imprimirPDF() { window.print(); }

  return (
    <div style={s.page} className="page-padding">
      <style>{`
        @media print {
          .no-print { display:none!important; }
          nav { display:none!important; }
          body { background:#fff; margin:0; }
          .page-padding { padding: 12px !important; max-width: 100% !important; }
          table { page-break-inside: auto; font-size: 11px !important; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          thead { display: table-header-group; }
          h1, h2 { page-break-after: avoid; }
          div { page-break-inside: avoid; }
          @page { size: A4 landscape; margin: 1cm; }
        }
      `}</style>
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
          <button onClick={() => descargarExcel()} disabled={loading} style={s.btnExcel}>⬇ Excel</button>
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
