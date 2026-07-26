/**
 * Sales.gs
 * Modul untuk POS dan Transaksi Penjualan
 */

function getBarangUntukPOS() {
  requireRole(['Admin', 'Kasir']);
  const barangList = SheetService.readSheet("Barang");
  const hargaList = SheetService.readSheet("Harga");
  
  // Ambil hanya harga yang aktif
  const hargaAktif = hargaList.filter(h => h.status_harga === "Aktif");
  
  return barangList.filter(b => b.status_barang === "Aktif").map(b => {
    // Harga sekarang satu baris per barang
    const h = hargaAktif.find(h => h.id_barang === b.id_barang);
    let mappedHarga = {
      "Regular": h ? Number(h.harga_regular) : 0,
      "Langganan": h ? Number(h.harga_langganan) : 0,
      "Teman": h ? Number(h.harga_teman) : 0
    };
    
    return {
      id_barang: b.id_barang,
      nama_barang: b.nama_barang,
      stok_saat_ini: Number(b.stok_saat_ini),
      barcode: b.barcode,
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
    if (b.barcode) {
      const barcodes = b.barcode.split(',').map(str => str.trim().toLowerCase());
      if (barcodes.includes(query)) return true;
    }
    return false;
  });
  
  if (!barang) throw new Error("Barang tidak ditemukan!");
  if (barang.status_barang !== "Aktif") throw new Error("Barang berstatus Nonaktif.");
  
  const h = SheetService.readSheet("Harga").find(h => h.id_barang === barang.id_barang && h.status_harga === "Aktif");
                 
  let mappedHarga = {
    "Regular": h ? Number(h.harga_regular) : 0,
    "Langganan": h ? Number(h.harga_langganan) : 0,
    "Teman": h ? Number(h.harga_teman) : 0
  };
  
  return {
    id_barang: barang.id_barang,
    nama_barang: barang.nama_barang,
    stok_saat_ini: Number(barang.stok_saat_ini),
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

function simpanTransaksi(cartItems, tipeHarga, metodeBayar, detailBayar, uangDiterima, status, existingInvoiceNo) {
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
    const stockUpdates = [];
    
    for (let i = 0; i < cartItems.length; i++) {
      const item = cartItems[i];
      const barang = masterBarang.find(b => b.id_barang === item.id_barang);
      
      if (!barang) throw new Error(`Barang ${item.id_barang} tidak valid.`);
      
      const stokSaatIni = Number(barang.stok_saat_ini) || 0;
      if (finalStatus === "Selesai" && stokSaatIni < item.qty) {
        throw new Error(`Stok ${barang.nama_barang} tidak mencukupi! (Sisa: ${stokSaatIni})`);
      }
      
      const hargaSatuan = Number(item.harga[tipeHarga]) || 0;
      subtotal += (hargaSatuan * item.qty);
      
      if (finalStatus === "Selesai") {
        stockUpdates.push({
          id: item.id_barang,
          stokBaru: stokSaatIni - item.qty
        });
      }
    }
    
    const total = subtotal;
    let kembalian = 0;
    if (finalStatus === "Selesai" && metodeBayar === "Cash") {
      kembalian = uangDiterima - total;
      if (kembalian < 0) throw new Error("Uang yang diterima kurang dari total belanja!");
    }
    
    const noInvoice = generateNomorInvoice();
    
    SheetService.appendRow("Penjualan", {
      no_invoice: noInvoice,
      tanggal: tanggal,
      kasir: username,
      kategori_customer: tipeHarga,
      subtotal: subtotal,
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
        
        SheetService.updateRow("Barang", item.id_barang, { stok_saat_ini: stockUpdates[i].stokBaru });
      }
    }
    
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
      
      const tanggal = new Date().toISOString();
      const idMovementBase = new Date().getTime();
      const username = Session.getActiveUser().getEmail() || "admin";
      
      details.forEach((item, index) => {
        const barang = masterBarang.find(b => b.id_barang === item.id_barang);
        if (barang) {
          const stokBaru = (Number(barang.stok_saat_ini) || 0) + Number(item.qty);
          SheetService.updateRow("Barang", barang.id_barang, { stok_saat_ini: stokBaru });
          
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
