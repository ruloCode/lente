// Lente demo data and the state the demo remembers (localStorage). Fictional people and meetings, written for this demo.

const DEMO_KEY = "lente-demo-v1";

const MEETINGS = [
  { id: "qa", title: "Fecha de lanzamiento con QA", topic: "product", day: "Hoy", range: "10:24–10:36", dur: "12 min", people: ["Ana", "Marcos", "Tú"],
    summary: "Se confirmó el lanzamiento para el 14 si QA aprueba el lunes. Falta cerrar el presupuesto de QA y los números de ventas.",
    decisions: [["Lanzar el jueves 14 si QA aprueba el lunes.", 3], ["Congelar cambios de producto desde el viernes.", 6]],
    commitments: [["Tú", "Mandar los números de ventas", "vie 31", 5], ["Marcos", "Preparar las notas de la versión", "lun 3", 7]],
    open: [["¿Quién valida el texto final de la tienda?", 8]],
    glossary: ["sign off", "rollout", "QA", "code freeze"],
    turns: [
      ["Ana", "10:24", "Arranquemos con la fecha. ¿Cuándo salimos?"],
      ["Tú", "10:25", "Depende de QA; están cerrando las pruebas de pago."],
      ["Marcos", "10:27", "QA dice que el lunes nos dan el sign off si no aparece nada nuevo."],
      ["Ana", "10:28", "Entonces el 14 es realista, ¿no?"],
      ["Tú", "10:29", "Sí: el lanzamiento queda para el 14, con QA el lunes."],
      ["Ana", "10:31", "Perfecto. ¿Me mandas los números de ventas antes del viernes?"],
      ["Marcos", "10:33", "Y congelamos cambios desde el viernes, nada de último minuto."],
      ["Marcos", "10:34", "Yo preparo las notas de la versión para el lunes."],
      ["Ana", "10:35", "Queda pendiente quién valida el texto de la tienda."],
    ] },
  { id: "movil", title: "Diseño de la experiencia móvil", topic: "product", day: "Hoy", range: "11:02–11:18", dur: "16 min", people: ["Lucía", "Tú"],
    summary: "Se repasaron los flujos de registro y búsqueda; la tarjeta Dilo se queda en una sola línea.",
    decisions: [["La tarjeta Dilo muestra una sola línea.", 2]], commitments: [["Lucía", "Prototipo del menú lateral", "mar 4", 3]], open: [["¿Modo oscuro por defecto?", 4]],
    glossary: ["onboarding", "flow"],
    turns: [["Lucía", "11:02", "Veamos el registro primero."], ["Tú", "11:04", "El paso de la voz es el más delicado."], ["Lucía", "11:07", "La tarjeta Dilo debería ser de una línea."], ["Lucía", "11:10", "Me llevo el prototipo del menú lateral."], ["Tú", "11:15", "Falta decidir si el modo oscuro va por defecto."]] },
  { id: "q4", title: "Revisión del presupuesto Q4", topic: "client", day: "Ayer", range: "16:20–16:42", dur: "22 min", people: ["Ana", "Cliente Norte", "Tú"],
    summary: "El cliente Norte validó las cifras finales; Ana lleva el presupuesto de QA.",
    decisions: [["Cifras finales aprobadas por el cliente.", 2]], commitments: [["Ana", "Enviar el presupuesto de QA", "lun 3", 3]], open: [["¿Se amplía el alcance en enero?", 4]],
    glossary: ["forecast", "budget"],
    turns: [["Cliente Norte", "16:20", "Revisamos las cifras que mandaron."], ["Tú", "16:24", "Ajustamos el margen como pidieron."], ["Cliente Norte", "16:30", "Así está bien, quedan aprobadas."], ["Ana", "16:02", "Yo llevo el presupuesto de QA y lo mando el lunes."], ["Cliente Norte", "16:40", "En enero vemos si ampliamos el alcance."]] },
  { id: "retro", title: "Retro del sprint", topic: "team", day: "Ayer", range: "14:05–14:32", dur: "27 min", people: ["Marcos", "Lucía", "Tú"],
    summary: "Se compartieron aprendizajes y se definieron acciones para el próximo sprint.",
    decisions: [["Revisión de diseño los martes.", 1]], commitments: [["Tú", "Preparar la demo para el cliente", "jue 6", 2]], open: [],
    glossary: ["retro", "sprint"],
    turns: [["Marcos", "14:05", "¿Qué salió bien?"], ["Lucía", "14:10", "Propongo revisión de diseño los martes."], ["Tú", "14:20", "Yo preparo la demo para el cliente."]] },
];
const TOPIC = { product: ["Producto", "l-topic--product"], client: ["Clientes", "l-topic--client"], team: ["Equipo", "l-topic--team"] };

