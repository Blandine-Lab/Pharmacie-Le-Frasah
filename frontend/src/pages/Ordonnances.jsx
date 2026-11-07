import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';

const PRIMARY = '#065f46';
const ACCENT = '#10b981';

const Ordonnances = () => {
  const [prescriptions, setPrescriptions] = useState([]);
  const [form, setForm] = useState({ patient_name: '', doctor_name: '', medications: '' });
  
  // États pour la photo
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    const { data } = await supabase.from('prescriptions').select('*').order('created_at', { ascending: false });
    if (data) setPrescriptions(data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // Gérer la sélection de la photo
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      // Créer un aperçu local
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.patient_name) {
      alert("Le nom du patient est requis.");
      return;
    }

    setUploading(true);
    let imageUrl = null;

    try {
      // 1. Uploader l'image si elle existe
      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('prescriptions')
          .upload(fileName, imageFile);

        if (uploadError) throw uploadError;

        // Récupérer l'URL publique
        const { data: { publicUrl } } = supabase.storage
          .from('prescriptions')
          .getPublicUrl(fileName);
          
        imageUrl = publicUrl;
      }

      // 2. Enregistrer dans la base de données
      await supabase.from('prescriptions').insert([{
        patient_name: form.patient_name,
        doctor_name: form.doctor_name,
        medications: form.medications,
        image_url: imageUrl
      }]);

      // 3. Réinitialiser le formulaire
      setForm({ patient_name: '', doctor_name: '', medications: '' });
      setImageFile(null);
      setImagePreview(null);
      fetchData();
    } catch (error) {
      console.error(error);
      alert("❌ Erreur lors de l'enregistrement : " + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleValidate = async (id) => {
    await supabase.from('prescriptions').update({ status: 'dispensed' }).eq('id', id);
    fetchData();
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Chargement...</div>;

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ color: PRIMARY, marginBottom: '0.5rem' }}>📝 Ordonnances</h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem' }}>Enregistrez les ordonnances (texte ou photo).</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
        
        {/* FORMULAIRE D'AJOUT */}
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h3 style={{ marginTop: 0, color: PRIMARY }}>➕ Nouvelle ordonnance</h3>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.3rem' }}>Nom du patient *</label>
              <input type="text" required value={form.patient_name} onChange={e => setForm({...form, patient_name: e.target.value})} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.3rem' }}>Médecin prescripteur</label>
              <input type="text" value={form.doctor_name} onChange={e => setForm({...form, doctor_name: e.target.value})} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.3rem' }}>Médicaments prescrits (texte)</label>
              <textarea value={form.medications} onChange={e => setForm({...form, medications: e.target.value})} rows={2} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', fontFamily: 'inherit' }} />
            </div>
            
            {/* PRISE DE PHOTO */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.3rem' }}>OU Prendre une photo</label>
              <input 
                type="file" 
                accept="image/*" 
                capture="environment" 
                onChange={handleImageChange} 
                style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px dashed #d1d5db', background: '#f9fafb', cursor: 'pointer' }} 
              />
              {imagePreview && (
                <div style={{ marginTop: '0.5rem', textAlign: 'center' }}>
                  <img src={imagePreview} alt="Aperçu" style={{ maxHeight: '120px', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }} />
                  <button type="button" onClick={() => { setImageFile(null); setImagePreview(null); }} style={{ display: 'block', margin: '0.3rem auto 0', background: 'transparent', border: 'none', color: '#dc2626', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' }}>Supprimer la photo</button>
                </div>
              )}
            </div>

            <button type="submit" disabled={uploading} style={{ width: '100%', padding: '0.6rem', background: ACCENT, color: 'white', border: 'none', borderRadius: '0.5rem', cursor: uploading ? 'not-allowed' : 'pointer', fontWeight: 'bold', opacity: uploading ? 0.7 : 1 }}>
              {uploading ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </form>
        </div>

        {/* HISTORIQUE */}
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h3 style={{ marginTop: 0, color: PRIMARY }}>📋 Historique</h3>
          {prescriptions.length === 0 ? <p style={{ color: '#6b7280' }}>Aucune ordonnance enregistrée.</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem' }}>Date</th>
                  <th style={{ padding: '0.5rem' }}>Patient</th>
                  <th style={{ padding: '0.5rem' }}>Médecin</th>
                  <th style={{ padding: '0.5rem', textAlign: 'center' }}>Photo</th>
                  <th style={{ padding: '0.5rem' }}>Statut</th>
                  <th style={{ padding: '0.5rem', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {prescriptions.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '0.5rem' }}>{new Date(p.created_at).toLocaleDateString('fr-FR')}</td>
                    <td style={{ padding: '0.5rem', fontWeight: 'bold' }}>{p.patient_name}</td>
                    <td style={{ padding: '0.5rem' }}>{p.doctor_name || '-'}</td>
                    
                    {/* BOUTON PHOTO */}
                    <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                      {p.image_url ? (
                        <a href={p.image_url} target="_blank" rel="noopener noreferrer" title="Voir la photo">
                          🖼️
                        </a>
                      ) : (
                        <span style={{ color: '#9ca3af' }}>-</span>
                      )}
                    </td>

                    <td style={{ padding: '0.5rem' }}>
                      <span style={{ background: p.status === 'pending' ? '#fef3c7' : '#d1fae5', color: p.status === 'pending' ? '#92400e' : PRIMARY, padding: '0.2rem 0.5rem', borderRadius: '0.3rem', fontSize: '0.75rem', fontWeight: 'bold' }}>
                        {p.status === 'pending' ? 'En attente' : 'Délivrée'}
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                      {p.status === 'pending' && (
                        <button onClick={() => handleValidate(p.id)} style={{ background: ACCENT, color: 'white', border: 'none', padding: '0.3rem 0.6rem', borderRadius: '0.3rem', cursor: 'pointer', fontSize: '0.8rem' }}>Délivrer</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
export default Ordonnances;