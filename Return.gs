/**
 * Return.gs
 * Modul untuk pengembalian barang dan tukar tambah (Return)
 */

/**
 * Validasi apakah nomor invoice ada, dan kembalikan detail transaksinya.
 */
function verifikasiInvoice(noInvoice) {
  requireRole(['Admin', 'Kasir']);
  
  const transaksi = SheetService.findRow("Penjualan", "no_invoice", noInvoice);
  if (!transaksi) {
    throw new Error(`Invoice ${noInvoice} tidak ditemukan.`);
  }
  
  const detail = SheetService.findRows("Penjualan_Detail", "no_invoice", noInvoice);
  
  return {
    header: transaksi,
    detail: detail
  };
}

/**
 * Memproses pengembalian barang (Return / Tukar Tambah).
 * 
 * @param {string} noInvoice Nomor invoice asli
 * @param {Array} itemsReturn Array object: { id_barang_direturn, qty_return, id_barang_pengganti, qty_pengganti }
 * @param {string} jenisPenyelesaian "Tukar Barang", "Uang Kembali", dll
 * @param {number} selisihBayar Negatif berarti toko mengembalikan uang, positif berarti pembeli menambah uang
 */
function prosesReturn(noInvoice, itemsReturn, jenisPenyelesaian, selisihBayar) {
  const user = requireRole(['Admin', 'Kasir']);
  const lock = LockService.getScriptLock();
  
  if (!lock.tryLock(15000)) {
    throw new Error("Sistem sedang sibuk memproses transaksi lain. Coba lagi beberapa detik.");
  }
  
  try {
    const tanggal = new Date().toISOString();
    const noReturn = generateNomorReturn();
    
    // 1. Verifikasi Data Asli (Invoice)
    const { header, detail } = verifikasiInvoice(noInvoice);
    if (!header) throw new Error("Invoice tidak valid.");
    
    // 2. Insert ke tabel Return (Header)
    SheetService.appendRow("Return", {
      no_return: noReturn,
      no_invoice_asal: noInvoice,
      tanggal: tanggal,
      kasir: user.email,
      jenis_penyelesaian: jenisPenyelesaian,
      selisih_bayar: selisihBayar,
      status: "Selesai"
    });
    
    // 3. Proses per-item
    const idMovementBase = new Date().getTime();
    
    for (let i = 0; i < itemsReturn.length; i++) {
      const item = itemsReturn[i];
      
      // Validasi Qty Return <= Qty Beli
      const beliDetail = detail.find(d => d.id_barang === item.id_barang_direturn);
      if (!beliDetail || item.qty_return > Number(beliDetail.qty)) {
        throw new Error(`Jumlah return untuk barang ID ${item.id_barang_direturn} melebihi jumlah pembelian asli!`);
      }
      
      // Insert Return_Detail
      SheetService.appendRow("Return_Detail", {
        id_detail: `${noReturn}-${i+1}`,
        no_return: noReturn,
        id_barang_direturn: item.id_barang_direturn,
        qty_return: item.qty_return,
        id_barang_pengganti: item.id_barang_pengganti || "",
        qty_pengganti: item.qty_pengganti || 0
      });
      
      // Stock Movement (Barang kembali ke toko -> RETURN_IN)
      SheetService.appendRow("Stock_Movement", {
        id_movement: `MV-${idMovementBase}-R${i}`,
        tanggal: tanggal,
        id_barang: item.id_barang_direturn,
        id_supplier: "",
        tipe: "RETURN_IN",
        qty_box: 0,
        qty_pcs: item.qty_return,
        harga_beli: 0,
        no_batch: "",
        referensi: noReturn,
        user: user.email
      });
      
      // Update master stok (Kembalikan stok yang diretur)
      // *Catatan: Jika barang rusak, biasanya dibuat alur manual untuk "Write-off" atau Adjustment (OUT).
      // Di sini kita kembalikan ke stok.
      const masterLama = SheetService.findRow("Barang", "id_barang", item.id_barang_direturn);
      if (masterLama) {
        SheetService.updateRow("Barang", item.id_barang_direturn, { 
          stok_saat_ini: Number(masterLama.stok_saat_ini) + item.qty_return 
        });
      }
      
      // Jika ini adalah proses TUKAR BARANG (ada barang pengganti)
      if (item.id_barang_pengganti && item.qty_pengganti > 0) {
        // Stock Movement (Barang baru keluar toko -> OUT)
        SheetService.appendRow("Stock_Movement", {
          id_movement: `MV-${idMovementBase}-O${i}`,
          tanggal: tanggal,
          id_barang: item.id_barang_pengganti,
          id_supplier: "",
          tipe: "OUT",
          qty_box: 0,
          qty_pcs: item.qty_pengganti,
          harga_beli: 0,
          no_batch: "",
          referensi: noReturn,
          user: user.email
        });
        
        // Kurangi stok barang pengganti
        const masterPengganti = SheetService.findRow("Barang", "id_barang", item.id_barang_pengganti);
        if (masterPengganti) {
          SheetService.updateRow("Barang", item.id_barang_pengganti, { 
            stok_saat_ini: Number(masterPengganti.stok_saat_ini) - item.qty_pengganti 
          });
        }
      }
    }
    
    return { success: true, noReturn: noReturn };
    
  } finally {
    lock.releaseLock();
  }
}

/**
 * Mengambil data lengkap untuk mencetak nota return
 */
function cetakInvoiceReturn(noReturn) {
  const transaksi = SheetService.findRow("Return", "no_return", noReturn);
  if (!transaksi) throw new Error("Nomor Return tidak ditemukan.");
  
  const detail = SheetService.findRows("Return_Detail", "no_return", noReturn);
  
  return {
    header: transaksi,
    detail: detail
  };
}