const ACTIONS = [
  { id: "mail-ana", kind: "mail", icon: "i-mail", title: "Correo de seguimiento a Ana", meeting: "qa", evidence: [4, 5],
    to: "Ana Gómez", subject: "Launch date and next steps",
    body: "Hi Ana,\n\nThanks for today. To confirm: we launch on Thursday the 14th if QA signs off on Monday, and we freeze changes from Friday.\n\nI'll send the sales numbers before Friday.\n\nBest,\nRulo",
    steps: ["Leyó la reunión «Fecha de lanzamiento con QA»", "Encontró 2 compromisos tuyos", "Redactó el correo en inglés", "Esperando tu aprobación"] },
  { id: "task-ventas", kind: "task", icon: "i-checkc", title: "Tarea: mandar números de ventas", meeting: "qa", evidence: [5], due: "vence vie 31" },
  { id: "rem-jue", kind: "reminder", icon: "i-bell", title: "Recordatorio jueves 17:00", meeting: "qa", evidence: [4], due: "un día antes del lanzamiento" },
];
const TASKS = [
  { id: "t1", text: "Revisar propuesta con diseño", due: "Hecho", done: true },
  { id: "t2", text: "Preparar la demo para el cliente", due: "jue 6" },
  { id: "t3", text: "Confirmar disponibilidad de Ana", due: "vie 31" },
];

const FACTS_REVIEW = [
  { id: "f1", kind: "person", text: "Ana lleva el presupuesto de QA del cliente Norte.", meeting: "q4", turn: 3 },
  { id: "f2", kind: "project", text: "El lanzamiento depende del sign off de QA del lunes.", meeting: "qa", turn: 2 },
];
const FACTS_KNOWN = {
  Personas: [["Ana", "Prefiere confirmaciones por escrito.", "qa"], ["Marcos", "Prepara las notas de cada versión.", "qa"], ["Lucía", "Diseña el menú lateral.", "movil"]],
  Proyectos: [["Lanzamiento", "Jueves 14, con code freeze desde el viernes.", "qa"], ["App móvil", "La tarjeta Dilo es de una línea.", "movil"]],
  Clientes: [["Cliente Norte", "Aprobó las cifras de Q4; revisa alcance en enero.", "q4"]],
};
const GLOSSARY = ["sign off", "rollout", "code freeze", "forecast", "deadline", "onboarding"];

