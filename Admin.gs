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
    let bc1 = b.barcode1 || "";
    let bc2 = b.barcode2 || "";
    if (!bc1 && b.barcode) {
      const parts = String(b.barcode).split(',').map(s => s.trim());
      bc1 = parts[0] || "";
      bc2 = parts[1] || "";
    }
    b.barcode1 = bc1;
    b.barcode2 = bc2;
    b.barcode = [bc1, bc2].filter(Boolean).join(', ');

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
  
  if (!data.nama_barang) {
    throw new Error("Nama barang wajib diisi.");
  }
  
  let bc1 = (data.barcode1 || "").trim();
  let bc2 = (data.barcode2 || "").trim();
  
  if (!bc1 && data.barcode) {
    const parts = String(data.barcode).split(',').map(s => s.trim());
    bc1 = parts[0] || "";
    bc2 = parts[1] || "";
  }

  const allBarang = SheetService.readSheet("Barang");
  if (bc1) {
    const dup1 = allBarang.find(b => (b.barcode1 === bc1 || b.barcode2 === bc1 || (b.barcode && b.barcode.includes(bc1))));
    if (dup1) throw new Error(`Barcode 1 (${bc1}) sudah digunakan oleh barang lain.`);
  }
  if (bc2) {
    const dup2 = allBarang.find(b => (b.barcode1 === bc2 || b.barcode2 === bc2 || (b.barcode && b.barcode.includes(bc2))));
    if (dup2) throw new Error(`Barcode 2 (${bc2}) sudah digunakan oleh barang lain.`);
  }

  const idBarang = generateIdBarang();
  
  const rowData = {
    id_barang: idBarang,
    barcode1: bc1,
    barcode2: bc2,
    nama_barang: data.nama_barang,
    merk: data.merk || "",
    kategori: data.kategori || "",
    status_barang: data.status_barang || "Aktif"
    // CATATAN: satuan, isi_per_box, stok, minimum_stok, lokasi_rak
    // disimpan di Barang_Supplier, bukan di sini
  };
  
  SheetService.appendRow("Barang", rowData);
  logActivity("CREATE", "Master Barang", `Menambah barang baru: ${data.nama_barang} (${idBarang})`);
  
  return idBarang;
}

function updateMasterBarang(idBarang, data) {
  requireRole(['Admin', 'Restocker']);
  
  if (!idBarang) throw new Error("ID Barang tidak valid.");
  
  const oldRow = SheetService.findRow("Barang", "id_barang", idBarang);
  
  let bc1 = (data.barcode1 !== undefined ? data.barcode1 : (data.barcode ? String(data.barcode).split(',')[0] : '')).trim();
  let bc2 = (data.barcode2 !== undefined ? data.barcode2 : (data.barcode ? String(data.barcode).split(',')[1] : '')).trim();

  const updatedFields = {
    barcode1: bc1,
    barcode2: bc2,
    nama_barang: data.nama_barang,
    merk: data.merk || "",
    kategori: data.kategori || "",
    status_barang: data.status_barang || "Aktif"
    // CATATAN: field inventory (satuan, stok, dll) tidak diupdate di sini
    // gunakan updateBarangSupplier() atau updateStokBarang() untuk itu
  };
  
  SheetService.updateRow("Barang", idBarang, updatedFields);
  logActivity("UPDATE", "Master Barang", `Update barang: ${idBarang} - Status: ${updatedFields.status_barang}`);
  
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
  const suppliers = SheetService.readSheet("Supplier");
  return suppliers.map(s => {
    let pics = [];
    if (s.pic && String(s.pic).trim().startsWith("[")) {
      try {
        pics = JSON.parse(s.pic);
      } catch (e) {
        pics = [{ nama: s.pic || "", hp: s.nomor_hp || "" }];
      }
    } else if (s.pic || s.nomor_hp) {
      pics = [{ nama: s.pic || "", hp: s.nomor_hp || "" }];
    }
    return {
      ...s,
      pics: pics
    };
  });
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
  
  const pics = Array.isArray(data.pics) ? data.pics.filter(p => p.nama || p.hp) : [];
  let picVal = data.pic || "";
  let hpVal = data.nomor_hp || "";

  if (pics.length > 0) {
    picVal = JSON.stringify(pics);
    hpVal = pics.map(p => p.hp).filter(Boolean).join(", ");
  }

  const rowData = {
    id_supplier: newId,
    nama_supplier: data.nama_supplier,
    pic: picVal,
    nomor_hp: hpVal,
    email: data.email || "",
    // CATATAN: kolom "alamat" dihapus sesuai PRD v1.1 update
    // Ganti dengan field "diskon" (dikelola per barang di Barang_Supplier.diskon_persen)
    status_supplier: data.status_supplier || "Aktif"
  };
  
  SheetService.appendRow("Supplier", rowData);
  logActivity("CREATE", "Master Supplier", `Menambah supplier baru: ${data.nama_supplier} (${newId})`);
  return newId;
}

