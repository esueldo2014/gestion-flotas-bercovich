import { useState } from 'react';

export default function HorometroForm({ maquina, ultimaLectura, onSave, saving }) {
  const [valor, setValor] = useState('');
  const [error, setError] = useState(null);

  const unidad = maquina.tipo === 'Autoelevador' ? 'hs' : 'km';
  const label  = maquina.tipo === 'Autoelevador' ? 'Horómetro (horas)' : 'Odómetro (kilómetros)';

  function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const num = parseFloat(valor);
    if (isNaN(num) || num <= 0) { setError('Ingresá un valor válido mayor a cero.'); return; }
    if (ultimaLectura !== null && num <= ultimaLectura) {
      setError(`El valor debe ser mayor al último registrado (${ultimaLectura} ${unidad}).`);
      return;
    }
    onSave(num);
    setValor('');
  }

  return (
    <form onSubmit={handleSubmit} style={styles.card}>
      <h3 style={styles.machineTitle}>
        <span style={styles.badge}>{maquina.numero_interno}</span>
        {maquina.marca} {maquina.modelo} — {maquina.tipo}
      </h3>

      {ultimaLectura !== null && (
        <p style={styles.ultima}>
          Última lectura registrada: <strong>{ultimaLectura.toLocaleString('es-AR')} {unidad}</strong>
        </p>
      )}

      <div style={styles.row}>
        <div style={styles.inputWrap}>
          <label style={styles.label}>{label} *</label>
          <input
            type="number" step="0.1" min="0" value={valor}
            onChange={e => setValor(e.target.value)}
            placeholder={ultimaLectura !== null ? `> ${ultimaLectura}` : '0'}
            style={styles.input} required autoFocus
          />
        </div>
        <button type="submit" disabled={saving} style={styles.btn}>
          {saving ? 'Guardando...' : `Registrar ${unidad}`}
        </button>
      </div>

      {error && <p style={styles.error}>{error}</p>}
    </form>
  );
}

const styles = {
  card: {
    background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10,
    padding: '20px 24px', marginBottom: 24,
  },
  machineTitle: { margin: '0 0 12px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 10 },
  badge: {
    background: '#2563eb', color: '#fff', borderRadius: 6,
    padding: '2px 10px', fontSize: 13, fontWeight: 700,
  },
  ultima: { margin: '0 0 14px', fontSize: 14, color: '#555' },
  row: { display: 'flex', gap: 12, alignItems: 'flex-end' },
  inputWrap: { display: 'flex', flexDirection: 'column', gap: 4, flex: 1 },
  label: { fontSize: 13, fontWeight: 600, color: '#444' },
  input: {
    padding: '9px 12px', border: '1px solid #ccc', borderRadius: 6,
    fontSize: 15, outline: 'none', maxWidth: 220,
  },
  btn: {
    background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6,
    padding: '9px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  error: { color: '#c0392b', marginTop: 10, fontSize: 13 },
};
