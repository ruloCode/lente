// Runs before the first paint (a classic script, so it blocks): the user's theme choice, if any,
// overrides the system's. Only the choice is stored, never content.
try {
  const theme = localStorage.getItem("lente.theme");
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
} catch {
  // Storage blocked: the system theme applies.
}
