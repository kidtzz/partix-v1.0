/**
 * Stock.gs
 * Modul manajemen inventaris dan master data stok
 */

function getStockList() {
  requireRole(['Admin', 'Restocker', 'Kasir']);
  return SheetService.readSheet("Barang");
}

function scanBarcodeStock(barcode) {
  requireRole(['Admin', 'Restocker', 'Kasir']);
  
  if (!barcode) throw new Error("Barcode tidak boleh kosong.");
  
  const barangList = SheetService.readSheet("Barang");
  const barang = barangList.find(b => {
    if (!b.barcode) return false;
    const barcodes = b.barcode.split(',').map(str => str.trim());
    return barcodes.includes(barcode.trim());
  });
  
  if (!barang) {
    throw new Error(`Barang dengan barcode ${barcode} tidak ditemukan.`);
  }
  return barang;
}

/**
 * Mengonversi kuantitas Box ke PCS berdasarkan master data barang
 */
function konversiBoxKePcs(idBarang, qtyBox) {
  if (!qtyBox || qtyBox <= 0) return 0;
  
  const barang = SheetService.findRow("Barang", "id_barang", idBarang);
  if (!barang) throw new Error("Barang tidak ditemukan untuk konversi Box ke PCS.");
  
  const isiPerBox = Number(barang.isi_per_box) || 1;
  return qtyBox * isiPerBox;
}

function inputBarangMasuk(idBarang, idSupplier, qtyBox, hargaBeli, tanggal, noInvoiceSupplier = "") {
  const userRole = requireRole(['Admin', 'Restocker']);
  const username = typeof userRole === 'string' ? userRole : (Session.getActiveUser().getEmail() || "admin");
  
  if (!idSupplier) {
    throw new Error("Pilih supplier saat restock barang.");
  }
  
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Sistem sibuk.");
  
  try {
    const qtyPcs = konversiBoxKePcs(idBarang, qtyBox);
    const noBatch = `${idSupplier}-${tanggal}`;
    const idMovement = "MV-" + new Date().getTime(); 
    
    SheetService.appendRow("Stock_Movement", {
      id_movement: idMovement,
      tanggal: tanggal,
      id_barang: idBarang,
      id_supplier: idSupplier,
      tipe_pergerakan: "IN",
      qty_box: qtyBox,
      qty_pcs: qtyPcs,
      harga_beli: hargaBeli || 0,
      nomor_invoice_supplier: noInvoiceSupplier,
      batch_barang: noBatch,
      alasan_perubahan: "Restock dari supplier",
      user: username
    });
    
    const barang = SheetService.findRow("Barang", "id_barang", idBarang);
    if (!barang) throw new Error("Barang tidak ditemukan!");
    
    const stokLama = Number(barang.stok_saat_ini) || 0;
    const stokBaru = stokLama + qtyPcs;
    
    SheetService.updateRow("Barang", idBarang, { stok_saat_ini: stokBaru });
    
    return { success: true, stokBaru: stokBaru };
  } finally {
    lock.releaseLock();
  }
}

function penyesuaianStok(idBarang, qtyAdjusment, keterangan) {
  requireRole(['Admin']); 
  const username = Session.getActiveUser().getEmail() || "admin";
  
  if (!keterangan) throw new Error("Alasan perubahan wajib diisi untuk penyesuaian stok.");
  if (qtyAdjusment === 0) throw new Error("Kuantitas penyesuaian tidak boleh nol.");
  
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Sistem sedang sibuk.");
  
  try {
    const barang = SheetService.findRow("Barang", "id_barang", idBarang);
    if (!barang) throw new Error("Barang tidak ditemukan!");
    
    const tipe = qtyAdjusment > 0 ? "ADJ_IN" : "ADJ_OUT";
    const idMovement = "MV-" + new Date().getTime(); 
    const tanggal = new Date().toISOString();
    
    SheetService.appendRow("Stock_Movement", {
      id_movement: idMovement,
      tanggal: tanggal,
      id_barang: idBarang,
      id_supplier: "",
      tipe_pergerakan: tipe,
      qty_box: 0,
      qty_pcs: Math.abs(qtyAdjusment),
      harga_beli: 0,
      nomor_invoice_supplier: "",
      batch_barang: "",
      alasan_perubahan: keterangan,
      user: username
    });
    
    const stokLama = Number(barang.stok_saat_ini) || 0;
    const stokBaru = stokLama + qtyAdjusment;
    
    SheetService.updateRow("Barang", idBarang, { stok_saat_ini: stokBaru });
    
    return { success: true, stokBaru: stokBaru };
  } finally {
    lock.releaseLock();
  }
}

function getHistoriPergerakan(idBarang) {
  requireRole(['Admin', 'Restocker']);
  const histori = SheetService.readSheet("Stock_Movement");
  return histori.filter(row => row.id_barang === idBarang);
}

function cekStokMinimum() {
  const barang = SheetService.readSheet("Barang");
  const underLimit = barang.filter(b => (Number(b.stok_saat_ini) || 0) <= (Number(b.minimum_stock) || 0) && b.status_barang === "Aktif");
  
  if (underLimit.length > 0) {
    let msg = "PERINGATAN STOK MINIMUM!\n\n";
    underLimit.forEach(b => {
      msg += `- ${b.nama_barang} (Stok: ${b.stok_saat_ini}, Min: ${b.minimum_stock})\n`;
    });
    Logger.log(msg);
  } else {
    Logger.log("Semua stok aman.");
  }
}

/**
 * Update atau tambah harga jual
 * Sesuai PRD v1.1, satu row mencakup 3 harga (Regular, Langganan, Teman)
 */
function updateHargaJual(idBarang, hargaRegular, hargaLangganan, hargaTeman, keteranganPerubahan = "") {
  requireRole(['Admin']);
  
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error("Sistem sibuk, mohon tunggu sebentar.");
  
  try {
    const listHarga = SheetService.readSheet("Harga");
    
    // Nonaktifkan harga lama untuk barang ini
    listHarga.forEach(row => {
      if (row.id_barang === idBarang && row.status_harga === "Aktif") {
        SheetService.updateRow("Harga", row.id_harga, { status_harga: "Nonaktif" });
      }
    });
    
    // Insert harga baru
    const newIdHarga = "HRG-" + new Date().getTime();
    SheetService.appendRow("Harga", {
      id_harga: newIdHarga,
      id_barang: idBarang,
      harga_regular: Number(hargaRegular) || 0,
      harga_langganan: Number(hargaLangganan) || 0,
      harga_teman: Number(hargaTeman) || 0,
      tanggal_berlaku: new Date().toISOString(),
      status_harga: "Aktif",
      keterangan_perubahan: keteranganPerubahan
    });
    
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}