function updateSupplier(idSupplier, data) {
  requireRole(['Admin', 'Restocker']);
  
  if (!idSupplier) throw new Error("ID Supplier tidak valid.");
  
  const pics = Array.isArray(data.pics) ? data.pics.filter(p => p.nama || p.hp) : [];
  let picVal = data.pic || "";
  let hpVal = data.nomor_hp || "";

  if (pics.length > 0) {
    picVal = JSON.stringify(pics);
    hpVal = pics.map(p => p.hp).filter(Boolean).join(", ");
  }

  const updatedFields = {
    nama_supplier: data.nama_supplier,
    pic: picVal,
    nomor_hp: hpVal,
    email: data.email,
    // CATATAN: kolom "alamat" dihapus sesuai PRD v1.1 update
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
        diskon_persen: Number(data.diskon_persen) || 0,
        satuan: data.satuan || "PCS",
        isi_per_box: Number(data.isi_per_box) || 1,
        stok_saat_ini: Number(data.stok_saat_ini) || 0,
        minimum_stok: Number(data.minimum_stok) || 5,
        lokasi_rak: data.lokasi_rak || "",
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
    diskon_persen: Number(data.diskon_persen) || 0,
    satuan: data.satuan || "PCS",
    isi_per_box: Number(data.isi_per_box) || 1,
    stok_saat_ini: Number(data.stok_saat_ini) || 0,
    minimum_stok: Number(data.minimum_stok) || 5,
    lokasi_rak: data.lokasi_rak || "",
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
    diskon_persen: Number(data.diskon_persen) || 0,
    satuan: data.satuan || "PCS",
    isi_per_box: Number(data.isi_per_box) || 1,
    stok_saat_ini: Number(data.stok_saat_ini) || 0,
    minimum_stok: Number(data.minimum_stok) || 5,
    lokasi_rak: data.lokasi_rak || "",
    kode_barang_supplier: data.kode_barang_supplier,
    is_utama: data.is_utama ? true : false,
    status: data.status
  };
  
  SheetService.updateRow("Barang_Supplier", idBarangSupplier, updatedFields);
  logActivity("UPDATE", "Barang Supplier", `Update tautan: ${idBarangSupplier} - Status: ${updatedFields.status}`);
  return true;
}

function hapusBarangSupplier(idBarangSupplier) {
  requireRole(['Admin', 'Restocker']);
  
  if (!idBarangSupplier) throw new Error("ID Barang Supplier tidak valid.");
  
  SheetService.updateRow("Barang_Supplier", idBarangSupplier, { status: "Nonaktif" });
  logActivity("DELETE", "Barang Supplier", `Menonaktifkan tautan: ${idBarangSupplier}`);
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
      DISKON_MEMBER: 5,
      DISKON_LANGGANAN: 10,
      DISKON_BENGKEL: 15,
      DISKON_TEMAN: 20,
      DISKON_GROSIR: 25,
      MINIMUM_STOK: 5
    };
    data.forEach(row => {
      if(row.kunci === "DISKON_MEMBER") result.DISKON_MEMBER = Number(row.nilai) || 0;
      if(row.kunci === "DISKON_LANGGANAN") result.DISKON_LANGGANAN = Number(row.nilai) || 0;
      if(row.kunci === "DISKON_BENGKEL") result.DISKON_BENGKEL = Number(row.nilai) || 0;
      if(row.kunci === "DISKON_TEMAN") result.DISKON_TEMAN = Number(row.nilai) || 0;
      if(row.kunci === "DISKON_GROSIR") result.DISKON_GROSIR = Number(row.nilai) || 0;
      if(row.kunci === "MINIMUM_STOK") result.MINIMUM_STOK = Number(row.nilai) || 0;
    });
    return result;
  } catch(e) {
    return { DISKON_MEMBER: 5, DISKON_LANGGANAN: 10, DISKON_BENGKEL: 15, DISKON_TEMAN: 20, DISKON_GROSIR: 25, MINIMUM_STOK: 5 };
  }
}

function updatePengaturanDiskon(arg1, arg2, arg3, arg4, arg5, arg6) {
  requireRole(['Admin']);
  
  let dMem = 5, dLan = 10, dBeng = 15, dTem = 20, dGro = 25, minStok = 5;
  if (typeof arg1 === 'object' && arg1 !== null) {
    dMem = Number(arg1.DISKON_MEMBER) || 0;
    dLan = Number(arg1.DISKON_LANGGANAN) || 0;
    dBeng = Number(arg1.DISKON_BENGKEL) || 0;
    dTem = Number(arg1.DISKON_TEMAN) || 0;
    dGro = Number(arg1.DISKON_GROSIR) || 0;
    if (arg1.MINIMUM_STOK !== undefined && arg1.MINIMUM_STOK !== null) minStok = Number(arg1.MINIMUM_STOK);
  } else {
    dMem = Number(arg1) || 0;
    dLan = Number(arg2) || 0;
    dBeng = Number(arg3) || 0;
    dTem = Number(arg4) || 0;
    dGro = Number(arg5) || 0;
    if (arg6 !== undefined && arg6 !== null) minStok = Number(arg6);
  }

  const ssId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const ss = SpreadsheetApp.openById(ssId);
  let sheet = ss.getSheetByName("Pengaturan");
  if (!sheet) {
    sheet = ss.insertSheet("Pengaturan");
    sheet.appendRow(["kunci", "nilai"]);
  }
  
  const data = sheet.getDataRange().getValues();
  const keysToUpdate = {
    "DISKON_MEMBER": dMem,
    "DISKON_LANGGANAN": dLan,
    "DISKON_BENGKEL": dBeng,
    "DISKON_TEMAN": dTem,
    "DISKON_GROSIR": dGro,
    "MINIMUM_STOK": minStok
  };

  const foundKeys = {};

  for(let i = 1; i < data.length; i++) {
    const k = data[i][0];
    if (keysToUpdate.hasOwnProperty(k)) {
      sheet.getRange(i+1, 2).setValue(keysToUpdate[k]);
      foundKeys[k] = true;
    }
  }
  
  Object.keys(keysToUpdate).forEach(k => {
    if (!foundKeys[k]) {
      sheet.appendRow([k, keysToUpdate[k]]);
    }
  });

  logActivity("UPDATE", "Pengaturan Global", `Diskon: Mem:${dMem}%, Lgn:${dLan}%, Bkg:${dBeng}%, Tmn:${dTem}%, Gsr:${dGro}%, MinStok: ${minStok}`);
  return true;
}
