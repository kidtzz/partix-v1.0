/**
 * Return.gs
 * Modul untuk pengembalian barang dan tukar tambah (Return)
 */

/**
 * Validasi apakah nomor invoice ada, dan kembalikan detail transaksinya.
 */
function verifikasiInvoice(noInvoice) {
  requireRole(['Admin', 'Kasir']);
  
  const transaksi = SheetService.findRow("Penjualan", "no_invoice", noInvoice);
  if (!transaksi) {
    throw new Error(`Invoice ${noInvoice} tidak ditemukan.`);
  }
  
  const detail = SheetService.findRows("Penjualan_Detail", "no_invoice", noInvoice);
  
  return {
    header: transaksi,
    detail: detail
  };
}

/**
 * Memproses pengembalian barang (Return / Tukar Tambah).
 * 
 * @param {string} noInvoice Nomor invoice asli
 * @param {Array} itemsReturn Array object: { id_barang_direturn, qty_return, id_barang_pengganti, qty_pengganti }
 * @param {string} jenisPenyelesaian "Tukar Barang", "Uang Kembali", dll
 * @param {number} selisihBayar Negatif berarti toko mengembalikan uang, positif berarti pembeli menambah uang
 */
function prosesReturn(noInvoice, itemsReturn, jenisPenyelesaian, selisihBayar) {
  const user = requireRole(['Admin', 'Kasir']);
  const lock = LockService.getScriptLock();
  
  if (!lock.tryLock(15000)) {
    throw new Error("Sistem sedang sibuk memproses transaksi lain. Coba lagi beberapa detik.");
  }
  
  try {
    const tanggal = new Date().toISOString();
    const noReturn = generateNomorReturn();
    
    // 1. Verifikasi Data Asli (Invoice)
    const { header, detail } = verifikasiInvoice(noInvoice);
    if (!header) throw new Error("Invoice tidak valid.");
    
    // 2. Insert ke tabel Return (Header)
    SheetService.appendRow("Return", {
      no_return: noReturn,
      no_invoice: noInvoice,
      tanggal: tanggal,
      kasir: user.email,
      jenis_return: jenisPenyelesaian,
      selisih_harga: selisihBayar,
      status: "Selesai"
    });
    
    // 3. Proses per-item
    const idMovementBase = new Date().getTime();
    
    for (let i = 0; i < itemsReturn.length; i++) {
      const item = itemsReturn[i];
      
      // Validasi Qty Return <= Qty Beli
      const beliDetail = detail.find(d => d.id_barang === item.id_barang_direturn);
      if (!beliDetail || item.qty_return > Number(beliDetail.qty)) {
        throw new Error(`Jumlah return untuk barang ID ${item.id_barang_direturn} melebihi jumlah pembelian asli!`);
      }
      
      // Insert Return_Detail
      SheetService.appendRow("Return_Detail", {
        id_detail: `${noReturn}-${i+1}`,
        no_return: noReturn,
        id_barang_direturn: item.id_barang_direturn,
        qty_return: item.qty_return,
        id_barang_pengganti: item.id_barang_pengganti || "",
        qty_pengganti: item.qty_pengganti || 0
      });
      
      const isCacat = (item.alasan_return === "Cacat Pabrik" || item.alasan_return === "Rusak");
      
      // Stock Movement (Barang kembali ke toko -> RETURN_IN)
      SheetService.appendRow("Stock_Movement", {
        id_movement: `MV-${idMovementBase}-R${i}`,
        tanggal: tanggal,
        id_barang: item.id_barang_direturn,
        id_supplier: "",
        tipe: isCacat ? "RETURN_IN_DEFECT" : "RETURN_IN",
        qty_box: 0,
        qty_pcs: item.qty_return,
        harga_beli: 0,
        no_batch: "",
        referensi: noReturn,
        user: user.email
      });
      
      if (isCacat) {
        // Masukkan ke penampungan barang rusak, tidak menambah stok jual
        SheetService.appendRow("Barang_Return", {
          id_barang_return: `BR-${idMovementBase}-${i}`,
          tanggal_terima: tanggal,
          no_invoice_asal: noInvoice,
          id_barang: item.id_barang_direturn,
          qty_rusak: item.qty_return,
          alasan: item.alasan_return,
          user_penerima: user.email
        });
      } else {
        // Update master stok (Kembalikan stok yang diretur karena masih bagus)
        const bsUtama = SheetService.readSheet("Barang_Supplier").find(bs => bs.id_barang === item.id_barang_direturn && (bs.is_utama == true || bs.is_utama === "TRUE") && bs.status === "Aktif");
        if (bsUtama) {
          SheetService.updateRow("Barang_Supplier", bsUtama.id_barang_supplier, {
            stok_saat_ini: (Number(bsUtama.stok_saat_ini) || 0) + item.qty_return
          });
        } else {
          // Fallback legacy
          const masterLama = SheetService.findRow("Barang", "id_barang", item.id_barang_direturn);
          if (masterLama && masterLama.stok_saat_ini !== undefined) {
            SheetService.updateRow("Barang", item.id_barang_direturn, { 
              stok_saat_ini: Number(masterLama.stok_saat_ini) + item.qty_return 
            });
          }
        }
      }
      
      // Jika ini adalah proses TUKAR BARANG (ada barang pengganti)
      if (item.id_barang_pengganti && item.qty_pengganti > 0) {
        // Stock Movement (Barang baru keluar toko -> OUT)
        SheetService.appendRow("Stock_Movement", {
          id_movement: `MV-${idMovementBase}-O${i}`,
          tanggal: tanggal,
          id_barang: item.id_barang_pengganti,
          id_supplier: "",
          tipe: "OUT",
          qty_box: 0,
          qty_pcs: item.qty_pengganti,
          harga_beli: 0,
          no_batch: "",
          referensi: noReturn,
          user: user.email
        });
        
        // Kurangi stok barang pengganti
        const bsPengganti = SheetService.readSheet("Barang_Supplier").find(bs => bs.id_barang === item.id_barang_pengganti && (bs.is_utama == true || bs.is_utama === "TRUE") && bs.status === "Aktif");
        if (bsPengganti) {
          SheetService.updateRow("Barang_Supplier", bsPengganti.id_barang_supplier, {
            stok_saat_ini: (Number(bsPengganti.stok_saat_ini) || 0) - item.qty_pengganti
          });
        } else {
          // Fallback legacy
          const masterPengganti = SheetService.findRow("Barang", "id_barang", item.id_barang_pengganti);
          if (masterPengganti) {
            SheetService.updateRow("Barang", item.id_barang_pengganti, { 
              stok_saat_ini: Number(masterPengganti.stok_saat_ini) - item.qty_pengganti 
            });
          }
        }
      }
    }
    
    try {
      logActivity("CREATE", "Return", `Transaksi return baru: ${noReturn} (Invoice asal: ${noInvoice})`);
    } catch (e) {}
    
    return { success: true, noReturn: noReturn };
    
  } finally {
    lock.releaseLock();
  }
}

