/**
 * Stock.gs
 * Modul manajemen inventaris dan master data stok
 */

/**
 * Mengambil daftar stok barang lengkap.
 * JOIN: Barang_Supplier (is_utama=true) + Barang + Supplier
 * Return: array per barang, dengan embedded array semua supplier
 */
function getStockList() {
  requireRole(['Admin', 'Restocker', 'Kasir']);
  
  const barangList = SheetService.readSheet("Barang");
  const bsList = SheetService.readSheet("Barang_Supplier");
  const supplierList = SheetService.readSheet("Supplier");
  return barangList
    .filter(b => bsList.some(bs => bs.id_barang === b.id_barang && bs.status === "Aktif"))
    .map(b => {
    // Semua relasi supplier untuk barang ini
    const relasi = bsList.filter(bs => bs.id_barang === b.id_barang && bs.status === "Aktif");
    // Baris supplier utama (pemegang stok)
    const utama = relasi.find(bs => bs.is_utama == true || bs.is_utama === "TRUE") || relasi[0] || null;
    
    // Supplier list dengan nama supplier di-embed
    const suppliersDetail = relasi.map(bs => {
      const sup = supplierList.find(s => s.id_supplier === bs.id_supplier);
      return {
        id_barang_supplier: bs.id_barang_supplier,
        id_supplier: bs.id_supplier,
        nama_supplier: sup ? sup.nama_supplier : bs.id_supplier,
        harga_beli: Number(bs.harga_beli) || 0,
        diskon_persen: Number(bs.diskon_persen) || 0,
        satuan: bs.satuan || "PCS",
        isi_per_box: Number(bs.isi_per_box) || 1,
        kode_barang_supplier: bs.kode_barang_supplier || "",
        is_utama: bs.is_utama == true || bs.is_utama === "TRUE",
        status: bs.status
      };
    });
    
    return {
      id_barang: b.id_barang,
      barcode1: b.barcode1 || "",
      barcode2: b.barcode2 || "",
      nama_barang: b.nama_barang,
      merk: b.merk || "",
      kategori: b.kategori || "",
      status_barang: b.status_barang,
      // Data stok diakumulasikan dari semua supplier aktif
      stok_saat_ini: relasi.reduce((sum, bs) => sum + (Number(bs.stok_saat_ini) || 0), 0),
      minimum_stok: utama ? (Number(utama.minimum_stok) || 0) : 0,
      lokasi_rak: utama ? (utama.lokasi_rak || "") : "",
      satuan: utama ? (utama.satuan || "PCS") : "PCS",
      isi_per_box: utama ? (Number(utama.isi_per_box) || 1) : 1,
      id_bs_utama: utama ? utama.id_barang_supplier : "",
      suppliers: suppliersDetail
    };
  });
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
 * Mengonversi kuantitas Box ke PCS berdasarkan Barang_Supplier (is_utama=true)
 */
function konversiBoxKePcs(idBarang, qtyBox) {
  if (!qtyBox || qtyBox <= 0) return 0;
  
  // Cari baris is_utama di Barang_Supplier untuk barang ini
  const bsList = SheetService.readSheet("Barang_Supplier");
  const utama = bsList.find(bs => bs.id_barang === idBarang && 
    (bs.is_utama == true || bs.is_utama === "TRUE") && bs.status === "Aktif");
  
  // Fallback: jika tidak ada is_utama, ambil baris pertama yang aktif
  const bs = utama || bsList.find(bs => bs.id_barang === idBarang && bs.status === "Aktif");
  if (!bs) {
    return qtyBox * 1;
  }
  
  const isiPerBox = Number(bs.isi_per_box) || 1;
  return qtyBox * isiPerBox;
}

function inputBarangMasuk(idBarang, idSupplier, qtyBox, isiPerBox, hargaBeli, tanggal, diskonPersen = 0, noInvoiceSupplier = "") {
  const userRole = requireRole(['Admin', 'Restocker']);
  const username = typeof userRole === 'string' ? userRole : (Session.getActiveUser().getEmail() || "admin");
  
  if (!idSupplier) {
    throw new Error("Pilih supplier saat restock barang.");
  }
  
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Sistem sibuk.");
  
  try {
    const bsList = SheetService.readSheet("Barang_Supplier");
    let supplierRelation = bsList.find(bs => bs.id_barang === idBarang && bs.id_supplier === idSupplier && bs.status === "Aktif");
      
    // Konversi total PCS = Box x isi_per_box
    const finalIsiPerBox = supplierRelation ? (Number(supplierRelation.isi_per_box) || 1) : (Number(isiPerBox) || 1);
    const qtyPcs = qtyBox * finalIsiPerBox;

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
      alasan_perubahan: `Restock: ${qtyBox} Box (${finalIsiPerBox} PCS/Box). Harga: Rp${Number(hargaBeli).toLocaleString('id-ID')}`,
      user: username
    });
    
    let stokBaru = qtyPcs;
    
    if (!supplierRelation) {
      const lastId = bsList.length > 0 ? bsList[bsList.length - 1].id_barang_supplier : "BS-000";
      const num = parseInt(lastId.replace("BS-", "")) + 1;
      const newId = "BS-" + String(num).padStart(3, "0");
      
      const existingUtama = bsList.find(bs => bs.id_barang === idBarang && (bs.is_utama == true || bs.is_utama === "TRUE") && bs.status === "Aktif");
      
      supplierRelation = {
        id_barang_supplier: newId,
        id_barang: idBarang,
        id_supplier: idSupplier,
        harga_beli: Number(hargaBeli) || 0,
        diskon_persen: Number(diskonPersen) || 0,
        satuan: "PCS",
        isi_per_box: finalIsiPerBox,
        stok_saat_ini: stokBaru,
        minimum_stok: existingUtama ? existingUtama.minimum_stok : 5,
        lokasi_rak: "",
        kode_barang_supplier: "",
        is_utama: existingUtama ? false : true,
        status: "Aktif"
      };
      SheetService.appendRow("Barang_Supplier", supplierRelation);
    } else {
      const stokLama = Number(supplierRelation.stok_saat_ini) || 0;
      stokBaru = stokLama + qtyPcs;
      
      SheetService.updateRow("Barang_Supplier", supplierRelation.id_barang_supplier, { 
        stok_saat_ini: stokBaru,
        harga_beli: Number(hargaBeli) || Number(supplierRelation.harga_beli) || 0,
        diskon_persen: diskonPersen !== undefined && diskonPersen !== "" ? Number(diskonPersen) : Number(supplierRelation.diskon_persen) || 0
      });
    }
    
    try {
      logActivity("CREATE", "Stok Barang", `Barang Masuk: ${idBarang}, Qty: ${qtyBox} Box (${qtyPcs} PCS)`);
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
    // Validasi barang ada
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
    
    // Update stok di Barang_Supplier baris is_utama=true
    const bsList = SheetService.readSheet("Barang_Supplier");
    const utama = bsList.find(bs => bs.id_barang === idBarang &&
      (bs.is_utama == true || bs.is_utama === "TRUE") && bs.status === "Aktif");
    
    if (!utama) throw new Error("Barang_Supplier (is_utama) tidak ditemukan!");
    
    const stokLama = Number(utama.stok_saat_ini) || 0;
    const stokBaru = stokLama + qtyAdjusment;
    
    SheetService.updateRow("Barang_Supplier", utama.id_barang_supplier, { stok_saat_ini: stokBaru });
    
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
  // Baca dari Barang_Supplier (is_utama=true) sebagai sumber stok
  const bsList = SheetService.readSheet("Barang_Supplier");
  const barangList = SheetService.readSheet("Barang");
  
  const utamaList = bsList.filter(bs => (bs.is_utama == true || bs.is_utama === "TRUE") && bs.status === "Aktif");
  const underLimit = utamaList.filter(bs => {
    const barang = barangList.find(b => b.id_barang === bs.id_barang);
    return barang && barang.status_barang === "Aktif" &&
      (Number(bs.stok_saat_ini) || 0) <= (Number(bs.minimum_stok) || 0);
  });
  
  if (underLimit.length > 0) {
    let msg = "PERINGATAN STOK MINIMUM!\n\n";
    underLimit.forEach(bs => {
      const barang = barangList.find(b => b.id_barang === bs.id_barang);
      msg += `- ${barang ? barang.nama_barang : bs.id_barang} (Stok: ${bs.stok_saat_ini}, Min: ${bs.minimum_stok})\n`;
    });
    Logger.log(msg);
  } else {
    Logger.log("Semua stok aman.");
  }
}

/**
 * Update data stok, minimum stok, dan lokasi rak suatu barang.
 * Data disimpan di Barang_Supplier baris is_utama=true.
 * @param {string} idBarang
 * @param {object} data - { stok_saat_ini, minimum_stok, lokasi_rak }
 */
function updateStokBarang(idBarang, data) {
  requireRole(['Admin', 'Restocker']);
  if (!idBarang) throw new Error("ID Barang tidak valid.");
  
  const bsList = SheetService.readSheet("Barang_Supplier");
  const relasi = bsList.filter(bs => bs.id_barang === idBarang && bs.status === "Aktif");
  
  if (relasi.length === 0) throw new Error("Barang ini belum memiliki supplier aktif. Tambahkan supplier terlebih dahulu.");
  
  const utama = relasi.find(bs => bs.is_utama == true || bs.is_utama === "TRUE") || relasi[0];
  
  const payload = {};
  if (data.stok_saat_ini !== undefined) payload.stok_saat_ini = Number(data.stok_saat_ini);
  if (data.minimum_stok !== undefined) payload.minimum_stok = Number(data.minimum_stok);
  if (data.lokasi_rak !== undefined) payload.lokasi_rak = data.lokasi_rak;
  if (data.isi_per_box !== undefined) payload.isi_per_box = Number(data.isi_per_box);
  if (data.satuan !== undefined) payload.satuan = data.satuan;
  
  SheetService.updateRow("Barang_Supplier", utama.id_barang_supplier, payload);
  
  try {
    const userRole = requireRole(['Admin', 'Restocker']);
    const username = typeof userRole === 'string' ? userRole : (Session.getActiveUser().getEmail() || "admin");
    SheetService.appendRow("Stock_Movement", {
      id_movement: "MV-" + new Date().getTime(),
      tanggal: new Date().toISOString(),
      id_barang: idBarang,
      id_supplier: utama.id_supplier,
      tipe_pergerakan: "EDIT",
      qty_box: 0, qty_pcs: 0, harga_beli: utama.harga_beli || 0, nomor_invoice_supplier: "", batch_barang: "",
      alasan_perubahan: `Edit Manual: Stok ${payload.stok_saat_ini !== undefined ? payload.stok_saat_ini : utama.stok_saat_ini} PCS, Min ${payload.minimum_stok !== undefined ? payload.minimum_stok : utama.minimum_stok}`,
      user: username
    });
    logActivity("UPDATE", "Stok Barang", `Update stok/min/lokasi barang ${idBarang}`);
  } catch (e) {}
  
  return { success: true };
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
      deskripsi: (m.qty_pcs > 0 || m.qty_box > 0) ? `${m.qty_pcs > 0 ? m.qty_pcs : (m.qty_box || 0)} Pcs - ${m.alasan_perubahan}` : m.alasan_perubahan,
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
function fixSatuanPcsAll() { const brg = SheetService.readSheet('Barang'); brg.forEach(b => { if(b.satuan !== 'PCS') SheetService.updateRow('Barang', b.id_barang, {satuan: 'PCS'}); }); const bs = SheetService.readSheet('Barang_Supplier'); bs.forEach(b => { if(b.satuan !== 'PCS') SheetService.updateRow('Barang_Supplier', b.id_barang_supplier, {satuan: 'PCS'}); }); } 
