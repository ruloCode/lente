// Apps (add-lens-apps): the catalog as a grid, and an app's page with what it does, its languages, each
// permission in one sentence and the instructions it is given in full. Read-only for now: Probar,
// Instalar and Publicar are shown greyed out with «Pronto» until installs and trials land.

import { getJson } from "../api.js";
import { empty, failed, h, icon, loading, sectionTitle } from "../dom.js";
import { pathFor } from "../lib/routes.js";
import { lifecycle, reactive } from "../reactive.js";
import { emit } from "../store.js";

/** Each permission's icon on the app's page. */
const PERMISSION_ICONS = { camera: "camera", microphone: "mic", location: "pin", "memory.read": "brain", "memory.write": "edit" };

const soonTag = () => h("span", { class: "tag neutral" }, "Pronto");

/** A greyed-out action with «Pronto» beside its label. */
const soonButton = (label, iconName) => h("button", { type: "button", class: "btn", disabled: true, title: `${label}: pronto` }, icon(iconName), h("span", {}, label), soonTag());

/** Loads one hub route into a view's state and redraws `key` when it answers. */
function loader(path, key) {
  const data = { state: "loading", body: null };
  const load = async () => {
    try {
      data.body = await getJson(path);
      data.state = "ok";
    } catch (error) {
      data.state = error?.status === 404 ? "missing" : "error";
    }
    emit([key]);
  };
  return { data, load };
}

export function appsView() {
  const life = lifecycle();
  const { data, load } = loader("/apps", "apps-catalog");
  void load();
  const grid = reactive(["apps-catalog"], () => {
    if (data.state === "loading") return loading("Cargando apps…");
    if (data.state === "error") return failed("No se pudieron cargar las apps.", load);
    const apps = data.body?.apps ?? [];
    if (!apps.length) return empty("grid", "Aún no hay apps", "Las apps de Lente aparecerán aquí.");
    return h("ul", { class: "app-grid", role: "list" }, apps.map((a) => h("li", {}, appCard(a))));
  });
  life.track(grid.off);
  return {
    title: "Apps",
    el: h(
      "div",
      { class: "page apps-page" },
      h("header", { class: "page-head" }, h("div", {}, h("h1", {}, "Apps"), h("p", { class: "muted" }, "Lo que Lente puede hacer en tus gafas. Cada app dice qué permisos pide.")), soonButton("Publicar", "plus")),
      grid.el,
    ),
    destroy: life.teardown,
  };
}

function appCard(a) {
  return h(
    "a",
    { class: "card app-card", href: pathFor("app", { id: a.id }) },
    h("div", { class: "app-top" }, icon(a.icon, "app-icon"), h("div", { class: "app-name" }, h("h3", {}, a.name), h("div", { class: "row" }, a.builtIn ? h("span", { class: "tag" }, "Integrada") : null, a.soon ? soonTag() : null))),
    h("p", { class: "app-line muted" }, a.description),
  );
}

export function appView(params) {
  const life = lifecycle();
  const { data, load } = loader(`/apps/${encodeURIComponent(params.id)}`, "app-page");
  void load();
  const back = h("a", { class: "back", href: pathFor("apps") }, icon("back"), "Apps");
  const view = reactive(["app-page"], () => {
    if (data.state === "loading") return loading();
    if (data.state === "missing") return [back, empty("grid", "Esa app no existe", "Quizá la retiraron.", h("a", { class: "btn", href: pathFor("apps") }, "Ver apps"))];
    if (data.state === "error") return [back, failed("No se pudo abrir la app.", load)];
    const a = data.body.app;
    return [
      h(
        "header",
        { class: "page-head app-head" },
        h(
          "div",
          { class: "app-hero" },
          back,
          h("div", { class: "app-top" }, icon(a.icon, "app-icon big"), h("div", { class: "app-name" }, h("h1", {}, a.name), h("p", { class: "muted" }, `Por ${a.developer}`), h("div", { class: "row" }, a.builtIn ? h("span", { class: "tag" }, "Integrada") : null, a.soon ? soonTag() : null))),
        ),
        h("div", { class: "row app-actions" }, soonButton("Probar", "play"), soonButton("Instalar", "download")),
      ),
      h(
        "div",
        { class: "app-cols" },
        h(
          "section",
          { class: "card pad" },
          sectionTitle("Qué hace"),
          h("p", {}, a.description),
          sectionTitle("Idiomas"),
          h("ul", { class: "chips app-langs", role: "list" }, a.languages.map((l) => h("li", { class: "chip static" }, l.name, l.soon ? soonTag() : null))),
          a.content.length ? [sectionTitle("Contenido", a.content.length), h("ul", { class: "plain-list" }, a.content.map((c) => h("li", {}, c.title)))] : null,
        ),
        h(
          "section",
          { class: "card pad" },
          sectionTitle("Permisos", a.permissions.length),
          h("ul", { class: "perm-list", role: "list" }, a.permissions.map((p) => h("li", { class: "perm" }, icon(PERMISSION_ICONS[p.id] ?? "lock", "perm-icon"), h("div", {}, h("strong", {}, p.label), h("p", { class: "muted small" }, p.sentence))))),
        ),
      ),
      h("section", { class: "card pad" }, sectionTitle("Lo que se le dice a la app"), h("p", { class: "muted small" }, "Estas son sus instrucciones completas. Las reglas de Lente van siempre después y no se pueden cambiar."), h("p", { class: "persona" }, a.persona)),
    ];
  });
  life.track(view.off);
  return { title: "App", el: h("div", { class: "page apps-page" }, view.el), destroy: life.teardown };
}