/**
 * Mengambil data lengkap untuk mencetak nota return
 */
function cetakInvoiceReturn(noReturn) {
  const transaksi = SheetService.findRow("Return", "no_return", noReturn);
  if (!transaksi) throw new Error("Nomor Return tidak ditemukan.");
  
  const detail = SheetService.findRows("Return_Detail", "no_return", noReturn);
  
  return {
    header: transaksi,
    detail: detail
  };
}

/**
 * Membuat PDF Struk Retur dalam format Base64 (untuk didownload/dibuka di tab baru)
 */
function generatePDFReturBase64(noReturn) {
  const res = cetakInvoiceReturn(noReturn);
  
  const tanggal = new Date(res.header.tanggal).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  let selisihText = 'Rp 0';
  let selisihColor = '#64748b';
  if (Number(res.header.selisih_harga) < 0) {
      selisihText = '(Refund) Rp ' + Math.abs(res.header.selisih_harga).toLocaleString('id-ID');
      selisihColor = '#ef4444';
  } else if (Number(res.header.selisih_harga) > 0) {
      selisihText = '(Tambah) Rp ' + Number(res.header.selisih_harga).toLocaleString('id-ID');
      selisihColor = '#10b981';
  }

  let html = "<html><head><style>body { font-family: 'Courier New', Courier, monospace; color: #0f172a; margin: 0; padding: 20px; } .container { max-width: 400px; margin: 0 auto; border: 1px dashed #cbd5e1; padding: 20px; border-radius: 12px; } .header { text-align: center; margin-bottom: 20px; border-bottom: 2px dashed #e2e8f0; padding-bottom: 16px; } .header h2 { margin: 0; font-size: 18px; font-weight: 800; } .header p { margin: 4px 0 0 0; font-size: 12px; color: #64748b; } .row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 8px; } .label { color: #64748b; } .value { font-weight: bold; } .items { border-top: 1px dashed #e2e8f0; border-bottom: 1px dashed #e2e8f0; padding: 12px 0; margin-bottom: 16px; } table { width: 100%; font-size: 12px; border-collapse: collapse; } .footer { text-align: center; margin-top: 24px; font-size: 11px; color: #64748b; }</style></head><body><div class='container'><div class='header'><h2>BUKTI RETUR BARANG</h2><p>PARTIX POS & INVENTORY</p></div><div class='row'><span class='label'>No. Retur</span><span class='value'>" + res.header.no_return + "</span></div><div class='row'><span class='label'>No. Invoice Asal</span><span class='value'>" + res.header.no_invoice + "</span></div><div class='row'><span class='label'>Waktu</span><span class='value'>" + tanggal + "</span></div><div class='row' style='margin-bottom: 16px;'><span class='label'>Kasir</span><span class='value'>" + res.header.kasir + "</span></div><div class='items'><div style='font-size: 11px; font-weight: bold; color: #64748b; margin-bottom: 8px;'>BARANG DIRETUR:</div><table>";
  
  res.detail.forEach(d => {
      html += "<tr><td style='padding: 4px 0; font-weight: 600;'>" + d.nama_barang_direturn + "</td><td style='padding: 4px 0; text-align: right; white-space: nowrap;'>" + d.qty_return + "x</td></tr><tr><td colspan='2' style='padding-bottom: 8px; font-size: 11px; color: #ef4444; font-style: italic;'>&#x21B3; Kondisi: " + d.kondisi + " - " + d.alasan + "</td></tr>";
  });

  html += "</table></div><div style='font-size: 12px;'><div class='row'><span class='value'>PENYELESAIAN</span><span class='value' style='color: #2563eb;'>" + res.header.jenis_return + "</span></div><div class='row' style='padding: 8px; background: #f8fafc; border-radius: 6px;'><span class='value'>Total Selisih</span><span class='value' style='font-size: 14px; color: " + selisihColor + ";'>" + selisihText + "</span></div></div><div class='footer'>Terima kasih atas pengertian Anda.<br>Barang yang sudah diretur telah diproses.</div></div></body></html>";

  const blob = Utilities.newBlob(html, MimeType.HTML, "Retur_" + noReturn + ".html").getAs(MimeType.PDF);
  return Utilities.base64Encode(blob.getBytes());
}

