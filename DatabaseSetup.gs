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
  "Barang": ["id_barang", "barcode", "nama_barang", "kategori", "merk", "satuan", "isi_per_box", "lokasi_rak", "minimum_stock", "stok_saat_ini", "status_barang"],
  "Supplier": ["id_supplier", "nama_supplier", "pic", "nomor_hp", "email", "alamat", "status_supplier"],
  "Barang_Supplier": ["id_barang_supplier", "id_barang", "id_supplier", "harga_beli", "kode_barang_supplier", "is_utama", "status"],
  "Harga": ["id_harga", "id_barang", "harga_regular", "harga_langganan", "harga_teman", "tanggal_berlaku", "status_harga", "keterangan_perubahan"],
  "Stock_Movement": ["id_movement", "tanggal", "id_barang", "id_supplier", "tipe_pergerakan", "qty_box", "qty_pcs", "harga_beli", "nomor_invoice_supplier", "batch_barang", "alasan_perubahan", "user"],
  "Penjualan": ["no_invoice", "tanggal", "kasir", "kategori_customer", "subtotal", "total", "metode_pembayaran", "detail_pembayaran", "kembalian", "status_transaksi"],
  "Penjualan_Detail": ["id_detail", "no_invoice", "id_barang", "nama_barang", "qty", "harga_satuan", "subtotal"],
  "Return": ["no_return", "no_invoice", "tanggal", "kasir", "jenis_return", "selisih_harga", "alasan_return", "status"],
  "Return_Detail": ["id_detail", "no_return", "id_barang_direturn", "qty_direturn", "id_barang_pengganti", "qty_pengganti"],
  "Users": ["username", "password", "nama_lengkap", "role", "status"],
  "Profil_Toko": ["id_profil", "nama_toko", "logo_toko", "alamat_toko", "nomor_telepon", "footer_invoice"]
};

function installDatabase(existingSheetId) {
  Logger.log("Memulai proses setup database v1.1...");
  
  let ss;
  let ssId = existingSheetId || EXISTING_SPREADSHEET_ID;
  
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
  
  // 3. Supplier
  const supplierSheet = ss.getSheetByName("Supplier");
  supplierSheet.appendRow(["SUP-001", "PT Astra Otoparts", "Budi Santoso", "08123456789", "budi@astra.co.id", "Jl. Sudirman No. 1, Jakarta", "Aktif"]);
  supplierSheet.appendRow(["SUP-002", "CV Maju Motor", "Andi", "08987654321", "andi@majumotor.com", "Jl. Merdeka No. 45, Bandung", "Aktif"]);

  // 4. Barang
  const barangSheet = ss.getSheetByName("Barang");
  barangSheet.appendRow(["BRG-00001", "8998989,123456", "Oli Pertamina Enduro 4T", "Oli", "Pertamina", "BOTOL", 24, "Rak A1", 10, 50, "Aktif"]);
  barangSheet.appendRow(["BRG-00002", "777777", "Busi NGK C7HSA", "Sparepart", "NGK", "PCS", 10, "Rak B2", 5, 20, "Aktif"]);
  barangSheet.appendRow(["BRG-00003", "55555", "Kampas Rem Depan Supra", "Sparepart", "Honda", "SET", 50, "Rak C3", 5, 15, "Aktif"]);

  // 5. Barang_Supplier
  const barangSupplierSheet = ss.getSheetByName("Barang_Supplier");
  barangSupplierSheet.appendRow(["BS-001", "BRG-00001", "SUP-001", 35000, "AST-OLI-01", true, "Aktif"]);
  barangSupplierSheet.appendRow(["BS-002", "BRG-00002", "SUP-002", 12000, "MM-BUSI", true, "Aktif"]);
  barangSupplierSheet.appendRow(["BS-003", "BRG-00003", "SUP-001", 20000, "AST-REM", true, "Aktif"]);

  // 6. Harga (Satu baris menampung 3 harga sekaligus)
  const hargaSheet = ss.getSheetByName("Harga");
  const today = new Date().toISOString();
  hargaSheet.appendRow(["HRG-001", "BRG-00001", 45000, 43000, 40000, today, "Aktif", "Harga Awal Setup"]);
  hargaSheet.appendRow(["HRG-002", "BRG-00002", 15000, 14000, 13000, today, "Aktif", "Harga Awal Setup"]);
  hargaSheet.appendRow(["HRG-003", "BRG-00003", 30000, 28000, 25000, today, "Aktif", "Harga Awal Setup"]);
  
  Logger.log("SETUP SELESAI!");
}
