import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../shared/lib/supabaseClient';
import { useRole, can } from '../../../shared/lib/RoleContext';
import MachineForm from '../components/machines/MachineForm';
import MachineList from '../components/machines/MachineList';
import ProvinciaTabs, { esDeProvincia } from '../components/common/ProvinciaTabs';
import DepositoResumen from '../components/common/DepositoResumen';

export default function MachinesPage() {
  const role = useRole();
  const puedeEditar = can.editarMaquinas(role?.rol);
  const [machines, setMachines] = useState([]);
  const [depositos, setDepositos] = useState([]);
  const [rubros, setRubros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filterDeposito, setFilterDeposito] = useState('');
  const [provincia, setProvincia] = useState('T');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [{ data: maq, error: e1 }, { data: dep, error: e2 }, { data: rub }] = await Promise.all([
      supabase.from('maquinas').select('*').order('numero_interno'),
      supabase.from('sucursales').select('*').order('code'),
      supabase.from('depositos').select('*').order('nombre'),
    ]);
    if (e1 || e2) { setError((e1 || e2).message); }
    else { setMachines(maq); setDepositos(dep); setRubros(rub ?? []); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function handleSave(form) {
    const payload = {
      ...form,
      anio: form.anio ? parseInt(form.anio) : null,
      deposito_id: form.deposito_id ? parseInt(form.deposito_id) : null,
      rubro_deposito_id: form.rubro_deposito_id ? parseInt(form.rubro_deposito_id) : null,
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
      rubro_deposito_id: machine.rubro_deposito_id ?? '',
      fecha_alta: machine.fecha_alta ?? new Date().toISOString().split('T')[0],
    });
    setShowForm(true);
  }

  function handleCancel() {
    setShowForm(false);
    setEditing(null);
  }

  return (
    <div style={styles.page} className="page-padding">
      <div style={styles.header} className="header-flex">
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
            rubros={rubros}
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
          rubros={rubros}
          initial={editing}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}

const styles = {
  page: { maxWidth: 1100, margin: '0 auto', padding: '28px 20px', fontFamily: 'system-ui, sans-serif' },
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
