import { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import db from '../db';
import { syncAll } from '../services/syncService';

const PRIMARY = '#065f46';
const ACCENT = '#10b981';
const WARN = '#f59e0b';
const DANGER = '#dc2626';
const BLUE = '#3b82f6';

// Couleurs RGB pour le PDF
const PDF_HEADER = [6, 95, 70];
const PDF_DANGER = [220, 38, 38];
const PDF_WARN = [245, 158, 11];
const PDF_ACCENT = [16, 185, 129];
const PDF_GRAY = [107, 114, 128];

const Sauvegarde = () => {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [exportType, setExportType] = useState('daily');
  const [signature, setSignature] = useState(localStorage.getItem('pharmacy_signature') || null);
  
  // Dates personnalisées
  const [customStartDate, setCustomStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [customEndDate, setCustomEndDate] = useState(new Date().toISOString().split('T')[0]);

  // ===== Récupération des données =====
  const fetchLocalData = async () => {
    if (navigator.onLine) {
      try { await syncAll(); } catch (e) { console.warn('Synchronisation ignorée:', e); }
    }

    const [products, stockMovements, sales, clients, sellers] = await Promise.all([
      db.products.toArray(),
      db.stockMovements.toArray(),
      db.sales.toArray(),
      db.clients ? db.clients.toArray() : [],
      db.sellers.toArray(),
    ]);

    return { products, stockMovements, sales, clients, sellers };
  };

  const getPeriodBounds = () => {
    const now = new Date();
    let start, end;
    
    if (exportType === 'daily') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    } else if (exportType === 'weekly') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      start = new Date(now.getFullYear(), now.getMonth(), diff);
      end = new Date(now.getFullYear(), now.getMonth(), diff + 6, 23, 59, 59);
    } else if (exportType === 'monthly') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    } else {
      // Personnalisé
      start = new Date(customStartDate);
      end = new Date(customEndDate);
      end.setHours(23, 59, 59, 999);
    }
    return { start, end };
  };

  // ===== Calcul détaillé de TOUS les produits =====
  const computeDetailedProducts = (products, stockMovements, sales) => {
    const { start, end } = getPeriodBounds();

    const periodMovements = stockMovements.filter(m => {
      const d = new Date(m.created_at || m.date);
      return d >= start && d <= end;
    });

    const periodSales = sales.filter(s => {
      const d = new Date(s.sale_date);
      return d >= start && d <= end;
    });

    const productStats = {};
    products.forEach(p => {
      const pa = parseFloat(p.prix_achat) || 0;
      const pv = parseFloat(p.unit_price) || 0;
      const stock = p.current_stock || 0;
      const seuil = p.reorder_level || 0;

      let peremptionJours = null;
      let peremptionStatut = 'OK';
      if (p.date_peremption) {
        const exp = new Date(p.date_peremption);
        const diffJ = Math.floor((exp - new Date()) / (24 * 3600 * 1000));
        peremptionJours = diffJ;
        if (diffJ < 0) peremptionStatut = 'PERIME';
        else if (diffJ <= 30) peremptionStatut = 'URGENT';
        else if (diffJ <= 90) peremptionStatut = 'PROCHE';
      }

      let stockStatut = 'OK';
      if (stock === 0) stockStatut = 'RUPTURE';
      else if (stock <= seuil) stockStatut = 'BAS';

      productStats[p.id] = {
        id: p.id, code: p.code || '-', name: p.name, dci: p.dci || '-', dosage: p.dosage || '-', forme: p.forme || '-', laboratoire: p.laboratoire || '-', lot: p.lot || '-',
        datePeremption: p.date_peremption || null, peremptionJours, peremptionStatut,
        stock, seuil, stockStatut, pa, pv,
        margePct: pv > 0 ? ((pv - pa) / pv * 100) : 0,
        margeValeur: pv - pa, valeurStockAchat: stock * pa, valeurStockVente: stock * pv,
        entrees: 0, sorties: 0, caVentes: 0, qtyVendue: 0,
      };
    });

    periodMovements.forEach(m => {
      const pid = m.product_id;
      if (!productStats[pid]) return;
      const qty = Math.abs(m.quantity_change);
      const type = m.movement_type;
      if (type === 'supplier_in' || type === 'cooperant_return') {
        productStats[pid].entrees += qty;
      } else if (type === 'cooperant_take' || type === 'retail_sale' || type === 'stock_loss') {
        productStats[pid].sorties += qty;
        if (type === 'retail_sale') {
          productStats[pid].qtyVendue += qty;
          productStats[pid].caVentes += qty * productStats[pid].pv;
        }
      }
    });

    const priority = (p) => {
      if (p.stockStatut === 'RUPTURE') return 0;
      if (p.peremptionStatut === 'PERIME') return 1;
      if (p.stockStatut === 'BAS') return 2;
      if (p.peremptionStatut === 'URGENT') return 3;
      if (p.peremptionStatut === 'PROCHE') return 4;
      return 5;
    };

    return Object.values(productStats).sort((a, b) => {
      const diff = priority(a) - priority(b);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    });
  };

  const paymentLabel = (pm) => {
    switch (pm) {
      case 'cash': return 'Espèces';
      case 'bank': return 'Banque';
      case 'mobile_money': return 'Mobile money';
      case 'assurance': return 'Assurance / Mutuelle';
      case 'credit': return 'Crédit';
      default: return pm;
    }
  };

  // ===== Export PDF =====
  const exportPDF = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const { products, stockMovements, sales } = await fetchLocalData();
      const { start, end } = getPeriodBounds();

      const periodSales = sales.filter(s => {
        const d = new Date(s.sale_date);
        return d >= start && d <= end;
      });

      const detailedProducts = computeDetailedProducts(products, stockMovements, sales);

      // KPI globaux
      const ca = periodSales.reduce((sum, s) => sum + (parseFloat(s.total_amount) || 0), 0);
      const nbVentes = periodSales.length;
      const panierMoyen = nbVentes > 0 ? ca / nbVentes : 0;
      const stockValeurAchat = detailedProducts.reduce((s, p) => s + p.valeurStockAchat, 0);
      const stockValeurVente = detailedProducts.reduce((s, p) => s + p.valeurStockVente, 0);
      const margePotentielle = stockValeurVente - stockValeurAchat;
      const totalStockQty = detailedProducts.reduce((s, p) => s + p.stock, 0);
      const ruptures = detailedProducts.filter(p => p.stockStatut === 'RUPTURE').length;
      const stocksBas = detailedProducts.filter(p => p.stockStatut === 'BAS').length;
      const expires = detailedProducts.filter(p => p.peremptionStatut === 'PERIME').length;
      const urgents = detailedProducts.filter(p => p.peremptionStatut === 'URGENT').length;

      const paymentMap = {};
      periodSales.forEach(s => {
        const key = s.payment_method || 'cash';
        paymentMap[key] = (paymentMap[key] || 0) + (parseFloat(s.total_amount) || 0);
      });

      const topProducts = detailedProducts.filter(p => p.qtyVendue > 0).sort((a, b) => b.qtyVendue - a.qtyVendue).slice(0, 20);

      const doc = new jsPDF('landscape', 'mm', 'a4');
      const periodLabel = exportType === 'daily' ? 'Journée' : exportType === 'weekly' ? 'Semaine' : exportType === 'monthly' ? 'Mois' : `Du ${customStartDate} au ${customEndDate}`;
      const dateStr = new Date().toLocaleString('fr-FR');
      const pageW = doc.internal.pageSize.width;
      const pageH = doc.internal.pageSize.height;

      // ================================================================
      // PAGE 1 : KPI + SYNTHÈSE + LOGO
      // ================================================================
      // Logo de la pharmacie
      try {
        doc.addImage('/logo.jpeg', 'JPEG', 14, 10, 20, 20);
      } catch(e) { console.warn('Logo non trouvé'); }

      doc.setFillColor(...PDF_HEADER);
      doc.rect(35, 0, pageW - 35, 18, 'F'); // Bandeau commence après le logo
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('Rapport Pharmacie Le Frasah', 40, 12);

      doc.setTextColor(80, 80, 80);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Généré le ${dateStr}`, 14, 38);
      doc.text(`Période : ${periodLabel}`, 14, 44);

      doc.setTextColor(...PDF_HEADER);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('Indicateurs clés', 14, 54);

      autoTable(doc, {
        startY: 58,
        head: [['Indicateur', 'Valeur', 'Indicateur', 'Valeur']],
        body: [
          ['Chiffre d\'affaires', `${ca.toFixed(0)} FC`, 'Nombre de ventes', nbVentes],
          ['Panier moyen', `${panierMoyen.toFixed(0)} FC`, 'Stock total (unités)', totalStockQty],
          ['Valeur stock (achat)', `${stockValeurAchat.toFixed(0)} FC`, 'Valeur stock (vente)', `${stockValeurVente.toFixed(0)} FC`],
          ['Marge potentielle', `${margePotentielle.toFixed(0)} FC`, 'Nombre de médicaments', products.length],
          ['⚠️ Ruptures', ruptures, '⚠️ Stocks bas', stocksBas],
          ['⏰ Expirés', expires, '⏰ Expirent bientôt (≤30j)', urgents],
        ],
        theme: 'grid',
        styles: { fontSize: 9 },
        headStyles: { fillColor: PDF_HEADER, textColor: 255 },
        columnStyles: { 0: { cellWidth: 55 }, 1: { cellWidth: 55, fontStyle: 'bold' }, 2: { cellWidth: 65 }, 3: { cellWidth: 55, fontStyle: 'bold' } },
        margin: { left: 14, right: 14 },
      });

      // ================================================================
      // PAGES SUIVANTES : DÉTAIL COMPLET DE CHAQUE PRODUIT
      // ================================================================
      doc.addPage();

      doc.setFontSize(14);
      doc.setTextColor(...PDF_HEADER);
      doc.setFont('helvetica', 'bold');
      doc.text('Détail complet de tous les produits', 14, 16);
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.setFont('helvetica', 'normal');
      doc.text(`Trié par priorité : ruptures et expirations en premier — ${detailedProducts.length} produit(s)`, 14, 21);

      const detailHead = [['Code', 'Médicament', 'DCI', 'Dosage', 'Forme', 'Laboratoire', 'Lot', 'Péremption', 'Stock', 'Seuil', 'P.Achat', 'P.Vente', 'Marge %', 'Val.Stock', 'Entrées', 'Sorties', 'CA période']];

      const detailBody = detailedProducts.map(p => {
        const stockColor = p.stockStatut === 'RUPTURE' ? PDF_DANGER : p.stockStatut === 'BAS' ? PDF_WARN : [0, 0, 0];
        const perempColor = p.peremptionStatut === 'PERIME' ? PDF_DANGER : p.peremptionStatut === 'URGENT' ? PDF_DANGER : p.peremptionStatut === 'PROCHE' ? PDF_WARN : [0, 0, 0];
        const perempText = p.datePeremption ? (p.peremptionStatut === 'PERIME' ? `EXPIRÉ` : `${new Date(p.datePeremption).toLocaleDateString('fr-FR')} (${p.peremptionJours}j)`) : '-';
        const margeText = p.pa > 0 && p.pv > 0 ? `${p.margePct.toFixed(0)}%` : '-';
        const entreesText = p.entrees > 0 ? `+${p.entrees}` : '-';
        const sortiesText = p.sorties > 0 ? `-${p.sorties}` : '-';
        const caText = p.caVentes > 0 ? `${p.caVentes.toFixed(0)} FC` : '-';

        return [
          { content: p.code, styles: { fontSize: 6.5 } },
          { content: p.name, styles: { fontSize: 6.5, fontStyle: 'bold' } },
          { content: p.dci, styles: { fontSize: 6 } },
          { content: p.dosage, styles: { fontSize: 6 } },
          { content: p.forme, styles: { fontSize: 6 } },
          { content: p.laboratoire, styles: { fontSize: 6 } },
          { content: p.lot, styles: { fontSize: 6 } },
          { content: perempText, styles: { fontSize: 6, textColor: perempColor, fontStyle: p.peremptionStatut !== 'OK' ? 'bold' : 'normal' } },
          { content: p.stock, styles: { fontSize: 6.5, textColor: stockColor, fontStyle: 'bold', halign: 'center' } },
          { content: p.seuil, styles: { fontSize: 6, halign: 'center' } },
          { content: `${p.pa.toFixed(0)}`, styles: { fontSize: 6, halign: 'right' } },
          { content: `${p.pv.toFixed(0)}`, styles: { fontSize: 6, halign: 'right' } },
          { content: margeText, styles: { fontSize: 6, halign: 'center', textColor: p.margePct > 30 ? PDF_ACCENT : [0, 0, 0] } },
          { content: `${p.valeurStockAchat.toFixed(0)}`, styles: { fontSize: 6, halign: 'right' } },
          { content: entreesText, styles: { fontSize: 6, halign: 'center', textColor: PDF_ACCENT } },
          { content: sortiesText, styles: { fontSize: 6, halign: 'center', textColor: PDF_DANGER } },
          { content: caText, styles: { fontSize: 6, halign: 'right', fontStyle: 'bold' } },
        ];
      });

      autoTable(doc, {
        startY: 26,
        head: detailHead,
        body: detailBody,
        theme: 'striped',
        styles: { fontSize: 6, cellPadding: 1, overflow: 'linebreak', valign: 'middle' },
        headStyles: { fillColor: PDF_HEADER, textColor: 255, fontSize: 6.5, fontStyle: 'bold', halign: 'center' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: { 0: { cellWidth: 14 }, 1: { cellWidth: 28 }, 2: { cellWidth: 22 }, 3: { cellWidth: 13 }, 4: { cellWidth: 15 }, 5: { cellWidth: 16 }, 6: { cellWidth: 15 }, 7: { cellWidth: 20 }, 8: { cellWidth: 11 }, 9: { cellWidth: 9 }, 10: { cellWidth: 12 }, 11: { cellWidth: 12 }, 12: { cellWidth: 11 }, 13: { cellWidth: 15 }, 14: { cellWidth: 11 }, 15: { cellWidth: 11 }, 16: { cellWidth: 16 } },
        margin: { left: 8, right: 8, top: 26, bottom: 15 },
        didDrawPage: (data) => {
          if (data.pageNumber > 1) {
            doc.setFillColor(...PDF_HEADER);
            doc.rect(0, 0, pageW, 8, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.text('Détail complet des produits — Pharmacie Le Frasah', 8, 5.5);
          }
          // Pied de page GlobalMind
          doc.setFontSize(7);
          doc.setTextColor(150, 150, 150);
          doc.text(`Pharmacie Le Frasah — Rapport ${periodLabel} — Page ${data.pageNumber}`, 8, pageH - 4);
          doc.text('Développé par GlobalMind InnoTech', pageW - 8, pageH - 4, { align: 'right' });
        },
      });

      // ================================================================
      // PAGE RÉPARTITION PAIEMENTS + TOP MÉDICAMENTS
      // ================================================================
      doc.addPage();

      doc.setFontSize(14);
      doc.setTextColor(...PDF_HEADER);
      doc.setFont('helvetica', 'bold');
      doc.text('Répartition par moyen de paiement', 14, 16);

      const paymentData = [['Moyen de paiement', 'Montant (FC)', 'Pourcentage']];
      const totalPayments = Object.values(paymentMap).reduce((s, v) => s + v, 0);
      Object.entries(paymentMap).sort(([, a], [, b]) => b - a).forEach(([key, amount]) => {
        const pct = totalPayments > 0 ? ((amount / totalPayments) * 100).toFixed(1) : '0';
        paymentData.push([paymentLabel(key), amount.toFixed(0), `${pct}%`]);
      });
      if (paymentData.length === 1) paymentData.push(['Aucune vente', '0', '0%']);

      autoTable(doc, {
        startY: 22,
        head: [paymentData[0]],
        body: paymentData.slice(1),
        theme: 'grid',
        styles: { fontSize: 9 },
        headStyles: { fillColor: PDF_HEADER, textColor: 255 },
        margin: { left: 14, right: 14 },
      });

      const topStartY = doc.lastAutoTable.finalY + 12;
      if (topStartY < pageH - 60) {
        doc.setFontSize(14);
        doc.setTextColor(...PDF_HEADER);
        doc.setFont('helvetica', 'bold');
        doc.text('Top 20 médicaments vendus (période)', 14, topStartY);

        const topData = [['#', 'Code', 'Médicament', 'DCI', 'Quantité', 'CA (FC)']];
        topProducts.forEach((p, idx) => {
          topData.push([idx + 1, p.code, p.name, p.dci, p.qtyVendue, p.caVentes.toFixed(0)]);
        });
        if (topData.length === 1) topData.push(['-', '-', 'Aucune vente', '-', '0', '0']);

        autoTable(doc, {
          startY: topStartY + 4,
          head: [topData[0]],
          body: topData.slice(1),
          theme: 'grid',
          styles: { fontSize: 8 },
          headStyles: { fillColor: PDF_ACCENT, textColor: 255 },
          margin: { left: 14, right: 14 },
        });
      }

      // ================================================================
      // PAGE ALERTES (rupture + péremption + stock bas)
      // ================================================================
      doc.addPage();

      doc.setFontSize(14);
      doc.setTextColor(...PDF_DANGER);
      doc.setFont('helvetica', 'bold');
      doc.text('Alertes — Médicaments à surveiller', 14, 16);

      doc.setFontSize(11);
      doc.setTextColor(...PDF_DANGER);
      doc.text('⏰ Médicaments proches de la péremption ou expirés', 14, 25);

      const expiryAlerts = detailedProducts.filter(p => p.peremptionStatut === 'PERIME' || p.peremptionStatut === 'URGENT' || p.peremptionStatut === 'PROCHE').sort((a, b) => (a.peremptionJours ?? 9999) - (b.peremptionJours ?? 9999));

      const expiryData = [['Code', 'Médicament', 'Lot', 'Stock', 'Péremption', 'Statut']];
      expiryAlerts.forEach(p => {
        let statut, color;
        if (p.peremptionStatut === 'PERIME') { statut = 'EXPIRÉ'; color = PDF_DANGER; }
        else if (p.peremptionStatut === 'URGENT') { statut = `URGENT (${p.peremptionJours}j)`; color = PDF_DANGER; }
        else { statut = `Proche (${p.peremptionJours}j)`; color = PDF_WARN; }
        expiryData.push([p.code, p.name, p.lot, p.stock, p.datePeremption ? new Date(p.datePeremption).toLocaleDateString('fr-FR') : '-', { content: statut, styles: { textColor: color, fontStyle: 'bold' } }]);
      });
      if (expiryData.length === 1) expiryData.push(['-', 'Aucun médicament concerné', '-', '0', '-', '-']);

      autoTable(doc, {
        startY: 28,
        head: [expiryData[0]],
        body: expiryData.slice(1),
        theme: 'grid',
        styles: { fontSize: 7 },
        headStyles: { fillColor: PDF_DANGER, textColor: 255 },
        margin: { left: 14, right: 14 },
      });

      const stockBasStartY = doc.lastAutoTable.finalY + 10;
      if (stockBasStartY < pageH - 40) {
        doc.setFontSize(11);
        doc.setTextColor(...PDF_WARN);
        doc.text('⚠️ Médicaments en rupture ou sous le seuil', 14, stockBasStartY);

        const stockAlerts = detailedProducts.filter(p => p.stockStatut === 'RUPTURE' || p.stockStatut === 'BAS').sort((a, b) => a.stock - b.stock);

        const stockAlertData = [['Code', 'Médicament', 'DCI', 'Stock', 'Seuil', 'Manque', 'Statut']];
        stockAlerts.forEach(p => {
          const manque = p.seuil - p.stock;
          stockAlertData.push([p.code, p.name, p.dci, p.stock, p.seuil, `+${manque}`, { content: p.stockStatut === 'RUPTURE' ? 'RUPTURE' : 'BAS', styles: { textColor: p.stockStatut === 'RUPTURE' ? PDF_DANGER : PDF_WARN, fontStyle: 'bold' } }]);
        });
        if (stockAlertData.length === 1) stockAlertData.push(['-', 'Aucun médicament en alerte', '-', '0', '0', '0', '-']);

        autoTable(doc, {
          startY: stockBasStartY + 4,
          head: [stockAlertData[0]],
          body: stockAlertData.slice(1),
          theme: 'grid',
          styles: { fontSize: 7 },
          headStyles: { fillColor: PDF_WARN, textColor: 255 },
          margin: { left: 14, right: 14 },
        });
      }

      // ================================================================
      // SIGNATURE SUR LA DERNIÈRE PAGE
      // ================================================================
      const lastPage = doc.internal.getNumberOfPages();
      doc.setPage(lastPage);
      
      const sigY = pageH - 35;
      if (signature) {
        try {
          doc.addImage(signature, 'PNG', 14, sigY, 30, 15);
        } catch(e) { console.warn('Signature non valide'); }
      }
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Visa Pharmacien', 14, sigY + 18);
      doc.setDrawColor(0, 0, 0);
      doc.line(14, sigY + 20, 55, sigY + 20);

      const dateFile = new Date().toISOString().split('T')[0];
      doc.save(`rapport_pharmacie_frasah_${dateFile}.pdf`);
      setMessage({ type: 'success', text: '✅ PDF détaillé exporté avec succès !' });
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: '❌ Erreur lors de l\'export PDF : ' + (error.message || 'inconnue') });
    } finally {
      setLoading(false);
    }
  };

  // ===== Export CSV =====
  const exportCSV = async () => {
    setLoading(true);
    try {
      const { products, stockMovements, sales } = await fetchLocalData();
      const detailed = computeDetailedProducts(products, stockMovements, sales);

      let csv = 'Code;Nom;DCI;Dosage;Forme;Laboratoire;Lot;Peremption;Jours_restants;Stock;Seuil;Statut_stock;Prix_achat;Prix_vente;Marge_pct;Valeur_stock_achat;Valeur_stock_vente;Entrees_periode;Sorties_periode;Qte_vendue;CA_periode\n';

      detailed.forEach(p => {
        const perempDate = p.datePeremption ? new Date(p.datePeremption).toLocaleDateString('fr-FR') : '';
        const jours = p.peremptionJours !== null ? p.peremptionJours : '';
        csv += [
          p.code, `"${(p.name || '').replace(/"/g, '""')}"`, `"${(p.dci || '').replace(/"/g, '""')}"`, p.dosage, p.forme, `"${(p.laboratoire || '').replace(/"/g, '""')}"`, p.lot,
          perempDate, jours, p.stock, p.seuil, p.stockStatut, p.pa.toFixed(2), p.pv.toFixed(2), p.margePct.toFixed(1), p.valeurStockAchat.toFixed(0), p.valeurStockVente.toFixed(0), p.entrees, p.sorties, p.qtyVendue, p.caVentes.toFixed(0)
        ].join(';') + '\n';
      });

      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `produits_detailles_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      setMessage({ type: 'success', text: '✅ CSV détaillé exporté !' });
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: '❌ Erreur export CSV' });
    } finally {
      setLoading(false);
    }
  };

  // ===== Export JSON =====
  const exportJSON = async () => {
    setLoading(true);
    try {
      const data = await fetchLocalData();
      const exportData = { application: 'Pharmacie Le Frasah', version: '1.0.0', date_export: new Date().toISOString(), tables: data };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sauvegarde_pharmacie_frasah_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      window.URL.revokeObjectURL(url);
      setMessage({ type: 'success', text: '✅ Sauvegarde effectuée !' });
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: '❌ Erreur sauvegarde' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '2rem', paddingTop: '90px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ color: PRIMARY, marginBottom: '0.5rem', fontSize: '2rem' }}>💾 Centre d'Export & Rapports</h1>
        <p style={{ color: '#4b5563', fontSize: '1.1rem' }}>
          Générez des documents PDF professionnels (avec logo et signature) ou exportez vos données brutes.
        </p>
      </div>

      {message && (
        <div style={{ padding: '1rem', borderRadius: '0.5rem', marginBottom: '1.5rem', background: message.type === 'success' ? '#d1fae5' : '#fecaca', color: message.type === 'success' ? PRIMARY : '#991b1b', border: `1px solid ${message.type === 'success' ? ACCENT : DANGER}`, fontWeight: 'bold' }}>
          {message.text}
        </div>
      )}

      {/* Filtres de date */}
      <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', marginBottom: '2rem' }}>
        <h3 style={{ margin: '0 0 1rem 0', color: PRIMARY, fontSize: '1.1rem' }}>📅 Période d'analyse</h3>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {['daily', 'weekly', 'monthly'].map(p => (
              <button key={p} onClick={() => setExportType(p)} style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', background: exportType === p ? PRIMARY : 'white', color: exportType === p ? 'white' : '#374151', cursor: 'pointer', fontWeight: exportType === p ? 'bold' : 'normal' }}>
                {p === 'daily' ? "Aujourd'hui" : p === 'weekly' ? "7 derniers jours" : "Ce mois"}
              </button>
            ))}
            <button onClick={() => setExportType('custom')} style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', background: exportType === 'custom' ? PRIMARY : 'white', color: exportType === 'custom' ? 'white' : '#374151', cursor: 'pointer', fontWeight: exportType === 'custom' ? 'bold' : 'normal' }}>
              Personnalisé
            </button>
          </div>
          
          {exportType === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '1rem' }}>
              <input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
              <span>au</span>
              <input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #d1d5db' }} />
            </div>
          )}
        </div>
      </div>

      {/* Cartes d'export */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        
        {/* Carte PDF */}
        <div style={{ background: 'white', borderRadius: '1rem', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', overflow: 'hidden', display: 'flex', flexDirection: 'column', borderTop: `5px solid ${DANGER}` }}>
          <div style={{ padding: '1.5rem', flex: 1 }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📄</div>
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#1f2937', fontSize: '1.2rem' }}>Rapport PDF Professionnel</h3>
            <p style={{ color: '#6b7280', fontSize: '0.9rem', lineHeight: '1.5', marginBottom: '1rem' }}>
              Document complet avec logo et signature. Contient : KPI, répartition des paiements, Top 20, alertes péremption, stock bas, et le détail complet des 200 produits.
            </p>
          </div>
          <div style={{ padding: '1.5rem', background: '#f9fafb', borderTop: '1px solid #e5e7eb' }}>
            <button onClick={exportPDF} disabled={loading} style={{ width: '100%', padding: '0.75rem', background: DANGER, color: 'white', border: 'none', borderRadius: '0.5rem', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '1rem', fontWeight: 'bold', opacity: loading ? 0.7 : 1 }}>
              {loading ? '⏳ Génération...' : '📥 Télécharger le PDF'}
            </button>
          </div>
        </div>

        {/* Carte CSV */}
        <div style={{ background: 'white', borderRadius: '1rem', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', overflow: 'hidden', display: 'flex', flexDirection: 'column', borderTop: `5px solid ${ACCENT}` }}>
          <div style={{ padding: '1.5rem', flex: 1 }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📊</div>
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#1f2937', fontSize: '1.2rem' }}>Export CSV (Excel)</h3>
            <p style={{ color: '#6b7280', fontSize: '0.9rem', lineHeight: '1.5', marginBottom: '1rem' }}>
              Tableau brut contenant 20 colonnes par produit (code, DCI, prix, mouvements, ventes, etc.). Idéal pour faire vos propres analyses sur Excel ou LibreOffice.
            </p>
          </div>
          <div style={{ padding: '1.5rem', background: '#f9fafb', borderTop: '1px solid #e5e7eb' }}>
            <button onClick={exportCSV} disabled={loading} style={{ width: '100%', padding: '0.75rem', background: ACCENT, color: 'white', border: 'none', borderRadius: '0.5rem', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '1rem', fontWeight: 'bold', opacity: loading ? 0.7 : 1 }}>
              {loading ? '⏳ Génération...' : '📥 Télécharger le CSV'}
            </button>
          </div>
        </div>

        {/* Carte JSON */}
        <div style={{ background: 'white', borderRadius: '1rem', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', overflow: 'hidden', display: 'flex', flexDirection: 'column', borderTop: `5px solid ${BLUE}` }}>
          <div style={{ padding: '1.5rem', flex: 1 }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>💾</div>
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#1f2937', fontSize: '1.2rem' }}>Sauvegarde de Sécurité (JSON)</h3>
            <p style={{ color: '#6b7280', fontSize: '0.9rem', lineHeight: '1.5', marginBottom: '1rem' }}>
              Archive complète de toutes les tables de la base de données. À conserver précieusement pour restaurer vos données en cas de problème.
            </p>
          </div>
          <div style={{ padding: '1.5rem', background: '#f9fafb', borderTop: '1px solid #e5e7eb' }}>
            <button onClick={exportJSON} disabled={loading} style={{ width: '100%', padding: '0.75rem', background: BLUE, color: 'white', border: 'none', borderRadius: '0.5rem', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '1rem', fontWeight: 'bold', opacity: loading ? 0.7 : 1 }}>
              {loading ? '⏳ Génération...' : '📥 Télécharger le JSON'}
            </button>
          </div>
        </div>

      </div>

      {/* Info Box */}
      <div style={{ marginTop: '2rem', background: '#f0fdf4', padding: '1.5rem', borderRadius: '1rem', border: `1px solid ${ACCENT}` }}>
        <h4 style={{ margin: '0 0 0.5rem 0', color: PRIMARY, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>💡</span> Le saviez-vous ?
        </h4>
        <ul style={{ margin: 0, paddingLeft: '1.5rem', color: '#374151', fontSize: '0.9rem', lineHeight: '1.6' }}>
          <li>Le PDF intègre automatiquement votre <strong>logo</strong> et votre <strong>signature numérique</strong> (si configurée dans le dossier patient).</li>
          <li>Les produits dans le PDF sont <strong>triés par urgence</strong> : les ruptures et les périmés apparaissent en premier.</li>
          <li>Pour un rapport de caisse officiel, rendez-vous dans l'onglet <strong>Caisse</strong> et cliquez sur "Imprimer le rapport".</li>
        </ul>
      </div>
    </div>
  );
};

export default Sauvegarde;