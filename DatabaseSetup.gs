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
  "Barang_Supplier": ["id_barang_supplier", "id_barang", "id_supplier", "harga_beli", "diskon_persen", "satuan", "isi_per_box", "stok_saat_ini", "minimum_stok", "lokasi_rak", "kode_barang_supplier", "is_utama", "status", "tanggal_masuk"],
  "Harga": ["id_harga", "id_barang", "harga_regular", "harga_langganan", "harga_teman", "tanggal_berlaku", "status_harga", "keterangan_perubahan"],
  "Stock_Movement": ["id_movement", "tanggal", "id_barang", "id_supplier", "tipe_pergerakan", "qty_box", "qty_pcs", "harga_beli", "nomor_invoice_supplier", "batch_barang", "alasan_perubahan", "user"],
  "Penjualan": ["no_invoice", "tanggal", "kasir", "kategori_customer", "subtotal", "potongan_penjualan", "total", "metode_pembayaran", "detail_pembayaran", "kembalian", "status_transaksi"],
  "Penjualan_Detail": ["id_detail", "no_invoice", "id_barang", "nama_barang", "qty", "harga_satuan", "subtotal"],
  "Return": ["no_return", "no_invoice", "tanggal", "kasir", "jenis_return", "selisih_harga", "alasan_return", "status"],
  "Return_Detail": ["id_detail", "no_return", "id_barang_direturn", "qty_direturn", "id_barang_pengganti", "qty_pengganti"],
  "Barang_Return": ["id_barang_return", "tanggal_terima", "no_invoice_asal", "id_barang", "qty_rusak", "alasan", "user_penerima"],
  "Return_Supplier": ["id_return_supplier", "tanggal_retur", "id_barang", "id_supplier", "qty_retur", "harga_beli", "no_invoice_supplier", "user"],
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
  usersSheet.appendRow(["kasir1", "123456", "Siti Kasir", "Kasir", "Aktif"]);
  usersSheet.appendRow(["kasir2", "123456", "Budi Kasir", "Kasir", "Aktif"]);
  usersSheet.appendRow(["restocker1", "123456", "Andi Gudang", "Restocker", "Aktif"]);
  usersSheet.appendRow(["restocker2", "123456", "Joko Gudang", "Restocker", "Aktif"]);
  
  // 2. Profil_Toko
  const profilSheet = ss.getSheetByName("Profil_Toko");
  profilSheet.appendRow(["PROF-01", "Bengkel Partix Motor", "", "Jl. Raya Bogor No 10", "081234567890", "Terima Kasih atas Kunjungan Anda"]);
  profilSheet.appendRow(["PROF-02", "Cabang Depok", "", "Jl. Margonda Raya", "081234567891", "Terima Kasih"]);
  profilSheet.appendRow(["PROF-03", "Cabang Bekasi", "", "Jl. Jendral Sudirman", "081234567892", "Terima Kasih"]);
  profilSheet.appendRow(["PROF-04", "Cabang Tangerang", "", "Jl. Daan Mogot", "081234567893", "Terima Kasih"]);
  profilSheet.appendRow(["PROF-05", "Cabang Jakarta", "", "Jl. Thamrin", "081234567894", "Terima Kasih"]);
  
  // 2.5 Pengaturan
  const pengaturanSheet = ss.getSheetByName("Pengaturan");
  pengaturanSheet.appendRow(["DISKON_LANGGANAN", "10"]);
  pengaturanSheet.appendRow(["DISKON_TEMAN", "20"]);
  pengaturanSheet.appendRow(["PPN", "11"]);
  pengaturanSheet.appendRow(["BIAYA_LAYANAN", "0"]);
  pengaturanSheet.appendRow(["TEMA_DEFAULT", "LIGHT"]);
  
  // 3. Supplier
  const supplierSheet = ss.getSheetByName("Supplier");
  supplierSheet.appendRow(["SUP-001", "PT Astra Otoparts", JSON.stringify([{nama:"Budi",hp:"08123456789"}]), "08123456789", "budi@astra.co.id", "Aktif"]);
  supplierSheet.appendRow(["SUP-002", "CV Maju Motor", JSON.stringify([{nama:"Andi",hp:"08987654321"}]), "08987654321", "andi@majumotor.com", "Aktif"]);
  supplierSheet.appendRow(["SUP-003", "UD Sinar Jaya", JSON.stringify([{nama:"Cici",hp:"08554433221"}]), "08554433221", "cici@sinarjaya.com", "Aktif"]);
  supplierSheet.appendRow(["SUP-004", "PT Indo Part", JSON.stringify([{nama:"Dedi",hp:"08771122334"}]), "08771122334", "dedi@indopart.com", "Aktif"]);
  supplierSheet.appendRow(["SUP-005", "Bintang Motor", JSON.stringify([{nama:"Eko",hp:"08339988776"}]), "08339988776", "eko@bintang.com", "Aktif"]);
  supplierSheet.appendRow(["SUP-006", "Toko Sparepart Lama", JSON.stringify([{nama:"Fajar",hp:"08221122334"}]), "08221122334", "fajar@lama.com", "Non Aktif"]);

  // 4. Barang
  const barangSheet = ss.getSheetByName("Barang");
  barangSheet.appendRow(["BRG-001", "899123456001", "899123456011", "Oli Pertamina Enduro 4T", "Pertamina", "Oli", "Aktif"]);
  barangSheet.appendRow(["BRG-002", "899123456002", "899123456012", "Busi NGK C7HSA", "NGK", "Sparepart", "Aktif"]);
  barangSheet.appendRow(["BRG-003", "899123456003", "899123456013", "Kampas Rem Depan Supra", "Honda", "Sparepart", "Aktif"]);
  barangSheet.appendRow(["BRG-004", "899123456004", "899123456014", "Ban IRC 90/90-14", "IRC", "Ban", "Aktif"]);
  barangSheet.appendRow(["BRG-005", "899123456005", "899123456015", "Lampu Depan Vario", "Honda", "Aksesoris", "Aktif"]);
  barangSheet.appendRow(["BRG-006", "899123456006", "899123456016", "Spion Standar Yamaha", "Yamaha", "Aksesoris", "Non Aktif"]);
  barangSheet.appendRow(["BRG-007", "899123456007", "899123456017", "Aki Yuasa YTZ5S", "Yuasa", "Aki", "Non Aktif"]);
  barangSheet.appendRow(["BRG-008", "899123456008", "899123456018", "Oli Yamalube Matic", "Yamaha", "Oli", "Aktif"]);
  barangSheet.appendRow(["BRG-009", "899123456009", "899123456019", "Rantai SSS 428", "SSS", "Sparepart", "Aktif"]);

  // 5. Barang_Supplier
  const bsSheet = ss.getSheetByName("Barang_Supplier");
  const today = new Date();
  const todayStr = today.toISOString();
  
  // Create past dates for realistic dashboard data
  const dateYesterday = new Date(today); dateYesterday.setDate(today.getDate() - 1);
  const dateLastWeek = new Date(today); dateLastWeek.setDate(today.getDate() - 7);
  
  bsSheet.appendRow(["BS-001", "BRG-001", "SUP-001", 35000, 0, "BOTOL", 24, 50, 10, "Rak A1", "AST-OLI-01", true, "Aktif", dateLastWeek.toISOString()]);
  bsSheet.appendRow(["BS-002", "BRG-002", "SUP-002", 12000, 0, "PCS", 10, 20, 5, "Rak B2", "MM-BUSI-01", true, "Aktif", dateLastWeek.toISOString()]);
  bsSheet.appendRow(["BS-003", "BRG-003", "SUP-001", 20000, 0, "SET", 1, 15, 5, "Rak C3", "AST-REM-01", true, "Aktif", dateLastWeek.toISOString()]);
  bsSheet.appendRow(["BS-004", "BRG-004", "SUP-003", 150000, 0, "PCS", 1, 30, 5, "Rak D4", "SJ-BAN-01", true, "Aktif", todayStr]);
  bsSheet.appendRow(["BS-005", "BRG-005", "SUP-004", 45000, 0, "PCS", 1, 10, 2, "Rak E5", "IP-LAMP-01", true, "Aktif", todayStr]);
  bsSheet.appendRow(["BS-006", "BRG-006", "SUP-002", 25000, 0, "SET", 1, 0, 5, "Rak F1", "MM-SPION-01", true, "Non Aktif", dateLastWeek.toISOString()]);
  bsSheet.appendRow(["BS-007", "BRG-007", "SUP-005", 180000, 0, "PCS", 1, 0, 2, "Rak G2", "BM-AKI-01", true, "Non Aktif", todayStr]);
  bsSheet.appendRow(["BS-008", "BRG-008", "SUP-002", 38000, 0, "BOTOL", 24, 40, 10, "Rak A2", "MM-YML-01", true, "Aktif", todayStr]);
  bsSheet.appendRow(["BS-009", "BRG-009", "SUP-003", 120000, 0, "SET", 1, 20, 3, "Rak H1", "SJ-RNT-01", true, "Aktif", todayStr]);

  // 6. Harga
  const hargaSheet = ss.getSheetByName("Harga");
  hargaSheet.appendRow(["HRG-001", "BRG-001", 45000, 43000, 40000, todayStr, "Aktif", "Awal Setup"]);
  hargaSheet.appendRow(["HRG-002", "BRG-002", 15000, 14000, 13000, todayStr, "Aktif", "Awal Setup"]);
  hargaSheet.appendRow(["HRG-003", "BRG-003", 30000, 28000, 25000, todayStr, "Aktif", "Awal Setup"]);
  hargaSheet.appendRow(["HRG-004", "BRG-004", 180000, 175000, 170000, todayStr, "Aktif", "Awal Setup"]);
  hargaSheet.appendRow(["HRG-005", "BRG-005", 60000, 55000, 50000, todayStr, "Aktif", "Awal Setup"]);
  hargaSheet.appendRow(["HRG-006", "BRG-006", 35000, 33000, 30000, todayStr, "Non Aktif", "Awal Setup"]);
  hargaSheet.appendRow(["HRG-007", "BRG-007", 220000, 210000, 200000, todayStr, "Non Aktif", "Awal Setup"]);
  hargaSheet.appendRow(["HRG-008", "BRG-008", 45000, 42000, 40000, todayStr, "Aktif", "Awal Setup"]);
  hargaSheet.appendRow(["HRG-009", "BRG-009", 150000, 145000, 140000, todayStr, "Aktif", "Awal Setup"]);
  
  // 7. Stock_Movement
  const smSheet = ss.getSheetByName("Stock_Movement");
  smSheet.appendRow(["SM-001", dateLastWeek.toISOString(), "BRG-001", "SUP-001", "IN_PURCHASE", 2, 48, 35000, "INV-S001", "-", "Stok Awal", "admin"]);
  smSheet.appendRow(["SM-002", dateLastWeek.toISOString(), "BRG-002", "SUP-002", "IN_PURCHASE", 2, 20, 12000, "INV-S002", "-", "Stok Awal", "admin"]);
  smSheet.appendRow(["SM-003", dateLastWeek.toISOString(), "BRG-003", "SUP-001", "IN_PURCHASE", 15, 15, 20000, "INV-S003", "-", "Stok Awal", "admin"]);
  smSheet.appendRow(["SM-004", todayStr, "BRG-004", "SUP-003", "IN_PURCHASE", 30, 30, 150000, "INV-S004", "-", "Stok Awal", "admin"]);
  smSheet.appendRow(["SM-005", todayStr, "BRG-005", "SUP-004", "IN_PURCHASE", 10, 10, 45000, "INV-S005", "-", "Stok Awal", "admin"]);
  smSheet.appendRow(["SM-006", todayStr, "BRG-008", "SUP-002", "IN_PURCHASE", 2, 40, 38000, "INV-S006", "-", "Stok Awal", "admin"]);
  smSheet.appendRow(["SM-007", todayStr, "BRG-009", "SUP-003", "IN_PURCHASE", 20, 20, 120000, "INV-S007", "-", "Stok Awal", "admin"]);

  // 8. Penjualan
  const jualSheet = ss.getSheetByName("Penjualan");
  jualSheet.appendRow(["INV-001", dateYesterday.toISOString(), "kasir1", "Regular", 105000, 0, 105000, "Tunai", "", 105000, "Selesai"]);
  jualSheet.appendRow(["INV-002", dateYesterday.toISOString(), "kasir1", "Langganan", 175000, 0, 175000, "Transfer", "BCA", 175000, "Selesai"]);
  jualSheet.appendRow(["INV-003", todayStr, "kasir2", "Regular", 60000, 0, 60000, "Tunai", "", 60000, "Selesai"]);
  jualSheet.appendRow(["INV-004", todayStr, "kasir2", "Teman", 105000, 0, 105000, "Tunai", "", 105000, "Selesai"]);
  jualSheet.appendRow(["INV-005", todayStr, "kasir1", "Regular", 195000, 0, 195000, "QRIS", "Gopay", 195000, "Selesai"]);
  jualSheet.appendRow(["INV-006", todayStr, "kasir1", "Regular", 210000, 0, 210000, "Transfer", "Mandiri", 210000, "Selesai"]);
  jualSheet.appendRow(["INV-007", todayStr, "kasir2", "Langganan", 82000, 0, 82000, "Tunai", "", 82000, "Selesai"]);

  // 9. Penjualan_Detail
  const jdSheet = ss.getSheetByName("Penjualan_Detail");
  // INV-001
  jdSheet.appendRow(["JD-001", "INV-001", "BRG-001", "Oli Pertamina Enduro 4T", 1, 45000, 45000]);
  jdSheet.appendRow(["JD-002", "INV-001", "BRG-005", "Lampu Depan Vario", 1, 60000, 60000]);
  // INV-002
  jdSheet.appendRow(["JD-003", "INV-002", "BRG-004", "Ban IRC 90/90-14", 1, 175000, 175000]);
  // INV-003
  jdSheet.appendRow(["JD-004", "INV-003", "BRG-005", "Lampu Depan Vario", 1, 60000, 60000]);
  // INV-004
  jdSheet.appendRow(["JD-005", "INV-004", "BRG-001", "Oli Pertamina Enduro 4T", 1, 40000, 40000]);
  jdSheet.appendRow(["JD-006", "INV-004", "BRG-003", "Kampas Rem Depan Supra", 1, 25000, 25000]);
  jdSheet.appendRow(["JD-007", "INV-004", "BRG-008", "Oli Yamalube Matic", 1, 40000, 40000]);
  // INV-005
  jdSheet.appendRow(["JD-008", "INV-005", "BRG-001", "Oli Pertamina Enduro 4T", 1, 45000, 45000]);
  jdSheet.appendRow(["JD-009", "INV-005", "BRG-009", "Rantai SSS 428", 1, 150000, 150000]);
  // INV-006
  jdSheet.appendRow(["JD-010", "INV-006", "BRG-005", "Lampu Depan Vario", 1, 60000, 60000]);
  jdSheet.appendRow(["JD-011", "INV-006", "BRG-009", "Rantai SSS 428", 1, 150000, 150000]);
  // INV-007
  jdSheet.appendRow(["JD-012", "INV-007", "BRG-008", "Oli Yamalube Matic", 1, 42000, 42000]);
  jdSheet.appendRow(["JD-013", "INV-007", "BRG-001", "Oli Pertamina Enduro 4T", 1, 40000, 40000]);

  // 10. Return & Return_Detail (Schema: no_return, no_invoice, tanggal, kasir, jenis_return, selisih_harga, alasan_return, status)
  const retSheet = ss.getSheetByName("Return");
  retSheet.appendRow(["RET-001", "INV-001", dateYesterday.toISOString(), "kasir1", "Tukar Barang Sama", 0, "Cacat Pabrik", "Selesai"]);
  retSheet.appendRow(["RET-002", "INV-002", todayStr, "kasir1", "Refund Uang", -175000, "Salah Beli", "Selesai"]);
  retSheet.appendRow(["RET-003", "INV-003", todayStr, "kasir2", "Tukar Barang Sama", 0, "Rusak", "Selesai"]);
  retSheet.appendRow(["RET-004", "INV-004", todayStr, "kasir2", "Refund Uang", -40000, "Lainnya", "Selesai"]);
  retSheet.appendRow(["RET-005", "INV-005", todayStr, "kasir1", "Tukar Barang Sama", 0, "Cacat Pabrik", "Selesai"]);
  retSheet.appendRow(["RET-006", "INV-004", todayStr, "kasir2", "Tukar Tambah", 35000, "Salah Beli", "Selesai"]);
  
  const rdSheet = ss.getSheetByName("Return_Detail");
  // id_detail, no_return, id_barang_direturn, qty_direturn, id_barang_pengganti, qty_pengganti
  rdSheet.appendRow(["RD-001", "RET-001", "BRG-005", 1, "BRG-005", 1]);
  rdSheet.appendRow(["RD-002", "RET-002", "BRG-004", 1, "", 0]);
  rdSheet.appendRow(["RD-003", "RET-003", "BRG-005", 1, "BRG-005", 1]);
  rdSheet.appendRow(["RD-004", "RET-004", "BRG-001", 1, "", 0]);
  rdSheet.appendRow(["RD-005", "RET-005", "BRG-001", 1, "BRG-001", 1]);
  rdSheet.appendRow(["RD-006", "RET-006", "BRG-003", 1, "BRG-005", 1]); // Harga BRG-003 = 25.000, BRG-005 = 60.000. Selisih = +35.000
  
  // 11. Barang_Return (Barang cacat/rusak di inventory gudang)
  // Schema: id_barang_return, tanggal_terima, no_invoice_asal, id_barang, qty_rusak, alasan, user_penerima
  const brSheet = ss.getSheetByName("Barang_Return");
  brSheet.appendRow(["RTN-B001", dateYesterday.toISOString(), "INV-001", "BRG-005", 1, "Cacat Pabrik", "kasir1"]);
  brSheet.appendRow(["RTN-B002", todayStr, "INV-002", "BRG-004", 1, "Salah Beli (Tidak Rusak)", "kasir1"]);
  brSheet.appendRow(["RTN-B003", todayStr, "INV-003", "BRG-005", 1, "Rusak fisik", "kasir2"]);
  brSheet.appendRow(["RTN-B004", todayStr, "INV-004", "BRG-001", 1, "Kemasan bocor", "kasir2"]);
  brSheet.appendRow(["RTN-B005", todayStr, "INV-005", "BRG-001", 1, "Cacat Pabrik", "kasir1"]);
  brSheet.appendRow(["RTN-B006", todayStr, "INV-004", "BRG-003", 0, "Salah Beli (Tidak Rusak)", "kasir2"]); // 0 karena sudah diretur ke supplier

  // 12. Return_Supplier
  // Schema: id_return_supplier, tanggal_retur, id_barang, id_supplier, qty_retur, harga_beli, no_invoice_supplier, user
  const rsSheet = ss.getSheetByName("Return_Supplier");
  rsSheet.appendRow(["RTS-001", todayStr, "BRG-003", "SUP-001", 1, 20000, "INV-S003", "admin"]);

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