/**
 * Mengambil daftar barang yang ada di sheet Barang_Return
 */
function getListBarangReturn() {
  requireRole(['Admin', 'Restocker', 'Kasir']);
  
  const listReturn = SheetService.readSheet("Barang_Return");
  const barangMaster = SheetService.readSheet("Barang");
  
  return listReturn
    .filter(r => Number(r.qty_rusak) > 0)
    .map(r => {
      const brg = barangMaster.find(b => b.id_barang === r.id_barang);
      return {
        ...r,
        nama_barang: brg ? brg.nama_barang : r.id_barang
      };
    });
}

/**
 * Mengambil daftar history retur dari customer ke toko
 */
function getDaftarReturLengkap() {
  requireRole(['Admin', 'Kasir']);
  
  const returns = SheetService.readSheet("Return");
  // Sort from newest to oldest
  returns.sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());
  
  return returns;
}

/**
 * Mengambil histori retur ke supplier
 */
function getHistoriReturSupplier() {
  requireRole(['Admin', 'Restocker', 'Kasir']);
  
  const history = SheetService.readSheet("Return_Supplier");
  const barangMaster = SheetService.readSheet("Barang");
  const supplierMaster = SheetService.readSheet("Supplier");
  
  const result = history.map(h => {
    const brg = barangMaster.find(b => b.id_barang === h.id_barang);
    const sup = supplierMaster.find(s => s.id_supplier === h.id_supplier);
    return {
      ...h,
      nama_barang: brg ? brg.nama_barang : h.id_barang,
      nama_supplier: sup ? sup.nama_supplier : h.id_supplier
    };
  });
  
  return result.sort((a, b) => new Date(b.tanggal_retur).getTime() - new Date(a.tanggal_retur).getTime());
}

