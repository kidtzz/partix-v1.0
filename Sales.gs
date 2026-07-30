/**
 * Sales.gs
 * Modul untuk POS dan Transaksi Penjualan
 */

function getBarangUntukPOS() {
  requireRole(['Admin', 'Kasir']);
  const barangList = SheetService.readSheet("Barang");
  const hargaList = SheetService.readSheet("Harga");
  const diskon = getPengaturanDiskon();
  
  // Ambil hanya harga yang aktif
  const hargaAktif = hargaList.filter(h => h.status_harga === "Aktif");
  const bsList = SheetService.readSheet("Barang_Supplier").filter(bs => bs.status === "Aktif");
  
  return barangList
    .filter(b => b.status_barang === "Aktif" && bsList.some(bs => bs.id_barang === b.id_barang))
    .map(b => {
    // Stok diakumulasi dari semua supplier aktif
    const allSuppliers = bsList.filter(bs => bs.id_barang === b.id_barang);
    const stok = allSuppliers.reduce((sum, bs) => sum + (Number(bs.stok_saat_ini) || 0), 0);

    // Harga modal dari supplier tertinggi
    const supplierPrices = bsList.filter(bs => bs.id_barang === b.id_barang).map(bs => Number(bs.harga_beli));
    const maxHargaBeli = supplierPrices.length > 0 ? Math.max(...supplierPrices) : 0;

    const h = hargaAktif.find(h => h.id_barang === b.id_barang);
    const regPrice = h ? Number(h.harga_regular) : 0;

    let mappedHarga = {
      "Regular": regPrice,
      "Member": Math.floor((regPrice * (1 - (diskon.DISKON_MEMBER / 100))) / 100) * 100,
      "Langganan": Math.floor((regPrice * (1 - (diskon.DISKON_LANGGANAN / 100))) / 100) * 100,
      "Bengkel": Math.floor((regPrice * (1 - (diskon.DISKON_BENGKEL / 100))) / 100) * 100,
      "Teman": Math.floor((regPrice * (1 - (diskon.DISKON_TEMAN / 100))) / 100) * 100,
      "Grosir": Math.floor((regPrice * (1 - (diskon.DISKON_GROSIR / 100))) / 100) * 100
    };
    mappedHarga["Bengkel / Reseller"] = mappedHarga["Bengkel"];
    mappedHarga["Teman / Kenalan"] = mappedHarga["Teman"];
    mappedHarga["Grosir / VIP"] = mappedHarga["Grosir"];
    
    return {
      id_barang: b.id_barang,
      nama_barang: b.nama_barang,
      stok_saat_ini: stok,
      barcode1: b.barcode1,
      barcode2: b.barcode2,
      harga_modal: maxHargaBeli,
      harga: mappedHarga
    };
  });
}

