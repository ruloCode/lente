// The page a browser gets from a hub with accounts before signing in (add-accounts 3.2): one button
// to sign in with Google. Task 8.1 gives it the full design; `<!--message-->` carries a refusal or
// an expired link back to the person in Spanish.

export const SIGNIN_PAGE = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lente · Entrar</title>
<style>body{font:18px system-ui;margin:0;min-height:100vh;display:grid;place-items:center;background:#111;color:#eee}
main{width:min(320px,90vw);text-align:center}a.go{display:block;font:inherit;padding:12px;margin-top:16px;border-radius:10px;background:#7cf;color:#012;text-decoration:none}
p{color:#aaa}p.msg{color:#f99;min-height:1.4em}</style></head>
<body><main><h1>Lente</h1><p>Entra con tu cuenta de Google para ver tus reuniones y tu memoria.</p>
<a class="go" href="/auth/google">Entrar con Google</a><p class="msg"><!--message--></p></main></body></html>`;