/**
 * Memproses barang karantina untuk dikembalikan ke supplier
 */
function prosesReturSupplier(payload) {
  requireRole(['Admin', 'Restocker']);
  
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  
  try {
    const { id_barang_return, id_supplier, qty_retur, harga_beli, no_invoice_supplier } = payload;
    
    // 1. Validasi qty
    const brData = SheetService.findRow("Barang_Return", "id_barang_return", id_barang_return);
    if (!brData) throw new Error("Data barang karantina tidak ditemukan!");
    
    if (Number(qty_retur) > Number(brData.qty_rusak)) {
      throw new Error("Kuantitas retur melebihi sisa barang rusak di gudang!");
    }
    
    // 2. Generate ID 
    const timestamp = new Date().getTime();
    const idReturSupplier = `RTS-${timestamp}`;
    const tanggal = new Date().toISOString();
    
    // 3. Masukkan ke tabel Return_Supplier
    SheetService.appendRow("Return_Supplier", {
      id_return_supplier: idReturSupplier,
      tanggal_retur: tanggal,
      id_barang: brData.id_barang,
      id_supplier: id_supplier,
      qty_retur: qty_retur,
      harga_beli: harga_beli,
      no_invoice_supplier: no_invoice_supplier,
      user: payload.user || "Admin"
    });
    
    // 4. Kurangi qty_rusak di tabel Barang_Return
    SheetService.updateRow("Barang_Return", id_barang_return, {
      qty_rusak: Number(brData.qty_rusak) - Number(qty_retur)
    });
    
    // 5. Catat di Stock_Movement (Pergerakan Barang Rusak Keluar dari Gudang)
    SheetService.appendRow("Stock_Movement", {
      id_movement: `MV-${timestamp}-RTS`,
      tanggal: tanggal,
      id_barang: brData.id_barang,
      id_supplier: id_supplier,
      tipe_pergerakan: "OUT_RETURN_SUPPLIER",
      qty_box: 0,
      qty_pcs: qty_retur,
      harga_beli: harga_beli,
      nomor_invoice_supplier: no_invoice_supplier,
      batch_barang: "-",
      alasan_perubahan: `Retur ke Supplier (Asal Invoice Customer: ${brData.no_invoice_asal})`,
      user: payload.user || "Admin"
    });
    
    try {
      logActivity("CREATE", "Return_Supplier", `Retur barang ${brData.id_barang} ke Supplier ${id_supplier} sejumlah ${qty_retur} pcs`);
    } catch (e) {}
    
    return { success: true, id_return_supplier: idReturSupplier };
    
  } finally {
    lock.releaseLock();
  }
}
