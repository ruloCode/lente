// @ts-check
// The first-run introduction on the web (the Android app's Intro, for an account on the cloud hub):
// what Lente does, the wearer's names, how to record, asking the memory and the listening promise.
// Pure: the steps, their buttons and whether to show it. No DOM, no fetch.

/** The pref that remembers the introduction was seen in this browser. */
export const INTRO_PREF = "welcomed";

/**
 * The steps in order. `names` marks the step with the names field; `try` is a question to ask.
 * @type {{ key: string, icon: string, title: string, body: string, names?: boolean, points?: { icon: string, title: string, text: string }[], try?: string }[]}
 */
export const INTRO_STEPS = [
  {
    key: "what",
    icon: "sparkle",
    title: "Te dice qué decir, justo cuando te preguntan.",
    body: "Lente escucha la reunión. Cuando alguien te hace una pregunta, aparece una frase para responder: DILO, con lo que significa en español.",
  },
  {
    key: "names",
    icon: "user",
    title: "¿Cómo te llaman?",
    body: "Lente te avisa cuando alguien dice uno de estos nombres. Separa los apodos con comas.",
    names: true,
  },
  {
    key: "record",
    icon: "record",
    title: "Graba desde aquí o desde el teléfono",
    body: "Toca Grabar o pulsa R. Esta computadora escucha con su micrófono; también puedes compartir una pestaña con la reunión.",
    points: [
      { icon: "sparkle", title: "Asistir", text: "Te dice qué decir cuando te preguntan." },
      { icon: "wave", title: "Solo grabar", text: "Guarda lo que se dice, como texto, sin interrumpir." },
      { icon: "eye", title: "Ver, en la app Android", text: "Describe en voz alta lo que tienes al frente." },
    ],
  },
  {
    key: "ask",
    icon: "chat",
    title: "Pregúntale a tu memoria",
    body: "A la derecha está el chat. Responde solo con lo que viste y escuchaste, y te dice de dónde lo sacó. Tu cuenta trae un proyecto de ejemplo para probarlo ya.",
    try: "¿Qué se decidió sobre la beta?",
  },
  {
    key: "promise",
    icon: "lock",
    title: "Siempre a la vista",
    body: "Mientras Lente escucha, verás la franja roja arriba con el botón para pausar. Avisa a quienes estén contigo. Lente guarda el texto, cifrado con una llave solo tuya; el audio y las fotos no se guardan.",
  },
];

/**
 * What the bottom row offers on a step.
 * @param {number} step
 * @param {number} [count]
 */
export function introButtons(step, count = INTRO_STEPS.length) {
  const last = step >= count - 1;
  return { back: step > 0, next: last ? "Empezar" : "Siguiente", skip: !last, done: last };
}

/**
 * Whether to show the introduction: once per browser, after sign-in and the terms.
 * @param {string | null | undefined} seen the pref's value
 */
export function needsIntro(seen) {
  return seen !== "yes";
}
