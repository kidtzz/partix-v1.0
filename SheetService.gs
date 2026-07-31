/**
 * SheetService.gs
 * Abstraction layer for Google Sheets database operations.
 */

const SheetService = (function() {
  
  function getSpreadsheet() {
    const ssId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    if (!ssId) throw new Error("SHEET_ID not found in Script Properties. Silakan jalankan installDatabase() terlebih dahulu.");
    return SpreadsheetApp.openById(ssId);
  }

  function getSheet(sheetName) {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) throw new Error(`Sheet "${sheetName}" tidak ditemukan.`);
    return sheet;
  }

  /**
   * Membaca seluruh data dari sebuah sheet.
   * @param {string} sheetName Nama sheet (tabel)
   * @returns {Array<Object>} Array of objects, di mana keys = headers
   */
  function readSheet(sheetName) {
    const sheet = getSheet(sheetName);
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues(); // Batch read seluruh data
    
    if (values.length <= 1) return []; // Kosong atau hanya header
    
    const headers = values[0];
    const data = [];
    
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const obj = {};
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = row[j];
      }
      data.push(obj);
    }
    return data;
  }

  /**
   * Menambahkan satu baris baru ke sheet.
   * @param {string} sheetName Nama sheet
   * @param {Object} rowObject Data dalam bentuk object key-value
   */
  function appendRow(sheetName, rowObject) {
    const sheet = getSheet(sheetName);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    const rowData = [];
    for (let i = 0; i < headers.length; i++) {
      const key = headers[i];
      rowData.push(rowObject[key] !== undefined ? rowObject[key] : "");
    }
    
    // Batch write (appendRow di-optimize oleh GAS sebagai operasi tunggal)
    sheet.appendRow(rowData);
    return true;
  }

  /**
   * Mencari baris pertama yang cocok dengan kriteria.
   * @param {string} sheetName Nama sheet
   * @param {string} columnName Nama kolom yang akan dicari
   * @param {any} value Nilai yang dicari
   * @returns {Object|null}
   */
  function findRow(sheetName, columnName, value) {
    const data = readSheet(sheetName);
    for (let i = 0; i < data.length; i++) {
      if (data[i][columnName] == value) {
        return data[i];
      }
    }
    return null;
  }

  /**
   * Mencari semua baris yang cocok dengan kriteria.
   * @param {string} sheetName Nama sheet
   * @param {string} columnName Nama kolom yang akan dicari
   * @param {any} value Nilai yang dicari
   * @returns {Array<Object>}
   */
  function findRows(sheetName, columnName, value) {
    const data = readSheet(sheetName);
    const results = [];
    for (let i = 0; i < data.length; i++) {
      if (data[i][columnName] == value) {
        results.push(data[i]);
      }
    }
    return results;
  }

  /**
   * Mengupdate baris yang sudah ada berdasarkan Primary Key (kolom pertama).
   * @param {string} sheetName Nama sheet
   * @param {any} primaryKeyValue Nilai ID/PK (selalu kolom pertama berdasarkan skema)
   * @param {Object} updatedFields Field yang ingin di-update saja (misal: { stok_saat_ini: 50 })
   */
  function updateRow(sheetName, primaryKeyValue, updatedFields) {
    const sheet = getSheet(sheetName);
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues(); // Batch read
    
    if (values.length <= 1) return false;
    
    const headers = values[0];
    let targetRowIndex = -1;
    
    // Cari index baris (asumsi PK selalu di kolom pertama / index 0)
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] == primaryKeyValue) {
        targetRowIndex = i;
        break;
      }
    }
    
    if (targetRowIndex === -1) {
      throw new Error(`Data dengan ID ${primaryKeyValue} tidak ditemukan di sheet ${sheetName}.`);
    }
    
    // Siapkan array data yang akan ditimpa
    const currentRowData = values[targetRowIndex];
    const newRowData = [...currentRowData];
    
    // Timpa hanya kolom yang ada di updatedFields
    for (const key in updatedFields) {
      const colIndex = headers.indexOf(key);
      if (colIndex !== -1) {
        newRowData[colIndex] = updatedFields[key];
      }
    }
    
    // Batch write: Timpa satu baris utuh
    sheet.getRange(targetRowIndex + 1, 1, 1, headers.length).setValues([newRowData]);
    return true;
  }

  function deleteRow(sheetName, primaryKeyValue) {
    const sheet = getSheet(sheetName);
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    
    if (values.length <= 1) return false;
    
    let targetRowIndex = -1;
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] == primaryKeyValue) {
        targetRowIndex = i;
        break;
      }
    }
    
    if (targetRowIndex === -1) {
      throw new Error(`Data dengan ID ${primaryKeyValue} tidak ditemukan.`);
    }
    
    sheet.deleteRow(targetRowIndex + 1);
    return true;
  }

  // Expose API
  return {
    readSheet: readSheet,
    appendRow: appendRow,
    updateRow: updateRow,
    findRow: findRow,
    findRows: findRows,
    deleteRow: deleteRow
  };
})();
