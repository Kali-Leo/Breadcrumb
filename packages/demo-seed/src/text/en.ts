/** The demo learner in English. */
import type { DemoText } from "./demoText";

export const DEMO_TEXT_EN: DemoText = {
  concepts: {
    "astro-root": ["Observational astronomy", "How the sky is measured, and with what."],
    "stellar-spectra": ["Stellar spectral classes", "Sorting stars by the lines in their light."],
    "js-root": ["How JavaScript runs your code", "The rules the runtime schedules code by."],
    parallax: ["Parallax distances", "Measuring a star's distance from Earth's own orbit."],
    closures: ["Closures and the scope chain", "A function keeps the variables it was born in."],
    transits: ["Exoplanet transits", "A planet crossing its star dims the light a little."],
    "event-loop": ["Event loop and microtasks", "What runs next, and in which order."],
    "promise-chains": ["Promise chaining", "Stringing asynchronous steps together with then."],
    "event-horizon": ["Black hole event horizon", "The boundary not even light gets back out of."],
    "async-await": ["async/await", "Asynchronous work written as if it were sequential."],
    "tidal-locking": ["Tidal locking", "A body that turns once per orbit, so one face stays lit."],
    "prototype-chain": ["Prototype inheritance", "An object looks up the chain for a property."],
    "kepler-laws": ["Kepler's laws", "Orbit shape and orbit period, tied together."],
    destructuring: ["Destructuring", "Pulling values out by the shape they are stored in."],
    "magnitude-scale": ["The magnitude scale", "A logarithmic ruler for how bright a thing looks."],
    "array-higher-order": ["Higher-order array methods", "Array methods that take a function."],
    "gravitational-lensing": ["Gravitational lensing", "Mass bends the light passing behind it."],
    "debounce-throttle": ["Debounce and throttle", "Two ways to rein in an event that fires fast."],
    "white-dwarf": ["White dwarfs", "The dense remains of a star that ran out of fuel."],
    "es-modules": ["ES Modules", "Organising what depends on what with import and export."],
    "neutron-star": ["Neutron stars", "What a supernova leaves behind, packed impossibly tight."],
    "recursion-call-stack": [
      "Recursion and the call stack",
      "A function calling itself, one frame at a time.",
    ],
    cmb: ["Cosmic microwave background", "The even glow left over from the Big Bang."],
    "regex-capture-groups": ["Regex capture groups", "Brackets that keep the part they matched."],
    "array-map": ["map", "Turning every item into a new one, same length out."],
    "array-filter": ["filter", "Keeping the items that pass a test."],
    "array-reduce": ["reduce", "Folding a whole array down to one value."],
    "method-chaining": ["Chaining", "map and filter back to back — data flows down a line."],
    "sparse-arrays": [
      "The sparse-array trap",
      "map skips the holes, and the result surprises you.",
    ],
    "predicate-functions": [
      "Predicate functions",
      "A function that answers yes or no — filter's heart.",
    ],
    truthiness: ["Truthiness", "Which values JavaScript counts as true, and which as false."],
    "accumulator-pattern": [
      "The accumulator",
      "Collecting results in one value that keeps updating.",
    ],
    "reduce-initial-value": [
      "Choosing the initial value",
      "reduce's second argument decides the first round.",
    ],
    "map-via-reduce": [
      "map, written with reduce",
      "Writing map out of reduce to see how far reduce reaches.",
    ],
    "group-by": ["Grouping with groupBy", "Sorting items into buckets by a key."],
    "object-accumulator": [
      "Accumulating into an object",
      "How the merge is written when the accumulator is an object.",
    ],
    "lazy-evaluation-tradeoff": [
      "The cost of chaining",
      "Easy to read, and every step builds an array in between.",
    ],
    "composing-predicates": [
      "Composing predicates",
      "Joining several tests into one with and, or.",
    ],
    "map-or-object": ["Map or plain object", "Which container to group into."],
  },
  titles: {
    astro: "[Example] Wandering the sky",
    js: "[Example] JS, revisited",
    teach: "Teach-back · closures and the scope chain",
    vocab: "[Example] Vocabulary catch-up",
  },
  goalTitle: "Turn my observing log into a summary report",
  astroMessages: [
    "Saw a photo of a galaxy cluster this morning and the light looked bent. What is going on there?",
    "That is gravitational lensing: the gravity of a massive object bends the path of light coming from behind it, so a background galaxy shows up stretched, or several times over.",
    "Can I put that together with the stellar spectral classes we talked about before?",
    "You can, as long as you keep them apart: spectral classes are about what a star's own light is made of and how hot it is, lensing is about light being bent by mass it passes. Different physics, same instruments.",
    "What about Kepler's laws and parallax distances? I want to go over the shape of observational astronomy today.",
    "Kepler's laws tie an orbit's shape to how long it takes; parallax measures a star's distance from Earth's own orbit. Both are ways of pinning something down, which is what observational astronomy is for.",
  ],
  jsMessages: [
    "Ran into the event loop again while coding — the interview favourite. I want to shore up how JavaScript runs my code.",
    "Inside that: the event loop decides the order of your ordinary code, microtasks and macrotasks. Everything asynchronous makes sense once that order does.",
    "Do closures have anything to do with it?",
    "They are separate ideas, but closures are how a callback still has the values it needs when it finally runs, so the two turn up in the same code constantly.",
  ],
  teachMessages: [
    "Let me try closures: a function remembers the scope it was written in, so even after the outer function has finished, the inner one can still read those variables. That is how you keep data private — a counter, say.",
    "That is accurate, and you got the part that matters: the scope from where it was defined is kept. The private counter is the right example for it.",
  ],
  vocabMessages: [
    "My vocabulary has grown quickly this week. Does that show anywhere?",
    "From the recent guesses, more words are coming back right. Meeting a few every day is enough to keep that going.",
    "Some of them still stop me for a second when I see them.",
    "A second's pause means it is still settling, not that it did not stick. As the gaps get longer that pause gets shorter on its own.",
  ],
  wordContexts: [
    "The word “{word}” came up in the conversation.",
    "“{word}” appeared in this passage.",
    "The review card reads “{word}”.",
  ],
};
