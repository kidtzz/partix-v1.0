/**
 * Admin.gs
 * Berisi fitur-fitur backend khusus untuk Role Admin.
 */

// ==========================================
// MASTER BARANG
// ==========================================

function getSemuaBarangAdmin() {
  requireRole(['Admin']);
  return SheetService.readSheet("Barang");
}

function tambahMasterBarang(data) {
  requireRole(['Admin']);
  
  if (!data.nama_barang || !data.kategori || !data.satuan) {
    throw new Error("Nama barang, kategori, dan satuan wajib diisi.");
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
    satuan: data.satuan,
    isi_per_box: Number(data.isi_per_box) || 1,
    lokasi_rak: data.lokasi_rak || "",
    minimum_stock: Number(data.minimum_stock) || 5,
    stok_saat_ini: 0,
    status_barang: data.status_barang || "Aktif"
  };
  
  SheetService.appendRow("Barang", rowData);
  return idBarang;
}

function updateMasterBarang(idBarang, data) {
  requireRole(['Admin']);
  
  if (!idBarang) throw new Error("ID Barang tidak valid.");
  
  const updatedFields = {
    barcode: data.barcode,
    nama_barang: data.nama_barang,
    kategori: data.kategori,
    merk: data.merk,
    satuan: data.satuan,
    isi_per_box: Number(data.isi_per_box) || 1,
    lokasi_rak: data.lokasi_rak,
    minimum_stock: Number(data.minimum_stock) || 5,
    status_barang: data.status_barang || "Aktif"
  };
  
  SheetService.updateRow("Barang", idBarang, updatedFields);
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
  return true;
}

function updateUser(username, updatedData) {
  requireRole(['Admin']);
  
  if (!username) throw new Error("Username tidak valid.");
  
  SheetService.updateRow("Users", username, {
    password: updatedData.password,
    nama_lengkap: updatedData.nama_lengkap,
    role: updatedData.role,
    status: updatedData.status
  });
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
  requireRole(['Admin']);
  
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
  return newId;
}

function updateSupplier(idSupplier, data) {
  requireRole(['Admin']);
  
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
  requireRole(['Admin']);
  
  if (!data.id_barang || !data.id_supplier || !data.harga_beli) {
    throw new Error("Barang, Supplier, dan Harga Beli wajib diisi.");
  }
  
  const existing = SheetService.readSheet("Barang_Supplier").filter(
    row => row.id_barang === data.id_barang && row.id_supplier === data.id_supplier
  );
  if (existing.length > 0) {
    throw new Error("Relasi Barang dan Supplier ini sudah ada.");
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
  return newId;
}

function updateBarangSupplier(idBarangSupplier, data) {
  requireRole(['Admin']);
  
  if (!idBarangSupplier) throw new Error("ID Barang Supplier tidak valid.");
  
  const updatedFields = {
    harga_beli: Number(data.harga_beli),
    kode_barang_supplier: data.kode_barang_supplier,
    is_utama: data.is_utama ? true : false,
    status: data.status
  };
  
  SheetService.updateRow("Barang_Supplier", idBarangSupplier, updatedFields);
  return true;
}
