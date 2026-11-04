// The preview terms (ship-hackathon decision 4): what Lente is during the hackathon's judging, what it
// keeps and where model calls go, accepted once per account before any data route answers. A subset of
// add-consent (tasks 1.1 without legal review, 1.3–1.5), which stays open for version 1. Pure: the text,
// the pages, and the gate's decision; the hub keeps who accepted which version on the account.
// (`src/terms.ts` is the memory index's word normalizer, unrelated.)

/** Bump it when the text changes in substance: everyone is asked again. */
export const TERMS_VERSION = "preview-2026-11-04";

/** Where people write: the repository's issues. */
export const CONTACT_URL = "https://github.com/ruloCode/lente/issues";

/** What a data route answers until the current version is accepted. */
export const NEEDS_TERMS_MESSAGE = "Antes de seguir, lee y acepta los términos de la prueba.";

export interface TermsText {
  title: string;
  /** The short version the apps show above «Acepto». */
  summary: string[];
  terms: { heading: string; body: string }[];
  privacy: { heading: string; body: string }[];
}

export const TERMS: Record<"es" | "en", TermsText> = {
  es: {
    title: "Lente · Términos de la prueba",
    summary: [
      "Lente es un prototipo hecho para un hackathon, no un dispositivo médico ni de movilidad.",
      "Guarda solo texto, sellado para tu cuenta. El audio y las fotos no se guardan.",
      "Las preguntas, lo que escucha y lo que ve van a los modelos de Meta con créditos gratuitos, que permiten usar ese contenido para mejorar sus productos: no compartas nada sensible.",
      "Puedes borrar tu cuenta cuando quieras, con todos sus datos.",
    ],
    terms: [
      { heading: "Qué es Lente", body: "Un prototipo hecho durante un hackathon y abierto para que el jurado y otras personas lo prueben hasta el 16 de noviembre de 2026. Puede fallar, cambiar o apagarse sin aviso. No es un dispositivo médico ni de movilidad: no lo uses para decidir por dónde caminar, cruzar una calle o tomar una medicina." },
      { heading: "Límites de la prueba", body: "Cada cuenta tiene un gasto máximo por día en los modelos, y la demo uno en total. Al llegar, Lente te lo dice y vuelve al día siguiente." },
      { heading: "Lo que envías a los modelos", body: "Tus preguntas, lo que Lente escucha y lo que ve se envían a Muse Spark y Muse Voice Transcribe, de Meta. Este prototipo usa créditos gratuitos de Meta, cuyas condiciones permiten usar ese contenido para mejorar sus productos. No compartas datos de salud, contraseñas, documentos ni nada que no quieras que otros lean." },
      { heading: "Otras personas", body: "Si grabas una conversación, avísales a quienes hablan contigo. Lente no identifica a nadie por su cara ni por su voz." },
      { heading: "Tu cuenta", body: "Puedes descargar o borrar tu cuenta en Ajustes. Borrarla elimina todo lo que guardó Lente para ti." },
      { heading: "Contacto", body: `Escríbenos en ${CONTACT_URL}.` },
    ],
    privacy: [
      { heading: "Qué guarda", body: "Texto: lo que se dijo y lo que se vio, notas, tareas y lo que pediste recordar, sellado con una clave propia de tu cuenta: en la base de datos no se puede leer, y solo el servidor de Lente lo abre para responderte." },
      { heading: "Qué no guarda", body: "Audio ni fotos: para las cuentas de prueba solo se guarda el texto. Las imágenes y el sonido llegan al modelo y se descartan." },
      { heading: "A dónde va", body: "A los modelos de Meta (Muse Spark, Muse Voice Transcribe) para entender y responder, con créditos gratuitos que permiten a Meta usar ese contenido para mejorar sus productos. La memoria vive en Supabase y el servidor en Modal." },
      { heading: "Cuánto tiempo", body: "Hasta que borres tu cuenta o termine la prueba. Borrar la cuenta elimina todo." },
      { heading: "Contacto", body: `Escríbenos en ${CONTACT_URL}.` },
    ],
  },
  en: {
    title: "Lente · Preview terms",
    summary: [
      "Lente is a hackathon prototype, not a medical or mobility device.",
      "It keeps text only, sealed for your account. Audio and photos are not kept.",
      "Your questions and what it hears and sees go to Meta's models on free credits, which allow that content to be used to improve their products: don't share anything sensitive.",
      "You can delete your account at any time, with all its data.",
    ],
    terms: [
      { heading: "What Lente is", body: "A prototype built during a hackathon, open for the judges and others to try until November 16, 2026. It may fail, change or go offline without notice. It is not a medical or mobility device: do not use it to decide where to walk, when to cross a street or what medicine to take." },
      { heading: "Limits", body: "Each account has a daily spend cap on the models, and the demo has one in total. When it is reached, Lente says so and is back the next day." },
      { heading: "What you send to the models", body: "Your questions and what Lente hears and sees are sent to Meta's Muse Spark and Muse Voice Transcribe. This prototype runs on Meta's free credits, whose terms allow that content to be used to improve their products. Don't share health data, passwords, documents or anything you don't want others to read." },
      { heading: "Other people", body: "If you record a conversation, tell the people talking with you. Lente identifies no one by face or voice." },
      { heading: "Your account", body: "You can download or delete your account in Settings. Deleting it removes everything Lente kept for you." },
      { heading: "Contact", body: `Write to us at ${CONTACT_URL}.` },
    ],
    privacy: [
      { heading: "What it keeps", body: "Text: what was said and seen, notes, tasks and what you asked it to remember, sealed with a key of your account's own: it cannot be read in the database, and only Lente's server opens it to answer you." },
      { heading: "What it does not keep", body: "Audio or photos: test accounts keep text only. Images and sound reach the model and are dropped." },
      { heading: "Where it goes", body: "To Meta's models (Muse Spark, Muse Voice Transcribe) to understand and answer, on free credits that allow Meta to use that content to improve their products. The memory lives in Supabase and the server on Modal." },
      { heading: "How long", body: "Until you delete your account or the preview ends. Deleting the account removes everything." },
      { heading: "Contact", body: `Write to us at ${CONTACT_URL}.` },
    ],
  },
};

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const linkify = (s: string): string => esc(s).replace(esc(CONTACT_URL), `<a href="${CONTACT_URL}">${esc(CONTACT_URL)}</a>`);