const AGENTS = [
  { id: "constructor", name: "Constructor", where: "Nube", whereIcon: "i-cloud", sub: "Claude Managed Agents", task: "add-meeting-library 2.1", status: "work", mins: "14 min", cost: "US$1.20",
    log: [["user", "Construye el grupo 2 de add-meeting-library."], ["tool", "Leyó openspec/changes/add-meeting-library/tasks.md"], ["agent", "Voy con la búsqueda de reuniones; primero el texto plano, sin acentos."], ["tool", "Editó src/meetings.ts (+48 −6)"], ["tool", "Corrió pnpm test · 212 pasaron"], ["diff", "+ export function searchMeetings(q) {\n+   const k = fold(q);\n+   return meetings.filter((m) => fold(m.text).includes(k));\n+ }\n- export function search(q) { return []; }"], ["agent", "Listo: la búsqueda ignora acentos y mayúsculas. ¿Sigo con el detalle de reunión?"]] },
  { id: "investigador", name: "Investigador", where: "Nube", whereIcon: "i-cloud", sub: "Claude Managed Agents", task: "Resume las juntas de octubre", status: "work", mins: "1 h 03", cost: "US$1.87",
    log: [["user", "Resume las juntas de octubre en una página."], ["tool", "Leyó 9 reuniones"], ["agent", "Llevo 6 de 9. Tema común: fecha de lanzamiento y presupuesto de QA."]] },
  { id: "code", name: "Claude Code", where: "Este Mac", whereIcon: "i-laptop", sub: "~/dev/side/lente", task: "Arreglar test de pausa", status: "ask", mins: "47 min", cost: "US$0.96",
    log: [["user", "Arregla el test de pausa automática."], ["tool", "Corrió pnpm test · 211 pasaron, 1 falló: idle-pause.test.ts"], ["agent", "El test usa 15 min y el umbral es 20. ¿Cambio el test o el umbral?"]] },
  { id: "deploy", name: "Despliegue", where: "VPS", whereIcon: "i-server", sub: "vps-1 · Fráncfort", task: "Publicar v0.9 en producción", status: "perm", mins: "3 h 26", cost: "US$0.40",
    log: [["agent", "La rama main pasó CI. Listo para publicar v0.9."], ["tool", "docker build … done"], ["perm", "Quiere publicar v0.9 en producción. Efecto: reinicia el hub (10 s sin escuchar)."]] },
  { id: "voz", name: "Asistente de voz", where: "Teléfono", whereIcon: "i-phone", sub: "Este teléfono", task: "En pausa", status: "idle", mins: "—", cost: "US$0.00",
    log: [["agent", "En pausa. Di «Lente, …» para preguntarme algo."]] },
];
const STATUS = { work: ["Trabajando", "i-spin"], ask: ["Te pregunta", "i-hand"], perm: ["Pide permiso", "i-hand"], idle: ["En pausa", "i-pause"], done: ["Listo", "i-ok"] };

const ANSWERS = [
  { match: /promet|ana|ventas/i, text: "Le prometiste a Ana mandar los números de ventas antes del viernes, y confirmaste que el lanzamiento queda para el 14 si QA aprueba el lunes.", cites: [["qa", 5, "Fecha de lanzamiento · 10:31"], ["qa", 4, "Fecha de lanzamiento · 10:29"]] },
  { match: /presupuesto|q4|norte/i, text: "El cliente Norte aprobó las cifras finales de Q4. Ana enviará el presupuesto de QA el lunes.", cites: [["q4", 2, "Revisión Q4 · 16:30"], ["q4", 3, "Revisión Q4 · 16:02"]] },
  { match: /lanz|fecha|cu[aá]ndo/i, text: "El lanzamiento es el jueves 14, siempre que QA dé el sign off el lunes. Hay code freeze desde el viernes.", cites: [["qa", 4, "Fecha de lanzamiento · 10:29"], ["qa", 6, "Fecha de lanzamiento · 10:33"]] },
  { match: /dilo|tarjeta|dise[nñ]o/i, text: "En la reunión de diseño se decidió que la tarjeta Dilo muestra una sola línea.", cites: [["movil", 2, "Experiencia móvil · 11:07"]] },
];
const SUGGESTED = ["¿Qué le prometí a Ana?", "¿Cuándo es el lanzamiento?", "¿Cómo quedó el presupuesto Q4?"];

// ── Remembered demo state ───────────────────────────────────────────────────
const Demo = {
  s: (() => { try { return JSON.parse(localStorage.getItem(DEMO_KEY)) || {}; } catch { return {}; } })(),
  save() { try { localStorage.setItem(DEMO_KEY, JSON.stringify(this.s)); } catch {} },
  get(key, id) { return (this.s[key] || {})[id]; },
  set(key, id, v) { (this.s[key] ||= {})[id] = v; this.save(); document.dispatchEvent(new CustomEvent("lente:demo")); },
  reset() { this.s = {}; this.save(); },
  pendingActions() { return ACTIONS.filter((a) => !this.get("actions", a.id)).length; },
  pendingFacts() { return FACTS_REVIEW.filter((f) => !this.get("facts", f.id)).length; },
  pendingAgents() { return AGENTS.filter((a) => a.status === "perm" && !this.get("agents", a.id)).length; },
};
const meetingById = (id) => MEETINGS.find((m) => m.id === id) || MEETINGS[0];
