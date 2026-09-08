/** The demo learner in Português. */
import type { DemoText } from "./demoText";

export const DEMO_TEXT_PT: DemoText = {
  concepts: {
    "astro-root": ["Astronomia de observação", "Como se mede o céu, e com quê."],
    "stellar-spectra": [
      "Classes espectrais das estrelas",
      "Separar estrelas pelas linhas da sua luz.",
    ],
    "js-root": [
      "Como o JavaScript roda seu código",
      "As regras com que o motor ordena a execução.",
    ],
    parallax: [
      "Distâncias por paralaxe",
      "Medir a distância de uma estrela a partir da órbita da Terra.",
    ],
    closures: ["Fechamentos e cadeia de escopos", "Uma função guarda as variáveis onde nasceu."],
    transits: [
      "Trânsitos de exoplanetas",
      "Um planeta que cruza a estrela deixa a luz um pouco mais fraca.",
    ],
    "event-loop": ["Laço de eventos e microtarefas", "O que roda em seguida, e em que ordem."],
    "promise-chains": ["Encadear promessas", "Emendar passos assíncronos um no outro com then."],
    "event-horizon": ["Horizonte de eventos", "O limite de onde nem a luz volta."],
    "async-await": ["async/await", "Escrever trabalho assíncrono como se fosse sequencial."],
    "tidal-locking": ["Acoplamento de maré", "Uma volta em si a cada órbita: sempre a mesma face."],
    "prototype-chain": [
      "Herança por protótipos",
      "Um objeto sobe a cadeia atrás de uma propriedade.",
    ],
    "kepler-laws": ["Leis de Kepler", "A forma da órbita e o tempo que ela leva, amarrados."],
    destructuring: ["Desestruturação", "Tirar valores pela forma em que estão guardados."],
    "magnitude-scale": ["A escala de magnitudes", "Uma régua logarítmica para o brilho aparente."],
    "array-higher-order": ["Métodos de ordem superior", "Métodos de vetor que recebem uma função."],
    "gravitational-lensing": ["Lente gravitacional", "A massa entorta a luz que passa atrás dela."],
    "debounce-throttle": [
      "Debounce e throttle",
      "Dois jeitos de segurar um evento que dispara demais.",
    ],
    "white-dwarf": ["Anãs brancas", "O que sobra, denso, de uma estrela sem combustível."],
    "es-modules": ["Módulos ES", "Organizar o que depende do quê com import e export."],
    "neutron-star": [
      "Estrelas de nêutrons",
      "O que uma supernova deixa, comprimido além do imaginável.",
    ],
    "recursion-call-stack": [
      "Recursão e pilha de chamadas",
      "Uma função chamando a si mesma, quadro a quadro.",
    ],
    cmb: ["Radiação cósmica de fundo", "O brilho parelho que sobrou do Big Bang."],
    "regex-capture-groups": ["Grupos de captura", "Parênteses que guardam o pedaço que casou."],
    "array-map": ["map", "Transformar cada item em outro, mesma quantidade."],
    "array-filter": ["filter", "Ficar com os itens que passam num teste."],
    "array-reduce": ["reduce", "Dobrar um vetor inteiro até um único valor."],
    "method-chaining": ["Encadeamento", "map e filter em seguida: os dados descem por uma linha."],
    "sparse-arrays": ["A armadilha dos buracos", "map pula os buracos, e o resultado surpreende."],
    "predicate-functions": [
      "Funções predicado",
      "Uma função que responde sim ou não: o coração do filter.",
    ],
    truthiness: [
      "Valores verdadeiros e falsos",
      "O que o JavaScript conta como verdadeiro, e como falso.",
    ],
    "accumulator-pattern": ["O acumulador", "Juntar resultados num valor que vai se atualizando."],
    "reduce-initial-value": [
      "Escolher o valor inicial",
      "O segundo argumento do reduce decide a primeira rodada.",
    ],
    "map-via-reduce": [
      "map escrito com reduce",
      "Escrever map com reduce para ver o alcance do reduce.",
    ],
    "group-by": ["Agrupar com groupBy", "Distribuir itens em grupos por uma chave."],
    "object-accumulator": [
      "Acumular num objeto",
      "Como fica a junção quando o acumulador é um objeto.",
    ],
    "lazy-evaluation-tradeoff": [
      "O custo de encadear",
      "Lê-se muito bem, e cada passo cria um vetor no meio.",
    ],
    "composing-predicates": ["Compor predicados", "Juntar vários testes num só com e, ou."],
    "map-or-object": ["Map ou objeto comum", "Em que recipiente agrupar."],
  },
  titles: {
    astro: "[Exemplo] Passeio pelo céu",
    js: "[Exemplo] JS, de novo",
    teach: "Explicando de volta · fechamentos e cadeia de escopos",
    vocab: "[Exemplo] Retomada de vocabulário",
  },
  goalTitle: "Transformar meu diário de observação em um relatório resumido",
  astroMessages: [
    "Vi de manhã uma foto de um aglomerado de galáxias e a luz parecia entortada. O que é isso?",
    "É uma lente gravitacional: a gravidade de um objeto bem massivo entorta o caminho da luz que vem de trás, então uma galáxia de fundo aparece esticada, ou várias vezes.",
    "Dá para juntar isso com as classes espectrais das estrelas que a gente viu antes?",
    "Dá, desde que não se misturem: as classes espectrais falam do que a luz da própria estrela é feita e da temperatura dela; a lente fala de luz entortada pela massa por que passa. Física diferente, os mesmos instrumentos.",
    "E as leis de Kepler e as distâncias por paralaxe? Hoje quero rever o formato da astronomia de observação.",
    "As leis de Kepler amarram a forma de uma órbita ao tempo que ela leva; a paralaxe mede a distância de uma estrela a partir da órbita da Terra. As duas servem para situar algo, que é do que a astronomia de observação trata.",
  ],
  jsMessages: [
    "Esbarrei de novo no laço de eventos programando, o queridinho das entrevistas. Quero firmar como o JavaScript roda meu código.",
    "Dentro disso, o laço de eventos decide a ordem entre o seu código comum, as microtarefas e as macrotarefas. Tudo que é assíncrono faz sentido assim que essa ordem faz.",
    "Fechamentos têm a ver com isso?",
    "São ideias separadas, mas o fechamento é o que faz uma função executada depois ainda ter os valores de que precisa, então as duas aparecem juntas o tempo todo.",
  ],
  teachMessages: [
    "Vou tentar fechamentos: uma função lembra do escopo onde foi escrita, então mesmo depois de a função de fora terminar, a de dentro continua lendo aquelas variáveis. É assim que se guarda dado em particular, um contador por exemplo.",
    "Está correto, e você pegou o que importa: o escopo de onde ela foi definida fica guardado. O contador privado é o exemplo certo.",
  ],
  vocabMessages: [
    "Meu vocabulário cresceu rápido esta semana. Isso aparece em algum lugar?",
    "Nas tentativas recentes voltam certas mais palavras. Encontrar algumas todo dia já basta para seguir assim.",
    "Algumas ainda me travam um segundo quando aparecem.",
    "Esse segundo quer dizer que está assentando, não que não pegou. Conforme os intervalos aumentam, a pausa encurta sozinha.",
  ],
  wordContexts: [
    "A palavra «{word}» apareceu na conversa.",
    "«{word}» apareceu neste trecho.",
    "O cartão de revisão traz «{word}».",
  ],
};
