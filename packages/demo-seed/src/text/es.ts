/** The demo learner in Español. */
import type { DemoText } from "./demoText";

export const DEMO_TEXT_ES: DemoText = {
  concepts: {
    "astro-root": ["Astronomía de observación", "Cómo se mide el cielo y con qué."],
    "stellar-spectra": [
      "Clases espectrales de estrellas",
      "Ordenar estrellas por las líneas de su luz.",
    ],
    "js-root": [
      "Cómo ejecuta JavaScript tu código",
      "Las reglas con las que el motor ordena la ejecución.",
    ],
    parallax: [
      "Distancias por paralaje",
      "Medir la distancia a una estrella desde la órbita terrestre.",
    ],
    closures: ["Cierres y cadena de ámbitos", "Una función conserva las variables donde nació."],
    transits: [
      "Tránsitos de exoplanetas",
      "Un planeta que cruza su estrella atenúa un poco la luz.",
    ],
    "event-loop": ["Bucle de eventos y microtareas", "Qué se ejecuta después y en qué orden."],
    "promise-chains": ["Encadenar promesas", "Unir pasos asíncronos uno tras otro con then."],
    "event-horizon": ["Horizonte de sucesos", "El límite del que ni la luz vuelve a salir."],
    "async-await": ["async/await", "Escribir trabajo asíncrono como si fuera secuencial."],
    "tidal-locking": [
      "Acoplamiento de marea",
      "Gira una vez por órbita, así que siempre da la misma cara.",
    ],
    "prototype-chain": [
      "Herencia por prototipos",
      "Un objeto busca la propiedad subiendo por la cadena.",
    ],
    "kepler-laws": ["Leyes de Kepler", "La forma de la órbita y su periodo, atados entre sí."],
    destructuring: ["Desestructuración", "Sacar valores según la forma en que están guardados."],
    "magnitude-scale": [
      "La escala de magnitudes",
      "Una regla logarítmica para el brillo aparente.",
    ],
    "array-higher-order": [
      "Métodos de orden superior",
      "Métodos de arreglo que reciben una función.",
    ],
    "gravitational-lensing": ["Lente gravitacional", "La masa curva la luz que pasa por detrás."],
    "debounce-throttle": [
      "Debounce y throttle",
      "Dos formas de frenar un evento que se dispara mucho.",
    ],
    "white-dwarf": ["Enanas blancas", "Lo que queda, denso, de una estrella sin combustible."],
    "es-modules": ["Módulos ES", "Ordenar qué depende de qué con import y export."],
    "neutron-star": [
      "Estrellas de neutrones",
      "Lo que deja una supernova, apretado hasta lo imposible.",
    ],
    "recursion-call-stack": [
      "Recursión y pila de llamadas",
      "Una función que se llama a sí misma, marco a marco.",
    ],
    cmb: ["Fondo cósmico de microondas", "El resplandor parejo que dejó el Big Bang."],
    "regex-capture-groups": ["Grupos de captura", "Paréntesis que se quedan con lo que coincidió."],
    "array-map": ["map", "Convertir cada elemento en otro, misma cantidad."],
    "array-filter": ["filter", "Quedarse con los elementos que pasan una prueba."],
    "array-reduce": ["reduce", "Plegar todo un arreglo hasta un solo valor."],
    "method-chaining": ["Encadenado", "map y filter seguidos: los datos bajan por una línea."],
    "sparse-arrays": ["La trampa de los huecos", "map salta los huecos y el resultado sorprende."],
    "predicate-functions": [
      "Funciones predicado",
      "Una función que responde sí o no: el corazón de filter.",
    ],
    truthiness: [
      "Valores verdaderos y falsos",
      "Qué cuenta como verdadero en JavaScript y qué no.",
    ],
    "accumulator-pattern": [
      "El acumulador",
      "Recoger resultados en un valor que se va actualizando.",
    ],
    "reduce-initial-value": [
      "Elegir el valor inicial",
      "El segundo argumento de reduce decide la primera vuelta.",
    ],
    "map-via-reduce": [
      "map escrito con reduce",
      "Escribir map con reduce para ver hasta dónde llega reduce.",
    ],
    "group-by": ["Agrupar con groupBy", "Repartir elementos en grupos según una clave."],
    "object-accumulator": [
      "Acumular en un objeto",
      "Cómo se escribe la mezcla cuando el acumulador es un objeto.",
    ],
    "lazy-evaluation-tradeoff": [
      "Lo que cuesta encadenar",
      "Se lee muy bien, y cada paso crea un arreglo intermedio.",
    ],
    "composing-predicates": ["Componer predicados", "Unir varias pruebas en una con y, o."],
    "map-or-object": ["Map u objeto normal", "En qué contenedor agrupar."],
  },
  titles: {
    astro: "[Ejemplo] Paseo por el cielo",
    js: "[Ejemplo] JS, otra vuelta",
    teach: "Explicar de vuelta · cierres y cadena de ámbitos",
    vocab: "[Ejemplo] Repaso de vocabulario",
  },
  astroMessages: [
    "Vi una foto de un cúmulo de galaxias esta mañana y la luz parecía curvada. ¿Qué es eso?",
    "Es una lente gravitacional: la gravedad de un objeto muy masivo curva el camino de la luz que viene de detrás, así que una galaxia de fondo aparece estirada, o varias veces.",
    "¿Puedo juntar eso con las clases espectrales de estrellas de las que hablamos antes?",
    "Puedes, mientras no las mezcles: las clases espectrales hablan de qué está hecha la luz de la estrella y de su temperatura; la lente habla de una luz curvada por la masa que atraviesa. Física distinta, mismos instrumentos.",
    "¿Y las leyes de Kepler y las distancias por paralaje? Hoy quiero repasar la forma de la astronomía de observación.",
    "Las leyes de Kepler atan la forma de una órbita a lo que tarda; el paralaje mide la distancia a una estrella desde la órbita terrestre. Las dos sirven para situar algo, que es a lo que se dedica la astronomía de observación.",
  ],
  jsMessages: [
    "Me topé otra vez con el bucle de eventos programando, el clásico de las entrevistas. Quiero afianzar cómo ejecuta JavaScript mi código.",
    "Dentro de eso, el bucle de eventos decide el orden entre tu código normal, las microtareas y las macrotareas. Todo lo asíncrono se entiende en cuanto ese orden se entiende.",
    "¿Los cierres tienen algo que ver?",
    "Son ideas distintas, pero un cierre es lo que hace que una función que se ejecuta más tarde todavía tenga los valores que necesita, así que aparecen juntos todo el tiempo.",
  ],
  teachMessages: [
    "Voy con los cierres: una función recuerda el ámbito donde se escribió, así que aunque la función de fuera ya haya terminado, la de dentro sigue leyendo esas variables. Así se guardan datos en privado, por ejemplo un contador.",
    "Es correcto, y agarraste lo que importa: el ámbito de donde se definió se conserva. El contador privado es el ejemplo justo.",
  ],
  vocabMessages: [
    "Esta semana el vocabulario creció rápido. ¿Se nota en algún sitio?",
    "En los intentos recientes vuelven bien más palabras. Con encontrarte unas cuantas cada día basta para que siga así.",
    "Algunas todavía me frenan un segundo cuando las veo.",
    "Ese segundo quiere decir que se está asentando, no que no haya quedado. Según se alargan los intervalos, esa pausa se acorta sola.",
  ],
  wordContexts: [
    "En la conversación salió la palabra «{word}».",
    "«{word}» apareció en este fragmento.",
    "La tarjeta de repaso dice «{word}».",
  ],
};
