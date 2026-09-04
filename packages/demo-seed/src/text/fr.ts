/** The demo learner in Français. Tutoiement, like the rest of the French copy. */
import type { DemoText } from "./demoText";

export const DEMO_TEXT_FR: DemoText = {
  concepts: {
    "astro-root": ["Astronomie d'observation", "Comment on mesure le ciel, et avec quoi."],
    "stellar-spectra": [
      "Classes spectrales des étoiles",
      "Classer les étoiles par les raies de leur lumière.",
    ],
    "js-root": [
      "Comment JavaScript exécute ton code",
      "Les règles selon lesquelles le moteur ordonne l'exécution.",
    ],
    parallax: [
      "Distances par parallaxe",
      "Mesurer la distance d'une étoile depuis l'orbite terrestre.",
    ],
    closures: [
      "Fermetures et chaîne de portées",
      "Une fonction garde les variables où elle est née.",
    ],
    transits: [
      "Transits d'exoplanètes",
      "Une planète qui passe devant son étoile en atténue la lumière.",
    ],
    "event-loop": [
      "Boucle d'événements et microtâches",
      "Ce qui s'exécute ensuite, et dans quel ordre.",
    ],
    "promise-chains": ["Chaîner les promesses", "Enchaîner des étapes asynchrones avec then."],
    "event-horizon": ["Horizon des événements", "La limite d'où même la lumière ne ressort pas."],
    "async-await": ["async/await", "Écrire de l'asynchrone comme si c'était séquentiel."],
    "tidal-locking": [
      "Verrouillage gravitationnel",
      "Un tour sur soi par orbite : toujours la même face.",
    ],
    "prototype-chain": [
      "Héritage par prototypes",
      "Un objet remonte la chaîne pour trouver une propriété.",
    ],
    "kepler-laws": [
      "Lois de Kepler",
      "La forme d'une orbite et sa période, liées l'une à l'autre.",
    ],
    destructuring: ["Décomposition", "Sortir des valeurs selon la forme où elles sont rangées."],
    "magnitude-scale": [
      "L'échelle des magnitudes",
      "Une règle logarithmique pour l'éclat apparent.",
    ],
    "array-higher-order": [
      "Méthodes d'ordre supérieur",
      "Les méthodes de tableau qui prennent une fonction.",
    ],
    "gravitational-lensing": [
      "Lentille gravitationnelle",
      "La masse courbe la lumière qui passe derrière elle.",
    ],
    "debounce-throttle": [
      "Debounce et throttle",
      "Deux façons de freiner un événement qui part trop souvent.",
    ],
    "white-dwarf": ["Naines blanches", "Ce qu'il reste, dense, d'une étoile sans carburant."],
    "es-modules": ["Modules ES", "Organiser ce qui dépend de quoi avec import et export."],
    "neutron-star": [
      "Étoiles à neutrons",
      "Ce qu'une supernova laisse, tassé au-delà du raisonnable.",
    ],
    "recursion-call-stack": [
      "Récursion et pile d'appels",
      "Une fonction qui s'appelle elle-même, cadre après cadre.",
    ],
    cmb: ["Fond diffus cosmologique", "La lueur uniforme laissée par le Big Bang."],
    "regex-capture-groups": [
      "Groupes de capture",
      "Des parenthèses qui gardent ce qu'elles ont attrapé.",
    ],
    "array-map": ["map", "Transformer chaque élément en un autre, autant en sortie."],
    "array-filter": ["filter", "Garder les éléments qui passent un test."],
    "array-reduce": ["reduce", "Replier tout un tableau en une seule valeur."],
    "method-chaining": ["Chaînage", "map puis filter : les données descendent une ligne."],
    "sparse-arrays": ["Le piège des trous", "map saute les trous, et le résultat surprend."],
    "predicate-functions": [
      "Fonctions prédicats",
      "Une fonction qui répond oui ou non : le cœur de filter.",
    ],
    truthiness: [
      "Valeurs vraies et fausses",
      "Ce que JavaScript compte comme vrai, et comme faux.",
    ],
    "accumulator-pattern": [
      "L'accumulateur",
      "Rassembler les résultats dans une valeur qui se met à jour.",
    ],
    "reduce-initial-value": [
      "Choisir la valeur de départ",
      "Le deuxième argument de reduce décide du premier tour.",
    ],
    "map-via-reduce": [
      "map écrit avec reduce",
      "Écrire map avec reduce pour voir jusqu'où reduce va.",
    ],
    "group-by": ["Regrouper avec groupBy", "Ranger les éléments par clé dans des groupes."],
    "object-accumulator": [
      "Accumuler dans un objet",
      "Comment s'écrit la fusion quand l'accumulateur est un objet.",
    ],
    "lazy-evaluation-tradeoff": [
      "Ce que coûte le chaînage",
      "Très lisible, et chaque étape crée un tableau au milieu.",
    ],
    "composing-predicates": [
      "Composer des prédicats",
      "Réunir plusieurs tests en un seul avec et, ou.",
    ],
    "map-or-object": ["Map ou objet simple", "Dans quel conteneur regrouper."],
  },
  titles: {
    astro: "[Exemple] Balade dans le ciel",
    js: "[Exemple] JS, deuxième passage",
    teach: "Réexplication · fermetures et chaîne de portées",
    vocab: "[Exemple] Retour sur le vocabulaire",
  },
  astroMessages: [
    "J'ai vu ce matin une photo d'amas de galaxies où la lumière avait l'air courbée. C'est quoi ?",
    "C'est une lentille gravitationnelle : la gravité d'un objet très massif courbe le trajet de la lumière qui vient de derrière, donc une galaxie d'arrière-plan apparaît étirée, ou plusieurs fois.",
    "Je peux rapprocher ça des classes spectrales des étoiles dont on a parlé ?",
    "Oui, tant que tu ne les confonds pas : les classes spectrales parlent de ce dont la lumière de l'étoile est faite et de sa température ; la lentille parle d'une lumière courbée par la masse qu'elle croise. Physique différente, mêmes instruments.",
    "Et les lois de Kepler et les distances par parallaxe ? Je veux revoir aujourd'hui la structure de l'astronomie d'observation.",
    "Les lois de Kepler lient la forme d'une orbite à sa durée ; la parallaxe mesure la distance d'une étoile depuis l'orbite terrestre. Les deux servent à situer quelque chose, et c'est le métier de l'astronomie d'observation.",
  ],
  jsMessages: [
    "Je suis retombé sur la boucle d'événements en codant, le classique des entretiens. Je veux consolider comment JavaScript exécute mon code.",
    "Là-dedans, la boucle d'événements décide de l'ordre entre ton code ordinaire, les microtâches et les macrotâches. Tout l'asynchrone devient clair dès que cet ordre l'est.",
    "Les fermetures ont un rapport avec ça ?",
    "Ce sont deux idées différentes, mais une fermeture est ce qui fait qu'une fonction exécutée plus tard a encore les valeurs dont elle a besoin — donc les deux se croisent tout le temps.",
  ],
  teachMessages: [
    "J'essaie les fermetures : une fonction se souvient de la portée où elle a été écrite, donc même quand la fonction extérieure est terminée, celle de l'intérieur lit encore ces variables. C'est comme ça qu'on garde des données privées, un compteur par exemple.",
    "C'est juste, et tu as pris ce qui compte : la portée de définition est conservée. Le compteur privé est le bon exemple.",
  ],
  vocabMessages: [
    "Mon vocabulaire a bien augmenté cette semaine. Ça se voit quelque part ?",
    "Dans les essais récents, plus de mots reviennent justes. En croiser quelques-uns chaque jour suffit à tenir ce rythme.",
    "Certains me bloquent encore une seconde quand je les vois.",
    "Cette seconde veut dire que ça s'installe, pas que ça n'a pas pris. Quand les intervalles s'allongent, la pause raccourcit d'elle-même.",
  ],
  wordContexts: [
    "Le mot « {word} » est apparu dans la conversation.",
    "« {word} » figure dans ce passage.",
    "La carte de révision porte « {word} ».",
  ],
};
