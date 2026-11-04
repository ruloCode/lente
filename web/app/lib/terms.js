// @ts-check
// The preview terms gate (ship-hackathon 3.2): until an account accepts the current terms, the hub
// answers its data routes with 428 and `{ needsTerms: true }`. Pure: which answers mean "show the
// terms", what to send back on «Acepto», and what the screen says. No DOM, no fetch.

/** The status the hub answers a data route with while the terms are not accepted. */
export const TERMS_STATUS = 428;

/** The hub's pages with the full text (served to anyone, same origin as the app). */
export const TERMS_LINKS = { terms: "/terminos", privacy: "/privacidad" };

/** The screen's summary, in Spanish, from the preview terms (design decision 4). */
export const TERMS_SUMMARY = [
  "Lente es un prototipo del hackathon. No es un dispositivo médico ni de movilidad.",
  "Tu memoria se guarda como texto, cifrada con una llave solo tuya. El audio y las fotos no se guardan para tu cuenta.",
  "Lente usa la API de modelos de Meta con créditos gratuitos, que permiten usar el contenido para mejorar el producto. No compartas nada sensible.",
  "Hay un límite diario de uso. Puedes borrar tu cuenta, con todos tus datos, cuando quieras.",
];

/**
 * The gate when a hub answer means "accept the terms first", else null: status 428 with
 * `needsTerms: true` in the body. Carries the version when the hub names one.
 * @param {number} status
 * @param {unknown} body
 * @returns {{ version: string | null } | null}
 */
export function termsGate(status, body) {
  if (status !== TERMS_STATUS || !body || typeof body !== "object") return null;
  const b = /** @type {Record<string, unknown>} */ (body);
  if (b.needsTerms !== true) return null;
  const version = typeof b.version === "string" && b.version ? b.version : typeof b.termsVersion === "string" && b.termsVersion ? b.termsVersion : null;
  return { version };
}

/**
 * Whether the session answer itself says the terms are pending (a hub may add it to /app/session).
 * @param {unknown} session
 */
export const sessionNeedsTerms = (session) => Boolean(session && typeof session === "object" && /** @type {Record<string, unknown>} */ (session).needsTerms === true);

/**
 * The body of POST /terms/accept: the version the person read, when the hub named one.
 * @param {{ version: string | null } | null} gate
 */
export const acceptBody = (gate) => (gate?.version ? { version: gate.version } : {});

/**
 * What a POST /sample/delete answer means for the person, in Spanish.
 * @param {{ ok: boolean, status: number, body: unknown }} res
 * @returns {{ ok: boolean, text: string }}
 */
export function sampleDeleteResult(res) {
  if (res.ok) {
    const b = /** @type {Record<string, unknown> | null} */ (res.body && typeof res.body === "object" ? res.body : null);
    const removed = typeof b?.removed === "number" ? b.removed : null;
    return { ok: true, text: removed === 0 ? "No quedaba ningún ejemplo por borrar." : "Ejemplo borrado. Lo tuyo sigue ahí." };
  }
  if (res.status === 404) return { ok: false, text: "No hay ejemplo que borrar." };
  return { ok: false, text: "No se pudo borrar el ejemplo. Prueba otra vez." };
}
