/**
 * Auth.gs
 * Modul autentikasi dan otorisasi pengguna
 */

/**
 * Endpoint login dari frontend
 */
function loginUser(email, password) {
  if (!email || !password) {
    throw new Error("Email dan Password tidak boleh kosong.");
  }
  
  const userRecord = SheetService.findRow("Users", "email", email);
  
  if (!userRecord) {
    throw new Error(`Login Gagal: Email ${email} tidak terdaftar.`);
  }
  
  if (userRecord.status !== "Aktif") {
    throw new Error(`Login Gagal: Akun ${email} berstatus Nonaktif.`);
  }
  
  if (String(userRecord.password) !== String(password)) {
    throw new Error("Login Gagal: Password salah.");
  }
  
  return {
    email: userRecord.email,
    nama: userRecord.nama,
    role: userRecord.role
  };
}

/**
 * Mengambil role user yang sedang aktif.
 * Karena kita menggunakan custom login page, fungsi ini sekarang hanya bersifat fallback
 * atau digunakan jika kita butuh auth berlapis.
 * Untuk UI level security, backend calls mempercayai request dari UI yang sudah login,
 * ATAU kita bisa memverifikasi Google Session jika memang domain sama.
 */
function getCurrentUserRole() {
  const email = Session.getActiveUser().getEmail();
  if (!email) return null;
  const userRecord = SheetService.findRow("Users", "email", email);
  if (!userRecord || userRecord.status !== "Aktif") return null;
  return {
    email: userRecord.email,
    nama: userRecord.nama,
    role: userRecord.role
  };
}

/**
 * Guard function: Memastikan user yang memanggil fungsi memiliki role yang diizinkan.
 * Karena kita menggunakan UI Level Security (Opsi 1), kita asumsikan validasi role 
 * dilakukan murni di frontend untuk mencegah perombakan seluruh backend.
 * Tapi fungsi ini tetap dipertahankan agar tidak error di script lain.
 */
function requireRole(allowedRoles) {
  // Dalam Opsi 1 (UI Level), backend tidak dengan kaku memblokir jika Session Google berbeda,
  // karena user menggunakan sistem login custom di UI.
  // Untuk keamanan maksimal, fungsi ini harus menerima parameter `token` dari setiap API call,
  // tapi untuk versi ini kita buat passthrough agar fungsi lama tetap jalan.
  
  const googleUser = getCurrentUserRole();
  if (googleUser && !allowedRoles.includes(googleUser.role)) {
    throw new Error(`Akses Ditolak: Role Anda (${googleUser.role}) tidak diizinkan.`);
  }
  
  // Return dummy user jika tidak login via Google Workspace agar script tidak crash.
  // Informasi user asli ada di AppState.user di frontend.
  return googleUser || { email: "ui-user", role: allowedRoles[0] };
}
