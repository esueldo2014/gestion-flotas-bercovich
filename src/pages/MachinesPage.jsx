import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useRole, can } from '../lib/RoleContext';
import MachineForm from '../components/machines/MachineForm';
import MachineList from '../components/machines/MachineList';
import ProvinciaTabs, { esDeProvincia } from '../components/common/ProvinciaTabs';

export default function MachinesPage() {
  const role = useRole();
  const puedeEditar = can.editarMaquinas(role?.rol);
  const [machines, setMachines] = useState([]);
  const [depositos, setDepositos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filterDeposito, setFilterDeposito] = useState('');
  const [provincia, setProvincia] = useState('T');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [{ data: maq, error: e1 }, { data: dep, error: e2 }] = await Promise.all([
      supabase.from('maquinas').select('*').order('numero_interno'),
      supabase.from('depositos').select('*').order('code'),
    ]);
    if (e1 || e2) { setError((e1 || e2).message); }
    else { setMachines(maq); setDepositos(dep); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function handleSave(form) {
    const payload = {
      ...form,
      anio: form.anio ? parseInt(form.anio) : null,
      deposito_id: form.deposito_id ? parseInt(form.deposito_id) : null,
      hora_inicial: form.hora_inicial ? parseFloat(form.hora_inicial) : null,
    };

    if (editing) {
      const { error } = await supabase.from('maquinas').update(payload).eq('id', editing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('maquinas').insert(payload);
      if (error) throw error;
    }
    setShowForm(false);
    setEditing(null);
    await fetchAll();
  }

  async function handleDelete(machine) {
    if (!window.confirm(`¿Eliminar la máquina ${machine.numero_interno}?`)) return;
    const { error } = await supabase.from('maquinas').delete().eq('id', machine.id);
    if (error) { alert(error.message); return; }
    await fetchAll();
  }

  function handleEdit(machine) {
    setEditing({
      ...machine,
      anio: machine.anio ?? '',
      deposito_id: machine.deposito_id ?? '',
      fecha_alta: machine.fecha_alta ?? new Date().toISOString().split('T')[0],
    });
    setShowForm(true);
  }

  function handleCancel() {
    setShowForm(false);
    setEditing(null);
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Maestro de máquinas</h1>
          <p style={styles.subtitle}>Autoelevadores y camiones — Grupo Bercovich</p>
        </div>
        {puedeEditar && (
          <button onClick={() => setShowForm(true)} style={styles.btnNew}>+ Nueva máquina</button>
        )}
      </div>

      <ProvinciaTabs value={provincia} onChange={(p) => { setProvincia(p); setFilterDeposito(''); }} />

      {loading && <p style={styles.info}>Cargando...</p>}
      {error && <p style={styles.errorMsg}>Error: {error}</p>}

      {!loading && !error && (
        <>
          <DepositoResumen
            machines={machines.filter(m => esDeProvincia(m.numero_interno, provincia))}
            depositos={depositos}
            selected={filterDeposito}
            onSelect={setFilterDeposito}
          />

          <MachineList
            machines={machines.filter(m => esDeProvincia(m.numero_interno, provincia))}
            depositos={depositos}
            filterDeposito={filterDeposito}
            onFilterChange={setFilterDeposito}
            onEdit={puedeEditar ? handleEdit : null}
            onDelete={puedeEditar ? handleDelete : null}
          />
        </>
      )}

      {showForm && (
        <MachineForm
          depositos={depositos}
          initial={editing}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}

function DepositoResumen({ machines, depositos, selected, onSelect }) {
  const counts = {};
  machines.forEach(m => {
    counts[m.deposito_id] = (counts[m.deposito_id] ?? 0) + 1;
  });

  const cards = depositos
    .filter(d => counts[d.id])
    .map(d => ({ ...d, total: counts[d.id], operativas: machines.filter(m => m.deposito_id === d.id && m.estado === 'Operativo').length }));

  if (cards.length === 0) return null;

  return (
    <div style={styles.resumenGrid}>
      {cards.map(d => (
        <button key={d.id} onClick={() => onSelect(String(selected) === String(d.id) ? '' : d.id)}
          style={{ ...styles.resumenCard, ...(String(selected) === String(d.id) ? styles.resumenCardActive : {}) }}>
          <div style={styles.resumenCode}>{d.code}</div>
          <div style={styles.resumenTotal}>{d.total}</div>
          <div style={styles.resumenSub}>{d.operativas} operativas</div>
        </button>
      ))}
    </div>
  );
}

const styles = {
  page: { maxWidth: 1100, margin: '0 auto', padding: '28px 20px', fontFamily: 'system-ui, sans-serif' },
  resumenGrid: { display:'flex', gap:12, flexWrap:'wrap', marginBottom:20 },
  resumenCard: {
    background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, padding:'14px 18px',
    minWidth:110, cursor:'pointer', textAlign:'left', fontFamily:'system-ui, sans-serif',
  },
  resumenCardActive: { borderColor:'#2563eb', background:'#eff6ff' },
  resumenCode: { fontSize:12, fontWeight:700, color:'#64748b' },
  resumenTotal: { fontSize:24, fontWeight:800, color:'#1e293b', marginTop:2 },
  resumenSub: { fontSize:11, color:'#94a3b8', marginTop:2 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  title: { margin: 0, fontSize: 26, color: '#1a1a2e', fontWeight: 700 },
  subtitle: { margin: '4px 0 0', color: '#888', fontSize: 14 },
  btnNew: {
    background: '#2563eb', color: '#fff', border: 'none', borderRadius: 7,
    padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  info: { color: '#666', textAlign: 'center', padding: 40 },
  errorMsg: { color: '#c0392b', background: '#fee2e2', padding: '10px 16px', borderRadius: 6 },
};
