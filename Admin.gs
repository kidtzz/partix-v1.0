/**
 * Admin.gs
 * Berisi fitur-fitur backend khusus untuk Role Admin.
 */

// ==========================================
// MASTER BARANG
// ==========================================

function getSemuaBarangAdmin() {
  requireRole(['Admin', 'Restocker']);
  const barang = SheetService.readSheet("Barang");
  const hargaList = SheetService.readSheet("Harga").filter(h => h.status_harga === "Aktif");
  
  return barang.map(b => {
    const h = hargaList.find(x => x.id_barang === b.id_barang);
    b.harga = {
      "Regular": h ? Number(h.harga_regular) : 0,
      "Langganan": h ? Number(h.harga_langganan) : 0,
      "Teman": h ? Number(h.harga_teman) : 0
    };
    return b;
  });
}

function tambahMasterBarang(data) {
  requireRole(['Admin', 'Restocker']);
  
  if (!data.nama_barang || !data.kategori) {
    throw new Error("Nama barang dan kategori wajib diisi.");
  }
  
  const barcode = data.barcode || "";
  
  if (barcode) {
    const existing = SheetService.findRow("Barang", "barcode", barcode);
    if (existing && existing.barcode === barcode) {
      throw new Error("Barcode sudah digunakan oleh barang lain.");
    }
  }
  
  const idBarang = generateIdBarang();
  
  const rowData = {
    id_barang: idBarang,
    barcode: barcode,
    nama_barang: data.nama_barang,
    kategori: data.kategori,
    merk: data.merk || "",
    satuan: "PCS",
    isi_per_box: Number(data.isi_per_box) || 1,
    lokasi_rak: data.lokasi_rak || "",
    stok_saat_ini: Number(data.stok_awal) || 0,
    status_barang: data.status_barang || "Aktif"
  };
  
  SheetService.appendRow("Barang", rowData);
  logActivity("CREATE", "Master Barang", `Menambah barang baru: ${data.nama_barang} (${idBarang})`);
  
  // Catat ke histori stok
  const activeEmail = Session.getActiveUser().getEmail() || "admin";
  SheetService.appendRow("Stock_Movement", {
    id_movement: "MV-" + new Date().getTime(),
    tanggal: new Date().toISOString(),
    id_barang: idBarang,
    id_supplier: "",
    tipe_pergerakan: "BARU",
    qty_box: 0,
    qty_pcs: Number(data.stok_awal) || 0,
    harga_beli: 0,
    nomor_invoice_supplier: "",
    batch_barang: "",
    alasan_perubahan: `Item baru dibuat. Stok awal: ${Number(data.stok_awal) || 0} PCS`,
    user: activeEmail
  });
  
  if (data.id_supplier && data.harga_beli) {
    try {
      tambahBarangSupplier({
        id_barang: idBarang,
        id_supplier: data.id_supplier,
        harga_beli: data.harga_beli
      });
    } catch(e) {}
  }
  
  return idBarang;
}

function updateMasterBarang(idBarang, data) {
  requireRole(['Admin', 'Restocker']);
  
  if (!idBarang) throw new Error("ID Barang tidak valid.");
  
  const oldRow = SheetService.findRow("Barang", "id_barang", idBarang);
  
  const updatedFields = {
    barcode: data.barcode,
    nama_barang: data.nama_barang,
    kategori: data.kategori,
    merk: data.merk,
    satuan: "PCS",
    isi_per_box: Number(data.isi_per_box) || 1,
    lokasi_rak: data.lokasi_rak,
    stok_saat_ini: Number(data.stok_awal) || 0,
    status_barang: data.status_barang || "Aktif"
  };
  
  SheetService.updateRow("Barang", idBarang, updatedFields);
  logActivity("UPDATE", "Master Barang", `Update barang: ${idBarang} - Status: ${updatedFields.status_barang}`);
  
  // Hitung perbedaan untuk histori
  if (oldRow) {
    let changes = [];
    if (oldRow.nama_barang !== updatedFields.nama_barang) changes.push(`Nama`);
    if (Number(oldRow.isi_per_box) !== updatedFields.isi_per_box) changes.push(`Isi per Box`);
    if (Number(oldRow.stok_saat_ini) !== updatedFields.stok_saat_ini) changes.push(`Stok Saat Ini (dari ${oldRow.stok_saat_ini} ke ${updatedFields.stok_saat_ini})`);
    if (oldRow.kategori !== updatedFields.kategori) changes.push(`Kategori`);
    if (oldRow.merk !== updatedFields.merk) changes.push(`Merk`);
    
    if (changes.length > 0) {
      const activeEmail = Session.getActiveUser().getEmail() || "admin";
      SheetService.appendRow("Stock_Movement", {
        id_movement: "MV-" + new Date().getTime(),
        tanggal: new Date().toISOString(),
        id_barang: idBarang,
        id_supplier: "",
        tipe_pergerakan: "UPDATE",
        qty_box: 0,
        qty_pcs: 0,
        harga_beli: 0,
        nomor_invoice_supplier: "",
        batch_barang: "",
        alasan_perubahan: `Perubahan Master: ${changes.join(", ")}`,
        user: activeEmail
      });
    }
  }
  
  return true;
}

