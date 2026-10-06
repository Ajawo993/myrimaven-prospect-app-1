/* Where prospects are saved.

   Today: the browser's localStorage, so data stays on one computer.
   Later: Supabase. To switch, rewrite these three functions to read and write
   a Supabase table instead. Nothing else in the app needs to change, because
   every component saves through ProspectsProvider, which only calls these. */

const KEY = "myrimaven-prospects-v1"; // same key as the first version, so saved data carries over
let cache = {};
let available = false;

/* -> { mode: "local" | "memory", prospects: Prospect[] } */
export async function loadProspects() {
  try {
    const raw = localStorage.getItem(KEY);
    localStorage.setItem(KEY + "-test", "1");
    localStorage.removeItem(KEY + "-test");
    cache = raw ? JSON.parse(raw) : {};
    available = true;
    return { mode: "local", prospects: Object.values(cache) };
  } catch {
    cache = {};
    available = false;
    return { mode: "memory", prospects: [] };
  }
}

function flush() {
  if (!available) return;
  localStorage.setItem(KEY, JSON.stringify(cache)); // throws if storage is full
}

export async function saveProspect(prospect) {
  cache[prospect.id] = prospect;
  flush();
}

export async function deleteProspect(id) {
  delete cache[id];
  flush();
}
