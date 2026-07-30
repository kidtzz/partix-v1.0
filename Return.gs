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
      no_invoice_asal: noInvoice,
      tanggal: tanggal,
      kasir: user.email,
      jenis_penyelesaian: jenisPenyelesaian,
      selisih_bayar: selisihBayar,
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
        const masterPengganti = SheetService.findRow("Barang", "id_barang", item.id_barang_pengganti);
        if (masterPengganti) {
          SheetService.updateRow("Barang", item.id_barang_pengganti, { 
            stok_saat_ini: Number(masterPengganti.stok_saat_ini) - item.qty_pengganti 
          });
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
 * Mengambil daftar barang yang ada di sheet Barang_Return
 */
function getListBarangReturn() {
  requireRole(['Admin', 'Restocker', 'Kasir']);
  
  const listReturn = SheetService.readSheet("Barang_Return");
  const barangMaster = SheetService.readSheet("Barang");
  
  return listReturn.map(r => {
    const brg = barangMaster.find(b => b.id_barang === r.id_barang);
    return {
      ...r,
      nama_barang: brg ? brg.nama_barang : r.id_barang
    };
  });
}
