import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import db from '../db';
import { syncAll } from '../services/syncService';

// Fonction pour obtenir le nom court (sans "Money" / "M-Pesa") pour les mégas/unités
const getShortName = (fullName) => {
  const map = {
    'Vodacom M-Pesa': 'Vodacom',
    'Airtel Money': 'Airtel',
    'Orange Money': 'Orange',
    'Africell Money': 'Africell'
  };
  return map[fullName] || fullName;
};

const OperatorSales = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [operator, setOperator] = useState(null);
  const [clients, setClients] = useState([]);
  const [sales, setSales] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('megas');
  const [stock, setStock] = useState({ stock_megas: 0, stock_unites: 0 });
  const [formData, setFormData] = useState({
    client_id: '',
    amount: '',
    quantity: '',
    payment_method: 'cash',
    note: '',
    operation_type: 'send',
    phone_number: '',
    beneficiary_phone: '',
    beneficiary_name: '',
    confirmation_code: ''
  });
  const [message, setMessage] = useState({ text: '', type: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      setLoading(true);

      const op = await db.operators.get(id);
      if (!op) {
        throw new Error('Opérateur introuvable');
      }
      setOperator(op);
      setStock({ stock_megas: op.stock_megas || 0, stock_unites: op.stock_unites || 0 });

      const clientsData = await db.clients.toArray();
      setClients(clientsData || []);

      const settingsData = await db.settings.toArray();
      const settingsObj = {};
      settingsData.forEach(s => { settingsObj[s.key] = s.value; });
      setSettings(settingsObj);

      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

      const allSales = await db.sales.toArray();
      const filteredSales = allSales.filter(s => {
        const saleDate = new Date(s.sale_date);
        return saleDate >= startOfDay && saleDate < endOfDay && s.operator_id === id;
      });
      filteredSales.sort((a, b) => new Date(b.sale_date) - new Date(a.sale_date));
      setSales(filteredSales);

      setMessage({ text: '', type: '' });
    } catch (error) {
      console.error('Erreur chargement:', error);
      setMessage({ text: 'Erreur de chargement des données', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (activeTab === 'emoney') {
      if (!formData.client_id || !formData.amount || parseFloat(formData.amount) <= 0) {
        setMessage({ text: 'Veuillez remplir tous les champs obligatoires', type: 'error' });
        return;
      }
      if (!formData.confirmation_code) {
        setMessage({ text: 'Le code de confirmation est obligatoire', type: 'error' });
        return;
      }
    } else {
      if (!formData.client_id || !formData.quantity || parseInt(formData.quantity) <= 0) {
        setMessage({ text: 'Veuillez remplir la quantité correctement', type: 'error' });
        return;
      }
    }

    setSaving(true);
    try {
      const saleData = {
        operator_id: id,
        client_id: formData.client_id,
        payment_method: formData.payment_method,
        note: formData.note,
        sale_type: activeTab,
      };

      if (activeTab === 'emoney') {
        saleData.total_amount = parseFloat(formData.amount);
        saleData.operation_type = formData.operation_type;
        saleData.phone_number = formData.phone_number;
        saleData.beneficiary_phone = formData.beneficiary_phone;
        saleData.beneficiary_name = formData.beneficiary_name;
        saleData.confirmation_code = formData.confirmation_code;
      } else {
        const unitPrice = activeTab === 'megas'
          ? parseFloat(settings.mega_price) || parseFloat(settings.default_unit_price) || 500
          : parseFloat(settings.unite_price) || parseFloat(settings.default_unit_price) || 500;

        const quantity = parseInt(formData.quantity);
        saleData.total_amount = quantity * unitPrice;
        saleData.quantity = quantity;
        const field = activeTab === 'megas' ? 'stock_megas' : 'stock_unites';
        const currentStock = stock[field];
        if (currentStock < quantity) {
          setMessage({ text: 'Stock insuffisant', type: 'error' });
          setSaving(false);
          return;
        }

        // ✅ CORRECTION : supprimer le "/api" en trop
        const stockUpdateResponse = await api.post('/stock/operator', {
          operator_id: id,
          type: activeTab === 'megas' ? 'mega' : 'unite',
          quantity: quantity,
          operation: 'remove'
        });

        if (!stockUpdateResponse.data.success) {
          throw new Error(stockUpdateResponse.data.error || 'Erreur mise à jour stock');
        }
        const newStock = currentStock - quantity;
        setStock(prev => ({ ...prev, [field]: newStock }));
      }

      const response = await api.post('/sale', saleData);

      if (response.data.success) {
        setMessage({ text: '✅ Transaction enregistrée avec succès !', type: 'success' });
        setFormData({
          client_id: '',
          amount: '',
          quantity: '',
          payment_method: 'cash',
          note: '',
          operation_type: 'send',
          phone_number: '',
          beneficiary_phone: '',
          beneficiary_name: '',
          confirmation_code: ''
        });
        await syncAll();
        await fetchData();
      } else {
        setMessage({ text: response.data.error || 'Erreur lors de l\'enregistrement', type: 'error' });
      }
    } catch (error) {
      console.error(error);
      setMessage({ text: error.message || '❌ Erreur serveur', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
      <div style={{ fontSize: '1.5rem', color: '#3b82f6' }}>Chargement...</div>
    </div>
  );

  if (!operator) return <div>Opérateur non trouvé</div>;

  const totalSales = sales.reduce((sum, s) => sum + s.total_amount, 0);
  const displayName = activeTab === 'emoney' ? operator.name : getShortName(operator.name);

  const unitPriceMega = parseFloat(settings.mega_price) || parseFloat(settings.default_unit_price) || 500;
  const unitPriceUnite = parseFloat(settings.unite_price) || parseFloat(settings.default_unit_price) || 500;
  const currentUnitPrice = activeTab === 'megas' ? unitPriceMega : unitPriceUnite;

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button
          onClick={() => navigate('/ventes-mega')}
          style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}
        >
          ←
        </button>
        <h1 style={{ color: operator.name === 'Vodacom M-Pesa' ? '#dc2626' : '#1e3a8a', margin: 0 }}>
          💳 {displayName}
        </h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ background: 'white', padding: '1rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <p style={{ color: '#6b7280', margin: 0 }}>Ventes du jour</p>
          <h2 style={{ color: '#1f2937', margin: '0.2rem 0' }}>{totalSales.toFixed(0)} FC</h2>
          <small style={{ color: '#6b7280' }}>{sales.length} transaction(s)</small>
        </div>
        <div style={{ background: 'white', padding: '1rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <p style={{ color: '#6b7280', margin: 0 }}>Stock mégas</p>
          <h2 style={{ color: '#1f2937', margin: '0.2rem 0' }}>{stock.stock_megas}</h2>
        </div>
        <div style={{ background: 'white', padding: '1rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <p style={{ color: '#6b7280', margin: 0 }}>Stock unités</p>
          <h2 style={{ color: '#1f2937', margin: '0.2rem 0' }}>{stock.stock_unites}</h2>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '2px solid #e5e7eb', marginBottom: '1.5rem' }}>
        {['megas', 'unites', 'emoney'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '0.5rem 1.5rem',
              border: 'none',
              background: activeTab === tab ? '#3b82f6' : 'transparent',
              color: activeTab === tab ? 'white' : '#1f2937',
              borderRadius: '0.5rem 0.5rem 0 0',
              cursor: 'pointer',
              fontWeight: activeTab === tab ? 'bold' : 'normal',
              transition: 'all 0.2s'
            }}
          >
            {tab === 'megas' && 'Mégas'}
            {tab === 'unites' && 'Unités'}
            {tab === 'emoney' && 'E-money'}
          </button>
        ))}
      </div>

      <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: '2rem' }}>
        <h3 style={{ marginTop: 0, color: '#1f2937' }}>
          {activeTab === 'megas' && '➕ Vente de mégas'}
          {activeTab === 'unites' && '➕ Vente d\'unités'}
          {activeTab === 'emoney' && '➕ Opération e-money'}
        </h3>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>Client</label>
              <select
                name="client_id"
                value={formData.client_id}
                onChange={handleChange}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }}
                required
              >
                <option value="">Sélectionner un client</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>Mode de paiement</label>
              <select
                name="payment_method"
                value={formData.payment_method}
                onChange={handleChange}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }}
              >
                <option value="cash">Espèces</option>
                <option value="emoney">E-money</option>
                <option value="credit">Crédit</option>
              </select>
            </div>

            {activeTab === 'emoney' && (
              <>
                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>Type d'opération</label>
                  <select
                    name="operation_type"
                    value={formData.operation_type}
                    onChange={handleChange}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }}
                  >
                    <option value="send">Dépôt (Envoi)</option>
                    <option value="receive">Retrait</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>Montant (FC)</label>
                  <input
                    type="number"
                    name="amount"
                    value={formData.amount}
                    onChange={handleChange}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }}
                    placeholder="Ex: 5000"
                    required
                    step="0.01"
                    min="0"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>Numéro de téléphone du client</label>
                  <input
                    type="text"
                    name="phone_number"
                    value={formData.phone_number}
                    onChange={handleChange}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }}
                    placeholder="Ex: 0612345678"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>Numéro du bénéficiaire</label>
                  <input
                    type="text"
                    name="beneficiary_phone"
                    value={formData.beneficiary_phone}
                    onChange={handleChange}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }}
                    placeholder="Ex: 0612345679"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>Nom du bénéficiaire</label>
                  <input
                    type="text"
                    name="beneficiary_name"
                    value={formData.beneficiary_name}
                    onChange={handleChange}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }}
                    placeholder="Nom du destinataire"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>Code de confirmation *</label>
                  <input
                    type="text"
                    name="confirmation_code"
                    value={formData.confirmation_code}
                    onChange={handleChange}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }}
                    placeholder="Ex: 123456"
                    required
                  />
                </div>
              </>
            )}

            {activeTab !== 'emoney' && (
              <>
                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>
                    Quantité de {activeTab === 'megas' ? 'mégas' : 'unités'}
                  </label>
                  <input
                    type="number"
                    name="quantity"
                    value={formData.quantity}
                    onChange={handleChange}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }}
                    placeholder="Ex: 10"
                    required
                    min="1"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>Montant total (FC)</label>
                  <input
                    type="text"
                    value={parseInt(formData.quantity) * currentUnitPrice || 0}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', background: '#f3f4f6' }}
                    readOnly
                  />
                  <small style={{ color: '#6b7280' }}>Prix unitaire : {currentUnitPrice} FC</small>
                </div>
              </>
            )}

            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.2rem' }}>Note (optionnel)</label>
              <input
                type="text"
                name="note"
                value={formData.note}
                onChange={handleChange}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }}
                placeholder="Ex: Recharge 10 000 FC"
              />
            </div>
          </div>
          {message.text && (
            <div style={{
              padding: '0.5rem',
              borderRadius: '0.5rem',
              marginTop: '1rem',
              background: message.type === 'success' ? '#d1fae5' : '#fecaca',
              color: message.type === 'success' ? '#065f46' : '#991b1b'
            }}>
              {message.text}
            </div>
          )}
          <button
            type="submit"
            disabled={saving}
            style={{
              marginTop: '1rem',
              padding: '0.75rem 2rem',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontSize: '1rem',
              opacity: saving ? 0.7 : 1
            }}
          >
            {saving ? 'Enregistrement...' : 'Enregistrer la transaction'}
          </button>
        </form>
      </div>

      <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <h3 style={{ marginTop: 0, color: '#1f2937' }}>📋 Historique des transactions (aujourd'hui)</h3>
        {sales.length === 0 ? (
          <p style={{ color: '#6b7280' }}>Aucune transaction enregistrée aujourd'hui pour cet opérateur.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem' }}>Client</th>
                  <th style={{ padding: '0.5rem', textAlign: 'center' }}>Montant (FC)</th>
                  <th style={{ padding: '0.5rem', textAlign: 'center' }}>Type</th>
                  <th style={{ padding: '0.5rem', textAlign: 'center' }}>Opération</th>
                  <th style={{ padding: '0.5rem', textAlign: 'center' }}>Paiement</th>
                  <th style={{ padding: '0.5rem', textAlign: 'center' }}>Date</th>
                  <th style={{ padding: '0.5rem', textAlign: 'left' }}>Téléphone</th>
                  <th style={{ padding: '0.5rem', textAlign: 'left' }}>Bénéficiaire</th>
                  <th style={{ padding: '0.5rem', textAlign: 'left' }}>Code</th>
                  <th style={{ padding: '0.5rem', textAlign: 'left' }}>Note</th>
                </tr>
              </thead>
              <tbody>
                {sales.map(s => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '0.5rem' }}>{s.clients?.name || 'Client'}</td>
                    <td style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 'bold' }}>{s.total_amount.toFixed(0)}</td>
                    <td style={{ padding: '0.5rem', textAlign: 'center' }}>{s.sale_type || '-'}</td>
                    <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                      {s.operation_type === 'send' ? 'Dépôt' : s.operation_type === 'receive' ? 'Retrait' : '-'}
                    </td>
                    <td style={{ padding: '0.5rem', textAlign: 'center' }}>{s.payment_method === 'cash' ? 'Espèces' : s.payment_method === 'emoney' ? 'E-money' : 'Crédit'}</td>
                    <td style={{ padding: '0.5rem', textAlign: 'center' }}>{new Date(s.sale_date).toLocaleTimeString()}</td>
                    <td style={{ padding: '0.5rem' }}>{s.phone_number || '-'}</td>
                    <td style={{ padding: '0.5rem' }}>{s.beneficiary_name || '-'} ({s.beneficiary_phone || '-'})</td>
                    <td style={{ padding: '0.5rem' }}>{s.confirmation_code || '-'}</td>
                    <td style={{ padding: '0.5rem' }}>{s.note || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default OperatorSales;