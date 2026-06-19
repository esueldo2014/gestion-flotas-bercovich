import { useState, useEffect } from 'react';

const ESTADOS = ['Operativo', 'En taller', 'Fuera de servicio'];
const TIPOS = ['Autoelevador', 'Camión'];

const emptyForm = {
  numero_interno: '',
  tipo: 'Autoelevador',
  marca: '',
  modelo: '',
  anio: '',
  numero_motor: '',
  numero_chasis: '',
  deposito_id: '',
  fecha_alta: new Date().toISOString().split('T')[0],
  estado: 'Operativo',
  capacidad_patente: '',
  hora_inicial: '',
};

export default function MachineForm({ depositos, initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial ?? emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setForm(initial ?? emptyForm);
  }, [initial]);

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSave(form);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const isEdit = !!initial;
  const capacidadLabel = form.tipo === 'Autoelevador' ? 'Capacidad de carga' : 'Patente';

  return (
    <div style={styles.overlay}>
      <form onSubmit={handleSubmit} style={styles.card}>
        <h2 style={styles.title}>{isEdit ? 'Editar máquina' : 'Alta de máquina'}</h2>

        <div style={styles.grid}>
          <Field label="N° interno *" name="numero_interno" value={form.numero_interno}
            onChange={handleChange} required placeholder="AE-014 / CAM-07" />

          <div style={styles.field}>
            <label style={styles.label}>Tipo *</label>
            <select name="tipo" value={form.tipo} onChange={handleChange} style={styles.input} required>
              {TIPOS.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          <Field label="Marca" name="marca" value={form.marca} onChange={handleChange} />
          <Field label="Modelo" name="modelo" value={form.modelo} onChange={handleChange} />
          <Field label="Año" name="anio" value={form.anio} onChange={handleChange} type="number"
            placeholder="2018" />
          <Field label="N° de motor" name="numero_motor" value={form.numero_motor} onChange={handleChange} />
          <Field label="N° de chasis" name="numero_chasis" value={form.numero_chasis} onChange={handleChange} />

          <div style={styles.field}>
            <label style={styles.label}>Depósito *</label>
            <select name="deposito_id" value={form.deposito_id} onChange={handleChange}
              style={styles.input} required>
              <option value="">Seleccionar...</option>
              {depositos.map(d => (
                <option key={d.id} value={d.id}>{d.code} — {d.name}</option>
              ))}
            </select>
          </div>

          <Field label="Fecha de alta *" name="fecha_alta" value={form.fecha_alta}
            onChange={handleChange} type="date" required />

          <div style={styles.field}>
            <label style={styles.label}>Estado *</label>
            <select name="estado" value={form.estado} onChange={handleChange} style={styles.input} required>
              {ESTADOS.map(e => <option key={e}>{e}</option>)}
            </select>
          </div>

          <Field label={capacidadLabel} name="capacidad_patente" value={form.capacidad_patente}
            onChange={handleChange} placeholder={form.tipo === 'Autoelevador' ? '2500 kg' : 'AA 123 BB'} />

          <Field
            label={form.tipo === 'Autoelevador' ? 'Horómetro inicial (hs)' : 'Kilometraje inicial (km)'}
            name="hora_inicial" value={form.hora_inicial} onChange={handleChange}
            type="number" placeholder="Ej: 1250" />
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <div style={styles.actions}>
          <button type="button" onClick={onCancel} style={styles.btnSecondary}>Cancelar</button>
          <button type="submit" disabled={saving} style={styles.btnPrimary}>
            {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Dar de alta'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, name, value, onChange, type = 'text', required, placeholder }) {
  return (
    <div style={styles.field}>
      <label style={styles.label}>{label}</label>
      <input
        type={type} name={name} value={value} onChange={onChange}
        required={required} placeholder={placeholder}
        style={styles.input}
      />
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
  },
  card: {
    background: '#fff', borderRadius: 10, padding: 28, width: '100%', maxWidth: 680,
    maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
  },
  title: { margin: '0 0 20px', fontSize: 20, color: '#1a1a2e' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px' },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 13, fontWeight: 600, color: '#444' },
  input: {
    padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6,
    fontSize: 14, outline: 'none',
  },
  error: { color: '#c0392b', marginTop: 12, fontSize: 13 },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 },
  btnPrimary: {
    background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6,
    padding: '9px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  btnSecondary: {
    background: '#f1f5f9', color: '#333', border: '1px solid #ccc', borderRadius: 6,
    padding: '9px 22px', fontSize: 14, cursor: 'pointer',
  },
};
