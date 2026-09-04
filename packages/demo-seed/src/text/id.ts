/** The demo learner in Bahasa Indonesia. */
import type { DemoText } from "./demoText";

export const DEMO_TEXT_ID: DemoText = {
  concepts: {
    "astro-root": ["Astronomi pengamatan", "Bagaimana langit diukur, dan dengan apa."],
    "stellar-spectra": [
      "Kelas spektrum bintang",
      "Memilah bintang lewat garis-garis pada cahayanya.",
    ],
    "js-root": [
      "Cara JavaScript menjalankan kodemu",
      "Aturan mesin dalam menyusun urutan eksekusi.",
    ],
    parallax: ["Jarak lewat paralaks", "Mengukur jarak bintang dari orbit Bumi sendiri."],
    closures: ["Closure dan rantai lingkup", "Fungsi menyimpan variabel tempat ia lahir."],
    transits: [
      "Transit eksoplanet",
      "Planet yang melintas di depan bintangnya sedikit meredupkan cahaya.",
    ],
    "event-loop": ["Event loop dan microtask", "Apa yang jalan berikutnya, dan dalam urutan apa."],
    "promise-chains": [
      "Merangkai promise",
      "Menyambung langkah asinkron satu per satu dengan then.",
    ],
    "event-horizon": ["Cakrawala peristiwa", "Batas yang bahkan cahaya tak bisa keluar darinya."],
    "async-await": ["async/await", "Menulis kerja asinkron seolah-olah berurutan."],
    "tidal-locking": [
      "Penguncian pasang surut",
      "Sekali berputar tiap orbit, jadi sisi yang sama selalu menghadap.",
    ],
    "prototype-chain": [
      "Pewarisan lewat prototipe",
      "Objek menelusuri rantai ke atas mencari properti.",
    ],
    "kepler-laws": ["Hukum Kepler", "Bentuk orbit dan lamanya, terikat satu sama lain."],
    destructuring: ["Destrukturisasi", "Mengambil nilai sesuai bentuk penyimpanannya."],
    "magnitude-scale": ["Skala magnitudo", "Penggaris logaritmik untuk terang yang terlihat."],
    "array-higher-order": ["Metode larik orde tinggi", "Metode larik yang menerima sebuah fungsi."],
    "gravitational-lensing": [
      "Lensa gravitasi",
      "Massa membelokkan cahaya yang lewat di belakangnya.",
    ],
    "debounce-throttle": [
      "Debounce dan throttle",
      "Dua cara menahan peristiwa yang terlalu sering terpicu.",
    ],
    "white-dwarf": ["Katai putih", "Sisa yang padat dari bintang yang kehabisan bahan bakar."],
    "es-modules": ["Modul ES", "Menata apa bergantung pada apa lewat import dan export."],
    "neutron-star": [
      "Bintang neutron",
      "Yang ditinggalkan supernova, dimampatkan luar biasa rapat.",
    ],
    "recursion-call-stack": [
      "Rekursi dan tumpukan panggilan",
      "Fungsi memanggil dirinya sendiri, bingkai demi bingkai.",
    ],
    cmb: ["Latar gelombang mikro kosmik", "Cahaya merata yang tersisa dari Dentuman Besar."],
    "regex-capture-groups": ["Grup tangkapan", "Tanda kurung yang menyimpan bagian yang cocok."],
    "array-map": ["map", "Mengubah tiap unsur jadi unsur baru, jumlahnya tetap."],
    "array-filter": ["filter", "Menyisakan unsur yang lolos sebuah uji."],
    "array-reduce": ["reduce", "Melipat seluruh larik menjadi satu nilai."],
    "method-chaining": ["Perangkaian", "map lalu filter — data mengalir di satu jalur."],
    "sparse-arrays": [
      "Jebakan larik berlubang",
      "map melewati lubangnya, dan hasilnya mengejutkan.",
    ],
    "predicate-functions": [
      "Fungsi predikat",
      "Fungsi yang menjawab ya atau tidak — jantungnya filter.",
    ],
    truthiness: [
      "Nilai benar dan salah",
      "Apa yang dianggap benar oleh JavaScript, dan apa yang salah.",
    ],
    "accumulator-pattern": [
      "Akumulator",
      "Mengumpulkan hasil dalam satu nilai yang terus diperbarui.",
    ],
    "reduce-initial-value": [
      "Memilih nilai awal",
      "Argumen kedua reduce menentukan putaran pertama.",
    ],
    "map-via-reduce": [
      "map yang ditulis dengan reduce",
      "Menulis map memakai reduce untuk melihat sejauh mana reduce sampai.",
    ],
    "group-by": [
      "Mengelompokkan dengan groupBy",
      "Membagi unsur ke kelompok berdasarkan sebuah kunci.",
    ],
    "object-accumulator": [
      "Menumpuk ke dalam objek",
      "Cara menulis penggabungan saat akumulatornya objek.",
    ],
    "lazy-evaluation-tradeoff": [
      "Ongkos perangkaian",
      "Enak dibaca, dan tiap langkah membuat larik antara.",
    ],
    "composing-predicates": [
      "Menggabung predikat",
      "Menyatukan beberapa uji jadi satu dengan dan, atau.",
    ],
    "map-or-object": ["Map atau objek biasa", "Wadah mana untuk mengelompokkan."],
  },
  titles: {
    astro: "[Contoh] Menyusuri langit",
    js: "[Contoh] JS, sekali lagi",
    teach: "Menjelaskan balik · closure dan rantai lingkup",
    vocab: "[Contoh] Menengok kosakata",
  },
  astroMessages: [
    "Pagi ini lihat foto gugus galaksi dan cahayanya tampak membengkok. Itu apa?",
    "Itu lensa gravitasi: gravitasi benda bermassa besar membelokkan jalur cahaya yang datang dari belakangnya, jadi galaksi latar terlihat memanjang, atau muncul beberapa kali.",
    "Bisa kusatukan dengan kelas spektrum bintang yang dulu kita bahas?",
    "Bisa, asal tidak tercampur: kelas spektrum bicara tentang susunan cahaya bintang itu sendiri dan suhunya, lensa bicara tentang cahaya yang dibelokkan massa yang dilewatinya. Fisikanya beda, alatnya sama.",
    "Kalau hukum Kepler dan jarak lewat paralaks? Hari ini aku mau menengok lagi bentuk astronomi pengamatan.",
    "Hukum Kepler mengikat bentuk orbit dengan lamanya, paralaks mengukur jarak bintang dari orbit Bumi sendiri. Keduanya cara menempatkan sesuatu, dan itulah pekerjaan astronomi pengamatan.",
  ],
  jsMessages: [
    "Ketemu event loop lagi waktu menulis kode, favoritnya wawancara kerja. Aku mau memantapkan cara JavaScript menjalankan kodeku.",
    "Di dalamnya, event loop yang menentukan urutan antara kode biasamu, microtask dan macrotask. Semua yang asinkron jadi masuk akal begitu urutan itu masuk akal.",
    "Closure ada hubungannya?",
    "Itu dua gagasan berbeda, tapi closure-lah yang membuat fungsi yang baru jalan belakangan masih punya nilai yang dibutuhkannya, jadi keduanya sering muncul bersama di kode.",
  ],
  teachMessages: [
    "Aku coba jelaskan closure: sebuah fungsi mengingat lingkup tempat ia ditulis, jadi meski fungsi luarnya sudah selesai, fungsi di dalamnya masih bisa membaca variabel-variabel itu. Begitulah data disimpan secara pribadi, misalnya sebuah pencacah.",
    "Penjelasannya tepat, dan bagian yang penting sudah kamu pegang: lingkup tempat ia didefinisikan tetap tersimpan. Pencacah pribadi memang contoh yang pas.",
  ],
  vocabMessages: [
    "Minggu ini kosakataku bertambah cepat. Itu kelihatan di mana?",
    "Dari tebakan belakangan ini, makin banyak kata yang kembali benar. Bertemu beberapa kata tiap hari sudah cukup untuk menjaganya.",
    "Beberapa masih membuatku berhenti sejenak waktu melihatnya.",
    "Jeda sedetik itu berarti katanya sedang mengendap, bukan berarti tidak melekat. Seiring jaraknya melebar, jeda itu memendek dengan sendirinya.",
  ],
  wordContexts: [
    "Kata «{word}» muncul dalam percakapan.",
    "«{word}» ada di bagian ini.",
    "Kartu ulangan bertuliskan «{word}».",
  ],
};
