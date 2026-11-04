// Route name → view. Each view returns `{ title, el, destroy }`.

import { appView, appsView } from "./apps.js";
import { devicesView } from "./devices.js";
import { homeView } from "./home.js";
import { meetingsView } from "./meetings.js";
import { memoryView } from "./memory.js";
import { projectView, projectsView } from "./projects.js";
import { settingsView } from "./settings.js";
import { tasksView } from "./tasks.js";
import { todayView } from "./today.js";

export const VIEWS = {
  home: homeView,
  tasks: tasksView,
  projects: projectsView,
  project: projectView,
  meetings: meetingsView,
  meeting: meetingsView,
  memory: memoryView,
  today: todayView,
  apps: appsView,
  app: appView,
  devices: devicesView,
  settings: settingsView,
};