function updateStatusBarang(idBarang, statusBaru) {
  requireRole(['Admin', 'Restocker']);
  if (!idBarang || !statusBaru) throw new Error("ID Barang dan Status Baru harus diisi.");
  
  SheetService.updateRow("Barang", idBarang, { status_barang: statusBaru });
  logActivity("UPDATE", "Status Barang", `Update status barang: ${idBarang} menjadi ${statusBaru}`);
  return true;
}

function hapusMasterBarang(idBarang) {
  requireRole(['Admin']);
  if (!idBarang) throw new Error("ID Barang tidak valid.");
  
  SheetService.deleteRow("Barang", idBarang);
  
  try {
    SheetService.deleteRow("Harga", idBarang);
  } catch(e) {}
  
  logActivity("DELETE", "Master Barang", `Menghapus permanen barang: ${idBarang}`);
  return true;
}

// ==========================================
// MANAJEMEN USER
// ==========================================

function getSemuaUser() {
  requireRole(['Admin']);
  return SheetService.readSheet("Users");
}

function tambahUser(data) {
  requireRole(['Admin']);
  
  if (!data.username || !data.nama_lengkap || !data.role) {
    throw new Error("Username, nama lengkap, dan role wajib diisi.");
  }
  
  const existing = SheetService.findRow("Users", "username", data.username);
  if (existing) {
    throw new Error(`Username ${data.username} sudah terdaftar.`);
  }
  
  const rowData = {
    username: data.username.trim(),
    password: data.password || "123456", 
    nama_lengkap: data.nama_lengkap.trim(),
    role: data.role, 
    status: data.status || "Aktif"
  };
  
  SheetService.appendRow("Users", rowData);
  
  try {
    logActivity("CREATE", "Manajemen User", `Menambah user baru: ${data.username} (${data.role})`);
  } catch (e) {}

  return true;
}

function updateUser(username, updatedData) {
  requireRole(['Admin']);
  
  if (!username) throw new Error("Username tidak valid.");
  
  const payload = {
    nama_lengkap: updatedData.nama_lengkap,
    role: updatedData.role,
    status: updatedData.status
  };

  if (updatedData.password) {
    payload.password = updatedData.password;
  }

  SheetService.updateRow("Users", username, payload);
  
  try {
    logActivity("UPDATE", "Manajemen User", `Update data user: ${username}`);
  } catch (e) {}

  return true;
}

function hapusUser(username) {
  requireRole(['Admin']);
  if (!username) throw new Error("Username tidak valid.");
  
  SheetService.deleteRow("Users", username);
  
  try {
    logActivity("DELETE", "Manajemen User", `Menghapus user: ${username}`);
  } catch (e) {}

  return true;
}

// ==========================================
// HISTORI TRANSAKSI
// ==========================================

function getHistoriTransaksiAdmin() {
  requireRole(['Admin']);
  const penjualan = SheetService.readSheet("Penjualan");
  penjualan.reverse();
  return penjualan;
}

// ==========================================
// SUPPLIER
// ==========================================

