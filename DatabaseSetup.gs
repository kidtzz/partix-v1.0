/**
 * PARTIX Database Setup Script (Strict PRD v1.1)
 * Run installDatabase() ONCE to setup the entire spreadsheet structure.
 */

// ==============================================================================
// PENGATURAN ID SPREADSHEET
// Biarkan kosong "" jika Anda ingin sistem membuat file baru secara otomatis.
const EXISTING_SPREADSHEET_ID = ""; 
// ==============================================================================

const DB_SCHEMA = {
  // Sheet Barang = referensi scan barcode: id, barcode, nama, merk, kategori, status
  // Semua data inventory (satuan, stok, harga beli, lokasi) ada di Barang_Supplier
  "Barang": ["id_barang", "barcode1", "barcode2", "nama_barang", "merk", "kategori", "status_barang"],
  "Supplier": ["id_supplier", "nama_supplier", "pic", "nomor_hp", "email", "status_supplier"],
  // Barang_Supplier = data inventory lengkap per relasi barang-supplier
  // stok_saat_ini, minimum_stok, lokasi_rak hanya diisi di baris is_utama=true
  "Barang_Supplier": ["id_barang_supplier", "id_barang", "id_supplier", "harga_beli", "diskon_persen", "satuan", "isi_per_box", "stok_saat_ini", "minimum_stok", "lokasi_rak", "kode_barang_supplier", "is_utama", "status"],
  "Harga": ["id_harga", "id_barang", "harga_regular", "harga_langganan", "harga_teman", "tanggal_berlaku", "status_harga", "keterangan_perubahan"],
  "Stock_Movement": ["id_movement", "tanggal", "id_barang", "id_supplier", "tipe_pergerakan", "qty_box", "qty_pcs", "harga_beli", "nomor_invoice_supplier", "batch_barang", "alasan_perubahan", "user"],
  "Penjualan": ["no_invoice", "tanggal", "kasir", "kategori_customer", "subtotal", "total", "metode_pembayaran", "detail_pembayaran", "kembalian", "status_transaksi"],
  "Penjualan_Detail": ["id_detail", "no_invoice", "id_barang", "nama_barang", "qty", "harga_satuan", "subtotal"],
  "Return": ["no_return", "no_invoice", "tanggal", "kasir", "jenis_return", "selisih_harga", "alasan_return", "status"],
  "Return_Detail": ["id_detail", "no_return", "id_barang_direturn", "qty_direturn", "id_barang_pengganti", "qty_pengganti"],
  "Users": ["username", "password", "nama_lengkap", "role", "status"],
  "Profil_Toko": ["id_profil", "nama_toko", "logo_toko", "alamat_toko", "nomor_telepon", "footer_invoice"],
  "Pengaturan": ["kunci", "nilai"]
};

