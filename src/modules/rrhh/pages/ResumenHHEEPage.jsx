import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../shared/lib/supabaseClient';

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const MESES_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const CATEGORIAS_INVENTARIO = ['PRE INVENTARIO', 'INVENTARIO'];
const esInventario = (cat) => CATEGORIAS_INVENTARIO.includes(cat);

const ANIOS = [2024, 2025, 2026, 2027];

export default function ResumenHHEEPage() {
  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [datos, setDatos] = useState([]); // array de 12 meses
  const [loading, setLoading] = useState(true);

  const fetchAnio = useCallback(async () => {
    setLoading(true);

    // traer todos los registros aprobados del año
    const desde = `${anio}-01-01`;
    const hasta = `${anio}-12-31`;
    const [{ data: hhee }, { data: tarifas }] = await Promise.all([
      supabase.from('hhee')
        .select('fecha, tipo, horas, categoria')
        .eq('estado', 'aprobada')
        .gte('fecha', desde)
        .lte('fecha', hasta),
      supabase.from('hhee_tarifas')
        .select('mes, valor_hora_50, valor_hora_100')
        .eq('anio', anio),
    ]);

    // indexar tarifas por mes
    const tarifaMap = {};
    (tarifas ?? []).forEach(t => { tarifaMap[t.mes] = t; });

    // armar resumen por mes (1-12)
    const meses = Array.from({ length: 12 }, (_, i) => ({
      mes: i + 1,
      op50: 0, op100: 0,   // horas operativas
      inv50: 0, inv100: 0, // horas inventario/pre-inventario
      total50: 0, total100: 0, // totales generales
    }));

    (hhee ?? []).forEach(r => {
      const m = new Date(r.fecha + 'T00:00:00').getMonth(); // 0-11
      const obj = meses[m];
      const hs = r.horas || 0;
      const inv = esInventario(r.categoria);
      if (r.tipo === '50%') {
        obj.total50 += hs;
        if (inv) obj.inv50 += hs; else obj.op50 += hs;
      } else {
        obj.total100 += hs;
        if (inv) obj.inv100 += hs; else obj.op100 += hs;
      }
    });

    // calcular $ por mes
    const resultado = meses.map(m => {
      const tar = tarifaMap[m.mes] || {};
      const v50  = parseFloat(tar.valor_hora_50)  || 0;
      const v100 = parseFloat(tar.valor_hora_100) || 0;
      return {
        ...m,
        v50, v100,
        $op:  m.op50  * v50 + m.op100  * v100,
        $inv: m.inv50 * v50 + m.inv100 * v100,
        $total: m.total50 * v50 + m.total100 * v100,
      };
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

  function fmt$(n) { return n > 0 ? `$${Math.round(n).toLocaleString('es-AR')}` : '—'; }
  function fmtHs(n) { return n > 0 ? n.toLocaleString('es-AR', { maximumFractionDigits: 1 }) : '—'; }

  return (
    <div style={s.page} className="page-padding">
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Evolución HHEE</h1>
          <p style={s.subtitle}>Horas aprobadas — operativas e inventario</p>
        </div>
        <select value={anio} onChange={e => setAnio(Number(e.target.value))} style={s.select}>
          {ANIOS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
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
        </>
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
