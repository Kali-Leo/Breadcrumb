/**
 * Purpose: the measurement behind `detectionCodes` — ten real sentences per shipped language,
 * written the way the model actually writes to a learner (an explanation, an analogy, a
 * nudge), run through the real detector. Before this existed each language carried exactly
 * one code, and franc's ordinary near-neighbour confusions (Indonesian read as Malay,
 * Portuguese as Galician, Hindi as Magahi) were filed as "the model answered in the wrong
 * language": a fake background failure plus a scolding retry directive on every single turn.
 *
 * Two gates, and they pull against each other on purpose:
 *  - no sentence may be judged `differs` (that is the fake-failure bug), and
 *  - every language must still catch prose written in a language from another family.
 * Widening a `detectionCodes` list to silence the first gate will trip the second.
 */
import { describe, expect, it } from "vitest";
import { languageOf, UI_LANGUAGE_CODES } from "./languages";
import { checkReplyLanguage } from "./replyLanguage";

/** Ten sentences per shipped language. Prose only — the stripper removes code and formulas,
 * so anything else here would be measuring the stripper instead of the detector. */
const SAMPLES: Record<string, readonly string[]> = {
  "zh-CN": [
    "闭包是函数和它捕获的环境组成的整体，所以它能在离开定义位置之后继续读到那些变量。",
    "要理解这个概念，先看看它在日常生活里对应的是什么，然后再回到定义上来。",
    "我们可以把这道题拆成三步：先算出总量，再求平均，最后比较两组数据的差别。",
    "你昨天问过的那个问题，其实和今天这个是同一类，只是换了一个说法。",
    "光合作用把光能变成化学能，储存在葡萄糖里，同时把氧气放回空气中。",
    "如果把分子换成一个更小的数，整个分数就会变大，这一点用图形来看更直观。",
    "读一段史料的时候，先看它是谁写的、写给谁看的，再判断它想说服你什么。",
    "这个函数每次被调用都会新建一个数组，所以在循环里用它会很慢。",
    "记住一件事最省力的办法，是在快要忘掉的时候再见到它一次。",
    "地球的自转让白天和黑夜交替，公转则决定了一年里季节的变化。",
  ],
  en: [
    "A closure is a function together with the environment it captured, which is why it can still read those variables later.",
    "Start from what you already know about fractions, then extend the same idea to decimals and it will feel familiar.",
    "The key point is that energy is conserved, so whatever leaves one part of the system has to show up somewhere else.",
    "The question you asked yesterday is really the same one as today, just dressed in different words.",
    "Photosynthesis turns light into chemical energy stored in sugar, and puts oxygen back into the air.",
    "When you read a historical source, first ask who wrote it and who they were writing for.",
    "This function builds a new array every time it runs, so calling it inside a loop gets slow.",
    "The cheapest way to remember something is to meet it again just before you would have forgotten it.",
    "The Earth spinning gives us day and night; going around the Sun gives us the seasons.",
    "Try explaining it out loud as if the person listening had never heard the word before.",
  ],
  es: [
    "Un cierre es una función junto con el entorno que capturó, y por eso puede seguir leyendo esas variables más tarde.",
    "Empieza por lo que ya sabes sobre las fracciones y luego extiende la misma idea a los decimales.",
    "Lo importante es que la energía se conserva, así que lo que sale de una parte del sistema aparece en otra.",
    "La pregunta que hiciste ayer es en el fondo la misma de hoy, solo que con otras palabras.",
    "La fotosíntesis convierte la luz en energía química guardada en azúcar y devuelve oxígeno al aire.",
    "Cuando leas una fuente histórica, pregúntate primero quién la escribió y para quién.",
    "Esta función crea un arreglo nuevo cada vez que se ejecuta, así que dentro de un bucle se vuelve lenta.",
    "La forma más barata de recordar algo es volver a encontrarlo justo antes de olvidarlo.",
    "La rotación de la Tierra nos da el día y la noche; su vuelta alrededor del Sol nos da las estaciones.",
    "Intenta explicarlo en voz alta como si quien te escucha nunca hubiera oído esa palabra.",
  ],
  fr: [
    "Une fermeture est une fonction accompagnée de l'environnement qu'elle a capturé, ce qui lui permet de relire ces variables plus tard.",
    "Pars de ce que tu sais déjà sur les fractions, puis étends la même idée aux nombres décimaux.",
    "L'essentiel est que l'énergie se conserve : ce qui quitte une partie du système réapparaît ailleurs.",
    "La question que tu as posée hier est au fond la même qu'aujourd'hui, seulement formulée autrement.",
    "La photosynthèse transforme la lumière en énergie chimique stockée dans le sucre et rend de l'oxygène à l'air.",
    "Quand tu lis une source historique, demande-toi d'abord qui l'a écrite et pour qui.",
    "Cette fonction construit un nouveau tableau à chaque appel, donc dans une boucle elle devient lente.",
    "La façon la moins coûteuse de retenir quelque chose est de la revoir juste avant de l'oublier.",
    "La rotation de la Terre donne le jour et la nuit ; sa révolution autour du Soleil donne les saisons.",
    "Essaie de l'expliquer à voix haute comme si la personne en face n'avait jamais entendu ce mot.",
  ],
  pt: [
    "Um fechamento é uma função junto com o ambiente que ela capturou, e por isso ainda consegue ler aquelas variáveis depois.",
    "Comece pelo que você já sabe sobre frações e depois estenda a mesma ideia para os decimais.",
    "O ponto principal é que a energia se conserva, então o que sai de uma parte do sistema aparece em outra.",
    "A pergunta que você fez ontem é no fundo a mesma de hoje, apenas dita com outras palavras.",
    "A fotossíntese transforma a luz em energia química guardada no açúcar e devolve oxigênio ao ar.",
    "Quando ler uma fonte histórica, pergunte primeiro quem a escreveu e para quem ela foi escrita.",
    "Essa função cria um novo vetor toda vez que roda, então dentro de um laço ela fica lenta.",
    "O jeito mais barato de lembrar de algo é reencontrá-lo pouco antes de você esquecer.",
    "A rotação da Terra nos dá o dia e a noite; a volta em torno do Sol nos dá as estações.",
    "Tente explicar em voz alta como se quem estivesse ouvindo nunca tivesse escutado essa palavra.",
  ],
  ru: [
    "Замыкание — это функция вместе с окружением, которое она захватила, поэтому она может читать эти переменные позже.",
    "Начни с того, что ты уже знаешь о дробях, а потом перенеси ту же мысль на десятичные числа.",
    "Главное здесь в том, что энергия сохраняется, поэтому то, что уходит из одной части системы, появляется в другой.",
    "Вопрос, который ты задал вчера, по сути тот же самый, что и сегодня, просто сказан другими словами.",
    "Фотосинтез превращает свет в химическую энергию, запасённую в сахаре, и возвращает кислород в воздух.",
    "Когда читаешь исторический источник, сначала спроси, кто его написал и для кого.",
    "Эта функция каждый раз создаёт новый массив, поэтому внутри цикла она работает медленно.",
    "Самый дешёвый способ что-то запомнить — встретить это снова прямо перед тем, как забудешь.",
    "Вращение Земли даёт нам день и ночь, а движение вокруг Солнца — смену времён года.",
    "Попробуй объяснить это вслух так, будто слушающий никогда не слышал этого слова.",
  ],
  ar: [
    "الإغلاق هو دالة مع البيئة التي التقطتها، ولهذا يمكنها أن تقرأ تلك المتغيرات لاحقًا.",
    "ابدأ مما تعرفه بالفعل عن الكسور، ثم وسّع الفكرة نفسها إلى الأعداد العشرية وسيبدو الأمر مألوفًا.",
    "النقطة الأساسية أن الطاقة محفوظة، فما يخرج من جزء من النظام لا بد أن يظهر في مكان آخر.",
    "السؤال الذي طرحته أمس هو في جوهره نفس سؤال اليوم، لكن بصياغة مختلفة.",
    "التركيب الضوئي يحول الضوء إلى طاقة كيميائية مخزنة في السكر، ويعيد الأكسجين إلى الهواء.",
    "حين تقرأ مصدرًا تاريخيًا، اسأل أولًا من كتبه ولمن كتبه.",
    "هذه الدالة تنشئ مصفوفة جديدة في كل مرة تعمل فيها، لذلك تصبح بطيئة داخل الحلقة.",
    "أرخص طريقة لتتذكر شيئًا هي أن تلتقي به مرة أخرى قبل أن تنساه بقليل.",
    "دوران الأرض حول نفسها يعطينا الليل والنهار، ودورانها حول الشمس يعطينا الفصول.",
    "حاول أن تشرحه بصوت عال كأن من يستمع إليك لم يسمع بهذه الكلمة من قبل.",
  ],
  hi: [
    "क्लोज़र एक ऐसा फ़ंक्शन है जो अपने पकड़े हुए परिवेश के साथ रहता है, इसीलिए वह बाद में भी उन चरों को पढ़ सकता है।",
    "जो तुम भिन्नों के बारे में पहले से जानते हो वहीं से शुरू करो, फिर वही विचार दशमलव संख्याओं तक बढ़ा दो।",
    "मुख्य बात यह है कि ऊर्जा संरक्षित रहती है, इसलिए जो तंत्र के एक हिस्से से निकलती है वह कहीं और दिखाई देती है।",
    "कल तुमने जो सवाल पूछा था, वह असल में आज वाले सवाल जैसा ही है, बस शब्द बदल गए हैं।",
    "प्रकाश संश्लेषण प्रकाश को रासायनिक ऊर्जा में बदलकर शर्करा में जमा करता है और ऑक्सीजन हवा में लौटा देता है।",
    "जब कोई ऐतिहासिक स्रोत पढ़ो, तो पहले यह पूछो कि उसे किसने लिखा और किसके लिए लिखा।",
    "यह फ़ंक्शन हर बार चलने पर एक नई सूची बनाता है, इसलिए किसी लूप के भीतर यह धीमा पड़ जाता है।",
    "किसी बात को याद रखने का सबसे सस्ता तरीका यह है कि भूलने से ठीक पहले उससे दोबारा मिल लो।",
    "पृथ्वी का अपनी धुरी पर घूमना दिन और रात देता है, और सूर्य के चारों ओर घूमना ऋतुएँ देता है।",
    "इसे ऐसे बोलकर समझाने की कोशिश करो जैसे सुनने वाले ने यह शब्द पहले कभी सुना ही न हो।",
  ],
  id: [
    "Closure adalah fungsi bersama lingkungan yang ditangkapnya, itulah sebabnya ia masih bisa membaca variabel-variabel tersebut nanti.",
    "Mulailah dari apa yang sudah kamu ketahui tentang pecahan, lalu perluas gagasan yang sama ke bilangan desimal.",
    "Intinya adalah energi itu kekal, jadi apa yang keluar dari satu bagian sistem pasti muncul di tempat lain.",
    "Pertanyaan yang kamu ajukan kemarin sebenarnya sama dengan yang hari ini, hanya diucapkan dengan kata lain.",
    "Fotosintesis mengubah cahaya menjadi energi kimia yang tersimpan dalam gula, lalu mengembalikan oksigen ke udara.",
    "Ketika membaca sumber sejarah, tanyakan dulu siapa yang menulisnya dan untuk siapa tulisan itu dibuat.",
    "Fungsi ini membuat larik baru setiap kali dijalankan, jadi di dalam perulangan ia menjadi lambat.",
    "Cara paling murah untuk mengingat sesuatu adalah menemuinya lagi tepat sebelum kamu melupakannya.",
    "Perputaran Bumi pada porosnya memberi kita siang dan malam, sedangkan mengelilingi Matahari memberi kita musim.",
    "Cobalah menjelaskannya dengan suara keras seolah-olah pendengarmu belum pernah mendengar kata itu.",
  ],
  bn: [
    "ক্লোজার হলো একটি ফাংশন এবং সে যে পরিবেশ ধরে রেখেছে তার মিলিত রূপ, তাই সে পরেও ওই চলকগুলো পড়তে পারে।",
    "ভগ্নাংশ নিয়ে তুমি যা আগে থেকেই জানো সেখান থেকে শুরু করো, তারপর সেই একই ভাবনা দশমিক সংখ্যায় বাড়িয়ে নাও।",
    "মূল কথা হলো শক্তি সংরক্ষিত থাকে, তাই সিস্টেমের এক অংশ থেকে যা বেরোয় তা অন্য কোথাও দেখা দেয়।",
    "গতকাল তুমি যে প্রশ্নটি করেছিলে, সেটি আসলে আজকের প্রশ্নেরই মতো, শুধু বলার ধরন বদলেছে।",
    "সালোকসংশ্লেষণ আলোকে রাসায়নিক শক্তিতে বদলে চিনিতে জমা রাখে এবং অক্সিজেন বাতাসে ফিরিয়ে দেয়।",
    "কোনো ঐতিহাসিক উৎস পড়ার সময় প্রথমে জিজ্ঞেস করো কে সেটি লিখেছে আর কার জন্য লিখেছে।",
    "এই ফাংশনটি প্রতিবার চলার সময় নতুন একটি তালিকা তৈরি করে, তাই লুপের ভেতরে এটি ধীর হয়ে যায়।",
    "কোনো কিছু মনে রাখার সবচেয়ে সহজ উপায় হলো ভুলে যাওয়ার ঠিক আগে আবার তার দেখা পাওয়া।",
    "পৃথিবীর নিজের অক্ষে ঘোরা আমাদের দিন আর রাত দেয়, আর সূর্যের চারপাশে ঘোরা দেয় ঋতু।",
    "এটি এমনভাবে মুখে বলে বোঝানোর চেষ্টা করো যেন শ্রোতা শব্দটি আগে কখনো শোনেনি।",
  ],
  sw: [
    "Kifungo ni kazi pamoja na mazingira iliyoyanasa, ndiyo maana bado inaweza kusoma vigezo hivyo baadaye.",
    "Anza na kile unachokijua tayari kuhusu sehemu, kisha panua wazo hilohilo hadi kwenye namba za desimali.",
    "Jambo la msingi ni kwamba nishati huhifadhiwa, hivyo kinachotoka sehemu moja ya mfumo lazima kionekane mahali pengine.",
    "Swali ulilouliza jana kwa kweli ni lilelile la leo, ila limeulizwa kwa maneno mengine.",
    "Usanisinuru hubadilisha mwanga kuwa nishati ya kemikali iliyohifadhiwa katika sukari, na hurudisha oksijeni hewani.",
    "Unaposoma chanzo cha kihistoria, uliza kwanza nani aliandika na aliandika kwa ajili ya nani.",
    "Kazi hii hutengeneza orodha mpya kila inapoendeshwa, hivyo ndani ya kitanzi inakuwa polepole.",
    "Njia rahisi zaidi ya kukumbuka jambo ni kukutana nalo tena muda mfupi kabla hujalisahau.",
    "Kuzunguka kwa Dunia katika mhimili wake hutupa mchana na usiku, na kuzunguka Jua hutupa majira.",
    "Jaribu kulieleza kwa sauti kana kwamba anayekusikiliza hajawahi kusikia neno hilo.",
  ],
};

