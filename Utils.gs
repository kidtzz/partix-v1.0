/**
 * Utils.gs
 * Fungsi utilitas bantuan (format, generator nomor, konversi)
 */

/**
 * Generate nomor invoice. Format: INV-YYYYMMDD-XXXX
 */
function generateNomorInvoice() {
  return _generateNomor("Penjualan", "no_invoice", "INV", true, 4);
}

/**
 * Generate nomor return. Format: RTN-YYYYMMDD-XXXX
 */
function generateNomorReturn() {
  return _generateNomor("Return", "no_return", "RTN", true, 4);
}

/**
 * Generate ID barang. Format: BRG-00001
 */
function generateIdBarang() {
  return _generateNomor("Barang", "id_barang", "BRG", false, 5);
}

/**
 * Generic Number Generator (thread-safe using LockService)
 * @param {string} sheetName Nama sheet target
 * @param {string} idColumnName Nama kolom ID di sheet tersebut
 * @param {string} prefix Prefix (ex: INV, BRG)
 * @param {boolean} includeDate Apakah butuh suffix YYYYMMDD?
 * @param {number} paddingSize Jumlah digit auto increment (ex: 4 -> 0001)
 */
function _generateNomor(sheetName, idColumnName, prefix, includeDate, paddingSize) {
  const lock = LockService.getScriptLock();
  // Tunggu maksimal 5 detik agar tidak bentrok dengan transaksi/kasir lain
  const success = lock.tryLock(5000);
  
  if (!success) {
    throw new Error("Sistem sibuk karena banyak transaksi bersamaan. Silakan coba simpan lagi dalam beberapa detik.");
  }
  
  try {
    const data = SheetService.readSheet(sheetName);
    
    let dateStr = "";
    if (includeDate) {
      const d = new Date();
      // Gunakan timezone Jakarta atau UTC (tergantung kebutuhan, kita pakai waktu lokal script)
      const yr = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const dt = String(d.getDate()).padStart(2, '0');
      dateStr = `-${yr}${mo}${dt}`;
    }
    
    const pattern = `${prefix}${dateStr}-`;
    let maxNumber = 0;
    
    for (let i = 0; i < data.length; i++) {
      const idVal = String(data[i][idColumnName]);
      if (idVal.startsWith(pattern)) {
        const numPart = parseInt(idVal.replace(pattern, ""), 10);
        if (!isNaN(numPart) && numPart > maxNumber) {
          maxNumber = numPart;
        }
      }
    }
    
    const nextNumber = maxNumber + 1;
    let paddedNumber = String(nextNumber);
    while (paddedNumber.length < paddingSize) {
      paddedNumber = "0" + paddedNumber;
    }
    
    return `${pattern}${paddedNumber}`;
    
  } catch(e) {
    throw e;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Konversi qty Box menjadi jumlah satuan Pcs berdasarkan master Barang
 */
function konversiBoxKePcs(idBarang, qtyBox) {
  if (!qtyBox || qtyBox <= 0) return 0;
  
  const barang = SheetService.findRow("Barang", "id_barang", idBarang);
  if (!barang) {
    throw new Error(`Barang dengan ID ${idBarang} tidak ditemukan di master data.`);
  }
  
  const isiPerBox = Number(barang.isi_per_box);
  if (isNaN(isiPerBox) || isiPerBox <= 0) {
    return qtyBox; // Default 1:1 jika tidak diset
  }
  
  return qtyBox * isiPerBox;
}

/**
 * Format angka ke mata uang Rupiah
 */
function formatRupiah(number) {
  if (isNaN(number)) return "Rp 0";
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(number);
}

/**
 * Mencatat aktivitas ke dalam log database terpisah (PARTIX-LOG-DB).
 * @param {string} action - Aksi yang dilakukan (contoh: "CREATE", "UPDATE", "DELETE")
 * @param {string} module - Modul tempat aksi dilakukan (contoh: "Master Barang", "Supplier")
 * @param {string} details - Detail perubahan atau deskripsi aksi
 */
function logActivity(action, module, details) {
  try {
    const logSheetId = PropertiesService.getScriptProperties().getProperty('LOG_SHEET_ID');
    if (!logSheetId) {
      Logger.log("LOG_SHEET_ID tidak ditemukan. Log tidak dicatat.");
      return;
    }
    
    const ss = SpreadsheetApp.openById(logSheetId);
    const sheet = ss.getSheetByName("Log_Activity");
    if (!sheet) return;
    
    // Ambil data user yang sedang login (dapat menggunakan getCurrentUserRole atau dari session dummy)
    const currentUser = getCurrentUserRole() || { username: "System", role: "System" };
    const idLog = "LOG-" + new Date().getTime();
    
    const rowData = [
      idLog,
      new Date().toISOString(),
      currentUser.username,
      currentUser.role,
      action,
      module,
      details
    ];
    
    sheet.appendRow(rowData);
  } catch (e) {
    Logger.log("Gagal mencatat log aktivitas: " + e.message);
  }
}