/** `/terminos` or `/privacidad`: Spanish first, the English below, the version at the foot. Plain HTML, readable by a screen reader. */
export function termsPage(kind: "terms" | "privacy"): string {
  const section = (lang: "es" | "en") => {
    const t = TERMS[lang];
    const items = kind === "terms" ? t.terms : t.privacy;
    const head = kind === "terms" ? t.title : lang === "es" ? "Lente · Privacidad" : "Lente · Privacy";
    return `<section lang="${lang}"><h${lang === "es" ? 1 : 2}>${esc(head)}</h${lang === "es" ? 1 : 2}>${items.map((i) => `<h3>${esc(i.heading)}</h3><p>${linkify(i.body)}</p>`).join("")}</section>`;
  };
  const title = kind === "terms" ? TERMS.es.title : "Lente · Privacidad";
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font:17px/1.5 system-ui;margin:0;background:#111;color:#eee}main{max-width:680px;margin:0 auto;padding:24px 20px 48px}
h1{font-size:1.6em}h2{font-size:1.4em;margin-top:2.4em}h3{font-size:1.05em;margin:1.4em 0 .2em}p{margin:0;color:#ddd}a{color:#7cf}nav{margin-bottom:1em}footer{margin-top:3em;color:#aaa;font-size:.9em}</style></head>
<body><main><nav><a href="/terminos">Términos</a> · <a href="/privacidad">Privacidad</a></nav>${section("es")}${section("en")}
<footer>Versión ${esc(TERMS_VERSION)}</footer></main></body></html>`;
}

/** `GET /terms`: what the apps show and whether this account still has to accept. */
export function termsView(accepted: { version: string; at: number } | undefined) {
  const needsTerms = accepted?.version !== TERMS_VERSION;
  return { version: TERMS_VERSION, needsTerms, ...(accepted && !needsTerms ? { acceptedAt: accepted.at } : {}), summary: { es: TERMS.es.summary, en: TERMS.en.summary }, links: { terms: "/terminos", privacy: "/privacidad" } };
}

/** The 428 body a data route answers with. */
export const needsTermsBody = () => ({ needsTerms: true, version: TERMS_VERSION, message: NEEDS_TERMS_MESSAGE, links: { terms: "/terminos", privacy: "/privacidad" } });

/** Routes an account may use before accepting: the terms themselves, signing out, and its account rights. Static shells carry no data. */
const BEFORE_TERMS = new Set(["/terms", "/terms/accept", "/terminos", "/privacidad", "/auth/signout", "/account", "/account/export", "/account/delete", "/", "/desktop", "/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"]);

/**
 * Must this request wait for the terms? Only when the hub asks for them, for an account other than
 * the owner's (who wrote them; and their clip and phone must never be locked out mid-demo), that has
 * not accepted the current version, on a route that is not one of the few allowed before.
 */
export function needsTerms(input: { path: string; required: boolean; isOwner: boolean; acceptedVersion: string | undefined }): boolean {
  if (!input.required || input.isOwner || input.acceptedVersion === TERMS_VERSION) return false;
  return !BEFORE_TERMS.has(input.path);
}

/**
 * `LENTE_TERMS`: `required` or `off`; unset, the terms are required exactly when sign-up is open (the
 * accounts that arrive then are strangers to the project).
 */
export function termsRequired(raw: string | undefined, signupOpen: boolean): boolean {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "required" || v === "on") return true;
  if (v === "off") return false;
  return signupOpen;
}