function scanBarcodePenjualan(barcode) {
  requireRole(['Admin', 'Kasir']);
  if (!barcode) throw new Error("Kata kunci tidak boleh kosong.");
  
  const query = barcode.toLowerCase().trim();
  const barangList = SheetService.readSheet("Barang");
  
  const barang = barangList.find(b => {
    if (b.nama_barang && b.nama_barang.toLowerCase().includes(query)) return true;
    if (b.id_barang && b.id_barang.toLowerCase() === query) return true;
    const bc1 = String(b.barcode1 || '').trim().toLowerCase();
    const bc2 = String(b.barcode2 || '').trim().toLowerCase();
    const legacy = String(b.barcode || '').split(',').map(s => s.trim().toLowerCase());
    return bc1 === query || bc2 === query || legacy.includes(query);
  });
  
  if (!barang) throw new Error("Barang tidak ditemukan!");
  if (barang.status_barang !== "Aktif") throw new Error("Barang berstatus Nonaktif.");
  
  // Stok diakumulasi dari semua relasi Barang_Supplier yang aktif
  const bsList = SheetService.readSheet("Barang_Supplier").filter(bs => bs.status === "Aktif" && bs.id_barang === barang.id_barang);
    
  if (bsList.length === 0) throw new Error("Barang belum terdaftar di stok!");
  
  const stok = bsList.reduce((sum, bs) => sum + (Number(bs.stok_saat_ini) || 0), 0);

  const h = SheetService.readSheet("Harga").find(h => h.id_barang === barang.id_barang && h.status_harga === "Aktif");
  const diskon = getPengaturanDiskon();
  const regPrice = h ? Number(h.harga_regular) : 0;
                 
  let mappedHarga = {
    "Regular": regPrice,
    "Member": Math.floor((regPrice * (1 - (diskon.DISKON_MEMBER / 100))) / 100) * 100,
    "Langganan": Math.floor((regPrice * (1 - (diskon.DISKON_LANGGANAN / 100))) / 100) * 100,
    "Bengkel": Math.floor((regPrice * (1 - (diskon.DISKON_BENGKEL / 100))) / 100) * 100,
    "Teman": Math.floor((regPrice * (1 - (diskon.DISKON_TEMAN / 100))) / 100) * 100,
    "Grosir": Math.floor((regPrice * (1 - (diskon.DISKON_GROSIR / 100))) / 100) * 100
  };
  mappedHarga["Bengkel / Reseller"] = mappedHarga["Bengkel"];
  mappedHarga["Teman / Kenalan"] = mappedHarga["Teman"];
  mappedHarga["Grosir / VIP"] = mappedHarga["Grosir"];
  
  return {
    id_barang: barang.id_barang,
    nama_barang: barang.nama_barang,
    stok_saat_ini: stok,
    barcode: barang.barcode,
    harga: mappedHarga
  };
}

function hitungTotalTransaksi(cartItems, tipeHarga) {
  return cartItems.reduce((total, item) => {
    const hargaSatuan = Number(item.harga[tipeHarga]) || 0;
    return total + (hargaSatuan * item.qty);
  }, 0);
}

