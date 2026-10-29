// The only page an unpaired browser gets from a cloud hub: a field for the code the hub shows.

export const PAIR_PAGE = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lente · Vincular</title>
<style>body{font:18px system-ui;margin:0;min-height:100vh;display:grid;place-items:center;background:#111;color:#eee}
main{width:min(320px,90vw)}input,button{font:inherit;width:100%;box-sizing:border-box;padding:12px;margin-top:12px;border-radius:10px;border:0}
input{text-align:center;letter-spacing:.3em}button{background:#7cf;color:#012}p{color:#f99;min-height:1.4em}</style></head>
<body><main><h1>Vincular teléfono</h1><p style="color:#aaa">Escribe el código de 6 dígitos que muestra el hub.</p>
<input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" aria-label="Código"><button id="go">Vincular</button><p id="err"></p></main>
<script>
document.getElementById("go").onclick = async () => {
  const r = await fetch("/pair", { method: "POST", body: JSON.stringify({ code: document.getElementById("code").value }) });
  if (r.ok) location.reload();
  else document.getElementById("err").textContent = "Código incorrecto o vencido.";
};
</script></body></html>`;
