// The app's global actions, filled in by the layout when it mounts, so a view can open the chat or
// the record dialog without importing the layout (no import cycles).

export const app = {
  navigate: (_path, _opts) => {},
  openChat: (_question) => {},
  toggleChat: () => {},
  openRecord: () => {},
  openSearch: () => {},
  openHelp: () => {},
  /** The computer capture (capture.js), shared by Grabar, Dispositivos and the recording bar. */
  capture: null,
};
