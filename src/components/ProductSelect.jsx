import { useState } from 'react';
import { Modal } from './ui';

const NEW_PRODUCT = '__new__';

// Selector de producto con la opción de crear uno nuevo; va fuera de otro <form> por el modal
export function useProductSelect({ value, onChange, products, onCreateProduct }) {
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleChange = (e) => {
    if (e.target.value === NEW_PRODUCT) {
      setName('');
      setShowModal(true);
    } else {
      onChange(e.target.value);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    const created = await onCreateProduct(name);
    setSaving(false);
    if (created) {
      onChange(created.name);
      setShowModal(false);
    }
  };

  const field = (
    <div>
      <label htmlFor="product">Tipo de producto</label>
      <select id="product" value={value} onChange={handleChange}>
        {products.map(p => (
          <option key={p.id} value={p.name}>{p.name}</option>
        ))}
        <option value={NEW_PRODUCT}>+ Crear producto…</option>
      </select>
    </div>
  );

  const modal = showModal && (
    <Modal title="Crear producto" onClose={() => setShowModal(false)}>
      <form onSubmit={handleCreate}>
        <div className="modal-field">
          <label htmlFor="newProductName">Nombre del producto</label>
          <input id="newProductName" type="text" autoFocus placeholder="Ej: Pera, Manzana" value={name} onChange={e => setName(e.target.value)} required />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-subtle" onClick={() => setShowModal(false)}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Crear producto'}</button>
        </div>
      </form>
    </Modal>
  );

  return { field, modal };
}