function installDatabase(existingSheetId) {
  Logger.log("Memulai proses setup database v1.1...");
  
  let ss;
  let ssId = existingSheetId || EXISTING_SPREADSHEET_ID || PropertiesService.getScriptProperties().getProperty("SHEET_ID");
  
  if (ssId) {
    try {
      ss = SpreadsheetApp.openById(ssId);
      Logger.log("Menggunakan Spreadsheet yang sudah ada: " + ssId);
    } catch (e) {
      Logger.log("Gagal membuka Spreadsheet ID: " + ssId + ". Membuat baru...");
      ss = null;
    }
  } 
  
  if (!ss) {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) {
      Logger.log("Menggunakan Spreadsheet yang sedang aktif: " + ss.getName());
    } else {
      ss = SpreadsheetApp.create("PARTIX-DB");
      Logger.log("Spreadsheet PARTIX-DB baru berhasil dibuat.");
    }
  }
  
  ssId = ss.getId();
  PropertiesService.getScriptProperties().setProperty("SHEET_ID", ssId);
  
  const sheetNames = Object.keys(DB_SCHEMA);
  const defaultSheet = ss.getSheetByName("Sheet1");
  let hasDefaultSheet = (defaultSheet !== null);
  
  sheetNames.forEach(sheetName => {
    let sheet = ss.getSheetByName(sheetName);
    let isNew = false;
    
    if (!sheet) {
      if (hasDefaultSheet) {
        sheet = defaultSheet;
        sheet.setName(sheetName);
        hasDefaultSheet = false;
        isNew = true;
      } else {
        sheet = ss.insertSheet(sheetName);
        isNew = true;
      }
    } else {
      // CLEAR sheet lama jika dipaksa setup, agar data sesuai schema 
      // (Bisa dihapus jika tidak ingin wipe out otomatis, tapi untuk V1.1 clean start ini perlu)
      sheet.clear();
      isNew = true;
    }
    
    if (isNew) {
      const headers = DB_SCHEMA[sheetName];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      
      const headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#E0E0E0");
      sheet.setFrozenRows(1);
    }
  });
  
  // ==========================================
  // INSERT DATA DUMMY
  // ==========================================
  
  // 1. Users
  const usersSheet = ss.getSheetByName("Users");
  usersSheet.appendRow(["admin", "123456", "Admin System", "Admin", "Aktif"]);
  usersSheet.appendRow(["kasir", "123456", "Mbak Kasir", "Kasir", "Aktif"]);
  usersSheet.appendRow(["restocker", "123456", "Mas Gudang", "Restocker", "Aktif"]);
  
  // 2. Profil_Toko
  const profilSheet = ss.getSheetByName("Profil_Toko");
  profilSheet.appendRow(["PROF-01", "Bengkel Partix Motor", "", "Jl. Raya Bogor No 10", "081234567890", "Terima Kasih atas Kunjungan Anda"]);
  
  // 2.5 Pengaturan Diskon Default
  const pengaturanSheet = ss.getSheetByName("Pengaturan");
  pengaturanSheet.appendRow(["DISKON_LANGGANAN", "10"]);
  pengaturanSheet.appendRow(["DISKON_TEMAN", "20"]);
  
  // 3. Supplier — hapus kolom alamat sesuai PRD v1.1 update
  const supplierSheet = ss.getSheetByName("Supplier");
  // Schema: id_supplier, nama_supplier, pic (JSON), nomor_hp, email, status_supplier
  supplierSheet.appendRow(["SUP-001", "PT Astra Otoparts", JSON.stringify([{nama:"Budi Santoso",hp:"08123456789"}]), "08123456789", "budi@astra.co.id", "Aktif"]);
  supplierSheet.appendRow(["SUP-002", "CV Maju Motor", JSON.stringify([{nama:"Andi",hp:"08987654321"}]), "08987654321", "andi@majumotor.com", "Aktif"]);

  // 4. Barang — hanya identitas produk, TIDAK ada stok/satuan/lokasi
  const barangSheet = ss.getSheetByName("Barang");
  // Schema: id_barang, barcode1, barcode2, nama_barang, merk, kategori, status_barang
  barangSheet.appendRow(["BRG-00001", "8998989", "123456", "Oli Pertamina Enduro 4T", "Pertamina", "Oli", "Aktif"]);
  barangSheet.appendRow(["BRG-00002", "777777", "888888", "Busi NGK C7HSA", "NGK", "Sparepart", "Aktif"]);
  barangSheet.appendRow(["BRG-00003", "55555", "66666", "Kampas Rem Depan Supra", "Honda", "Sparepart", "Aktif"]);

  // 5. Barang_Supplier — semua data inventory per relasi barang-supplier
  const barangSupplierSheet = ss.getSheetByName("Barang_Supplier");
  // Schema: id_bs, id_barang, id_supplier, harga_beli, diskon_persen, satuan, isi_per_box,
  //         stok_saat_ini, minimum_stok, lokasi_rak, kode_barang_supplier, is_utama, status
  // CATATAN: stok_saat_ini, minimum_stok, lokasi_rak hanya diisi di is_utama=true
  barangSupplierSheet.appendRow(["BS-001", "BRG-00001", "SUP-001", 35000, 25, "BOTOL", 24, 50, 10, "Rak A1", "AST-OLI-01", true,  "Aktif"]);
  barangSupplierSheet.appendRow(["BS-002", "BRG-00002", "SUP-002", 12000, 15, "PCS",   10, 20,  5, "Rak B2", "MM-BUSI",    true,  "Aktif"]);
  barangSupplierSheet.appendRow(["BS-003", "BRG-00003", "SUP-001", 20000, 20, "SET",    1, 15,  5, "Rak C3", "AST-REM",    true,  "Aktif"]);
  // Supplier ke-2 untuk Oli — stok/lokasi kosong (hanya is_utama yang punya stok)
  barangSupplierSheet.appendRow(["BS-004", "BRG-00001", "SUP-002", 36000, 20, "BOTOL", 24,  0,  0, "",       "MM-OLI-01",  false, "Aktif"]);

  // 6. Harga (Satu baris menampung 3 harga sekaligus)
  const hargaSheet = ss.getSheetByName("Harga");
  const today = new Date().toISOString();
  hargaSheet.appendRow(["HRG-001", "BRG-00001", 45000, 43000, 40000, today, "Aktif", "Harga Awal Setup"]);
  hargaSheet.appendRow(["HRG-002", "BRG-00002", 15000, 14000, 13000, today, "Aktif", "Harga Awal Setup"]);
  hargaSheet.appendRow(["HRG-003", "BRG-00003", 30000, 28000, 25000, today, "Aktif", "Harga Awal Setup"]);
  
  Logger.log("SETUP DATABASE UTAMA SELESAI!");
  
  // Otomatis jalankan setup Log DB juga agar user tidak bingung
  installLogDatabase();
}

function installLogDatabase(existingSheetId) {
  Logger.log("Memulai proses setup Log Database...");
  
  let ss;
  let ssId = existingSheetId || PropertiesService.getScriptProperties().getProperty('LOG_SHEET_ID');
  
  if (ssId) {
    try {
      ss = SpreadsheetApp.openById(ssId);
      Logger.log("Menggunakan Log Spreadsheet yang sudah ada: " + ssId);
    } catch (e) {
      Logger.log("Gagal membuka Log Spreadsheet ID: " + ssId + ". Membuat baru...");
      ss = null;
    }
  } 
  
  if (!ss) {
    ss = SpreadsheetApp.create("PARTIX-LOG-DB");
    Logger.log("Spreadsheet PARTIX-LOG-DB baru berhasil dibuat.");
  }
  
  ssId = ss.getId();
  PropertiesService.getScriptProperties().setProperty("LOG_SHEET_ID", ssId);
  
  const sheetName = "Log_Activity";
  let sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  
  const headers = ["id_log", "timestamp", "username", "role", "action", "module", "details"];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#d9ead3");
  sheet.setFrozenRows(1);
  
  const defaultSheet = ss.getSheetByName("Sheet1");
  if (defaultSheet) {
    try {
      ss.deleteSheet(defaultSheet);
    } catch(e) {}
  }
  
  Logger.log("Setup Log Database selesai. LOG_SHEET_ID Anda adalah: " + ssId);
  Logger.log("LINK SPREADSHEET LOG ANDA: " + ss.getUrl());
}
