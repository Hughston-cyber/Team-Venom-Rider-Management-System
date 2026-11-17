const $ = selector => document.querySelector(selector);
const STORAGE_KEY = "team-venom-offline-v1";
const DEFAULT_SECONDS = 24 * 60 * 60;
let state = loadState();
let timerHandle = null;

function freshState() {
  return { eventName: "", riders: [], currentIndex: 0, remainingSeconds: DEFAULT_SECONDS, endsAt: null, running: false, activity: [] };
}
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved && Array.isArray(saved.riders) ? { ...freshState(), ...saved, running: false, endsAt: null } : freshState();
  } catch { return freshState(); }
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function displayName(name) { return (name || "").trim(); }
function initials(name) { return displayName(name).split(/\s+/).map(part => part[0]).slice(0,2).join("").toUpperCase() || "—"; }
function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600), m = Math.floor((safe % 3600) / 60), s = safe % 60;
  return [h,m,s].map(v => String(v).padStart(2,"0")).join(":");
}
function addActivity(message) {
  state.activity.unshift({ id: crypto.randomUUID(), message, at: new Date().toISOString(), pending: true });
  state.activity = state.activity.slice(0,100);
}
function render() {
  $("#event-name").value = state.eventName;
  const current = state.riders[state.currentIndex] || null;
  const next = state.riders[state.currentIndex + 1] || null;
  $("#current-avatar").textContent = current ? initials(current.name) : "—";
  $("#current-rider").textContent = current ? current.name : "No rider selected";
  $("#current-position").textContent = current ? `Rider ${state.currentIndex + 1} of ${state.riders.length}` : "Add riders to your roster";
  $("#next-avatar").textContent = next ? initials(next.name) : "—";
  $("#next-rider").textContent = next ? next.name : "No next rider";
  $("#next-position").textContent = next ? `Rider ${state.currentIndex + 2} of ${state.riders.length}` : "End of current roster";
  $("#changeover-button").disabled = !next;
  $("#rider-count").textContent = `${state.riders.length} RIDERS`;
  $("#countdown").textContent = formatTime(state.remainingSeconds);
  $("#timer-state").textContent = state.running ? "RUNNING" : state.remainingSeconds === 0 ? "FINISHED" : "READY / PAUSED";
  $("#timer-message").textContent = state.running ? "Race clock is running on this Mac." : state.remainingSeconds === DEFAULT_SECONDS ? "The race clock is ready to start." : "Race clock is paused.";
  $("#start-timer").disabled = state.running || state.remainingSeconds === 0;
  $("#stop-timer").disabled = !state.running;
  $("#roster-list").replaceChildren();
  state.riders.forEach((rider,index) => {
    const li = document.createElement("li");
    li.className = index === state.currentIndex ? "current" : "";
    li.textContent = rider.name + (index === state.currentIndex ? " · CURRENT" : index === state.currentIndex + 1 ? " · NEXT" : "");
    const remove = document.createElement("button");
    remove.type = "button"; remove.textContent = "REMOVE"; remove.setAttribute("aria-label", `Remove ${rider.name}`);
    remove.addEventListener("click", () => removeRider(index));
    li.append(remove); $("#roster-list").append(li);
  });
  $("#activity-list").replaceChildren();
  if (!state.activity.length) {
    const empty = document.createElement("p"); empty.className = "muted"; empty.textContent = "No activity recorded yet."; $("#activity-list").append(empty);
  } else state.activity.forEach(item => {
    const row = document.createElement("div"); row.className = "activity-item";
    const message = document.createElement("span"); message.textContent = item.message;
    const time = document.createElement("time"); time.textContent = new Date(item.at).toLocaleString("en-AU");
    row.append(message,time); $("#activity-list").append(row);
  });
  $("#pending-count").textContent = `${state.activity.filter(item => item.pending).length} PENDING`;
  $("#changeover-status").textContent = state.riders.length ? "Changes are saved locally on this Mac." : "Set up a roster to begin.";
}
function removeRider(index) {
  if (state.running) return alert("Pause the race clock before editing the roster.");
  if (!confirm(`Remove ${state.riders[index].name} from this local roster?`)) return;
  state.riders.splice(index,1);
  if (index < state.currentIndex) state.currentIndex--;
  state.currentIndex = Math.min(state.currentIndex, Math.max(0,state.riders.length - 1));
  addActivity("Removed a rider from the local roster."); saveState(); render();
}
function tick() {
  if (!state.running || !state.endsAt) return;
  state.remainingSeconds = Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000));
  if (state.remainingSeconds === 0) {
    state.running = false; state.endsAt = null; addActivity("The 24-hour race clock finished."); clearInterval(timerHandle); timerHandle = null;
  }
  saveState(); render();
}
function startClock() {
  if (state.running || state.remainingSeconds <= 0) return;
  state.running = true; state.endsAt = Date.now() + state.remainingSeconds * 1000;
  addActivity("Started the 24-hour race clock."); saveState(); render();
  timerHandle = setInterval(tick, 250);
}
function stopClock() {
  if (!state.running) return;
  tick(); state.running = false; state.endsAt = null;
  addActivity("Paused the race clock."); clearInterval(timerHandle); timerHandle = null; saveState(); render();
}
function resetClock() {
  if (!confirm("Restart the race clock at 24:00:00?")) return;
  clearInterval(timerHandle); timerHandle = null;
  state.running = false; state.endsAt = null; state.remainingSeconds = DEFAULT_SECONDS;
  addActivity("Reset the race clock to 24 hours."); saveState(); render();
}
$("#event-name").addEventListener("change", event => { state.eventName = event.target.value.trim(); saveState(); });
$("#add-rider-form").addEventListener("submit", event => {
  event.preventDefault(); const name = displayName($("#new-rider").value);
  if (!name) return;
  state.riders.push({ id: crypto.randomUUID(), name }); $("#new-rider").value = "";
  addActivity(`Added ${name} to the roster.`); saveState(); render();
});
$("#changeover-button").addEventListener("click", () => {
  const previous = state.riders[state.currentIndex], next = state.riders[state.currentIndex + 1];
  if (!next) return;
  if (!confirm(`Confirm changeover?\n\n${previous.name} → ${next.name}`)) return;
  state.currentIndex++;
  addActivity(`Changeover: ${previous.name} → ${next.name}. Next rider: ${state.riders[state.currentIndex + 1]?.name || "End of roster"}.`);
  saveState(); render();
});
$("#start-timer").addEventListener("click", startClock);
$("#stop-timer").addEventListener("click", stopClock);
$("#reset-timer").addEventListener("click", resetClock);
$("#export-button").addEventListener("click", async () => {
  try {
    const result = await window.venomDesktop.exportBackup({ format: "team-venom-offline-backup", version: 1, exportedAt: new Date().toISOString(), state });
    if (!result.canceled) alert("Backup exported successfully.");
  } catch (error) { alert("Could not export backup: " + error.message); }
});
$("#import-button").addEventListener("click", async () => {
  try {
    const result = await window.venomDesktop.importBackup();
    if (result.canceled) return;
    if (result.data?.format !== "team-venom-offline-backup" || result.data?.version !== 1 || !Array.isArray(result.data?.state?.riders)) throw new Error("This is not a recognised Team Venom backup.");
    if (!confirm("Import this backup and replace the current local roster and activity?")) return;
    state = { ...freshState(), ...result.data.state, running: false, endsAt: null };
    saveState(); render(); alert("Backup imported.");
  } catch (error) { alert("Could not import backup: " + error.message); }
});
function updateLocalClock() {
  const now = new Date().toLocaleTimeString("en-AU", { hour12: false });
  $("#local-clock").textContent = now; $("#event-time").textContent = now;
}
updateLocalClock(); setInterval(updateLocalClock,1000); render();