function getSemuaSupplier() {
  requireRole(['Admin', 'Restocker']); 
  return SheetService.readSheet("Supplier");
}

function tambahSupplier(data) {
  requireRole(['Admin', 'Restocker']);
  
  if (!data.nama_supplier) {
    throw new Error("Nama supplier wajib diisi.");
  }
  
  const suppliers = SheetService.readSheet("Supplier");
  const lastId = suppliers.length > 0 ? suppliers[suppliers.length - 1].id_supplier : "SUP-000";
  const num = parseInt(lastId.replace("SUP-", "")) + 1;
  const newId = "SUP-" + String(num).padStart(3, "0");
  
  const rowData = {
    id_supplier: newId,
    nama_supplier: data.nama_supplier,
    pic: data.pic || "",
    nomor_hp: data.nomor_hp || "",
    email: data.email || "",
    alamat: data.alamat || "",
    status_supplier: data.status_supplier || "Aktif"
  };
  
  SheetService.appendRow("Supplier", rowData);
  logActivity("CREATE", "Master Supplier", `Menambah supplier baru: ${data.nama_supplier} (${newId})`);
  return newId;
}

function updateSupplier(idSupplier, data) {
  requireRole(['Admin', 'Restocker']);
  
  if (!idSupplier) throw new Error("ID Supplier tidak valid.");
  
  const updatedFields = {
    nama_supplier: data.nama_supplier,
    pic: data.pic,
    nomor_hp: data.nomor_hp,
    email: data.email,
    alamat: data.alamat,
    status_supplier: data.status_supplier
  };
  
  SheetService.updateRow("Supplier", idSupplier, updatedFields);
  logActivity("UPDATE", "Master Supplier", `Update supplier: ${idSupplier} - Status: ${updatedFields.status_supplier}`);
  return true;
}

// ==========================================
// BARANG - SUPPLIER
// ==========================================

function getBarangSupplier() {
  requireRole(['Admin', 'Restocker']);
  return SheetService.readSheet("Barang_Supplier");
}

function tambahBarangSupplier(data) {
  requireRole(['Admin', 'Restocker']);
  
  if (!data.id_barang || !data.id_supplier || !data.harga_beli) {
    throw new Error("Barang, Supplier, dan Harga Beli wajib diisi.");
  }
  
  const existing = SheetService.readSheet("Barang_Supplier").find(
    row => row.id_barang === data.id_barang && row.id_supplier === data.id_supplier
  );
  if (existing) {
    if (existing.status === "Aktif") {
      throw new Error("Relasi Barang dan Supplier ini sudah ada dan masih Aktif.");
    } else {
      // Jika sudah ada tapi nonaktif, kita aktifkan kembali dan update harga
      const payload = {
        harga_beli: Number(data.harga_beli),
        kode_barang_supplier: data.kode_barang_supplier || existing.kode_barang_supplier || "",
        status: "Aktif"
      };
      SheetService.updateRow("Barang_Supplier", existing.id_barang_supplier, payload);
      logActivity("UPDATE", "Barang Supplier", `Mengaktifkan kembali tautan barang ${data.id_barang} dengan supplier ${data.id_supplier}`);
      return existing.id_barang_supplier;
    }
  }
  
  const bsList = SheetService.readSheet("Barang_Supplier");
  const lastId = bsList.length > 0 ? bsList[bsList.length - 1].id_barang_supplier : "BS-000";
  const num = parseInt(lastId.replace("BS-", "")) + 1;
  const newId = "BS-" + String(num).padStart(3, "0");
  
  const rowData = {
    id_barang_supplier: newId,
    id_barang: data.id_barang,
    id_supplier: data.id_supplier,
    harga_beli: Number(data.harga_beli),
    kode_barang_supplier: data.kode_barang_supplier || "",
    is_utama: data.is_utama ? true : false,
    status: data.status || "Aktif"
  };
  
  SheetService.appendRow("Barang_Supplier", rowData);
  logActivity("CREATE", "Barang Supplier", `Menautkan barang ${data.id_barang} dengan supplier ${data.id_supplier}`);
  return newId;
}

