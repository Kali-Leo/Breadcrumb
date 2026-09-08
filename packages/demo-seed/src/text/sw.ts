/** The demo learner in Kiswahili. */
import type { DemoText } from "./demoText";

export const DEMO_TEXT_SW: DemoText = {
  concepts: {
    "astro-root": ["Unajimu wa uchunguzi", "Jinsi anga hupimwa, na kwa vifaa gani."],
    "stellar-spectra": [
      "Madaraja ya mwonekano wa nyota",
      "Kupanga nyota kwa mistari iliyo kwenye mwanga wao.",
    ],
    "js-root": [
      "Jinsi JavaScript inavyoendesha msimbo",
      "Kanuni ambazo injini hupanga utekelezaji kwazo.",
    ],
    parallax: ["Umbali kwa paralaksi", "Kupima umbali wa nyota kutoka mzunguko wa Dunia yenyewe."],
    closures: ["Closure na mnyororo wa mawanda", "Kazi huhifadhi vigezo vya mahali ilipozaliwa."],
    transits: [
      "Kupita kwa sayari za nje",
      "Sayari inapopita mbele ya nyota yake mwanga hupungua kidogo.",
    ],
    "event-loop": [
      "Kitanzi cha matukio na kazi ndogo",
      "Nini kitaendeshwa baadaye, na kwa mpangilio upi.",
    ],
    "promise-chains": [
      "Kuunganisha promise",
      "Kufunga hatua zisizo sambamba moja baada ya nyingine kwa then.",
    ],
    "event-horizon": ["Upeo wa tukio", "Mpaka ambao hata mwanga haurudi kutoka humo."],
    "async-await": ["async/await", "Kuandika kazi isiyo sambamba kana kwamba ni ya mfululizo."],
    "tidal-locking": [
      "Kufungwa kwa mawimbi",
      "Mzunguko mmoja kwa kila mzingo, hivyo uso uleule hubaki mbele.",
    ],
    "prototype-chain": ["Urithi wa prototype", "Kitu hupanda mnyororo kutafuta sifa."],
    "kepler-laws": ["Sheria za Kepler", "Umbo la mzingo na muda wake, vimefungamana."],
    destructuring: ["Kufumua muundo", "Kutoa thamani kwa umbo lilelile zilivyohifadhiwa."],
    "magnitude-scale": ["Kipimo cha ung'aavu", "Rula ya logarithmu kwa mng'ao unaoonekana."],
    "array-higher-order": ["Mbinu za safu za daraja la juu", "Mbinu za safu zinazopokea kazi."],
    "gravitational-lensing": ["Lenzi ya uvutano", "Uzito hupinda mwanga unaopita nyuma yake."],
    "debounce-throttle": [
      "Debounce na throttle",
      "Njia mbili za kuzuia tukio linalojirudia haraka.",
    ],
    "white-dwarf": ["Vibete vyeupe", "Mabaki mazito ya nyota iliyoishiwa mafuta."],
    "es-modules": ["Moduli za ES", "Kupanga nini kinategemea nini kwa import na export."],
    "neutron-star": ["Nyota za neutroni", "Kile supernova huacha, kimebanwa kupita kiasi."],
    "recursion-call-stack": [
      "Urudiaji na rafu ya miito",
      "Kazi inayojiita yenyewe, fremu baada ya fremu.",
    ],
    cmb: ["Mionzi ya asili ya ulimwengu", "Mwangaza sawia uliobaki kutoka Mlipuko Mkuu."],
    "regex-capture-groups": ["Vikundi vya kunasa", "Mabano yanayoshika sehemu waliyoilinganisha."],
    "array-map": ["map", "Kubadilisha kila kipengele kuwa kipya, idadi ileile."],
    "array-filter": ["filter", "Kubakiza vipengele vinavyofaulu jaribio."],
    "array-reduce": ["reduce", "Kukunja safu nzima hadi thamani moja."],
    "method-chaining": ["Kuunganisha miito", "map kisha filter — data hupita kwenye mstari mmoja."],
    "sparse-arrays": ["Mtego wa safu zenye mapengo", "map huruka mapengo, na jibu hushtua."],
    "predicate-functions": ["Kazi za masharti", "Kazi inayojibu ndiyo au hapana — moyo wa filter."],
    truthiness: [
      "Thamani za kweli na za uongo",
      "Nini JavaScript huhesabu kuwa kweli, na nini si kweli.",
    ],
    "accumulator-pattern": [
      "Mkusanyaji",
      "Kukusanya majibu katika thamani moja inayoendelea kubadilika.",
    ],
    "reduce-initial-value": [
      "Kuchagua thamani ya kuanzia",
      "Hoja ya pili ya reduce huamua raundi ya kwanza.",
    ],
    "map-via-reduce": [
      "map iliyoandikwa kwa reduce",
      "Kuandika map kwa reduce ili kuona reduce inafika wapi.",
    ],
    "group-by": ["Kupanga makundi kwa groupBy", "Kugawa vipengele katika makundi kwa ufunguo."],
    "object-accumulator": [
      "Kukusanya ndani ya kitu",
      "Jinsi muunganiko unavyoandikwa mkusanyaji akiwa kitu.",
    ],
    "lazy-evaluation-tradeoff": [
      "Gharama ya kuunganisha",
      "Rahisi kusoma, na kila hatua hutengeneza safu ya katikati.",
    ],
    "composing-predicates": [
      "Kuunganisha masharti",
      "Kuunganisha majaribio kadhaa kuwa moja kwa na, au.",
    ],
    "map-or-object": ["Map au kitu cha kawaida", "Chombo kipi cha kupangia makundi."],
  },
  titles: {
    astro: "[Mfano] Kuzurura angani",
    js: "[Mfano] JS, tena",
    teach: "Kueleza tena · closure na mnyororo wa mawanda",
    vocab: "[Mfano] Kupitia msamiati",
  },
  goalTitle: "Kugeuza kumbukumbu za uchunguzi kuwa ripoti ya muhtasari",
  astroMessages: [
    "Asubuhi niliona picha ya kundi la galaksi na mwanga ulionekana umepinda. Hilo ni nini?",
    "Hiyo ni lenzi ya uvutano: uvutano wa kitu chenye uzito mkubwa hupinda njia ya mwanga unaotoka nyuma yake, hivyo galaksi ya nyuma huonekana imenyooshwa, au huonekana mara kadhaa.",
    "Naweza kuiweka pamoja na madaraja ya mwonekano wa nyota tuliyozungumzia awali?",
    "Unaweza, mradi usiyachanganye: madaraja ya mwonekano ni kuhusu mwanga wa nyota yenyewe umeundwa na nini na joto lake, lenzi ni kuhusu mwanga uliopindwa na uzito uliopo njiani. Fizikia tofauti, vifaa vilevile.",
    "Na sheria za Kepler na umbali kwa paralaksi? Leo nataka kupitia tena umbo la unajimu wa uchunguzi.",
    "Sheria za Kepler hufunga umbo la mzingo na muda wake; paralaksi hupima umbali wa nyota kutoka mzunguko wa Dunia yenyewe. Zote mbili ni njia za kupata mahali kitu kilipo, na hiyo ndiyo kazi ya unajimu wa uchunguzi.",
  ],
  jsMessages: [
    "Nilikutana tena na kitanzi cha matukio nikiandika msimbo, swali pendwa la mahojiano. Nataka kuimarisha jinsi JavaScript inavyoendesha msimbo wangu.",
    "Ndani ya hilo, kitanzi cha matukio ndicho huamua mpangilio kati ya msimbo wako wa kawaida, kazi ndogo na kazi kubwa. Kila kitu kisicho sambamba hueleweka mara tu mpangilio huo unapoeleweka.",
    "Je, closure ina uhusiano na hilo?",
    "Ni mawazo mawili tofauti, lakini closure ndiyo hufanya kazi inayoendeshwa baadaye bado iwe na thamani inazohitaji, hivyo hukutana mara kwa mara kwenye msimbo mmoja.",
  ],
  teachMessages: [
    "Nijaribu closure: kazi hukumbuka mawanda iliyoandikwa ndani yake, hivyo hata baada ya kazi ya nje kumaliza, ile ya ndani bado husoma vigezo vile. Ndivyo data huwekwa faraghani, kwa mfano kihesabu.",
    "Maelezo ni sahihi, na umeshika kinachohusika: mawanda ya pale ilipofafanuliwa hubaki. Kihesabu cha faragha ni mfano unaofaa.",
  ],
  vocabMessages: [
    "Wiki hii msamiati wangu umeongezeka haraka. Je, hilo huonekana mahali fulani?",
    "Kwa majaribio ya karibuni, maneno mengi zaidi yanarudi sawa. Kukutana na machache kila siku kunatosha kuendeleza hivyo.",
    "Bado kuna machache yanayonisimamisha kwa sekunde nikiyaona.",
    "Sekunde hiyo inamaanisha neno bado linatulia, si kwamba halikushika. Nafasi zinapoongezeka, kusita huko hupungua kwenyewe.",
  ],
  wordContexts: [
    "Neno «{word}» lilijitokeza kwenye mazungumzo.",
    "«{word}» limeonekana katika kifungu hiki.",
    "Kadi ya kupitia imeandikwa «{word}».",
  ],
};