function simpanTransaksi(cartItems, tipeHarga, metodeBayar, detailBayar, uangDiterima, status, existingInvoiceNo, potonganPenjualan) {
  const userRole = requireRole(['Admin', 'Kasir']);
  const username = typeof userRole === 'string' ? userRole : (Session.getActiveUser().getEmail() || "kasir");
  const lock = LockService.getScriptLock();
  
  if (!lock.tryLock(15000)) throw new Error("Sistem POS sibuk. Kasir lain sedang memproses transaksi. Coba lagi.");
  
  try {
    const finalStatus = status || "Selesai";
    
    if (existingInvoiceNo) {
      _voidTransaksiInternal(existingInvoiceNo, false); 
    }
    
    const tanggal = new Date().toISOString();
    let subtotal = 0;
    
    const masterBarang = SheetService.readSheet("Barang");
    const bsListAll = SheetService.readSheet("Barang_Supplier");
    const stockUpdates = [];
    
    for (let i = 0; i < cartItems.length; i++) {
      const item = cartItems[i];
      const barang = masterBarang.find(b => b.id_barang === item.id_barang);
      
      if (!barang) throw new Error(`Barang ${item.id_barang} tidak valid.`);
      
      // Validasi total stok dari semua relasi aktif
      const relasi = bsListAll.filter(bs => bs.id_barang === item.id_barang && bs.status === "Aktif");
      const stokSaatIni = relasi.reduce((sum, bs) => sum + (Number(bs.stok_saat_ini) || 0), 0);
      
      if (finalStatus === "Selesai" && stokSaatIni < item.qty) {
        throw new Error(`Stok ${barang.nama_barang} tidak mencukupi! (Sisa: ${stokSaatIni})`);
      }
      
      const hargaSatuan = Number(item.harga[tipeHarga]) || 0;
      subtotal += (hargaSatuan * item.qty);
      
      if (finalStatus === "Selesai") {
        let sisaDeduct = item.qty;
        for (let j = 0; j < relasi.length; j++) {
           if (sisaDeduct <= 0) break;
           const sbs = relasi[j];
           let stokBs = Number(sbs.stok_saat_ini) || 0;
           if (stokBs > 0) {
             let potong = Math.min(stokBs, sisaDeduct);
             stockUpdates.push({
               id_barang_supplier: sbs.id_barang_supplier,
               id_barang: item.id_barang,
               stokBaru: stokBs - potong
             });
             sisaDeduct -= potong;
           }
        }
      }
    }
    
    const potongan = Number(potonganPenjualan) || 0;
    const total = Math.max(0, subtotal - potongan);
    let kembalian = 0;
    if (finalStatus === "Selesai" && metodeBayar === "Cash") {
      kembalian = uangDiterima - total;
      if (kembalian < 0) throw new Error("Uang yang diterima kurang dari total tagihan!");
    }
    
    const noInvoice = generateNomorInvoice();
    
    SheetService.appendRow("Penjualan", {
      no_invoice: noInvoice,
      tanggal: tanggal,
      kasir: username,
      kategori_customer: tipeHarga,
      subtotal: subtotal,
      potongan_penjualan: potongan,
      total: total,
      metode_pembayaran: metodeBayar || "",
      detail_pembayaran: JSON.stringify(detailBayar || {}),
      kembalian: kembalian,
      status_transaksi: finalStatus
    });
    
    const idMovementBase = new Date().getTime();
    
    for (let i = 0; i < cartItems.length; i++) {
      const item = cartItems[i];
      const hargaSatuan = Number(item.harga[tipeHarga]) || 0;
      const subtotalItem = hargaSatuan * item.qty;
      
      SheetService.appendRow("Penjualan_Detail", {
        id_detail: `${noInvoice}-${i+1}`,
        no_invoice: noInvoice,
        id_barang: item.id_barang,
        nama_barang: item.nama_barang,
        qty: item.qty,
        harga_satuan: hargaSatuan,
        subtotal: subtotalItem
      });
      
      if (finalStatus === "Selesai") {
        SheetService.appendRow("Stock_Movement", {
          id_movement: `MV-${idMovementBase}-${i}`,
          tanggal: tanggal,
          id_barang: item.id_barang,
          id_supplier: "",
          tipe_pergerakan: "OUT",
          qty_box: 0,
          qty_pcs: item.qty,
          harga_beli: 0,
          nomor_invoice_supplier: "",
          batch_barang: "",
          alasan_perubahan: "Penjualan POS",
          user: username
        });
        
        // Deduct stok dari Barang_Supplier (secara berantai)
        const updatesForItem = stockUpdates.filter(su => su.id_barang === item.id_barang);
        updatesForItem.forEach(su => {
          SheetService.updateRow("Barang_Supplier", su.id_barang_supplier, { stok_saat_ini: su.stokBaru });
        });
      }
    }
    
    try {
      logActivity("CREATE", "Penjualan", `Transaksi penjualan baru: ${noInvoice} (Total: Rp ${total})`);
    } catch (e) {}
    
    return { success: true, noInvoice: noInvoice, kembalian: kembalian, status: finalStatus };
    
  } finally {
    lock.releaseLock();
  }
}

function cetakInvoice(noInvoice) {
  requireRole(['Admin', 'Kasir']);
  const transaksi = SheetService.findRow("Penjualan", "no_invoice", noInvoice);
  if (!transaksi) throw new Error("Invoice tidak ditemukan.");
  
  const detail = SheetService.findRows("Penjualan_Detail", "no_invoice", noInvoice);
  
  return { header: transaksi, detail: detail };
}

function resumeTransaksi(noInvoice) {
  requireRole(['Admin', 'Kasir']);
  const tx = SheetService.findRow("Penjualan", "no_invoice", noInvoice);
  if (!tx) throw new Error("Invoice tidak ditemukan.");
  if (tx.status_transaksi !== "Hold") throw new Error("Hanya transaksi berstatus Hold yang bisa di-resume.");
  
  const detail = SheetService.findRows("Penjualan_Detail", "no_invoice", noInvoice);
  return { header: tx, detail: detail };
}

