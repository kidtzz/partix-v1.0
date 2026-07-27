/**
 * Dashboard.gs
 * Backend logic untuk Modul Dashboard & Laporan
 */

function getDashboardStats() {
  requireRole(['Admin']); // Hanya admin yang boleh melihat data sensitif ini
  
  const stats = {
    totalStockBarang: 0,
    totalPenjualanHariIni: 0,
    totalPendapatanHariIni: 0,
    dailySales: {},
    notifikasiStockMinimum: []
  };

  try {
    const barangList = SheetService.readSheet("Barang");
    const pengaturanList = SheetService.readSheet("Pengaturan");
    
    let globalMinStok = 5; // default fallback
    pengaturanList.forEach(row => {
      if(row.kunci === "MINIMUM_STOK") globalMinStok = Number(row.nilai) || 0;
    });
    
    // 1. Total Stock Barang & Notifikasi
    barangList.forEach(b => {
      if(b.status_barang === "Aktif") {
        const stokSaatIni = Number(b.stok_saat_ini) || 0;
        const minStok = globalMinStok;
        
        stats.totalStockBarang += stokSaatIni;
        
        if (stokSaatIni <= minStok) {
          stats.notifikasiStockMinimum.push({
            id_barang: b.id_barang,
            nama_barang: b.nama_barang,
            stok_saat_ini: stokSaatIni,
            minimum_stock: minStok,
            satuan: b.satuan
          });
        }
      }
    });

    // 2. Transaksi Hari Ini
    const txList = SheetService.readSheet("Penjualan");
    const today = new Date();
    // Gunakan zona waktu WIB (Asia/Jakarta) sebagai acuan hari
    const todayStr = today.toLocaleString('en-CA', { timeZone: 'Asia/Jakarta' }).split(',')[0].trim(); // YYYY-MM-DD
    
    txList.forEach(tx => {
      // Ambil tanggal transaksi (misal: "2026-07-27T10:00:00.000Z")
      if (tx.tanggal && tx.status_transaksi === "Selesai") {
        const txDateObj = new Date(tx.tanggal);
        const txDateStr = txDateObj.toLocaleString('en-CA', { timeZone: 'Asia/Jakarta' }).split(',')[0].trim();
        
        if (txDateStr === todayStr) {
          stats.totalPenjualanHariIni++;
          stats.totalPendapatanHariIni += (Number(tx.total) || 0);
        }
        
        if (!stats.dailySales[txDateStr]) {
            stats.dailySales[txDateStr] = 0;
        }
        stats.dailySales[txDateStr] += (Number(tx.total) || 0);
      }
    });
    
  } catch(e) {
    throw new Error("Gagal mengambil data dashboard: " + e.message);
  }
  
  return stats;
}
