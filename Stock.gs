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
  const query = barcode.trim().toLowerCase();
  
  const barangList = SheetService.readSheet("Barang");
  const barang = barangList.find(b => {
    const bc1 = String(b.barcode1 || '').trim().toLowerCase();
    const bc2 = String(b.barcode2 || '').trim().toLowerCase();
    const legacy = String(b.barcode || '').split(',').map(s => s.trim().toLowerCase());
    return bc1 === query || bc2 === query || legacy.includes(query);
  });
  
  if (!barang) {
    throw new Error(`Barang dengan barcode ${barcode} tidak ditemukan.`);
  }
  
  try {
    logActivity("READ", "Scan Barcode", `Scan barcode: ${barcode}`);
  } catch (e) {}

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
    
    try {
      logActivity("CREATE", "Stok Barang", `Barang Masuk: ${idBarang}, Qty: ${qtyBox} Box`);
    } catch (e) {}
    
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
    
    try {
      logActivity("UPDATE", "Penyesuaian Stok", `Barang: ${idBarang}, Adj: ${qtyAdjusment}`);
    } catch (e) {}
    
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
function updateHargaJual(idBarang, hargaRegular, keteranganPerubahan = "") {
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
    
    // Ambil setting diskon global
    let diskonLangganan = 10;
    let diskonTeman = 20;
    try {
      const dataPengaturan = SheetService.readSheet("Pengaturan");
      dataPengaturan.forEach(row => {
        if(row.kunci === "DISKON_LANGGANAN") diskonLangganan = Number(row.nilai) || 0;
        if(row.kunci === "DISKON_TEMAN") diskonTeman = Number(row.nilai) || 0;
      });
    } catch(e) {}
    
    // Hitung harga (dengan pembulatan ke bawah kelipatan 100 agar rapi)
    const basePrice = Number(hargaRegular) || 0;
    const calcLangganan = basePrice * (1 - (diskonLangganan / 100));
    const calcTeman = basePrice * (1 - (diskonTeman / 100));
    
    const finalLangganan = Math.floor(calcLangganan / 100) * 100;
    const finalTeman = Math.floor(calcTeman / 100) * 100;
    
    // Insert harga baru
    const newIdHarga = "HRG-" + new Date().getTime();
    SheetService.appendRow("Harga", {
      id_harga: newIdHarga,
      id_barang: idBarang,
      harga_regular: basePrice,
      harga_langganan: finalLangganan,
      harga_teman: finalTeman,
      tanggal_berlaku: new Date().toISOString(),
      status_harga: "Aktif",
      keterangan_perubahan: keteranganPerubahan
    });
    
    try {
      logActivity("UPDATE", "Harga Jual", `Update harga untuk barang ${idBarang}`);
    } catch (e) {}
    
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

function getHistoriBarang(idBarang) {
  requireRole(['Admin', 'Restocker']);
  
  const movements = SheetService.readSheet("Stock_Movement").filter(m => m.id_barang === idBarang);
  const prices = SheetService.readSheet("Harga").filter(h => h.id_barang === idBarang);
  
  let history = [];
  
  movements.forEach(m => {
    history.push({
      tanggal: m.tanggal,
      jenis: 'Stok (' + m.tipe_pergerakan + ')',
      deskripsi: (m.qty_box > 0 || m.qty_pcs > 0) ? `${m.qty_box > 0 ? m.qty_box + ' Box ' : ''}${m.qty_pcs > 0 ? m.qty_pcs + ' Pcs ' : ''}- ${m.alasan_perubahan}` : m.alasan_perubahan,
      user: m.user || 'Sistem'
    });
  });
  
  prices.forEach(h => {
    // Keterangan perubahan format: Update Harga via Admin Panel oleh [Nama User]
    let user = 'Sistem';
    let ket = h.keterangan_perubahan || '';
    if (ket.includes(' oleh ')) {
      const parts = ket.split(' oleh ');
      user = parts[1];
      ket = parts[0];
    }
    
    history.push({
      tanggal: h.tanggal_berlaku,
      jenis: 'Harga',
      deskripsi: `Reg: Rp${h.harga_regular}, Lgn: Rp${h.harga_langganan}, Tmn: Rp${h.harga_teman} (${ket})`,
      user: user
    });
  });
  
  // Sort descending by tanggal
  history.sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
  
  return history;
}