function voidTransaksi(noInvoice) {
  return _voidTransaksiInternal(noInvoice, true);
}

function _voidTransaksiInternal(noInvoice, requireAdminCheck) {
  if (requireAdminCheck) requireRole(['Admin']);
  else requireRole(['Admin', 'Kasir']);
  
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("Sistem sibuk memproses antrean lain.");
  
  try {
    const tx = SheetService.findRow("Penjualan", "no_invoice", noInvoice);
    if (!tx) throw new Error("Invoice tidak ditemukan.");
    if (tx.status_transaksi === "Void") throw new Error("Transaksi sudah berstatus Void.");
    
    if (tx.status_transaksi === "Selesai") {
      if (!requireAdminCheck) {
        throw new Error("Kasir tidak memiliki izin untuk membatalkan transaksi yang sudah Selesai.");
      }
      
      const details = SheetService.findRows("Penjualan_Detail", "no_invoice", noInvoice);
      const masterBarang = SheetService.readSheet("Barang");
      const bsListAll = SheetService.readSheet("Barang_Supplier");
      
      const tanggal = new Date().toISOString();
      const idMovementBase = new Date().getTime();
      const username = Session.getActiveUser().getEmail() || "admin";
      
      details.forEach((item, index) => {
        const barang = masterBarang.find(b => b.id_barang === item.id_barang);
        if (barang) {
          // Restore stok ke Barang_Supplier (is_utama=true)
          const utama = bsListAll.find(bs => bs.id_barang === item.id_barang &&
            (bs.is_utama == true || bs.is_utama === "TRUE") && bs.status === "Aktif");
          
          if (utama) {
            const stokBaru = (Number(utama.stok_saat_ini) || 0) + Number(item.qty);
            SheetService.updateRow("Barang_Supplier", utama.id_barang_supplier, { stok_saat_ini: stokBaru });
          }
          
          SheetService.appendRow("Stock_Movement", {
            id_movement: `MV-${idMovementBase}-${index}`,
            tanggal: tanggal,
            id_barang: item.id_barang,
            id_supplier: "",
            tipe_pergerakan: "ADJ_IN",
            qty_box: 0,
            qty_pcs: item.qty,
            harga_beli: 0,
            nomor_invoice_supplier: "",
            batch_barang: "",
            alasan_perubahan: "Pembatalan Transaksi Penjualan",
            user: username
          });
        }
      });
    }
    
    SheetService.updateRow("Penjualan", noInvoice, { status_transaksi: "Void" });
    
    try {
      logActivity("UPDATE", "Penjualan", `Void transaksi penjualan: ${noInvoice}`);
    } catch (e) {}
    
    return true;
  } finally {
    lock.releaseLock();
  }
}

function cariTransaksi(filterQuery) {
  requireRole(['Admin', 'Kasir']); 
  const allTransaksi = SheetService.readSheet("Penjualan");
  
  if (!filterQuery) return allTransaksi;
  
  const query = filterQuery.toLowerCase().trim();
  const allDetails = SheetService.readSheet("Penjualan_Detail");
  const masterBarang = SheetService.readSheet("Barang");
  
  return allTransaksi.filter(t => {
    if (t.no_invoice.toLowerCase().includes(query)) return true;
    if (t.kasir.toLowerCase().includes(query)) return true;
    if (t.tanggal.includes(query)) return true; 
    
    const details = allDetails.filter(d => d.no_invoice === t.no_invoice);
    for (let d of details) {
      if (d.nama_barang.toLowerCase().includes(query)) return true;
      const b = masterBarang.find(mb => mb.id_barang === d.id_barang);
      if (b && b.barcode) {
        const barcodes = b.barcode.split(',').map(str => str.trim().toLowerCase());
        if (barcodes.some(bc => bc.includes(query))) return true;
      }
    }
    return false;
  });
}

function getDaftarTransaksi() {
  requireRole(['Admin', 'Kasir']);
  const penjualan = SheetService.readSheet("Penjualan");
  return penjualan.sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
}