/** Pairs whose scripts and families are far enough apart that no detector could confuse
 * them — the answer really is in the wrong language, and the tripwire has to say so. */
const WRONG_LANGUAGE_PAIRS: ReadonlyArray<[expected: string, writtenIn: string]> = [
  ["zh-CN", "en"],
  ["en", "ru"],
  ["ar", "hi"],
  ["hi", "bn"],
  ["bn", "sw"],
  ["sw", "ar"],
  ["ru", "zh-CN"],
  ["id", "fr"],
  ["fr", "id"],
  ["pt", "bn"],
  ["es", "ru"],
];

function languageOrThrow(code: string) {
  const language = languageOf(code);
  if (language === null) throw new Error(`no language row for ${code}`);
  return language;
}

describe("detecting the language a reply was written in", () => {
  it("has ten real sentences for every language the picker offers", () => {
    for (const code of UI_LANGUAGE_CODES) {
      expect(SAMPLES[code]?.length, `no sample sentences for ${code}`).toBe(10);
    }
  });

  it.each(UI_LANGUAGE_CODES)(
    "never calls a real %s sentence a wrong-language answer",
    async (code) => {
      const language = languageOrThrow(code);
      for (const sentence of SAMPLES[code] ?? []) {
        // "unknown" is honest (too short to judge); "differs" is the fake failure this fixes.
        expect(await checkReplyLanguage(sentence, language), `${code}: ${sentence}`).not.toBe(
          "differs",
        );
      }
    },
  );

  it.each(UI_LANGUAGE_CODES)(
    "recognises a whole %s answer, not just tolerates it",
    async (code) => {
      const language = languageOrThrow(code);
      // A real reply is several sentences long; that is the length the tripwire mostly sees.
      const wholeAnswer = (SAMPLES[code] ?? []).slice(0, 3).join(" ");
      expect(await checkReplyLanguage(wholeAnswer, language)).toBe("matches");
    },
  );

  it.each(WRONG_LANGUAGE_PAIRS)(
    "still catches %s asked for and %s delivered",
    async (expectedCode, writtenCode) => {
      const expected = languageOrThrow(expectedCode);
      const written = (SAMPLES[writtenCode] ?? []).slice(0, 3).join(" ");
      expect(await checkReplyLanguage(written, expected)).toBe("differs");
    },
  );
});
