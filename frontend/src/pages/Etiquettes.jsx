import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import db from '../db';
import { supabase } from '../utils/supabaseClient';
import { syncAll } from '../services/syncService';

const PRIMARY = '#065f46';
const ACCENT = '#10b981';

const Etiquettes = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedForPrint, setSelectedForPrint] = useState([]);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const data = await db.products.toArray();
      // Auto-générer les codes manquants localement
      const updated = data.map(p => ({
        ...p,
        code: p.code || `MED-${(p.id || '').substring(0, 6).toUpperCase()}`,
      }));
      updated.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setProducts(updated);
    } catch (err) {
      console.error('Erreur chargement produits:', err);
    } finally {
      setLoading(false);
    }
  };

  // Générer et sauvegarder un code si manquant (async)
  const ensureCode = async (product) => {
    if (product.code && product.code.length > 0) return product.code;
    const newCode = `MED-${(product.id || '').substring(0, 6).toUpperCase()}`;
    try {
      await supabase
        .from('products')
        .update({ code: newCode })
        .eq('id', product.id);
      await syncAll();
    } catch (err) {
      console.error('Erreur sauvegarde code:', err);
    }
    return newCode;
  };

  // Ajouter/retirer de la sélection pour impression
  const toggleSelect = (product) => {
    setSelectedForPrint(prev => {
      const exists = prev.find(p => p.id === product.id);
      if (exists) return prev.filter(p => p.id !== product.id);
      return [...prev, product];
    });
  };

  const toggleSelectAll = () => {
    if (selectedForPrint.length === filtered.length) {
      setSelectedForPrint([]);
    } else {
      setSelectedForPrint([...filtered]);
    }
  };

  const handlePrint = async () => {
    if (selectedForPrint.length === 0) {
      alert('Sélectionnez au moins un produit à imprimer');
      return;
    }
    setPrinting(true);

    // S'assurer que tous les codes existent
    for (const p of selectedForPrint) {
      await ensureCode(p);
    }

    setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 300);
  };

  const filtered = products.filter(p => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (p.name || '').toLowerCase().includes(s) ||
      (p.dci || '').toLowerCase().includes(s) ||
      (p.code || '').toLowerCase().includes(s) ||
      (p.lot || '').toLowerCase().includes(s)
    );
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <div style={{ fontSize: '1.5rem', color: ACCENT }}>Chargement des médicaments...</div>
      </div>
    );
  }

  return (
    <>
      {/* ==== ÉCRAN NORMAL (masqué à l'impression) ==== */}
      <div className="no-print" style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ color: PRIMARY, marginBottom: '0.25rem' }}>🏷️ Étiquettes & QR Codes</h1>
            <p style={{ color: '#6b7280' }}>Générez et imprimez les QR codes à coller sur les médicaments</p>
          </div>
          <button
            onClick={handlePrint}
            disabled={printing || selectedForPrint.length === 0}
            style={{
              background: selectedForPrint.length === 0 ? '#9ca3af' : PRIMARY,
              color: 'white',
              padding: '0.6rem 1.5rem',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: selectedForPrint.length === 0 ? 'not-allowed' : 'pointer',
              fontSize: '1rem',
              fontWeight: 'bold',
            }}
          >
            🖨️ Imprimer {selectedForPrint.length > 0 && `(${selectedForPrint.length})`}
          </button>
        </div>

        {/* Guide */}
        <div style={{ background: '#f0fdf4', padding: '1rem', borderRadius: '0.75rem', marginBottom: '1.5rem', borderLeft: `4px solid ${ACCENT}`, fontSize: '0.9rem', color: '#374151' }}>
          <strong>💡 Comment ça marche ?</strong>
          <ol style={{ margin: '0.5rem 0 0', paddingLeft: '1.5rem' }}>
            <li>Sélectionnez les médicaments (cases à cocher)</li>
            <li>Cliquez sur <strong>🖨️ Imprimer</strong> — une page d'étiquettes s'affiche</li>
            <li>Imprimez et découpez les étiquettes</li>
            <li>Collez chaque QR code sur la boîte correspondante</li>
            <li>À la vente, ouvrez <strong>📷 Scanner</strong> dans Ventes pour lire le QR</li>
          </ol>
        </div>

        {/* Recherche */}
        <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            placeholder="🔍 Rechercher par nom, DCI, code ou lot..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', fontSize: '0.95rem' }}
          />
          <button
            onClick={toggleSelectAll}
            style={{ padding: '0.5rem 1rem', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}
          >
            {selectedForPrint.length === filtered.length ? 'Désélectionner tout' : 'Sélectionner tout'}
          </button>
        </div>

        {filtered.length === 0 ? (
          <p style={{ color: '#6b7280' }}>Aucun médicament trouvé.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
            {filtered.map((p) => {
              const isSelected = selectedForPrint.some(x => x.id === p.id);
              const code = p.code || `MED-${(p.id || '').substring(0, 6).toUpperCase()}`;
              return (
                <div
                  key={p.id}
                  onClick={() => toggleSelect(p)}
                  style={{
                    background: 'white',
                    padding: '1rem',
                    borderRadius: '0.75rem',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                    cursor: 'pointer',
                    border: isSelected ? `2px solid ${ACCENT}` : '2px solid transparent',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ padding: '0.5rem', background: 'white', borderRadius: '0.4rem', border: '1px solid #e5e7eb' }}>
                      <QRCodeSVG value={code} size={70} level="M" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 'bold', color: '#1f2937', fontSize: '0.95rem', marginBottom: '0.2rem' }}>
                        {p.name}
                      </div>
                      {p.dci && <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{p.dci} {p.dosage && `· ${p.dosage}`}</div>}
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.2rem', fontFamily: 'monospace' }}>
                        {code}
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(p)}
                      style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ==== ZONE D'IMPRESSION (visible uniquement à l'impression) ==== */}
      <div className="print-area">
        {selectedForPrint.map((p) => {
          const code = p.code || `MED-${(p.id || '').substring(0, 6).toUpperCase()}`;
          return (
            <div key={p.id} className="label">
              <QRCodeSVG value={code} size={140} level="M" />
              <div className="label-name">{p.name}</div>
              {p.dosage && <div className="label-dosage">{p.dosage}</div>}
              {p.dci && <div className="label-dci">{p.dci}</div>}
              <div className="label-code">{code}</div>
              <div className="label-footer">Pharmacie Le Frasah</div>
            </div>
          );
        })}
      </div>

      <style>{`
        .print-area { display: none; }

        @media print {
          .no-print { display: none !important; }
          .print-area {
            display: grid !important;
            grid-template-columns: repeat(3, 1fr);
            gap: 10mm;
            padding: 10mm;
          }
          .label {
            border: 1px dashed #999;
            padding: 5mm;
            text-align: center;
            page-break-inside: avoid;
            background: white;
          }
          .label-name {
            font-weight: bold;
            font-size: 12px;
            margin-top: 4px;
            word-break: break-word;
          }
          .label-dosage { font-size: 10px; color: #333; }
          .label-dci { font-size: 9px; color: #666; font-style: italic; }
          .label-code {
            font-family: monospace;
            font-size: 9px;
            color: #333;
            margin-top: 2px;
            letter-spacing: 0.5px;
          }
          .label-footer {
            font-size: 7px;
            color: #999;
            margin-top: 2px;
          }
          @page { margin: 10mm; }
        }
      `}</style>
    </>
  );
};

export default Etiquettes;