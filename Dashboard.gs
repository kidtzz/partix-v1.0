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
    totalPendapatanMingguIni: 0,
    totalPendapatanBulanIni: 0,
    totalPendapatanTahunIni: 0,
    pendapatanCashHariIni: 0,
    pendapatanCashMingguIni: 0,
    pendapatanCashBulanIni: 0,
    pendapatanCashTahunIni: 0,
    pendapatanTransferHariIni: 0,
    pendapatanTransferMingguIni: 0,
    pendapatanTransferBulanIni: 0,
    pendapatanTransferTahunIni: 0,
    pendapatanQRISHariIni: 0,
    pendapatanQRISMingguIni: 0,
    pendapatanQRISBulanIni: 0,
    pendapatanQRISTahunIni: 0,
    totalPotonganHariIni: 0,
    totalPotonganMingguIni: 0,
    totalPotonganBulanIni: 0,
    totalPotonganTahunIni: 0,
    totalRefundHariIni: 0,
    totalRefundMingguIni: 0,
    totalRefundBulanIni: 0,
    totalRefundTahunIni: 0,
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
    
    const bsList = SheetService.readSheet("Barang_Supplier");
    
    // 1. Total Stock Barang & Notifikasi
    barangList.forEach(b => {
      if(b.status_barang === "Aktif") {
        const relasi = bsList.filter(bs => bs.id_barang === b.id_barang && bs.status === "Aktif");
        
        if (relasi.length > 0) {
          const stokSaatIni = relasi.reduce((sum, bs) => sum + (Number(bs.stok_saat_ini) || 0), 0);
          const minStok = globalMinStok; // Force refer ke global
          const satuan = "PCS";
          
          stats.totalStockBarang += stokSaatIni;
          
          if (stokSaatIni <= minStok) {
            stats.notifikasiStockMinimum.push({
              id_barang: b.id_barang,
              nama_barang: b.nama_barang,
              stok_saat_ini: stokSaatIni,
              minimum_stock: minStok,
              satuan: satuan
            });
          }
        }
      }
    });

    // 2. Transaksi Hari Ini
    const txList = SheetService.readSheet("Penjualan");
    const today = new Date();
    // Gunakan zona waktu WIB (Asia/Jakarta) sebagai acuan hari
    const todayStr = today.toLocaleString('en-CA', { timeZone: 'Asia/Jakarta' }).split(',')[0].trim(); // YYYY-MM-DD
    // Date filters for Potongan
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0,0,0,0);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    
    txList.forEach(tx => {
      // Ambil tanggal transaksi (misal: "2026-07-27T10:00:00.000Z")
      if (tx.tanggal && tx.status_transaksi === "Selesai") {
        const txDateObj = new Date(tx.tanggal);
        const txDateStr = txDateObj.toLocaleString('en-CA', { timeZone: 'Asia/Jakarta' }).split(',')[0].trim();
        const potongan = Number(tx.potongan_penjualan) || 0;
        const tTotal = Number(tx.total) || 0;
        const metode = (tx.metode_pembayaran || "").toLowerCase();
        
        if (txDateStr === todayStr) {
          stats.totalPenjualanHariIni++;
          stats.totalPendapatanHariIni += tTotal;
          stats.totalPotonganHariIni += potongan;
          if (metode === "cash") stats.pendapatanCashHariIni += tTotal;
          else if (metode === "transfer") stats.pendapatanTransferHariIni += tTotal;
          else if (metode === "qris") stats.pendapatanQRISHariIni += tTotal;
        }
        
        if (txDateObj >= startOfWeek) {
          stats.totalPotonganMingguIni += potongan;
          stats.totalPendapatanMingguIni += tTotal;
          if (metode === "cash") stats.pendapatanCashMingguIni += tTotal;
          else if (metode === "transfer") stats.pendapatanTransferMingguIni += tTotal;
          else if (metode === "qris") stats.pendapatanQRISMingguIni += tTotal;
        }
        
        if (txDateObj >= startOfMonth) {
          stats.totalPotonganBulanIni += potongan;
          stats.totalPendapatanBulanIni += tTotal;
          if (metode === "cash") stats.pendapatanCashBulanIni += tTotal;
          else if (metode === "transfer") stats.pendapatanTransferBulanIni += tTotal;
          else if (metode === "qris") stats.pendapatanQRISBulanIni += tTotal;
        }
        
        if (txDateObj >= startOfYear) {
          stats.totalPotonganTahunIni += potongan;
          stats.totalPendapatanTahunIni += tTotal;
          if (metode === "cash") stats.pendapatanCashTahunIni += tTotal;
          else if (metode === "transfer") stats.pendapatanTransferTahunIni += tTotal;
          else if (metode === "qris") stats.pendapatanQRISTahunIni += tTotal;
        }
        
        if (!stats.dailySales[txDateStr]) {
            stats.dailySales[txDateStr] = 0;
        }
        stats.dailySales[txDateStr] += (Number(tx.total) || 0);
      }
    });
    
    // 3. Hitung Total Refund (Return)
    const returnList = SheetService.readSheet("Return");
    returnList.forEach(r => {
      if (r.tanggal && r.status === "Selesai") {
        const retDateObj = new Date(r.tanggal);
        const retDateStr = retDateObj.toLocaleString('en-CA', { timeZone: 'Asia/Jakarta' }).split(',')[0].trim();
        const selisih = Number(r.selisih_harga) || 0;
        
        if (selisih < 0) {
           const refundAmount = Math.abs(selisih);
           if (retDateStr === todayStr) stats.totalRefundHariIni += refundAmount;
           if (retDateObj >= startOfWeek) stats.totalRefundMingguIni += refundAmount;
           if (retDateObj >= startOfMonth) stats.totalRefundBulanIni += refundAmount;
           if (retDateObj >= startOfYear) stats.totalRefundTahunIni += refundAmount;
        }
      }
    });
    
    
  } catch(e) {
    throw new Error("Gagal mengambil data dashboard: " + e.message);
  }
  
  return stats;
}