function updateBarangSupplier(idBarangSupplier, data) {
  requireRole(['Admin', 'Restocker']);
  
  if (!idBarangSupplier) throw new Error("ID Barang Supplier tidak valid.");
  
  const updatedFields = {
    harga_beli: Number(data.harga_beli),
    kode_barang_supplier: data.kode_barang_supplier,
    is_utama: data.is_utama ? true : false,
    status: data.status
  };
  
  SheetService.updateRow("Barang_Supplier", idBarangSupplier, updatedFields);
  logActivity("UPDATE", "Barang Supplier", `Update tautan: ${idBarangSupplier} - Status: ${updatedFields.status}`);
  return true;
}

// ==========================================
// LOG AKTIVITAS
// ==========================================

function getLogActivityAdmin() {
  requireRole(['Admin']);
  const logSheetId = PropertiesService.getScriptProperties().getProperty('LOG_SHEET_ID');
  if (!logSheetId) return [];
  
  try {
    const ss = SpreadsheetApp.openById(logSheetId);
    const sheet = ss.getSheetByName("Log_Activity");
    if (!sheet) return [];
    
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    if (values.length <= 1) return [];
    
    const headers = values[0];
    const data = [];
    
    for (let i = 1; i < values.length; i++) {
      const obj = {};
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = values[i][j];
      }
      data.push(obj);
    }
    
    data.reverse(); // Terbaru di atas
    return data;
  } catch(e) {
    return [];
  }
}
// ==========================================
// PENGATURAN DISKON
// ==========================================

function getPengaturanDiskon() {
  requireRole(['Admin', 'Restocker', 'Kasir']);
  try {
    const data = SheetService.readSheet("Pengaturan");
    let result = {
      DISKON_LANGGANAN: 10,
      DISKON_TEMAN: 20,
      MINIMUM_STOK: 5
    };
    data.forEach(row => {
      if(row.kunci === "DISKON_LANGGANAN") result.DISKON_LANGGANAN = Number(row.nilai) || 0;
      if(row.kunci === "DISKON_TEMAN") result.DISKON_TEMAN = Number(row.nilai) || 0;
      if(row.kunci === "MINIMUM_STOK") result.MINIMUM_STOK = Number(row.nilai) || 0;
    });
    return result;
  } catch(e) {
    // Fallback jika sheet belum di-setup
    return { DISKON_LANGGANAN: 10, DISKON_TEMAN: 20, MINIMUM_STOK: 5 };
  }
}

function updatePengaturanDiskon(diskonLangganan, diskonTeman, minimumStok) {
  requireRole(['Admin']);
  
  const ssId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const ss = SpreadsheetApp.openById(ssId);
  let sheet = ss.getSheetByName("Pengaturan");
  if (!sheet) {
    sheet = ss.insertSheet("Pengaturan");
    sheet.appendRow(["kunci", "nilai"]);
  }
  
  const data = sheet.getDataRange().getValues();
  let foundLangganan = false;
  let foundTeman = false;
  let foundMinimumStok = false;
  
  for(let i = 1; i < data.length; i++) {
    if(data[i][0] === "DISKON_LANGGANAN") {
      sheet.getRange(i+1, 2).setValue(diskonLangganan);
      foundLangganan = true;
    }
    if(data[i][0] === "DISKON_TEMAN") {
      sheet.getRange(i+1, 2).setValue(diskonTeman);
      foundTeman = true;
    }
    if(data[i][0] === "MINIMUM_STOK") {
      if(minimumStok !== undefined && minimumStok !== null) {
        sheet.getRange(i+1, 2).setValue(minimumStok);
        foundMinimumStok = true;
      }
    }
  }
  
  if(!foundLangganan) sheet.appendRow(["DISKON_LANGGANAN", diskonLangganan]);
  if(!foundTeman) sheet.appendRow(["DISKON_TEMAN", diskonTeman]);
  if(!foundMinimumStok && minimumStok !== undefined && minimumStok !== null) sheet.appendRow(["MINIMUM_STOK", minimumStok]);
  
  logActivity("UPDATE", "Pengaturan Global", `Diskon: ${diskonLangganan}%/${diskonTeman}%, Min Stok: ${minimumStok}`);
  return true;
}
