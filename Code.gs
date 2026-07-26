/**
 * Entry point for the Google Apps Script Web App.
 * Serves the index.html file.
 */
function doGet(e) {
  // Evaluates the index.html template and serves it as HTML service
  const template = HtmlService.createTemplateFromFile('index');
  
  // Custom login: Halaman akan terbuka tanpa initial user (user harus login dari UI)
  template.initialUser = "null";
  
  return template.evaluate()
    .setTitle('PARTIX - POS & Inventory')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Helper function to include HTML files (CSS, JS, Partials) inside the template.
 * Usage in HTML: <?!= include('filename'); ?>
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}



/**
 * Mock Backend function for saving transaction
 */
function simpanTransaksi(cartItems) {
  Logger.log('Menyimpan transaksi...');
  Logger.log(cartItems);
  return { success: true, message: 'Transaksi berhasil disimpan!' };
}

/**
 * Memvalidasi apakah skema database di Google Sheets sesuai dengan yang diharapkan.
 * Hal ini untuk memitigasi risiko jika ada user yang mengubah header secara manual.
 */
function verifySchema() {
  const ssId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!ssId) {
    Logger.log("SHEET_ID tidak ditemukan. Silakan jalankan installDatabase() terlebih dahulu.");
    return false;
  }
  
  const ss = SpreadsheetApp.openById(ssId);
  const expectedSchema = {
    "Barang": ["id_barang", "nama_barang", "barcode", "kategori", "satuan_dasar", "isi_per_box", "gambar_url", "stok_minimum", "stok_saat_ini", "status"],
    "Supplier": ["id_supplier", "nama_supplier", "kontak", "alamat"],
    "Stock_Movement": ["id_movement", "tanggal", "id_barang", "id_supplier", "tipe", "qty_box", "qty_pcs", "harga_beli", "no_batch", "referensi", "user"],
    "Harga": ["id_harga", "id_barang", "tipe_harga", "harga", "tanggal_berlaku", "status"],
    "Users": ["email", "nama", "role", "status"],
    "Penjualan": ["no_invoice", "tanggal", "kasir", "tipe_harga", "subtotal", "total", "metode_bayar", "detail_bayar", "kembalian", "status"],
    "Penjualan_Detail": ["id_detail", "no_invoice", "id_barang", "nama_barang_snapshot", "qty", "harga_satuan_snapshot", "subtotal"],
    "Return": ["no_return", "no_invoice_asal", "tanggal", "kasir", "jenis_penyelesaian", "selisih_bayar", "status"],
    "Return_Detail": ["id_detail", "no_return", "id_barang_direturn", "qty_return", "id_barang_pengganti", "qty_pengganti"]
  };
  
  let isSchemaValid = true;
  
  for (const sheetName in expectedSchema) {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      Logger.log(`Sheet "${sheetName}" hilang!`);
      isSchemaValid = false;
      continue;
    }
    
    const expectedHeaders = expectedSchema[sheetName];
    const actualHeaders = sheet.getRange(1, 1, 1, expectedHeaders.length).getValues()[0];
    
    for (let i = 0; i < expectedHeaders.length; i++) {
      if (actualHeaders[i] !== expectedHeaders[i]) {
        Logger.log(`Header mismatch di sheet "${sheetName}" kolom ${i+1}. Diharapkan: ${expectedHeaders[i]}, Ditemukan: ${actualHeaders[i]}`);
        isSchemaValid = false;
      }
    }
  }
  
  if (isSchemaValid) {
    Logger.log("Skema database valid.");
  } else {
    Logger.log("Skema database TIDAK VALID! Ada sheet atau header yang diubah secara manual.");
  }
  
  return isSchemaValid;
}

