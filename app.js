const SUPABASE_URL = "https://xqfbmioydhuycvvkafwq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_xPxK2aWz7gIkafxhiMIVGQ_mG77O6dD";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
let emergencyAudioContext = null;
let emergencyAudioUnlocked = false;
function unlockEmergencyAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  if (!emergencyAudioContext) emergencyAudioContext = new AudioContextClass();
  emergencyAudioContext.resume().then(() => { emergencyAudioUnlocked = emergencyAudioContext.state === "running"; }).catch(() => {});
}
window.addEventListener("pointerdown", unlockEmergencyAudio, { passive: true });
window.addEventListener("keydown", unlockEmergencyAudio);
function playEmergencyBeepBeep() {
  if (!emergencyAudioContext || !emergencyAudioUnlocked || emergencyAudioContext.state !== "running") return;
  const ctx = emergencyAudioContext;
  const now = ctx.currentTime;
  [880, 660].forEach((frequency, index) => {
    const start = now + index * 0.32;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.16, start + 0.025);
    gain.gain.setValueAtTime(0.16, start + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.23);
  });
}
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", event => {
    if (event.data?.type === "TEAM_VENOM_EMERGENCY_ALERT") playEmergencyBeepBeep();
  });
}


const authScreen = document.querySelector("#auth-screen");
const appShell = document.querySelector("#app-shell");
const loginForm = document.querySelector("#login-form");
const loginMessage = document.querySelector("#auth-message");
const loginButton = document.querySelector("#login-submit");
const title = document.querySelector("#page-title");
const description = document.querySelector("#page-description");
const breadcrumb = document.querySelector("#breadcrumb-current");

const pageCopy = {
  "rider-workspace": ["Rider workspace.", "Your personal Team Venom rider information and upcoming rostered stints."],
  overview: ["Race Control.", "Your live command centre for race-day operations, rider handovers and team coordination."],
  riders: ["Rider directory.", "Manage rider profiles, contact records and eligibility."],
  rosters: ["Roster management.", "Build, review and publish race rosters and stint allocations."],
  "roster-versions": ["Roster versions.", "Manage draft and published roster versions without overwriting existing schedules."],
  "race-day": ["Race-day control.", "Monitor live rider handovers and the 24-hour race clock."],
  performance: ["Performance centre.", "Review rider participation and team performance statistics."],
  "changeover-log": ["Changeover log.", "Review the recorded rider handovers, stint times and race-clock differences."],
  notifications: ["Notifications.", "View in-app updates and send team announcements."],
  settings: ["System settings.", "Review account access and notification preferences."],
  accounts: ["Account management.", "Invite riders and manage their Team Venom login access."],
  operations: ["Operations hub.", "Emergency contacts, incident reporting, rider availability and race-weekend coordination."],
  "event-schedule": ["Event schedule.", "Plan every activity across your Team Venom race weekend and track what is coming up next."]
};

let currentRoles = [];
let ridersCache = [];
let editingRiderId = null;

function isAdministrator() {
  return currentRoles.includes("administrator");
}

function showMessage(message, isError = true) {
  loginMessage.textContent = message;
  loginMessage.style.color = isError ? "#ffb6a9" : "var(--green)";
}

function selectView(view) {
  if (view === "race-day") view = "overview";
  if (view === "accounts" && !isAdministrator()) view = "overview";
  if (currentRoles.includes("member") && !currentRoles.some(role => ["administrator", "manager"].includes(role))) {
    const memberViews = ["rider-workspace", "race-day", "notifications", "settings", "operations"];
    if (!memberViews.includes(view)) view = "rider-workspace";
  }
  const copy = pageCopy[view] || pageCopy.overview;
  title.textContent = copy[0];
  const accent = document.createElement("span");
  title.append(accent);
  description.textContent = copy[1];
  breadcrumb.textContent = view.replace("-", " ").toUpperCase();
  const clearLogButton = document.querySelector("#clear-changeover-log");
  if (clearLogButton) clearLogButton.hidden = !canManageRiders();
  document.querySelectorAll("[data-view]").forEach(button => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  const views = ["rider-workspace","overview","riders","rosters","roster-versions","performance","changeover-log","notifications","accounts","settings","operations","event-schedule"];
  views.forEach(name => {
    const node = document.querySelector("#" + (name === "race-day" ? "race-day" : name) + "-content");
    if (node) node.hidden = view !== name;
  });
  document.querySelector("#rider-profile-content").hidden = true;
  document.querySelector("#sidebar").classList.remove("open");
  if (view === "rider-workspace") loadRiderWorkspace();
  if (view === "overview") loadRaceDay();
  if (view === "riders") loadRiders();
  if (view === "rosters") loadRosters();
  if (view === "roster-versions") loadRosters();
  if (view === "race-day") loadRaceDay();
  if (view === "performance") loadPerformance();
  if (view === "changeover-log") { void loadRaceDay(); void loadChangeoverLog(); }
  if (view === "notifications") loadNotifications();
  if (view === "accounts") { loadRiderAccounts(); loadTeamVenomGmailStatus(); }
  if (view === "settings") loadSettings();
  if (view === "operations") window.loadOperationsHub?.();
  if (view === "event-schedule") loadEventSchedule();
}
document.querySelectorAll("[data-view]").forEach(button => {
  button.addEventListener("click", () => selectView(button.dataset.view));
});
document.querySelector("#refresh-changeover-log")?.addEventListener("click", () => loadChangeoverLog());
document.querySelector("#export-changeover-log")?.addEventListener("click", () => { void exportChangeoverLogToExcel(); });
document.querySelector("#clear-changeover-log")?.addEventListener("click", async () => {
  if (!canManageRiders() || !liveSelectedEventId) return;
  const confirmed = window.confirm("Clear every changeover log for this event? This permanently deletes the test records and cannot be undone.");
  if (!confirmed) return;
  const button = document.querySelector("#clear-changeover-log");
  button.disabled = true;
  button.textContent = "Clearing…";
  const { data, error } = await supabaseClient.rpc("clear_race_changeover_log", { p_event_id: liveSelectedEventId });
  button.disabled = false;
  button.textContent = "Clear logs";
  if (error) { window.alert("Could not clear the changeover log: " + error.message); return; }
  raceChangeoverLog = [];
  renderChangeoverLog();
  window.alert((Number(data) || 0) + " changeover record(s) cleared for this event.");
});
document.querySelector("#menu-toggle").addEventListener("click", () => {
  document.querySelector("#sidebar").classList.toggle("open");
});
const signoutDialog = document.querySelector("#signout-dialog");
const confirmSignoutButton = document.querySelector("#confirm-signout");

document.querySelector("#signout-button").addEventListener("click", () => {
  if (signoutDialog && typeof signoutDialog.showModal === "function") {
    signoutDialog.showModal();
  } else if (window.confirm("Are you sure you want to sign out of Team Venom Rider Management?")) {
    performSignout();
  }
});

document.querySelector("#cancel-signout").addEventListener("click", () => {
  signoutDialog.close();
});

confirmSignoutButton.addEventListener("click", performSignout);

async function performSignout() {
  confirmSignoutButton.disabled = true;
  confirmSignoutButton.textContent = "Signing out…";
  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    showMessage("Sign out failed. Please try again.");
    confirmSignoutButton.disabled = false;
    confirmSignoutButton.textContent = "Yes, sign out";
    signoutDialog.close();
    return;
  }
}

function canManageRiders() {
  return currentRoles.some(role => ["administrator", "manager"].includes(role));
}

function renderRiders() {
  const search = document.querySelector("#rider-search").value.trim().toLowerCase();
  const status = document.querySelector("#rider-status-filter").value;
  const filtered = ridersCache.filter(rider => {
    const name = [rider.preferred_name, rider.first_name, rider.last_name, rider.rider_number].filter(Boolean).join(" ").toLowerCase();
    return name.includes(search) && (status === "all" || rider.status === status);
  });
  document.querySelector("#rider-count").textContent = `${ridersCache.length} ${ridersCache.length === 1 ? "rider" : "riders"} registered`;
  const list = document.querySelector("#rider-list");
  list.replaceChildren();
  document.querySelector("#rider-loading").hidden = true;
  document.querySelector("#rider-error").hidden = true;
  document.querySelector("#rider-empty").hidden = true;
  list.hidden = false;
  if (!filtered.length) {
    list.hidden = true;
    document.querySelector("#rider-empty").hidden = false;
    document.querySelector("#rider-empty").textContent = ridersCache.length ? "No riders match those filters." : "No riders have been added yet.";
    return;
  }
  filtered.forEach(rider => {
    const row = document.createElement("article");
    row.className = "rider-row rider-row-clickable";
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `Open profile for ${rider.first_name} ${rider.last_name}`);
    const initials = `${rider.first_name?.[0] || ""}${rider.last_name?.[0] || ""}`.toUpperCase();
    const displayName = rider.preferred_name
      ? `${rider.preferred_name} ${rider.last_name}`
      : `${rider.first_name} ${rider.last_name}`;
    const identity = document.createElement("div");
    identity.className = "rider-identity";
    let avatar;
    if (rider.photo_url) {
      avatar = document.createElement("img");
      avatar.className = "rider-avatar rider-photo";
      avatar.src = rider.photo_url;
      avatar.alt = `${displayName} profile photograph`;
      avatar.loading = "lazy";
    } else {
      avatar = document.createElement("span");
      avatar.className = "rider-avatar";
      avatar.textContent = initials;
    }
    const nameBlock = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = displayName;
    const legal = document.createElement("small");
    legal.textContent = rider.preferred_name ? `${rider.first_name} ${rider.last_name}` : "Team Venom rider";
    nameBlock.append(name, legal);
    identity.append(avatar, nameBlock);
    const number = document.createElement("span");
    number.className = "rider-number";
    number.textContent = rider.rider_number ? `#${rider.rider_number}` : "No number";
    const badge = document.createElement("span");
    badge.className = `status-badge status-${rider.status}`;
    badge.textContent = rider.status;
    row.append(identity, number, badge);
    if (canManageRiders()) {
      const actions = document.createElement("div");
      actions.className = "rider-row-actions";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "text-button";
      edit.textContent = "Edit";
      edit.addEventListener("click", event => { event.stopPropagation(); startRiderEdit(rider.id); });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "text-button rider-delete-button";
      remove.textContent = "Delete";
      remove.addEventListener("click", event => { event.stopPropagation(); deleteRider(rider.id); });
      actions.append(edit, remove);
      row.append(actions);
    }
    row.addEventListener("click", () => openRiderProfile(rider.id));
    row.addEventListener("keydown", event => { if (event.target === row && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openRiderProfile(rider.id); } });
    list.append(row);
  });
}


function formatLapTime(seconds) {
  if (seconds === null || seconds === undefined || !Number.isFinite(Number(seconds))) return "—";
  const value = Number(seconds);
  const minutes = Math.floor(value / 60);
  const remainder = (value % 60).toFixed(1).padStart(4, "0");
  return minutes ? `${minutes}:${remainder}` : `${remainder}s`;
}

async function openRiderProfile(riderId) {
  const rider = ridersCache.find(item => item.id === riderId);
  if (!rider) return;
  document.querySelector("#overview-content").hidden = true;
  document.querySelector("#riders-content").hidden = true;
  document.querySelector("#rosters-content").hidden = true;
  document.querySelector("#rider-profile-content").hidden = false;
  document.querySelector("#breadcrumb-current").textContent = "RIDERS / PROFILE";
  document.querySelectorAll("[data-view]").forEach(button => button.classList.toggle("active", button.dataset.view === "riders"));

  const displayName = rider.preferred_name ? `${rider.preferred_name} ${rider.last_name}` : `${rider.first_name} ${rider.last_name}`;
  document.querySelector("#profile-name").textContent = displayName;
  const profileTitleAccent = document.createElement("span");
  document.querySelector("#profile-name").append(profileTitleAccent);
  document.querySelector("#profile-legal-name").textContent = rider.preferred_name ? `Registered name: ${rider.first_name} ${rider.last_name}` : "Team Venom registered rider";
  document.querySelector("#profile-number").textContent = rider.rider_number ? `#${rider.rider_number}` : "No rider number";
  const status = document.querySelector("#profile-status");
  status.textContent = rider.status;
  status.className = `status-badge status-${rider.status}`;
  const avatar = document.querySelector("#profile-avatar");
  avatar.replaceChildren();
  if (rider.photo_url) {
    const img = document.createElement("img");
    img.src = rider.photo_url;
    img.alt = `${displayName} profile photograph`;
    avatar.append(img);
  } else {
    avatar.textContent = `${rider.first_name?.[0] || ""}${rider.last_name?.[0] || ""}`.toUpperCase();
  }

  ["#profile-stints", "#profile-laps", "#profile-events", "#profile-best-lap"].forEach(selector => {
    document.querySelector(selector).textContent = "…";
  });
  const history = document.querySelector("#profile-history");
  history.textContent = "Loading race history…";

  const { data: stints, error } = await supabaseClient
    .from("race_stints")
    .select("id,actual_start,actual_end,laps_completed,best_lap_seconds,race_events!race_stints_event_id_fkey(event_name,season_year,venue,start_date)")
    .eq("rider_id", riderId)
    .order("actual_start", { ascending: false });

  if (error) {
    history.textContent = "Race history is currently unavailable.";
    ["#profile-stints", "#profile-laps", "#profile-events", "#profile-best-lap"].forEach(selector => {
      document.querySelector(selector).textContent = "—";
    });
  } else {
    const rows = stints || [];
    const totalLaps = rows.reduce((sum, stint) => sum + (Number(stint.laps_completed) || 0), 0);
    const eventIds = new Set(rows.map(stint => stint.race_events?.event_name ? `${stint.race_events.event_name}-${stint.race_events.season_year}` : null).filter(Boolean));
    const bestLap = rows.map(stint => Number(stint.best_lap_seconds)).filter(value => Number.isFinite(value) && value > 0).sort((a,b) => a-b)[0];
    document.querySelector("#profile-stints").textContent = rows.length.toLocaleString("en-AU");
    document.querySelector("#profile-laps").textContent = totalLaps.toLocaleString("en-AU");
    document.querySelector("#profile-events").textContent = eventIds.size.toLocaleString("en-AU");
    document.querySelector("#profile-best-lap").textContent = bestLap ? formatLapTime(bestLap) : "—";
    history.replaceChildren();
    if (!rows.length) {
      history.textContent = "No race stints have been recorded for this rider yet.";
    } else {
      rows.forEach(stint => {
        const item = document.createElement("article");
        item.className = "history-item";
        const event = stint.race_events;
        const heading = document.createElement("strong");
        heading.textContent = event?.event_name || "Race event";
        const meta = document.createElement("small");
        const details = [event?.season_year, event?.venue, stint.actual_start ? new Date(stint.actual_start).toLocaleDateString("en-AU") : null].filter(Boolean);
        meta.textContent = details.join(" · ") || "Event details not recorded";
        const metrics = document.createElement("span");
        const parts = [];
        if (stint.laps_completed !== null) parts.push(`${stint.laps_completed} laps`);
        if (stint.best_lap_seconds) parts.push(`Best ${formatLapTime(stint.best_lap_seconds)}`);
        metrics.textContent = parts.join("  /  ") || "No stint metrics recorded";
        item.append(heading, meta, metrics);
        history.append(item);
      });
    }
  }

  const notesPanel = document.querySelector("#private-notes-panel");
  notesPanel.hidden = !canManageRiders();
  if (canManageRiders()) {
    const notesField = document.querySelector("#profile-private-notes");
    const notesMessage = document.querySelector("#private-notes-message");
    notesField.value = "";
    notesMessage.textContent = "Loading notes…";
    const { data: note, error: noteError } = await supabaseClient
      .from("rider_private_notes")
      .select("notes")
      .eq("rider_id", riderId)
      .maybeSingle();
    if (noteError) {
      notesMessage.textContent = "Private notes could not be loaded.";
      notesMessage.className = "inline-message error-state";
    } else {
      notesField.value = note?.notes || "";
      notesMessage.textContent = note ? "Private notes loaded." : "No private notes saved.";
      notesMessage.className = "inline-message";
    }
    document.querySelector("#save-private-notes").onclick = async () => {
      const saveButton = document.querySelector("#save-private-notes");
      saveButton.disabled = true;
      saveButton.textContent = "Saving…";
      const { error: saveError } = await supabaseClient
        .from("rider_private_notes")
        .upsert({ rider_id: riderId, notes: notesField.value, updated_at: new Date().toISOString() }, { onConflict: "rider_id" });
      saveButton.disabled = false;
      saveButton.textContent = "Save notes";
      notesMessage.textContent = saveError ? "Notes could not be saved. Please try again." : "Private notes saved.";
      notesMessage.className = saveError ? "inline-message error-state" : "inline-message success-message";
    };
  }
}

document.querySelector("#back-to-riders").addEventListener("click", () => {
  document.querySelector("#rider-profile-content").hidden = true;
  selectView("riders");
});

async function startRiderEdit(riderId) {
  if (!canManageRiders()) return;
  const rider = ridersCache.find(item => item.id === riderId);
  if (!rider) return;
  editingRiderId = rider.id;
  const form = document.querySelector("#rider-form");
  form.elements.first_name.value = rider.first_name || "";
  form.elements.last_name.value = rider.last_name || "";
  form.elements.preferred_name.value = rider.preferred_name || "";
  form.elements.rider_number.value = rider.rider_number || "";
  form.elements.status.value = rider.status || "active";
  form.elements.photo.value = "";
  document.querySelector("#rider-form-panel").hidden = false;
  document.querySelector("#rider-form-panel .eyebrow").textContent = "EDIT DATABASE RECORD";
  document.querySelector("#rider-form-panel h2").textContent = "Edit rider";
  document.querySelector("#save-rider-button").textContent = "Save changes";
  document.querySelector("#rider-form-message").textContent = "Leave the photograph field empty to keep the current photo.";
  document.querySelector("#rider-form-panel").scrollIntoView({ behavior: "smooth", block: "center" });
  form.elements.first_name.focus();
}

async function deleteRider(riderId) {
  if (!canManageRiders()) return;
  const rider = ridersCache.find(item => item.id === riderId);
  if (!rider) return;
  const name = rider.preferred_name ? `${rider.preferred_name} ${rider.last_name}` : `${rider.first_name} ${rider.last_name}`;
  const relatedChecks = await Promise.all([
    supabaseClient.from("race_stints").select("id", { count: "exact", head: true }).eq("rider_id", riderId),
    supabaseClient.from("roster_stints").select("id", { count: "exact", head: true }).eq("rider_id", riderId),
    supabaseClient.from("event_riders").select("event_id", { count: "exact", head: true }).eq("rider_id", riderId)
  ]);
  if (relatedChecks.some(result => result.error)) {
    alert("The system could not verify this rider's history. Nothing was deleted.");
    return;
  }
  const historyCount = relatedChecks.reduce((sum, result) => sum + (result.count || 0), 0);
  if (historyCount > 0) {
    alert(`${name} has ${historyCount} linked race or roster record(s). To protect Team Venom's history, permanent deletion is blocked. Edit the rider and change their status to Inactive or Retired instead.`);
    return;
  }
  if (!confirm(`Permanently delete ${name}? This cannot be undone.`)) return;
  const { error: notesError } = await supabaseClient.from("rider_private_notes").delete().eq("rider_id", riderId);
  if (notesError) {
    alert("Private notes could not be cleared, so the rider record was kept.");
    return;
  }
  const { error } = await supabaseClient.from("riders").delete().eq("id", riderId);
  if (error) {
    alert("The rider could not be deleted. Check your permissions and try again.");
    return;
  }
  if (rider.photo_path) {
    await supabaseClient.storage.from("rider-photos").remove([rider.photo_path]);
  }
  await loadRiders();
  document.querySelector("#rider-form-message").textContent = `${name} was deleted.`;
  document.querySelector("#rider-form-message").className = "inline-message success-message";
}

async function loadRiders() {
  const loading = document.querySelector("#rider-loading");
  const list = document.querySelector("#rider-list");
  const empty = document.querySelector("#rider-empty");
  const errorBox = document.querySelector("#rider-error");
  loading.hidden = false;
  list.hidden = true;
  empty.hidden = true;
  errorBox.hidden = true;
  const { data, error } = await supabaseClient
    .from("riders")
    .select("id,rider_number,first_name,last_name,preferred_name,status,photo_path")
    .order("last_name", { ascending: true });
  loading.hidden = true;
  if (error) {
    errorBox.hidden = false;
    document.querySelector("#rider-count").textContent = "Unable to load records";
    return;
  }
  ridersCache = await Promise.all((data || []).map(async rider => {
    if (!rider.photo_path) return rider;
    const { data: signed, error: photoError } = await supabaseClient.storage.from("rider-photos").createSignedUrl(rider.photo_path, 3600);
    return { ...rider, photo_url: photoError ? null : signed.signedUrl };
  }));
  renderRiders();
}

document.querySelector("#rider-search").addEventListener("input", renderRiders);
document.querySelector("#rider-status-filter").addEventListener("change", renderRiders);
document.querySelector("#refresh-riders").addEventListener("click", loadRiders);
document.querySelector("#add-rider-toggle").addEventListener("click", () => {
  editingRiderId = null;
  document.querySelector("#rider-form").reset();
  document.querySelector("#rider-form-panel .eyebrow").textContent = "NEW DATABASE RECORD";
  document.querySelector("#rider-form-panel h2").textContent = "Add a rider";
  document.querySelector("#save-rider-button").textContent = "Save rider";
  document.querySelector("#rider-form-panel").hidden = false;
  document.querySelector("#rider-form").elements.first_name.focus();
});
document.querySelector("#cancel-add-rider").addEventListener("click", () => {
  editingRiderId = null;
  document.querySelector("#rider-form-panel").hidden = true;
  document.querySelector("#rider-form").reset();
  document.querySelector("#rider-form-panel .eyebrow").textContent = "NEW DATABASE RECORD";
  document.querySelector("#rider-form-panel h2").textContent = "Add a rider";
  document.querySelector("#save-rider-button").textContent = "Save rider";
  document.querySelector("#rider-form-message").textContent = "";
});
document.querySelector("#rider-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!canManageRiders()) return;
  const form = event.currentTarget;
  const submit = document.querySelector("#save-rider-button");
  const message = document.querySelector("#rider-form-message");
  const values = Object.fromEntries(new FormData(form).entries());
  const photo = values.photo;
  delete values.photo;
  values.first_name = values.first_name.trim();
  values.last_name = values.last_name.trim();
  values.preferred_name = values.preferred_name.trim() || null;
  values.rider_number = values.rider_number.trim() || null;
  if (photo && photo.size) {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(photo.type) || photo.size > 5 * 1024 * 1024) {
      message.textContent = "Choose a JPEG, PNG or WebP image no larger than 5 MB.";
      message.className = "inline-message error-state";
      return;
    }
  }
  if (editingRiderId) {
    submit.disabled = true;
    submit.textContent = "Saving…";
    message.textContent = "";
    let newPhotoPath = null;
    if (photo && photo.size) {
      const extension = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
      newPhotoPath = `${editingRiderId}/profile-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabaseClient.storage.from("rider-photos").upload(newPhotoPath, photo, { contentType: photo.type, upsert: false });
      if (uploadError) {
        submit.disabled = false;
        submit.textContent = "Save changes";
        message.textContent = "The new photograph could not be uploaded. No rider details were changed.";
        message.className = "inline-message error-state";
        return;
      }
      values.photo_path = newPhotoPath;
    }
    const previousPhotoPath = ridersCache.find(item => item.id === editingRiderId)?.photo_path;
    const { error: updateError } = await supabaseClient.from("riders").update(values).eq("id", editingRiderId);
    if (updateError) {
      if (newPhotoPath) await supabaseClient.storage.from("rider-photos").remove([newPhotoPath]);
      submit.disabled = false;
      submit.textContent = "Save changes";
      message.textContent = "Rider details could not be updated. Check your access and try again.";
      message.className = "inline-message error-state";
      return;
    }
    if (newPhotoPath && previousPhotoPath) await supabaseClient.storage.from("rider-photos").remove([previousPhotoPath]);
    editingRiderId = null;
    submit.disabled = false;
    submit.textContent = "Save rider";
    form.reset();
    document.querySelector("#rider-form-panel").hidden = true;
    document.querySelector("#rider-form-panel .eyebrow").textContent = "NEW DATABASE RECORD";
    document.querySelector("#rider-form-panel h2").textContent = "Add a rider";
    message.textContent = "Rider details updated successfully.";
    message.className = "inline-message success-message";
    await loadRiders();
    return;
  }
  submit.disabled = true;
  submit.textContent = "Saving…";
  message.textContent = "";
  const { data: inserted, error: insertError } = await supabaseClient.from("riders").insert(values).select("id").single();
  if (insertError || !inserted) {
    submit.disabled = false;
    submit.textContent = "Save rider";
    message.textContent = "The rider could not be saved. Check your access or try again.";
    message.className = "inline-message error-state";
    return;
  }
  if (photo && photo.size) {
    const extension = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
    const photoPath = `${inserted.id}/profile-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabaseClient.storage.from("rider-photos").upload(photoPath, photo, { contentType: photo.type, upsert: false });
    if (uploadError) {
      await supabaseClient.from("riders").delete().eq("id", inserted.id);
      submit.disabled = false;
      submit.textContent = "Save rider";
      message.textContent = "The rider photo could not be uploaded, so the rider record was not kept. Please try again.";
      message.className = "inline-message error-state";
      return;
    }
    const { error: photoSaveError } = await supabaseClient.from("riders").update({ photo_path: photoPath }).eq("id", inserted.id);
    if (photoSaveError) {
      await supabaseClient.storage.from("rider-photos").remove([photoPath]);
      await supabaseClient.from("riders").delete().eq("id", inserted.id);
      submit.disabled = false;
      submit.textContent = "Save rider";
      message.textContent = "The photo could not be linked to the rider. Nothing was saved; please try again.";
      message.className = "inline-message error-state";
      return;
    }
  }
  submit.disabled = false;
  submit.textContent = "Save rider";
  form.reset();
  document.querySelector("#rider-form-panel").hidden = true;
  message.textContent = photo && photo.size ? "Rider and photograph added successfully." : "Rider added successfully.";
  message.className = "inline-message success-message";
  await loadRiders();
});

let authRenderVersion = 0;
let loginRequestInProgress = false;
let loginCooldownUntil = 0;
let loginCooldownTimer = null;

function restoreLoginButton() {
  if (loginCooldownTimer) {
    clearTimeout(loginCooldownTimer);
    loginCooldownTimer = null;
  }
  loginButton.disabled = false;
  updateLoginModeFields();
}

function applyLoginCooldown(message) {
  loginCooldownUntil = Date.now() + 60_000;
  loginButton.disabled = true;
  loginButton.textContent = "Please wait before retrying…";
  showMessage(message, true);
  if (loginCooldownTimer) clearTimeout(loginCooldownTimer);
  loginCooldownTimer = setTimeout(() => {
    loginCooldownTimer = null;
    if (!loginRequestInProgress) restoreLoginButton();
  }, 60_000);
}

async function loadRiderWorkspace() {
  const message = document.querySelector("#rider-workspace-message");
  const details = document.querySelector("#rider-workspace-details");
  const stintsList = document.querySelector("#rider-workspace-stints");
  if (!currentRiderId || !currentUser) { message.textContent = "Your rider profile is not linked. Please contact a Team Venom administrator."; details.replaceChildren(); stintsList.replaceChildren(); return; }
  message.textContent = "Loading your rider information…";
  const [{ data: rider, error: riderError }, { data: stints, error: stintsError }] = await Promise.all([
    supabaseClient.from("riders").select("id,first_name,last_name,preferred_name,rider_number,status").eq("id", currentRiderId).maybeSingle(),
    supabaseClient.from("roster_stints").select("id,stint_number,scheduled_start,scheduled_end,rosters!inner(status)").eq("rider_id", currentRiderId).eq("rosters.status", "published").gte("scheduled_end", new Date().toISOString()).order("scheduled_start", { ascending: true }).limit(20)
  ]);
  if (riderError || !rider) { message.textContent = "Your rider profile could not be loaded. Contact a Team Venom administrator."; return; }
  details.replaceChildren(); const name = document.createElement("h2");
  name.textContent = rider.preferred_name ? rider.preferred_name + " " + rider.last_name : rider.first_name + " " + rider.last_name;
  const meta = document.createElement("p"); meta.textContent = (rider.rider_number ? "Rider number #" + rider.rider_number + " · " : "") + "Account status: " + rider.status; details.append(name, meta);
  stintsList.replaceChildren();
  if (stintsError) { const error = document.createElement("p"); error.textContent = "Your published roster could not be loaded. Please refresh or contact an administrator."; stintsList.append(error); }
  else if (!stints?.length) { const empty = document.createElement("p"); empty.textContent = "You have no upcoming published stints."; stintsList.append(empty); }
  else stints.forEach(stint => { const item = document.createElement("article"); item.className = "record-row"; const heading = document.createElement("strong"); heading.textContent = "Stint " + stint.stint_number; const when = document.createElement("small"); when.textContent = new Date(stint.scheduled_start).toLocaleString("en-AU") + " – " + new Date(stint.scheduled_end).toLocaleTimeString("en-AU"); item.append(heading, when); stintsList.append(item); });
  message.textContent = "This is your personal rider workspace.";
}

async function showAuthenticatedWorkspace(session) {
  const renderVersion = ++authRenderVersion;
  if (!session?.user) { currentProfile=null; currentUser=null; currentRiderId=null; currentRoles=[]; appShell.hidden=true; authScreen.hidden=false; loginForm.hidden=false; return; }
  const userId=session.user.id;
  const [profileResult,roleResult]=await Promise.all([supabaseClient.from("member_profiles").select("display_name,status").eq("user_id",userId).maybeSingle(),supabaseClient.from("member_roles").select("role").eq("user_id",userId)]);
  if(renderVersion!==authRenderVersion)return;
  if(profileResult.error||roleResult.error){appShell.hidden=true;authScreen.hidden=false;showMessage("We couldn’t verify your team access. Please refresh and try again.");return;}
  const profile=profileResult.data; const roles=(roleResult.data||[]).map(item=>item.role);
  const isAdmin=roles.includes("administrator"); const isMemberOnly=roles.includes("member")&&!roles.some(role=>["administrator","manager"].includes(role));
  if(!profile||profile.status!=="active"||!roles.length||(lastLoginMode==="admin"&&!isAdmin)||(lastLoginMode==="rider"&&!isMemberOnly&&!isAdmin)){appShell.hidden=true;authScreen.hidden=false;showMessage("This account is not authorised for that login area. Check your login type or contact a Team Venom administrator.");await supabaseClient.auth.signOut();return;}
  if(isMemberOnly||lastLoginMode==="rider"){const {data:link,error:linkError}=await supabaseClient.from("rider_account_links").select("rider_id").eq("user_id",userId).maybeSingle();if(linkError||!link?.rider_id){appShell.hidden=true;authScreen.hidden=false;showMessage("Your rider login is not linked to a rider profile. Contact a Team Venom administrator.");await supabaseClient.auth.signOut();return;}currentRiderId=link.rider_id;}else currentRiderId=null;
  currentProfile=profile;currentUser=session.user;currentRoles=roles;
  document.querySelector("#account-name").textContent=profile.display_name||"Team member";document.querySelector("#account-role").textContent=isAdmin?"ADMINISTRATOR":isMemberOnly?"RIDER":roles[0].toUpperCase();
  document.querySelector("#add-rider-toggle").hidden=!canManageRiders();document.querySelector("#account-management-nav").hidden=!isAdministrator();document.querySelector("#new-event-toggle").hidden=!rosterCanManage();
  document.querySelector("#create-manual-roster-form").querySelectorAll("input,select,button").forEach(control=>{control.disabled=!rosterCanManage();});document.querySelector("#manual-stint-form").querySelectorAll("input,select,button").forEach(control=>{control.disabled=!rosterCanManage();});document.querySelector("#bulk-roster-panel").querySelectorAll("textarea,button").forEach(control=>{control.disabled=!rosterCanManage();});
  document.querySelectorAll("[data-role=staff]").forEach(node=>{node.hidden=isMemberOnly;});document.querySelectorAll("[data-role=rider]").forEach(node=>{node.hidden=!isMemberOnly;});
  appShell.hidden=false;authScreen.hidden=true;selectView(isMemberOnly?"rider-workspace":"race-day");
}

const loginModeSelect=document.querySelector("#login-mode");
const loginPasswordField=document.querySelector("#login-password-field");
const loginPasswordInput=document.querySelector("#login-password");
function updateLoginModeFields(){
  const riderMode=loginModeSelect.value==="rider";
  document.querySelector("#login-username-field").hidden=!riderMode;
  document.querySelector("#login-email-field").hidden=riderMode;
  loginPasswordField.hidden=false;
  loginPasswordInput.required=true;
  loginPasswordInput.autocomplete="current-password";
  document.querySelector("#login-hint").textContent=riderMode
    ?"Rider usernames are not case-sensitive. Passwords are case-sensitive. Administrator-enabled accounts open the staff workspace."
    :"Enter your registered administrator email and password.";
  loginButton.innerHTML=riderMode
    ?'Sign in to Rider Workspace <span>→</span>'
    :'Sign in to Team Admin <span>→</span>';
}
loginModeSelect.addEventListener("change",updateLoginModeFields);updateLoginModeFields();
loginForm.addEventListener("submit",async event=>{
  event.preventDefault();if(loginRequestInProgress||Date.now()<loginCooldownUntil)return;
  const mode=loginModeSelect.value;
  const identity=mode==="rider"
    ?document.querySelector("#login-username").value.trim().replace(/[^a-z0-9]/gi,"").toLowerCase()
    :document.querySelector("#login-email").value.trim().toLowerCase();
  const password=loginPasswordInput.value;
  if(!identity||!password){showMessage(mode==="rider"?"Enter your rider username and password.":"Enter your administrator email and password.");return;}
  if(mode==="rider"&&!/^[a-z0-9]{3,32}$/.test(identity)){showMessage("Enter your rider username using 3–32 letters or numbers.");return;}
  if(mode==="admin"&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity)){showMessage("Enter a valid administrator email address.");return;}
  loginRequestInProgress=true;loginButton.disabled=true;loginButton.textContent="Signing in…";showMessage("");lastLoginMode=mode;
  try{
    if(mode==="rider"){
      const {error}=await supabaseClient.auth.signInWithPassword({email:identity+"@riders.teamvenom.invalid",password});
      if(error){showMessage("Sign-in failed. Check your rider username and password, then try again.");lastLoginMode=null;}
    }else{
      const {error}=await supabaseClient.auth.signInWithPassword({email:identity,password});
      if(error){
        showMessage("Sign-in failed. Check your administrator email and password, then try again.");
        lastLoginMode=null;
      }
    }
  }catch(error){
    console.error("Sign-in request failed:",error);
    showMessage("The sign-in service is unavailable. Please try again shortly.");
    lastLoginMode=null;
  }finally{
    loginRequestInProgress=false;
    if(Date.now()>=loginCooldownUntil){loginButton.disabled=false;updateLoginModeFields();}
  }
});
supabaseClient.auth.onAuthStateChange((event,session)=>{if(["INITIAL_SESSION","SIGNED_IN","SIGNED_OUT","USER_UPDATED"].includes(event)){setTimeout(()=>{void showAuthenticatedWorkspace(session);},0);}});

/* EVENT SCHEDULE */
let eventScheduleEvents = [];
let eventScheduleActivities = [];
let editingActivityId = null;
let raceActivitiesByEvent = {};

function localActivityDateTime(activity) {
  const date = String(activity.activity_date || "").slice(0, 10);
  const time = String(activity.start_time || "").trim();
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date) || !/^[0-9]{2}:[0-9]{2}(:[0-9]{2})?$/.test(time)) return new Date(NaN);
  return new Date(date + "T" + (time.length === 5 ? time + ":00" : time));
}

function formatActivityTime(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) : "Time not set";
}

async function loadEventSchedule() {
  const list = document.querySelector("#event-schedule-list");
  const eventSelect = document.querySelector("#schedule-event-select");
  const message = document.querySelector("#event-schedule-message");
  if (!list || !eventSelect) return;
  list.innerHTML = '<p class="empty-state">Loading event schedule…</p>';
  const { data: events, error: eventError } = await supabaseClient.from("race_events").select("id,event_name,season_year,venue,start_date").order("start_date", { ascending: false });
  if (eventError) {
    list.innerHTML = '<p class="empty-state error-state">Race events could not be loaded. Please refresh.</p>';
    return;
  }
  eventScheduleEvents = events || [];
  const selected = eventSelect.value;
  eventSelect.replaceChildren(new Option("Select a race event…", ""));
  eventScheduleEvents.forEach(item => {
    const details = [item.season_year, item.venue].filter(Boolean).join(" · ");
    eventSelect.add(new Option(details ? item.event_name + " · " + details : item.event_name, item.id));
  });
  if (eventScheduleEvents.some(item => item.id === selected)) eventSelect.value = selected;
  else if (eventScheduleEvents.length === 1) eventSelect.value = eventScheduleEvents[0].id;
  const eventId = eventSelect.value;
  document.querySelector("#add-activity-toggle").hidden = !rosterCanManage() || !eventId;
  document.querySelector("#event-activity-form-panel").hidden = true;
  if (!eventId) {
    list.innerHTML = '<p class="empty-state">Create or select a race event in Rosters to start building its activity schedule.</p>';
    document.querySelector("#event-schedule-count").textContent = "0 ACTIVITIES";
    return;
  }
  const { data, error } = await supabaseClient.from("race_event_activities")
    .select("id,event_id,activity_name,activity_date,start_time,end_time,location,notes,display_order")
    .eq("event_id", eventId).order("activity_date", { ascending: true })
    .order("start_time", { ascending: true }).order("display_order", { ascending: true });
  if (error) {
    list.innerHTML = '<p class="empty-state error-state">The activity schedule could not be loaded. Check your access and refresh.</p>';
    return;
  }
  eventScheduleActivities = data || [];
  renderEventSchedule();
  if (message && !message.textContent) message.textContent = "";
}

function renderEventSchedule() {
  const list = document.querySelector("#event-schedule-list");
  if (!list) return;
  list.replaceChildren();
  const count = document.querySelector("#event-schedule-count");
  if (count) count.textContent = eventScheduleActivities.length + (eventScheduleActivities.length === 1 ? " ACTIVITY" : " ACTIVITIES");
  if (!eventScheduleActivities.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No activities have been added yet. Add Design and Presentation, Design and Construction, Practice, The Race or anything else on your programme.";
    list.append(empty);
    return;
  }
  eventScheduleActivities.forEach(activity => {
    const card = document.createElement("article");
    card.className = "event-activity-card";
    const main = document.createElement("div");
    main.className = "event-activity-main";
    const time = document.createElement("p");
    time.className = "eyebrow";
    time.textContent = formatActivityTime(localActivityDateTime(activity));
    const heading = document.createElement("h3");
    heading.textContent = activity.activity_name;
    main.append(time, heading);
    const metaText = [activity.location, activity.end_time ? "Ends " + activity.end_time.slice(0, 5) : ""].filter(Boolean).join(" · ");
    if (metaText) {
      const meta = document.createElement("p");
      meta.className = "event-activity-meta";
      meta.textContent = metaText;
      main.append(meta);
    }
    if (activity.notes) {
      const notes = document.createElement("p");
      notes.className = "event-activity-notes";
      notes.textContent = activity.notes;
      main.append(notes);
    }
    card.append(main);
    if (rosterCanManage()) {
      const actions = document.createElement("div");
      actions.className = "event-activity-actions";
      const edit = document.createElement("button");
      edit.type = "button"; edit.className = "text-button"; edit.textContent = "Edit";
      edit.addEventListener("click", () => startActivityEdit(activity));
      const remove = document.createElement("button");
      remove.type = "button"; remove.className = "text-button danger-text"; remove.textContent = "Delete";
      remove.addEventListener("click", () => deleteEventActivity(activity));
      actions.append(edit, remove);
      card.append(actions);
    }
    list.append(card);
  });
}

function startActivityEdit(activity) {
  const form = document.querySelector("#event-activity-form");
  editingActivityId = activity.id;
  form.elements.activity_name.value = activity.activity_name || "";
  form.elements.activity_date.value = activity.activity_date || "";
  form.elements.start_time.value = (activity.start_time || "").slice(0, 5);
  form.elements.end_time.value = (activity.end_time || "").slice(0, 5);
  form.elements.location.value = activity.location || "";
  form.elements.notes.value = activity.notes || "";
  document.querySelector("#event-activity-form-panel").hidden = false;
  document.querySelector("#event-activity-form-title").textContent = "Edit activity";
  document.querySelector("#save-event-activity").textContent = "Save changes";
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function deleteEventActivity(activity) {
  if (!rosterCanManage() || !window.confirm("Delete " + activity.activity_name + " from this event schedule?")) return;
  const { error } = await supabaseClient.from("race_event_activities").delete().eq("id", activity.id);
  const message = document.querySelector("#event-schedule-message");
  if (error) {
    message.textContent = "That activity could not be deleted. Check your access and try again.";
    message.className = "inline-message error-state";
    return;
  }
  message.textContent = "Activity deleted.";
  message.className = "inline-message success-message";
  await loadEventSchedule();
  await loadRaceDay();
}

document.querySelector("#schedule-event-select")?.addEventListener("change", () => {
  editingActivityId = null;
  document.querySelector("#event-activity-form-panel").hidden = true;
  void loadEventSchedule();
});
document.querySelector("#refresh-event-schedule")?.addEventListener("click", () => loadEventSchedule());
document.querySelector("#add-activity-toggle")?.addEventListener("click", () => {
  if (!rosterCanManage()) return;
  editingActivityId = null;
  const form = document.querySelector("#event-activity-form");
  form.reset();
  document.querySelector("#event-activity-form-title").textContent = "Add an activity";
  document.querySelector("#save-event-activity").textContent = "Add to schedule";
  document.querySelector("#event-activity-form-panel").hidden = false;
  form.scrollIntoView({ behavior: "smooth", block: "center" });
});
document.querySelector("#cancel-event-activity")?.addEventListener("click", () => {
  editingActivityId = null;
  document.querySelector("#event-activity-form").reset();
  document.querySelector("#event-activity-form-panel").hidden = true;
});
document.querySelector("#event-activity-form")?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!rosterCanManage()) return;
  const form = event.currentTarget;
  const eventId = document.querySelector("#schedule-event-select").value;
  if (!eventId) return;
  const values = {
    event_id: eventId,
    activity_name: form.elements.activity_name.value.trim(),
    activity_date: form.elements.activity_date.value,
    start_time: form.elements.start_time.value,
    end_time: form.elements.end_time.value || null,
    location: form.elements.location.value.trim() || null,
    notes: form.elements.notes.value.trim() || null
  };
  const button = document.querySelector("#save-event-activity");
  const message = document.querySelector("#event-schedule-message");
  button.disabled = true;
  button.textContent = "Saving…";
  const isEditing = Boolean(editingActivityId);
  const result = isEditing
    ? await supabaseClient.from("race_event_activities").update(values).eq("id", editingActivityId)
    : await supabaseClient.from("race_event_activities").insert({ ...values, created_by: currentUser?.id || null });
  button.disabled = false;
  button.textContent = isEditing ? "Save changes" : "Add to schedule";
  if (result.error) {
    message.textContent = "The activity could not be saved. Check that the end time is later than the start time and try again.";
    message.className = "inline-message error-state";
    return;
  }
  editingActivityId = null;
  form.reset();
  document.querySelector("#event-activity-form-panel").hidden = true;
  message.textContent = "Activity saved to the event schedule.";
  message.className = "inline-message success-message";
  await loadEventSchedule();
  await loadRaceDay();
});

// ROSTER MANAGEMENT
let rosterEvents = [];
let rosterRiders = [];
let rosterRecords = [];

function rosterCanManage() {
  return currentRoles.some(role => ["administrator", "manager"].includes(role));
}

function setRosterMessage(selector, message, isError = false) {
  const box = document.querySelector(selector);
  if (!box) return;
  box.textContent = message;
  box.className = isError ? "inline-message error-state" : "inline-message";
}

function displayRiderName(rider) {
  return rider.preferred_name
    ? `${rider.preferred_name} ${rider.last_name}`
    : `${rider.first_name} ${rider.last_name}`;
}

function populateEventSelect() {
  const select = document.querySelector("#manual-event-select");
  const selected = select.value;
  select.replaceChildren(new Option("Select an event…", ""));
  rosterEvents.forEach(item => {
    const details = [item.season_year, item.venue].filter(Boolean).join(" · ");
    select.add(new Option(details ? `${item.event_name} · ${details}` : item.event_name, item.id));
  });
  if (rosterEvents.some(item => item.id === selected)) select.value = selected;
}

function populateManualRiderSelect() {
  const select = document.querySelector("#manual-rider-select");
  const selected = select.value;
  select.replaceChildren(new Option("Choose a rider…", ""));
  rosterRiders.forEach(rider => select.add(new Option(displayRiderName(rider), rider.id)));
  if (rosterRiders.some(item => item.id === selected)) select.value = selected;
}

function populateManualRosterSelect(preferredId = null) {
  const select = document.querySelector("#manual-roster-select");
  const selected = preferredId || select.value;
  select.replaceChildren(new Option("Select a draft roster…", ""));
  rosterRecords.filter(roster => roster.status === "draft").forEach(roster => {
    const event = rosterEvents.find(item => item.id === roster.event_id);
    select.add(new Option(`${event?.event_name || "Race event"} · Version ${roster.version_number}`, roster.id));
  });
  if (rosterRecords.some(roster => roster.id === selected && roster.status === "draft")) select.value = selected;
  document.querySelector("#manual-stint-form").elements.roster_id.value = select.value;
}


async function previewRosterVersion(roster, previewNode) {
  if (!previewNode.hidden) {
    previewNode.hidden = true;
    previewNode.replaceChildren();
    return;
  }
  previewNode.hidden = false;
  previewNode.className = "roster-preview-details";
  previewNode.textContent = "Loading roster preview…";
  const { data, error } = await supabaseClient
    .from("roster_stints")
    .select("id,stint_number,scheduled_start,scheduled_end,roster_notes,riders(id,first_name,last_name,preferred_name,photo_path)")
    .eq("roster_id", roster.id)
    .order("stint_number", { ascending: true });
  if (error) {
    previewNode.textContent = "This roster could not be previewed. Check your access and try again.";
    return;
  }
  previewNode.replaceChildren();
  const title = document.createElement("strong");
  title.className = "roster-preview-title";
  title.textContent = `Version ${roster.version_number} · ${(data || []).length} scheduled stint(s)`;
  previewNode.append(title);
  if (!data?.length) {
    const empty = document.createElement("p");
    empty.className = "roster-no-version";
    empty.textContent = "No stints have been added to this roster version yet.";
    previewNode.append(empty);
    return;
  }
  const photoUrls = new Map();
  await Promise.all([...new Set((data || []).map(stint => stint.riders).filter(rider => rider?.id && rider.photo_path).map(rider => rider.id))].map(async riderId => {
    const rider = data.find(stint => stint.riders?.id === riderId)?.riders;
    const { data: signed, error: photoError } = await supabaseClient.storage.from("rider-photos").createSignedUrl(rider.photo_path, 3600);
    if (!photoError && signed?.signedUrl) photoUrls.set(riderId, signed.signedUrl);
  }));
  data.forEach(stint => {
    const item = document.createElement("div");
    item.className = "roster-preview-stint";
    const rider = stint.riders;
    const identity = document.createElement("div");
    identity.className = "roster-preview-identity";
    const avatar = document.createElement("div");
    avatar.className = "roster-preview-avatar";
    const photoUrl = rider?.id ? photoUrls.get(rider.id) : null;
    if (photoUrl) {
      const image = document.createElement("img");
      image.src = photoUrl;
      image.alt = `${displayRiderName(rider)} profile photograph`;
      image.loading = "lazy";
      avatar.append(image);
    } else {
      avatar.textContent = rider ? `${rider.first_name?.[0] || ""}${rider.last_name?.[0] || ""}`.toUpperCase() : "?";
      avatar.setAttribute("aria-label", "No profile photograph available");
    }
    const nameBlock = document.createElement("div");
    nameBlock.className = "roster-preview-name";
    const heading = document.createElement("strong");
    heading.textContent = rider ? displayRiderName(rider) : "Unknown rider";
    const registeredName = document.createElement("small");
    registeredName.textContent = rider ? [rider.first_name, rider.last_name].filter(Boolean).join(" ") : "Rider profile unavailable";
    nameBlock.append(heading, registeredName);
    identity.append(avatar, nameBlock);
    const details = document.createElement("div");
    details.className = "roster-preview-time";
    const stintLabel = document.createElement("strong");
    stintLabel.textContent = `Time in · ${new Date(stint.scheduled_start).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
    const times = document.createElement("small");
    times.textContent = `${new Date(stint.scheduled_start).toLocaleString("en-AU")} – ${new Date(stint.scheduled_end).toLocaleString("en-AU")}`;
    details.append(stintLabel, times);
    item.append(identity, details);
    if (stint.roster_notes) {
      const note = document.createElement("small");
      note.className = "roster-preview-note";
      note.textContent = stint.roster_notes;
      item.append(note);
    }
    previewNode.append(item);
  });
}

async function deleteRaceEvent(eventRecord, button) {
  if (!rosterCanManage()) return;
  const { count: raceRecordCount, error: raceCheckError } = await supabaseClient
    .from("race_stints").select("id", { count: "exact", head: true }).eq("event_id", eventRecord.id);
  if (raceCheckError) {
    setRosterMessage("#manual-roster-message", "The event's race history could not be checked. Nothing was deleted.", true);
    return;
  }
  if (raceRecordCount > 0) {
    setRosterMessage("#manual-roster-message", `"${eventRecord.event_name}" has ${raceRecordCount} recorded race stint(s). Deletion is blocked to protect race history.`, true);
    return;
  }
  const eventRosters = rosterRecords.filter(item => item.event_id === eventRecord.id);
  const rosterIds = eventRosters.map(item => item.id);
  let plannedStintCount = 0;
  if (rosterIds.length) {
    const { count, error } = await supabaseClient
      .from("roster_stints").select("id", { count: "exact", head: true }).in("roster_id", rosterIds);
    if (error) {
      setRosterMessage("#manual-roster-message", "The event's scheduled stints could not be checked. Nothing was deleted.", true);
      return;
    }
    plannedStintCount = count || 0;
  }
  const summary = `Delete event "${eventRecord.event_name}"? This permanently removes ${eventRosters.length} roster version(s), ${plannedStintCount} planned stint(s), and its event rider links. Actual race history is protected and will block deletion. This cannot be undone.`;
  if (!confirm(summary)) return;
  button.disabled = true;
  button.textContent = "Deleting…";
  if (rosterIds.length) {
    const { error: stintError } = await supabaseClient.from("roster_stints").delete().in("roster_id", rosterIds);
    if (stintError) {
      button.disabled = false;
      button.textContent = "Delete event";
      setRosterMessage("#manual-roster-message", "Scheduled stints could not be removed. The event was kept.", true);
      return;
    }
    const { error: rosterError } = await supabaseClient.from("rosters").delete().in("id", rosterIds);
    if (rosterError) {
      button.disabled = false;
      button.textContent = "Delete event";
      setRosterMessage("#manual-roster-message", "Roster versions could not be removed. The event was kept; refresh and check its remaining rosters.", true);
      await loadRosters();
      return;
    }
  }
  const { error: eventRidersError } = await supabaseClient.from("event_riders").delete().eq("event_id", eventRecord.id);
  if (eventRidersError) {
    button.disabled = false;
    button.textContent = "Delete event";
    setRosterMessage("#manual-roster-message", "Event rider links could not be removed. The event was kept.", true);
    await loadRosters();
    return;
  }
  const { error: eventError } = await supabaseClient.from("race_events").delete().eq("id", eventRecord.id);
  if (eventError) {
    button.disabled = false;
    button.textContent = "Delete event";
    setRosterMessage("#manual-roster-message", "The event record could not be deleted. Refresh and check its remaining linked records.", true);
    await loadRosters();
    return;
  }
  setRosterMessage("#manual-roster-message", `Event "${eventRecord.event_name}" deleted.`);
  await loadRosters();
}

async function createDraftFromRoster(sourceRoster, button) {
  if (!rosterCanManage()) return;
  const eventRecord = rosterEvents.find(item => item.id === sourceRoster.event_id);
  if (!eventRecord) {
    setRosterMessage("#manual-roster-message", "The race event for this roster could not be found.", true);
    return;
  }

  const nextVersion = Math.max(
    0,
    ...rosterRecords.filter(item => item.event_id === sourceRoster.event_id).map(item => Number(item.version_number) || 0)
  ) + 1;

  button.disabled = true;
  button.textContent = "Preparing…";
  const { data: sourceStints, error: sourceError } = await supabaseClient
    .from("roster_stints")
    .select("rider_id,stint_number,scheduled_start,scheduled_end,roster_notes")
    .eq("roster_id", sourceRoster.id)
    .order("stint_number", { ascending: true });

  if (sourceError) {
    button.disabled = false;
    button.textContent = "Create draft";
    setRosterMessage("#manual-roster-message", "The source roster could not be read. No new version was created.", true);
    return;
  }

  const count = sourceStints?.length || 0;
  if (!confirm(`Create draft Version ${nextVersion} for ${eventRecord.event_name} by copying Version ${sourceRoster.version_number}? This creates a separate draft with ${count} stint(s). Version ${sourceRoster.version_number} will remain unchanged.`)) {
    button.disabled = false;
    button.textContent = "Create draft";
    return;
  }

  const { data: authData } = await supabaseClient.auth.getUser();
  const { data: newRoster, error: createError } = await supabaseClient
    .from("rosters")
    .insert({
      event_id: sourceRoster.event_id,
      version_number: nextVersion,
      status: "draft",
      source_filename: `Draft copied from Version ${sourceRoster.version_number}`,
      uploaded_by: authData.user?.id
    })
    .select("id")
    .single();

  if (createError || !newRoster) {
    button.disabled = false;
    button.textContent = "Create draft";
    setRosterMessage("#manual-roster-message", "The new draft could not be created. Refresh the roster list and try again.", true);
    return;
  }

  if (count) {
    const copiedStints = sourceStints.map(stint => ({ ...stint, roster_id: newRoster.id }));
    const { error: copyError } = await supabaseClient.from("roster_stints").insert(copiedStints);
    if (copyError) {
      const { error: cleanupError } = await supabaseClient.from("rosters").delete().eq("id", newRoster.id).eq("status", "draft");
      button.disabled = false;
      button.textContent = "Create draft";
      setRosterMessage(
        "#manual-roster-message",
        cleanupError
          ? "The draft was created but its stints could not be copied, and automatic cleanup failed. Refresh and ask an administrator to inspect the empty draft."
          : "The stints could not be copied. The incomplete draft was removed and the source version was left unchanged.",
        true
      );
      await loadRosters();
      return;
    }
  }

  button.disabled = false;
  button.textContent = "Create draft";
  selectView("rosters");
  await loadRosters();
  document.querySelector("#manual-roster-select").value = newRoster.id;
  await loadManualStints();
  document.querySelector("#manual-stint-form").scrollIntoView({ behavior: "smooth", block: "center" });
  setRosterMessage("#manual-roster-message", `Draft Version ${nextVersion} created from Version ${sourceRoster.version_number}. Edit and preview it before publishing.`);
}

function renderRosterRecords() {
  const list = document.querySelector("#roster-list");
  const empty = document.querySelector("#roster-empty");
  list.replaceChildren();
  const eventsWithRosters = rosterEvents.map(event => ({
    event,
    rosters: rosterRecords.filter(roster => roster.event_id === event.id)
  }));
  document.querySelector("#roster-event-count").textContent = rosterEvents.length.toLocaleString("en-AU");
  document.querySelector("#roster-count").textContent = rosterRecords.length.toLocaleString("en-AU");
  list.hidden = false;
  empty.hidden = true;
  if (!eventsWithRosters.length) {
    list.hidden = true;
    empty.hidden = false;
    return;
  }
  eventsWithRosters.forEach(group => {
    const section = document.createElement("article");
    section.className = "roster-event-row";
    const heading = document.createElement("div");
    heading.className = "roster-event-heading";
    const name = document.createElement("strong");
    name.textContent = group.event.event_name;
    const meta = document.createElement("small");
    meta.textContent = [group.event.season_year, group.event.venue, group.event.status].filter(Boolean).join(" · ");
    heading.append(name, meta);
    section.append(heading);
    if (rosterCanManage()) {
      const eventActions = document.createElement("div");
      eventActions.className = "roster-event-actions";
      const deleteEvent = document.createElement("button");
      deleteEvent.type = "button";
      deleteEvent.className = "text-button roster-delete-button";
      deleteEvent.textContent = "Delete event";
      deleteEvent.addEventListener("click", () => deleteRaceEvent(group.event, deleteEvent));
      eventActions.append(deleteEvent);
      section.append(eventActions);
    }
    if (!group.rosters.length) {
      const noRoster = document.createElement("p");
      noRoster.className = "roster-no-version";
      noRoster.textContent = "No roster version has been created for this event yet.";
      section.append(noRoster);
    }
    group.rosters.forEach(roster => {
      const row = document.createElement("div");
      row.className = "roster-version-row";
      const info = document.createElement("span");
      info.textContent = `Version ${roster.version_number} · ${roster.status.toUpperCase()} · ${new Date(roster.created_at).toLocaleDateString("en-AU")}`;
      row.append(info);
      const actions = document.createElement("div");
      actions.className = "roster-version-actions";
      if (rosterCanManage()) {
        const createDraft = document.createElement("button");
        createDraft.type = "button";
        createDraft.className = "text-button";
        createDraft.textContent = "Create draft";
        createDraft.title = `Create a new draft by copying Version ${roster.version_number}`;
        createDraft.addEventListener("click", () => createDraftFromRoster(roster, createDraft));
        actions.append(createDraft);
      }
      const preview = document.createElement("button");
      preview.type = "button";
      preview.className = "text-button";
      preview.textContent = "Preview";
      const previewNode = document.createElement("div");
      previewNode.hidden = true;
      preview.addEventListener("click", () => previewRosterVersion(roster, previewNode));
      actions.append(preview);
      if (roster.status === "draft" && rosterCanManage()) {

        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "text-button";
        edit.textContent = "Edit draft";
        edit.addEventListener("click", () => {
          selectView("rosters");
          const select = document.querySelector("#manual-roster-select");
          select.value = roster.id;
          select.dispatchEvent(new Event("change"));
          document.querySelector("#manual-stint-form").scrollIntoView({ behavior: "smooth", block: "center" });
          document.querySelector("#manual-rider-select").focus();
          setRosterMessage("#manual-stint-message", `Editing draft version ${roster.version_number}. Add or remove its stint allocations above.`);
        });

        const rename = document.createElement("button");
        rename.type = "button";
        rename.className = "text-button";
        rename.textContent = "Edit version";
        rename.addEventListener("click", async () => {
          const answer = prompt("Enter the new draft version number:", String(roster.version_number));
          if (answer === null) return;
          const version = Number(answer.trim());
          if (!Number.isInteger(version) || version < 1) {
            setRosterMessage("#manual-roster-message", "Version number must be a whole number greater than zero.", true);
            return;
          }
          if (rosterRecords.some(item => item.id !== roster.id && item.event_id === roster.event_id && Number(item.version_number) === version)) {
            setRosterMessage("#manual-roster-message", "That version number is already used for this event.", true);
            return;
          }
          rename.disabled = true;
          const { error } = await supabaseClient.from("rosters").update({ version_number: version }).eq("id", roster.id).eq("status", "draft");
          if (error) {
            setRosterMessage("#manual-roster-message", "Draft version could not be updated. Check your access and try again.", true);
            rename.disabled = false;
            return;
          }
          setRosterMessage("#manual-roster-message", `Draft renamed to version ${version}.`);
          await loadRosters();
        });

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "text-button roster-delete-button";
        remove.textContent = "Delete draft";
        remove.addEventListener("click", async () => {
          if (!rosterCanManage()) return;
          const { count, error: countError } = await supabaseClient
            .from("roster_stints").select("id", { count: "exact", head: true }).eq("roster_id", roster.id);
          if (countError) {
            setRosterMessage("#manual-roster-message", "The draft could not be checked. Nothing was deleted.", true);
            return;
          }
          const eventName = group.event.event_name;
          if (!confirm(`Delete draft version ${roster.version_number} for ${eventName}? This will permanently remove its ${count || 0} scheduled stint(s). Published rosters cannot be deleted here.`)) return;
          remove.disabled = true;
          const { error: stintsError } = await supabaseClient.from("roster_stints").delete().eq("roster_id", roster.id);
          if (stintsError) {
            setRosterMessage("#manual-roster-message", "The draft's stints could not be removed. The draft was kept.", true);
            remove.disabled = false;
            return;
          }
          const { error: rosterError } = await supabaseClient.from("rosters").delete().eq("id", roster.id).eq("status", "draft");
          if (rosterError) {
            setRosterMessage("#manual-roster-message", "The stints were removed, but the draft record could not be deleted. Please refresh and contact an administrator if it remains.", true);
            remove.disabled = false;
            await loadRosters();
            return;
          }
          setRosterMessage("#manual-roster-message", `Draft version ${roster.version_number} deleted.`);
          await loadRosters();
        });

        const publish = document.createElement("button");
        publish.type = "button";
        publish.className = "text-button";
        publish.textContent = "Publish roster";
        publish.addEventListener("click", async () => {
          if (!confirm("Publish this roster? Team members will be able to view its scheduled stints.")) return;
          publish.disabled = true;
          const { error } = await supabaseClient.from("rosters").update({ status: "published", published_at: new Date().toISOString() }).eq("id", roster.id).eq("status", "draft");
          if (error) {
            setRosterMessage("#manual-roster-message", "Roster could not be published. Check permissions and try again.", true);
            publish.disabled = false;
            return;
          }
          setRosterMessage("#manual-roster-message", `Roster version ${roster.version_number} published successfully.`);
          void sendOperationalPush("roster_published", { roster_id: roster.id });
          await loadRosters();
        });
        actions.append(edit, rename, remove, publish);
      }
      row.append(actions);
      section.append(row, previewNode);
    });
    list.append(section);
  });
}

async function loadManualStints() {
  const rosterId = document.querySelector("#manual-roster-select").value;
  const form = document.querySelector("#manual-stint-form");
  const list = document.querySelector("#manual-stint-list");
  const empty = document.querySelector("#manual-stint-empty");
  list.replaceChildren();
  empty.hidden = true;
  form.elements.roster_id.value = rosterId;
  if (!rosterId) {
    empty.hidden = false;
    empty.textContent = "Select a draft roster to view or add its stints.";
    form.elements.stint_number.value = 1;
    return;
  }
  const { data, error } = await supabaseClient
    .from("roster_stints")
    .select("id,stint_number,rider_id,scheduled_start,scheduled_end,roster_notes")
    .eq("roster_id", rosterId)
    .order("stint_number", { ascending: true });
  if (error) {
    empty.hidden = false;
    empty.textContent = "Stints could not be loaded. Please refresh and try again.";
    return;
  }
  document.querySelector("#roster-stint-count").textContent = "…";
  if (!data?.length) {
    empty.hidden = false;
    empty.textContent = "No stints have been added to this draft yet.";
    form.elements.stint_number.value = 1;
    return;
  }
  const nextNumber = Math.max(...data.map(item => Number(item.stint_number))) + 1;
  form.elements.stint_number.value = nextNumber;
  data.forEach(stint => {
    const rider = rosterRiders.find(item => item.id === stint.rider_id);
    const row = document.createElement("article");
    row.className = "manual-stint-row";
    const info = document.createElement("div");
    info.className = "manual-stint-info";
    const title = document.createElement("strong");
    title.textContent = `Stint ${stint.stint_number} · ${rider ? displayRiderName(rider) : "Unknown rider"}`;
    const times = document.createElement("small");
    times.textContent = `${new Date(stint.scheduled_start).toLocaleString("en-AU")} – ${new Date(stint.scheduled_end).toLocaleString("en-AU")}`;
    info.append(title, times);
    if (stint.roster_notes) {
      const notes = document.createElement("small");
      notes.textContent = stint.roster_notes;
      info.append(notes);
    }
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "text-button";
    remove.textContent = "Remove";
    remove.disabled = !rosterCanManage();
    remove.addEventListener("click", async () => {
      if (!rosterCanManage()) return;
      remove.disabled = true;
      const { error: deleteError } = await supabaseClient.from("roster_stints").delete().eq("id", stint.id);
      if (deleteError) {
        setRosterMessage("#manual-stint-message", "That stint could not be removed. Check your access and try again.", true);
        remove.disabled = false;
        return;
      }
      setRosterMessage("#manual-stint-message", `Stint ${stint.stint_number} removed from the draft.`);
      await loadManualStints();
      await loadRosters();
    });
    row.append(info, remove);
    list.append(row);
  });
}

async function loadRosters() {
  const loading = document.querySelector("#roster-loading");
  const list = document.querySelector("#roster-list");
  const empty = document.querySelector("#roster-empty");
  const errorBox = document.querySelector("#roster-error");
  loading.hidden = false;
  list.hidden = true;
  empty.hidden = true;
  errorBox.hidden = true;
  const [eventsResult, rostersResult, ridersResult, stintsResult] = await Promise.all([
    supabaseClient.from("race_events").select("id,event_name,season_year,venue,event_type,start_date,end_date,status,created_at").order("start_date", { ascending: false }),
    supabaseClient.from("rosters").select("id,event_id,version_number,status,created_at,published_at").order("created_at", { ascending: false }),
    supabaseClient.from("riders").select("id,first_name,last_name,preferred_name,status").eq("status", "active").order("last_name", { ascending: true }),
    supabaseClient.from("roster_stints").select("id", { count: "exact", head: true })
  ]);
  loading.hidden = true;
  if (eventsResult.error || rostersResult.error || ridersResult.error || stintsResult.error) {
    errorBox.hidden = false;
    document.querySelector("#roster-event-count").textContent = "—";
    document.querySelector("#roster-count").textContent = "—";
    document.querySelector("#roster-stint-count").textContent = "—";
    return;
  }
  rosterEvents = eventsResult.data || [];
  rosterRecords = rostersResult.data || [];
  rosterRiders = ridersResult.data || [];
  document.querySelector("#roster-stint-count").textContent = (stintsResult.count ?? 0).toLocaleString("en-AU");
  populateEventSelect();
  populateManualRiderSelect();
  populateManualRosterSelect();
  renderRosterRecords();
  await loadManualStints();
}

document.querySelector("#new-event-toggle").addEventListener("click", () => {
  document.querySelector("#event-form-panel").hidden = false;
  document.querySelector("#event-form").elements.event_name.focus();
});
document.querySelector("#cancel-event").addEventListener("click", () => {
  document.querySelector("#event-form-panel").hidden = true;
  document.querySelector("#event-form").reset();
  setRosterMessage("#event-message", "");
});

document.querySelector("#event-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!rosterCanManage()) return;
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form).entries());
  const startDate = values.start_date || null;
  const endDate = values.end_date || null;
  const message = document.querySelector("#event-message");
  const button = document.querySelector("#save-event");
  if (startDate && endDate && endDate < startDate) {
    setRosterMessage("#event-message", "The event end date must be on or after its start date.", true);
    return;
  }
  button.disabled = true;
  button.textContent = "Creating…";
  const { data: authData } = await supabaseClient.auth.getUser();
  const { error } = await supabaseClient.from("race_events").insert({
    event_name: values.event_name.trim(),
    season_year: Number(values.season_year),
    venue: values.venue.trim() || null,
    event_type: values.event_type.trim() || null,
    start_date: startDate,
    end_date: endDate,
    start_time: values.start_time || "12:00",
    created_by: authData.user?.id
  });
  button.disabled = false;
  button.textContent = "Create event";
  if (error) {
    setRosterMessage("#event-message", "The event could not be saved. Check your access and try again.", true);
    return;
  }
  form.reset();
  form.elements.season_year.value = new Date().getFullYear();
  document.querySelector("#event-form-panel").hidden = true;
  setRosterMessage("#event-message", "Race event created successfully.");
  await loadRosters();
});

document.querySelector("#create-manual-roster-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!rosterCanManage()) return;
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form).entries());
  const eventId = values.event_id;
  const version = Number(values.version_number);
  if (!eventId || !Number.isInteger(version) || version < 1) {
    setRosterMessage("#manual-roster-message", "Choose an event and a valid version number.", true);
    return;
  }
  const existing = rosterRecords.filter(item => item.event_id === eventId).map(item => Number(item.version_number));
  if (existing.includes(version)) {
    setRosterMessage("#manual-roster-message", `Version ${version} already exists. Choose version ${Math.max(...existing) + 1}.`, true);
    return;
  }
  const button = document.querySelector("#create-manual-roster");
  button.disabled = true;
  button.textContent = "Creating draft…";
  const { data: authData } = await supabaseClient.auth.getUser();
  const { data, error } = await supabaseClient.from("rosters").insert({
    event_id: eventId,
    version_number: version,
    status: "draft",
    source_filename: "Manual entry",
    uploaded_by: authData.user?.id
  }).select("id").single();
  button.disabled = false;
  button.textContent = "Create draft roster";
  if (error || !data) {
    setRosterMessage("#manual-roster-message", "The draft roster could not be created. Check your permissions and try again.", true);
    return;
  }
  form.elements.version_number.value = Math.max(...existing, version) + 1;
  await loadRosters();
  document.querySelector("#manual-roster-select").value = data.id;
  await loadManualStints();
  setRosterMessage("#manual-roster-message", "Draft roster created. You can now add stints individually.");
});

document.querySelector("#manual-roster-select").addEventListener("change", async event => {
  document.querySelector("#manual-stint-form").elements.roster_id.value = event.target.value;
  await loadManualStints();
});
document.querySelector("#manual-stint-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!rosterCanManage()) return;
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form).entries());
  const rosterId = values.roster_id;
  const stintNumber = Number(values.stint_number);
  const start = new Date(values.scheduled_start);
  const end = new Date(values.scheduled_end);
  if (!rosterId || !values.rider_id || !Number.isInteger(stintNumber) || stintNumber < 1 || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    setRosterMessage("#manual-stint-message", "Complete all required fields and make sure the end time is after the start time.", true);
    return;
  }
  const { data: existing, error: existingError } = await supabaseClient.from("roster_stints").select("stint_number,rider_id,scheduled_start,scheduled_end").eq("roster_id", rosterId);
  if (existingError) {
    setRosterMessage("#manual-stint-message", "Existing stints could not be checked. Please try again.", true);
    return;
  }
  if ((existing || []).some(item => Number(item.stint_number) === stintNumber)) {
    setRosterMessage("#manual-stint-message", `Stint number ${stintNumber} is already in this roster.`, true);
    return;
  }
  const conflict = (existing || []).find(item => item.rider_id === values.rider_id && start < new Date(item.scheduled_end) && end > new Date(item.scheduled_start));
  if (conflict) {
    setRosterMessage("#manual-stint-message", "This rider already has a stint that overlaps with the selected time.", true);
    return;
  }
  const button = document.querySelector("#save-manual-stint");
  button.disabled = true;
  button.textContent = "Saving…";
  const { error } = await supabaseClient.from("roster_stints").insert({
    roster_id: rosterId,
    rider_id: values.rider_id,
    stint_number: stintNumber,
    scheduled_start: start.toISOString(),
    scheduled_end: end.toISOString(),
    roster_notes: values.roster_notes.trim() || null
  });
  button.disabled = false;
  button.textContent = "Add stint";
  if (error) {
    setRosterMessage("#manual-stint-message", "The stint could not be saved. Check your access and try again.", true);
    return;
  }
  form.elements.stint_number.value = stintNumber + 1;
  form.elements.rider_id.value = "";
  form.elements.scheduled_start.value = "";
  form.elements.scheduled_end.value = "";
  form.elements.roster_notes.value = "";
  setRosterMessage("#manual-stint-message", `Stint ${stintNumber} saved successfully.`);
  await loadManualStints();
  await loadRosters();
  document.querySelector("#manual-roster-select").value = rosterId;
  form.elements.roster_id.value = rosterId;
});


let bulkRosterPreview = null;

function parseRosterClock(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function parseRosterDuration(value) {
  const match = String(value || "").trim().match(/^(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours)?$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = (match[2] || "minutes").toLowerCase();
  return /^(h|hr|hrs|hour|hours)$/.test(unit) ? amount * 60 : amount;
}

function rosterDateTime(dateString, minutesFromMidnight, dayOffset) {
  const [year, month, day] = dateString.split("-").map(Number);
  const value = new Date(year, month - 1, day + dayOffset, Math.floor(minutesFromMidnight / 60), minutesFromMidnight % 60, 0, 0);
  return value;
}

function parseBulkRoster(text, eventId) {
  const eventRecord = rosterEvents.find(item => item.id === eventId);
  if (!eventRecord) return { error: "Select a draft roster before checking the pasted schedule." };
  if (!eventRecord.start_date) return { error: "This event needs a start date before an overnight roster can be imported. Add the event start date first." };
  const lines = String(text || "").split(/\r?\n/).map(line => line.trimEnd()).filter(line => line.trim());
  if (lines.length < 2) return { error: "Paste the roster including its header row and at least one stint." };
  const rows = lines.map(line => line.split("\t").map(cell => cell.trim()));
  const headers = rows[0].map(value => value.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const findColumn = names => headers.findIndex(header => names.includes(header));
  const columns = {
    number: headers[0] === "" ? 0 : findColumn(["stint", "stintnumber", "number"]),
    stintTime: findColumn(["stinttime", "starttime"]),
    duration: findColumn(["duration"]),
    timeIn: findColumn(["timein", "start", "scheduledstart"]),
    timeOut: findColumn(["timeout", "finish", "scheduledend"]),
    rider: findColumn(["rider", "ridername", "name"])
  };
  if (Object.values(columns).some(index => index < 0)) {
    return { error: "The header row must contain: #, Stint time, Duration, Time in, Time out and Rider." };
  }
  const riderLookup = new Map();
  rosterRiders.forEach(rider => {
    const names = [displayRiderName(rider), [rider.first_name, rider.last_name].filter(Boolean).join(" "), rider.preferred_name].filter(Boolean);
    names.forEach(name => riderLookup.set(name.trim().toLowerCase(), rider));
  });
  const parsed = [];
  const errors = [];
  let previousStartClock = null;
  let previousStartTimestamp = null;
  let dayOffset = 0;
  rows.slice(1).forEach((cells, index) => {
    const lineNumber = index + 2;
    const get = key => cells[columns[key]] || "";
    if (cells.every(cell => !cell)) return;
    const stintNumber = Number(get("number"));
    const startClock = parseRosterClock(get("timeIn"));
    const endClock = parseRosterClock(get("timeOut"));
    const stintClock = parseRosterClock(get("stintTime"));
    const duration = parseRosterDuration(get("duration"));
    const rider = riderLookup.get(get("rider").toLowerCase());
    if (!Number.isInteger(stintNumber) || stintNumber < 1) errors.push(`Row ${lineNumber}: invalid stint number.`);
    if (startClock === null || endClock === null || stintClock === null) errors.push(`Row ${lineNumber}: use 24-hour times such as 12:40 or 0:40.`);
    if (startClock !== null && stintClock !== null && startClock !== stintClock) errors.push(`Row ${lineNumber}: Stint time and Time in do not match.`);
    if (duration === null || duration <= 0) errors.push(`Row ${lineNumber}: duration must be a positive number of minutes (for example, 40 Minutes).`);
    if (!rider) errors.push(`Row ${lineNumber}: rider "${get("rider")}" was not found in the active rider directory.`);
    if (startClock === null || endClock === null || duration === null || !rider || !Number.isInteger(stintNumber) || stintNumber < 1) return;
    if (previousStartClock !== null && startClock < previousStartClock) dayOffset += 1;
    const start = rosterDateTime(eventRecord.start_date, startClock, dayOffset);
    let endDayOffset = dayOffset + (endClock <= startClock ? 1 : 0);
    const end = rosterDateTime(eventRecord.start_date, endClock, endDayOffset);
    const actualDuration = (end.getTime() - start.getTime()) / 60000;
    if (Math.abs(actualDuration - duration) > 0.01) errors.push(`Row ${lineNumber}: duration says ${duration} minutes but the times span ${actualDuration} minutes.`);
    if (previousStartTimestamp !== null && start.getTime() < previousStartTimestamp) errors.push(`Row ${lineNumber}: roster times are not in chronological order.`);
    parsed.push({
      roster_id: document.querySelector("#manual-roster-select").value,
      stint_number: stintNumber,
      rider_id: rider.id,
      scheduled_start: start.toISOString(),
      scheduled_end: end.toISOString(),
      roster_notes: null,
      rider_name: displayRiderName(rider),
      start_label: get("timeIn"),
      end_label: get("timeOut"),
      duration
    });
    previousStartClock = startClock;
    previousStartTimestamp = start.getTime();
  });
  const seenNumbers = new Set();
  parsed.forEach(item => {
    if (seenNumbers.has(item.stint_number)) errors.push(`Stint number ${item.stint_number} appears more than once in the pasted roster.`);
    seenNumbers.add(item.stint_number);
  });
  return { rows: parsed, errors, event: eventRecord };
}

function renderBulkRosterPreview(result) {
  const preview = document.querySelector("#bulk-roster-preview");
  preview.replaceChildren();
  preview.hidden = false;
  const heading = document.createElement("strong");
  heading.textContent = result.errors.length
    ? `Check required: ${result.errors.length} issue(s) found`
    : `Ready to import: ${result.rows.length} stints`;
  preview.append(heading);
  if (result.errors.length) {
    const list = document.createElement("ul");
    result.errors.forEach(message => {
      const item = document.createElement("li");
      item.textContent = message;
      list.append(item);
    });
    preview.append(list);
    bulkRosterPreview = null;
    return;
  }
  const table = document.createElement("div");
  table.className = "roster-import-table";
  const header = document.createElement("div");
  header.className = "roster-import-row roster-import-header";
  ["#", "Time in", "Time out", "Duration", "Rider"].forEach(value => {
    const cell = document.createElement("span");
    cell.textContent = value;
    header.append(cell);
  });
  table.append(header);
  result.rows.forEach(row => {
    const line = document.createElement("div");
    line.className = "roster-import-row";
    [row.stint_number, row.start_label, row.end_label, `${row.duration} min`, row.rider_name].forEach(value => {
      const cell = document.createElement("span");
      cell.textContent = value;
      line.append(cell);
    });
    table.append(line);
  });
  preview.append(table);
  bulkRosterPreview = result.rows;
  const importButton = document.createElement("button");
  importButton.type = "button";
  importButton.className = "primary-button";
  importButton.id = "confirm-bulk-roster-import";
  importButton.textContent = "Import all stints";
  importButton.addEventListener("click", importBulkRoster);
  preview.append(importButton);
}

async function importBulkRoster() {
  if (!rosterCanManage() || !bulkRosterPreview?.length) return;
  const rosterId = document.querySelector("#manual-roster-select").value;
  if (!rosterId || bulkRosterPreview.some(row => row.roster_id !== rosterId)) {
    setRosterMessage("#bulk-roster-message", "Select the same draft roster and check the pasted schedule again.", true);
    bulkRosterPreview = null;
    return;
  }
  const button = document.querySelector("#confirm-bulk-roster-import");
  button.disabled = true;
  button.textContent = "Checking existing stints…";
  const { data: existing, error: existingError } = await supabaseClient.from("roster_stints")
    .select("stint_number,rider_id,scheduled_start,scheduled_end")
    .eq("roster_id", rosterId);
  if (existingError) {
    button.disabled = false;
    button.textContent = "Import all stints";
    setRosterMessage("#bulk-roster-message", "Existing roster entries could not be checked. Nothing was imported.", true);
    return;
  }
  const existingNumbers = new Set((existing || []).map(item => Number(item.stint_number)));
  const conflicts = [];
  bulkRosterPreview.forEach(row => {
    if (existingNumbers.has(row.stint_number)) conflicts.push(`Stint number ${row.stint_number} already exists in this draft.`);
    const overlap = (existing || []).find(item => item.rider_id === row.rider_id &&
      new Date(row.scheduled_start) < new Date(item.scheduled_end) &&
      new Date(row.scheduled_end) > new Date(item.scheduled_start));
    if (overlap) conflicts.push(`${row.rider_name} already has an overlapping stint in this draft.`);
  });
  const incoming = [...bulkRosterPreview].sort((a,b)=>new Date(a.scheduled_start)-new Date(b.scheduled_start));
  for (let i=0;i<incoming.length;i++) {
    for (let j=i+1;j<incoming.length;j++) {
      if (incoming[i].rider_id === incoming[j].rider_id &&
        new Date(incoming[i].scheduled_start) < new Date(incoming[j].scheduled_end) &&
        new Date(incoming[i].scheduled_end) > new Date(incoming[j].scheduled_start)) {
        conflicts.push(`${incoming[i].rider_name} has overlapping stints ${incoming[i].stint_number} and ${incoming[j].stint_number}.`);
      }
    }
  }
  if (conflicts.length) {
    button.disabled = false;
    button.textContent = "Import all stints";
    const preview = document.querySelector("#bulk-roster-preview");
    const list = document.createElement("ul");
    list.className = "roster-import-errors";
    conflicts.forEach(message => { const li=document.createElement("li"); li.textContent=message; list.append(li); });
    preview.append(list);
    setRosterMessage("#bulk-roster-message", "Import stopped. Resolve the conflicts before importing.", true);
    return;
  }
  button.textContent = "Importing…";
  const payload = bulkRosterPreview.map(({rider_name,start_label,end_label,duration,...row})=>row);
  const { error } = await supabaseClient.from("roster_stints").insert(payload);
  if (error) {
    button.disabled = false;
    button.textContent = "Import all stints";
    setRosterMessage("#bulk-roster-message", "The import failed and no success was reported. Check the draft before trying again.", true);
    return;
  }
  const count = payload.length;
  bulkRosterPreview = null;
  document.querySelector("#bulk-roster-data").value = "";
  document.querySelector("#bulk-roster-preview").hidden = true;
  setRosterMessage("#bulk-roster-message", `${count} stints imported successfully into the draft roster. Review them below before publishing.`);
  await loadManualStints();
  await loadRosters();
  document.querySelector("#manual-roster-select").value = rosterId;
  document.querySelector("#manual-stint-form").elements.roster_id.value = rosterId;
}

document.querySelector("#preview-bulk-roster").addEventListener("click", () => {
  if (!rosterCanManage()) return;
  const rosterId = document.querySelector("#manual-roster-select").value;
  const result = parseBulkRoster(document.querySelector("#bulk-roster-data").value, rosterId);
  if (result.error) {
    bulkRosterPreview = null;
    document.querySelector("#bulk-roster-preview").hidden = true;
    setRosterMessage("#bulk-roster-message", result.error, true);
    return;
  }
  renderBulkRosterPreview(result);
  setRosterMessage("#bulk-roster-message", result.errors.length ? "Fix the issues listed in the preview." : "Check the preview, then choose Import all stints.");
});
document.querySelector("#manual-roster-select").addEventListener("change", () => {
  bulkRosterPreview = null;
  document.querySelector("#bulk-roster-preview").hidden = true;
  document.querySelector("#bulk-roster-message").textContent = "";
});
document.querySelector("#bulk-roster-data").addEventListener("input", () => {
  bulkRosterPreview = null;
  document.querySelector("#bulk-roster-preview").hidden = true;
  document.querySelector("#bulk-roster-message").textContent = "Roster changed. Check it again before importing.";
});

document.querySelector("#refresh-rosters").addEventListener("click", loadRosters);
document.querySelector("#refresh-roster-versions").addEventListener("click", loadRosters);
document.querySelector("#new-event-toggle").hidden = !rosterCanManage();
document.querySelector("#create-manual-roster-form").querySelectorAll("input,select,button").forEach(control => { control.disabled = !rosterCanManage(); });
document.querySelector("#manual-stint-form").querySelectorAll("input,select,button").forEach(control => { control.disabled = !rosterCanManage(); });

/* APPLICATION MODULES */
let currentProfile = null;
let currentUser = null;
let currentRiderId = null;
let lastLoginMode = null;
let raceDayRosterStints = [];
let raceChangeoverLog = [];
let liveRaceStateByEvent = {};
let liveSelectedEventId = null;
let liveRaceChannel = null;

function setModuleMessage(id, message, error = false) {
  const node = document.querySelector(id);
  if (!node) return;
  node.textContent = message;
  node.className = error ? "inline-message error-state" : "inline-message success-message";
}
function canManageOperations() {
  return currentRoles.some(role => ["administrator","manager"].includes(role));
}
function canManageNotifications() {
  return currentRoles.includes("administrator");
}
async function sendOperationalPush(type, details = {}) {
  try {
    const { data, error } = await supabaseClient.functions.invoke("push-notifications", {
      body: { action: "send", type, ...details }
    });
    if (error) console.warn("Team Venom notification delivery could not be started:", error.message);
    else if (data?.error) console.warn("Team Venom notification delivery:", data.error);
    return data || null;
  } catch (error) {
    console.warn("Team Venom notification delivery failed:", error);
    return null;
  }
}
function safeNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}
function formatDateTime(value) {
  return value ? new Date(value).toLocaleString("en-AU") : "Not recorded";
}
async function loadOverview() {
  const [riders, events, stints, alerts] = await Promise.all([
    supabaseClient.from("riders").select("id",{count:"exact",head:true}),
    supabaseClient.from("race_events").select("id",{count:"exact",head:true}).in("status",["planning","confirmed"]),
    supabaseClient.from("roster_stints").select("id",{count:"exact",head:true}),
    supabaseClient.from("notifications").select("id",{count:"exact",head:true}).eq("status","sent").is("read_at",null)
  ]);
  document.querySelector("#overview-riders").textContent = riders.error ? "—" : (riders.count ?? 0).toLocaleString("en-AU");
  document.querySelector("#overview-events").textContent = events.error ? "—" : (events.count ?? 0).toLocaleString("en-AU");
  document.querySelector("#overview-stints").textContent = stints.error ? "—" : (stints.count ?? 0).toLocaleString("en-AU");
  document.querySelector("#overview-alerts").textContent = alerts.error ? "—" : (alerts.count ?? 0).toLocaleString("en-AU");
  document.querySelector("#overview-updated").textContent = "Updated " + new Date().toLocaleTimeString("en-AU",{hour:"2-digit",minute:"2-digit"});
}
function liveRiderName(stint) {
  const rider = stint?.riders;
  if (!rider) return "Rider details unavailable";
  return rider.preferred_name ? rider.preferred_name + " " + rider.last_name : rider.first_name + " " + rider.last_name;
}
function liveTime(value) {
  return value ? new Date(value).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
}
function renderLiveRiderCard(prefix, stint, emptyTitle, emptyDetail) {
  const photo = document.querySelector("#" + prefix + "-photo");
  const name = document.querySelector("#" + prefix + "-name");
  const detail = document.querySelector("#" + prefix + "-detail");
  const time = document.querySelector("#" + prefix + "-time");
  photo.replaceChildren();
  if (!stint) {
    const placeholder = document.createElement("span");
    placeholder.className = "live-rider-placeholder";
    placeholder.textContent = "—";
    photo.append(placeholder);
    name.textContent = emptyTitle;
    detail.textContent = emptyDetail;
    time.textContent = "";
    return;
  }
  if (stint.rider_photo_url) {
    const image = document.createElement("img");
    image.src = stint.rider_photo_url;
    image.alt = liveRiderName(stint) + " profile photograph";
    photo.append(image);
  } else {
    const placeholder = document.createElement("span");
    placeholder.className = "live-rider-placeholder";
    placeholder.textContent = (stint.riders?.first_name?.[0] || "") + (stint.riders?.last_name?.[0] || "");
    photo.append(placeholder);
  }
  name.textContent = liveRiderName(stint);
  detail.textContent = stint.rosters?.race_events?.event_name || "Team Venom";
  time.textContent = prefix === "next" ? "TIME IN · " + liveTime(stint.scheduled_start) : "";
}
function renderUpcomingRiders(stints, currentIndex) {
  const list = document.querySelector("#upcoming-rider-list");
  const section = document.querySelector("#upcoming-riders");
  if (!list || !section) return;
  list.replaceChildren();
  const upcoming = currentIndex >= 0 ? stints.slice(currentIndex + 2, currentIndex + 7) : [];
  section.hidden = upcoming.length === 0;
  upcoming.forEach(stint => {
    const item = document.createElement("li");
    const start = new Date(stint.scheduled_start);
    const end = new Date(stint.scheduled_end);
    const timeOptions = { hour: "2-digit", minute: "2-digit", hour12: false };
    const startTime = start.toLocaleTimeString("en-AU", timeOptions);
    const endTime = end.toLocaleTimeString("en-AU", timeOptions);
    const daySuffix = start.toDateString() !== end.toDateString() ? " (+1 day)" : "";
    item.textContent = `STINT ${stint.stint_number} | ${liveRiderName(stint)} · ${startTime}–${endTime}${daySuffix}`;
    list.append(item);
  });
}
function renderLiveRaceDisplay() {
  const clock = document.querySelector("#live-current-time");
  if (!clock) return;
  clock.textContent = new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const now = Date.now();
  const published = raceDayRosterStints
    .filter(item => item.rosters?.status === "published" && item.scheduled_start && item.scheduled_end)
    .sort((a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start));
  const groups = new Map();
  published.forEach(item => {
    const eventId = item.rosters?.event_id;
    if (!eventId) return;
    if (!groups.has(eventId)) groups.set(eventId, []);
    groups.get(eventId).push(item);
  });
  let chosenEventId = null;
  let chosenStints = [];
  for (const [eventId, stints] of groups) {
    const storedId = liveRaceStateByEvent[eventId]?.current_roster_stint_id;
    const storedIndex = storedId ? stints.findIndex(item => item.id === storedId) : -1;
    const activeIndex = stints.findIndex(item => new Date(item.scheduled_start).getTime() <= now && new Date(item.scheduled_end).getTime() > now);
    const candidateIndex = storedIndex >= 0 ? storedIndex : activeIndex >= 0 ? activeIndex : stints.findIndex(item => new Date(item.scheduled_start).getTime() > now);
    if (candidateIndex >= 0) { chosenEventId = eventId; chosenStints = stints; break; }
  }
  liveSelectedEventId = chosenEventId;
  const eventChip = document.querySelector("#race-control-event");
  const eventStatus = document.querySelector("#race-control-event-status");
  const selectedStint = chosenStints[0];
  const eventRecord = selectedStint?.rosters?.race_events;
  const startName = document.querySelector("#race-start-countdown-name");
  const startDateLabel = document.querySelector("#race-start-countdown-date");
  const startValue = document.querySelector("#race-start-countdown-value");
  const startCaption = document.querySelector("#race-start-countdown-label");
  if (startName && startDateLabel && startValue && startCaption) {
    if (!eventRecord?.start_date) {
      startName.textContent = eventRecord?.event_name?.toUpperCase() || "NO EVENT SCHEDULED";
      startDateLabel.textContent = "An event start date has not been entered.";
      startValue.textContent = "—";
      startCaption.textContent = "START TIME NOT SET";
    } else {
      const datePart = String(eventRecord.start_date).slice(0, 10);
      const timePart = String(eventRecord.start_time || "12:00").trim();
      const validTime = /^[0-9]{2}:[0-9]{2}(:[0-9]{2})?$/.test(timePart);
      const startAt = validTime ? new Date(datePart + "T" + (timePart.length === 5 ? timePart + ":00" : timePart)) : new Date(NaN);
      const remaining = startAt.getTime() - Date.now();
      startName.textContent = (eventRecord.event_name || "NEXT EVENT").toUpperCase();
      startDateLabel.textContent = Number.isFinite(startAt.getTime()) ? startAt.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }) : "Check the event start date and time.";
      if (!Number.isFinite(startAt.getTime())) {
        startValue.textContent = "—";
        startCaption.textContent = "INVALID EVENT TIME";
      } else if (remaining <= 0) {
        startValue.textContent = "00:00:00";
        startCaption.textContent = "EVENT STARTED";
      } else {
        const days = Math.floor(remaining / 86400000);
        const hours = Math.floor(remaining % 86400000 / 3600000);
        const minutes = Math.floor(remaining % 3600000 / 60000);
        const seconds = Math.floor(remaining % 60000 / 1000);
        startValue.textContent = (days ? days + "d " : "") + [hours, minutes, seconds].map(value => String(value).padStart(2, "0")).join(":");
        startCaption.textContent = "TIME UNTIL START";
      }
    }
  }
  const eventName = selectedStint?.rosters?.race_events?.event_name || "NO ACTIVE EVENT";
  if (eventChip) eventChip.textContent = eventName.toUpperCase();
  if (eventStatus) eventStatus.textContent = chosenEventId ? "LIVE EVENT CONNECTED · ROSTER SYNC ACTIVE" : "NO PUBLISHED EVENT FOUND · WAITING FOR ROSTER";
  const updated = document.querySelector("#overview-updated");
  if (updated) updated.textContent = "SYNCED " + new Date().toLocaleTimeString("en-AU",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
  const raceClockState = liveRaceStateByEvent[liveSelectedEventId];
  const countdown = document.querySelector("#race-countdown");
  const raceClockStatus = document.querySelector("#race-clock-status");
  const raceClockLabel = document.querySelector("#race-clock-live-label");
  const startRaceClockButton = document.querySelector("#start-race-clock-button");
  if (countdown && raceClockStatus && raceClockLabel && startRaceClockButton) {
    const startedAt = raceClockState?.race_clock_started_at;
    const rawDuration = raceClockState?.race_clock_duration_seconds;
    const duration = rawDuration == null || rawDuration === "" ? 86400 : Number(rawDuration);
    const pausedAt = raceClockState?.race_clock_paused_at;
    const stopRaceClockButton = document.querySelector("#stop-race-clock-button");
    const restartRaceClockButton = document.querySelector("#restart-race-clock-button");
    const moreClockControls = document.querySelector("#race-clock-more-controls");
    const canControlClock = canManageOperations() && !!liveSelectedEventId;
    if (startedAt) {
      startRaceClockButton.hidden = false;
      if (moreClockControls) moreClockControls.hidden = false;
      const startedAtMs = new Date(startedAt).getTime();
      const pausedAtMs = pausedAt ? new Date(pausedAt).getTime() : null;
      const endTime = pausedAt ? pausedAtMs : Date.now();
      if (!Number.isFinite(startedAtMs) || !Number.isFinite(duration) || duration <= 0 || (pausedAt && !Number.isFinite(pausedAtMs))) {
        countdown.textContent = "--:--:--";
        raceClockLabel.textContent = "CLOCK ERROR";
        raceClockStatus.textContent = "The saved race clock data is invalid. An administrator needs to reset the race clock before it can run.";
        startRaceClockButton.textContent = "CLOCK NEEDS RESET";
        startRaceClockButton.disabled = true;
        if (stopRaceClockButton) { stopRaceClockButton.hidden = true; stopRaceClockButton.disabled = true; }
        if (restartRaceClockButton) { restartRaceClockButton.hidden = false; restartRaceClockButton.disabled = !canControlClock; }
      } else {
      const remaining = Math.max(0, duration - Math.floor((endTime - startedAtMs) / 1000));
      const hours = Math.floor(remaining / 3600);
      const minutes = Math.floor((remaining % 3600) / 60);
      const seconds = remaining % 60;
      countdown.textContent = [hours, minutes, seconds].map(value => String(value).padStart(2, "0")).join(":");
      raceClockLabel.textContent = remaining === 0 ? "FINISHED" : pausedAt ? "PAUSED" : "LIVE";
      raceClockStatus.textContent = remaining === 0 ? "The 24-hour race period has finished." : pausedAt ? "Clock paused · " + liveTime(pausedAt) : "Race started · " + liveTime(startedAt);
      startRaceClockButton.textContent = remaining === 0 ? "RACE COMPLETE" : pausedAt ? "RESUME CLOCK" : "CLOCK RUNNING";
      startRaceClockButton.disabled = !canControlClock || remaining === 0 || !pausedAt;
      if (stopRaceClockButton) {
        stopRaceClockButton.hidden = !!pausedAt || remaining === 0;
        stopRaceClockButton.disabled = !canControlClock || !!pausedAt || remaining === 0;
      }
      if (restartRaceClockButton) {
        restartRaceClockButton.hidden = false;
        restartRaceClockButton.disabled = !canControlClock;
      }
      }
    } else {
      if (moreClockControls) { moreClockControls.hidden = true; moreClockControls.open = false; }
      countdown.textContent = "24:00:00";
      raceClockLabel.textContent = "READY";
      raceClockStatus.textContent = "Ready to start. The first rider will be Hugh.";
      startRaceClockButton.textContent = "START RACE";
      startRaceClockButton.hidden = true;
      startRaceClockButton.disabled = true;
      if (stopRaceClockButton) { stopRaceClockButton.hidden = true; stopRaceClockButton.disabled = true; }
      if (restartRaceClockButton) { restartRaceClockButton.hidden = true; restartRaceClockButton.disabled = true; }
    }
  }
  let current = null, next = null;
  const liveState = liveRaceStateByEvent[chosenEventId];
  const raceHasStarted = !!liveState?.race_clock_started_at;
  let currentIndex = -1;
  if (chosenStints.length && raceHasStarted) {
    const storedId = liveState?.current_roster_stint_id;
    currentIndex = storedId ? chosenStints.findIndex(item => item.id === storedId) : -1;
    if (currentIndex < 0) {
      currentIndex = chosenStints.findIndex(item => new Date(item.scheduled_start).getTime() <= now && new Date(item.scheduled_end).getTime() > now);
      if (currentIndex < 0) currentIndex = chosenStints.findIndex(item => new Date(item.scheduled_start).getTime() > now);
    }
    if (currentIndex >= 0) {
      current = chosenStints[currentIndex];
      next = chosenStints[currentIndex + 1] || null;
    }
  } else if (chosenStints.length) {
    next = chosenStints[0];
  }
  renderLiveRiderCard("current", current, "Race not started", "Press START RACE when the team is ready");
  renderLiveRiderCard("next", next, "No upcoming rider", "No future published stint found");
  renderUpcomingRiders(chosenStints, currentIndex);
  const changeoverButton = document.querySelector("#rider-changeover-button");
  if (changeoverButton) {
    changeoverButton.textContent = raceHasStarted ? "RIDER CHANGEOVER" : "START RACE";
    changeoverButton.disabled = !canManageOperations() || !chosenStints.length || (raceHasStarted && (!current || !next));
  }
  const stintTimer = document.querySelector("#current-stint-timer");
  if (stintTimer) {
    if (current && liveState?.changed_at) {
      const elapsed = Math.max(0, Math.floor((now - new Date(liveState.current_stint_started_at || liveState.changed_at).getTime()) / 1000));
      const planned = Math.max(0, Math.floor((new Date(current.scheduled_end).getTime() - new Date(current.scheduled_start).getTime()) / 1000));
      const difference = planned - elapsed;
      const format = value => {
        const abs = Math.abs(value);
        return [Math.floor(abs / 3600), Math.floor((abs % 3600) / 60), abs % 60].map(part => String(part).padStart(2, "0")).join(":");
      };
      stintTimer.hidden = false;
      stintTimer.textContent = "STINT TIME · " + format(elapsed) + (difference >= 0 ? "  ·  −" + format(difference) + " TO GO" : "  ·  +" + format(-difference) + " OVER");
      stintTimer.classList.toggle("stint-over", difference < 0);
    } else {
      stintTimer.hidden = true;
      stintTimer.textContent = "";
      stintTimer.classList.remove("stint-over");
    }
  }
  const undoButton = document.querySelector("#undo-rider-changeover-button");
  if (undoButton) undoButton.disabled = !canManageOperations() || !liveRaceStateByEvent[chosenEventId]?.previous_roster_stint_id;
  const restartButton = document.querySelector("#restart-live-roster-button");
  if (restartButton) restartButton.disabled = !canManageOperations() || !chosenEventId || !chosenStints.length;
  const status = document.querySelector("#changeover-status");
  if (status && liveRaceStateByEvent[chosenEventId]?.changed_at) {
    const state = liveRaceStateByEvent[chosenEventId];
    status.textContent = (state.previous_roster_stint_id ? "Last changeover · " : "Last changeover undone · ") + liveTime(state.changed_at);
  } else if (status && !status.dataset.message) {
    status.textContent = "Changeovers sync to all connected devices.";
  }
}
async function startRaceFromGrid() {
  if (!canManageOperations() || !liveSelectedEventId) return;
  const button = document.querySelector("#rider-changeover-button");
  const clockStatus = document.querySelector("#race-clock-status");
  const changeoverStatus = document.querySelector("#changeover-status");
  const state = liveRaceStateByEvent[liveSelectedEventId];
  if (state?.race_clock_started_at) return performRiderChangeover();

  const firstStint = raceDayRosterStints
    .filter(item => item.rosters?.event_id === liveSelectedEventId && item.rosters?.status === "published")
    .sort((a,b) => new Date(a.scheduled_start) - new Date(b.scheduled_start) || Number(a.stint_number) - Number(b.stint_number))[0];
  if (!firstStint) {
    clockStatus.textContent = "No published roster is available to start.";
    return;
  }

  button.disabled = true;
  button.textContent = "STARTING RACE…";
  clockStatus.classList.remove("error-state");

  // Set the first rostered stint as CURRENT before starting the clock.
  // Do not call advance_live_changeover here: that RPC advances one rider
  // beyond the first stint when the live state is empty.
  const { data: riderData, error: riderError } = await supabaseClient.rpc("restart_live_roster", { p_event_id: liveSelectedEventId });
  if (riderError) {
    clockStatus.textContent = riderError.message || "The first rider could not be assigned.";
    clockStatus.classList.add("error-state");
    renderLiveRaceDisplay();
    return;
  }
  if (!riderData?.current_roster_stint_id || riderData.current_roster_stint_id !== firstStint.id) {
    clockStatus.textContent = "Race start stopped: the database did not confirm Hugh's first rostered stint. The race clock has not been started.";
    clockStatus.classList.add("error-state");
    renderLiveRaceDisplay();
    return;
  }
  liveRaceStateByEvent[riderData.event_id] = riderData;

  const { data: clockData, error: clockError } = await supabaseClient.rpc("start_live_race_clock", { p_event_id: liveSelectedEventId });
  if (clockError) {
    clockStatus.textContent = clockError.message || "The race clock could not be started.";
    clockStatus.classList.add("error-state");
    renderLiveRaceDisplay();
    return;
  }
  if (clockData) liveRaceStateByEvent[clockData.event_id] = clockData;

  changeoverStatus.classList.remove("error-state");
  changeoverStatus.textContent = "Race started · " + liveTime(clockData?.race_clock_started_at || new Date().toISOString());
  clockStatus.textContent = "The 24-hour race clock has started. " + liveRiderName(firstStint) + " is riding first.";
  void sendOperationalPush("race_clock_started", { event_id: liveSelectedEventId });
  renderLiveRaceDisplay();
}
async function startRaceClock() {
  if (!canManageOperations() || !liveSelectedEventId) return;
  const button = document.querySelector("#start-race-clock-button");
  const status = document.querySelector("#race-clock-status");
  if (liveRaceStateByEvent[liveSelectedEventId]?.race_clock_started_at && !liveRaceStateByEvent[liveSelectedEventId]?.race_clock_paused_at) return;
  button.disabled = true;
  button.textContent = "STARTING…";
  const { data, error } = await supabaseClient.rpc("start_live_race_clock", { p_event_id: liveSelectedEventId });
  if (error) {
    status.textContent = error.message || "The race clock could not be started.";
    status.classList.add("error-state");
    renderLiveRaceDisplay();
    return;
  }
  if (data) liveRaceStateByEvent[data.event_id] = data;
  status.classList.remove("error-state");
  status.textContent = "The 24-hour race clock has started.";
  void sendOperationalPush("race_clock_started", { event_id: liveSelectedEventId });
  renderLiveRaceDisplay();
}
async function stopRaceClock() {
  if (!canManageOperations() || !liveSelectedEventId) return;
  const button = document.querySelector("#stop-race-clock-button");
  const status = document.querySelector("#race-clock-status");
  button.disabled = true;
  button.textContent = "STOPPING…";
  const { data, error } = await supabaseClient.rpc("stop_live_race_clock", { p_event_id: liveSelectedEventId });
  button.textContent = "STOP CLOCK";
  if (error) {
    status.textContent = error.message || "The race clock could not be stopped.";
    status.classList.add("error-state");
    renderLiveRaceDisplay();
    return;
  }
  if (data) liveRaceStateByEvent[data.event_id] = data;
  status.classList.remove("error-state");
  status.textContent = "Race clock paused.";
  void sendOperationalPush("race_clock_stopped", { event_id: liveSelectedEventId });
  renderLiveRaceDisplay();
}
async function restartRaceClock() {
  if (!canManageOperations() || !liveSelectedEventId) return;
  const confirmed = window.confirm("Reset the race clock to 24:00:00? The clock will be stopped and will need to be started again.");
  if (!confirmed) return;
  const button = document.querySelector("#restart-race-clock-button");
  const status = document.querySelector("#race-clock-status");
  button.disabled = true;
  button.textContent = "RESETTING…";
  const { data, error } = await supabaseClient.rpc("restart_live_race_clock", { p_event_id: liveSelectedEventId });
  button.textContent = "↻ RESTART CLOCK";
  if (error) {
    status.textContent = error.message || "The race clock could not be restarted.";
    status.classList.add("error-state");
    renderLiveRaceDisplay();
    return;
  }
  if (data) liveRaceStateByEvent[data.event_id] = data;
  status.classList.remove("error-state");
  status.textContent = "Race clock reset to 24 hours. Ready to start.";
  renderLiveRaceDisplay();
}
async function performRiderChangeover() {
  if (!canManageOperations() || !liveSelectedEventId) return;
  const button = document.querySelector("#rider-changeover-button");
  const status = document.querySelector("#changeover-status");
  button.disabled = true;
  button.textContent = "Updating…";
  const { data, error } = await supabaseClient.rpc("advance_live_changeover", { p_event_id: liveSelectedEventId });
  button.textContent = "RIDER CHANGEOVER";
  if (error) {
    status.textContent = error.message || "Changeover could not be saved.";
    status.classList.add("error-state");
    renderLiveRaceDisplay();
    return;
  }
  if (data) liveRaceStateByEvent[data.event_id] = data;
  status.classList.remove("error-state");
  status.textContent = "Changeover saved · " + liveTime(data?.changed_at || new Date().toISOString());
  await loadChangeoverLog();
  void sendOperationalPush("rider_changeover", { event_id: liveSelectedEventId });
  // Read the saved live state and published roster again so the targeted alert
  // does not depend on a possibly stale in-memory roster list.
  const { data: refreshedState, error: refreshedStateError } = await supabaseClient
    .from("live_race_state")
    .select("current_roster_stint_id")
    .eq("event_id", liveSelectedEventId)
    .maybeSingle();
  const currentStintId = data?.current_roster_stint_id || refreshedState?.current_roster_stint_id;
  const { data: eventStints, error: eventStintsError } = await supabaseClient
    .from("roster_stints")
    .select("id,rider_id,scheduled_start,stint_number,riders(first_name,last_name,preferred_name),rosters!inner(event_id,status)")
    .eq("rosters.event_id", liveSelectedEventId)
    .eq("rosters.status", "published")
    .order("scheduled_start", { ascending: true })
    .order("stint_number", { ascending: true });
  if (refreshedStateError || eventStintsError) {
    console.warn("Next rider roster lookup failed:", refreshedStateError?.message || eventStintsError?.message);
    status.textContent += " · Could not look up the next rider.";
  } else {
    const currentIndex = (eventStints || []).findIndex(item => item.id === currentStintId);
    const nextStint = currentIndex >= 0 ? eventStints[currentIndex + 1] : null;
    if (nextStint?.rider_id) {
      const nextName = liveRiderName(nextStint);
      const { data: nextAlert, error: nextAlertError } = await supabaseClient.functions.invoke("push-notifications", {
        body: { action: "notify_next_rider", event_id: liveSelectedEventId, rider_id: nextStint.rider_id }
      });
      if (nextAlertError || nextAlert?.error) {
        console.warn("Next rider notification could not be delivered:", nextAlert?.error || nextAlertError?.message);
        status.textContent += " · Next rider alert could not be sent.";
      } else {
        status.textContent += " · " + nextName + " notified for their upcoming stint.";
      }
    } else {
      console.warn("Next rider alert skipped: current stint not found or no later published stint.", { currentStintId, eventId: liveSelectedEventId });
      status.textContent += " · Next rider could not be identified.";
    }
  }
  renderLiveRaceDisplay();
}
async function undoRiderChangeover() {
  if (!canManageOperations() || !liveSelectedEventId || !liveRaceStateByEvent[liveSelectedEventId]?.previous_roster_stint_id) return;
  const button = document.querySelector("#undo-rider-changeover-button");
  const status = document.querySelector("#changeover-status");
  button.disabled = true;
  button.textContent = "Undoing…";
  const { data, error } = await supabaseClient.rpc("undo_live_changeover", { p_event_id: liveSelectedEventId });
  button.textContent = "↶ UNDO CHANGEOVER";
  if (error) {
    status.textContent = error.message || "The last changeover could not be undone.";
    status.classList.add("error-state");
    renderLiveRaceDisplay();
    return;
  }
  if (data) liveRaceStateByEvent[data.event_id] = data;
  status.classList.remove("error-state");
  status.textContent = "Changeover undone · " + liveTime(data?.changed_at || new Date().toISOString());
  await loadChangeoverLog();
  renderLiveRaceDisplay();
}
async function restartLiveRoster() {
  if (!canManageOperations() || !liveSelectedEventId) return;
  const confirmed = window.confirm("Restart the live roster from the very first published stint? This resets the shared live rider position for everyone. It does not change the saved roster or recorded race results.");
  if (!confirmed) return;
  const button = document.querySelector("#restart-live-roster-button");
  const status = document.querySelector("#changeover-status");
  button.disabled = true;
  button.textContent = "Restarting…";
  const { data, error } = await supabaseClient.rpc("restart_live_roster", { p_event_id: liveSelectedEventId });
  button.textContent = "↻ RESTART ROSTER";
  if (error) {
    status.textContent = error.message || "The live roster could not be restarted.";
    status.classList.add("error-state");
    renderLiveRaceDisplay();
    return;
  }
  if (data) liveRaceStateByEvent[data.event_id] = data;
  status.classList.remove("error-state");
  status.textContent = "Roster restarted from the first stint · " + liveTime(data?.changed_at || new Date().toISOString());
  renderLiveRaceDisplay();
}
function formatRaceDuration(totalSeconds) { const v=Math.max(0,Math.floor(Number(totalSeconds)||0)); return [Math.floor(v/3600),Math.floor((v%3600)/60),v%60].map(x=>String(x).padStart(2,'0')).join(':'); }
async function exportChangeoverLogToExcel() {
  if (!liveSelectedEventId) {
    window.alert("Select a race event before exporting its changeover log.");
    return;
  }
  if (!window.XLSX) {
    window.alert("The Excel export library could not load. Check your internet connection and try again.");
    return;
  }
  const button = document.querySelector("#export-changeover-log");
  const originalLabel = button?.textContent || "Export to Excel";
  if (button) { button.disabled = true; button.textContent = "Preparing workbook…"; }
  try {
    const pageSize = 1000;
    let allRows = [];
    for (let offset = 0; ; offset += pageSize) {
      const result = await supabaseClient
        .from("race_changeovers")
        .select("id,event_id,from_roster_stint_id,to_roster_stint_id,changeover_at,race_elapsed_seconds,actual_stint_seconds,scheduled_stint_seconds,variance_seconds")
        .eq("event_id", liveSelectedEventId)
        .order("changeover_at", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (result.error) throw result.error;
      const page = result.data || [];
      allRows = allRows.concat(page);
      if (page.length < pageSize) break;
    }

    const eventStint = raceDayRosterStints.find(stint => stint.rosters?.event_id === liveSelectedEventId);
    const eventName = eventStint?.rosters?.race_events?.event_name || "Team Venom race";
    const rosterById = new Map(raceDayRosterStints.map(stint => [stint.id, stint]));
    const workbookRows = allRows.map(row => {
      const from = rosterById.get(row.from_roster_stint_id);
      const to = rosterById.get(row.to_roster_stint_id);
      const variance = Number(row.variance_seconds) || 0;
      return {
        "Local changeover date and time": row.changeover_at ? new Date(row.changeover_at).toLocaleString("en-AU") : "",
        "Race elapsed time": formatRaceDuration(row.race_elapsed_seconds),
        "Rider handing over": from ? liveRiderName(from) : "Previous rider",
        "Rider taking over": to ? liveRiderName(to) : "Next rider",
        "Actual stint duration": formatRaceDuration(row.actual_stint_seconds),
        "Scheduled stint duration": formatRaceDuration(row.scheduled_stint_seconds),
        "Variance": variance > 0 ? "+" + formatRaceDuration(variance) : variance < 0 ? "−" + formatRaceDuration(Math.abs(variance)) : "00:00:00",
        "Variance status": variance > 0 ? "Over schedule" : variance < 0 ? "Early" : "On time"
      };
    });

    const sheet = XLSX.utils.json_to_sheet(workbookRows, {
      header: ["Local changeover date and time","Race elapsed time","Rider handing over","Rider taking over","Actual stint duration","Scheduled stint duration","Variance","Variance status"]
    });
    sheet["!cols"] = [{wch:25},{wch:19},{wch:25},{wch:25},{wch:22},{wch:25},{wch:17},{wch:18}];
    sheet["!autofilter"] = { ref: sheet["!ref"] || "A1:H1" };
    sheet["!freeze"] = { xSplit: 0, ySplit: 1 };
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Changeovers");
    const safeName = eventName.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "race";
    const dateStamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `team-venom-${safeName}-changeovers-${dateStamp}.xlsx`);
    if (button) button.textContent = "Exported";
    window.setTimeout(() => { if (button) button.textContent = originalLabel; }, 1800);
  } catch (error) {
    console.error("Changeover Excel export failed:", error);
    window.alert("The changeover log could not be exported: " + (error.message || "Unknown error"));
    if (button) button.textContent = originalLabel;
  } finally {
    if (button) button.disabled = false;
  }
}

function renderChangeoverLog() {
 const list=document.querySelector('#changeover-log-list'), count=document.querySelector('#changeover-log-count'); if(!list)return; list.replaceChildren();
 const rows=raceChangeoverLog.filter(row=>row.event_id===liveSelectedEventId); if(count)count.textContent=rows.length+' RECORDED';
 if(!rows.length){const empty=document.createElement('p');empty.className='changeover-log-empty';empty.textContent='No changeovers recorded yet. Each confirmed rider handover will appear here.';list.append(empty);return;}
 rows.forEach(row=>{
  const from=raceDayRosterStints.find(stint=>stint.id===row.from_roster_stint_id),to=raceDayRosterStints.find(stint=>stint.id===row.to_roster_stint_id);
  const item=document.createElement('article');item.className='changeover-log-item';
  const heading=document.createElement('div');heading.className='changeover-log-heading';
  const time=document.createElement('strong');time.textContent=new Date(row.changeover_at).toLocaleTimeString('en-AU',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
  const clock=document.createElement('span');clock.textContent='RACE '+formatRaceDuration(row.race_elapsed_seconds);heading.append(time,clock);
  const riders=document.createElement('p');riders.className='changeover-log-riders';riders.textContent=(from?liveRiderName(from):'Previous rider')+'  →  '+(to?liveRiderName(to):'Next rider');
  const details=document.createElement('div');details.className='changeover-log-details';
  const duration=document.createElement('span');duration.textContent='STINT '+formatRaceDuration(row.actual_stint_seconds);
  const variance=document.createElement('strong'),diff=Number(row.variance_seconds)||0;variance.className=diff>0?'changeover-over':diff<0?'changeover-under':'';
  variance.textContent=diff>0?'+'+formatRaceDuration(diff)+' OVER':diff<0?'−'+formatRaceDuration(Math.abs(diff))+' EARLY':'ON TIME';
  details.append(duration,variance);item.append(heading,riders,details);list.append(item);
 });
}
async function loadChangeoverLog(){
 if(!liveSelectedEventId){raceChangeoverLog=[];renderChangeoverLog();return;}
 const result=await supabaseClient.from('race_changeovers').select('id,event_id,from_roster_stint_id,to_roster_stint_id,changeover_at,race_elapsed_seconds,actual_stint_seconds,scheduled_stint_seconds,variance_seconds').eq('event_id',liveSelectedEventId).order('changeover_at',{ascending:false}).limit(30);
 if(result.error){console.warn('Race changeover log could not be loaded:',result.error.message);const list=document.querySelector('#changeover-log-list');if(list)list.textContent='Changeover history is currently unavailable.';return;}
 raceChangeoverLog=result.data||[];renderChangeoverLog();
}
function setupLiveRaceRealtime() {
  if (liveRaceChannel) return;
  liveRaceChannel = supabaseClient.channel("live-race-state-sync")
    .on("postgres_changes", { event: "*", schema: "public", table: "live_race_state" }, payload => {
      if (payload.new?.event_id) liveRaceStateByEvent[payload.new.event_id] = payload.new;
      if (payload.eventType === "DELETE" && payload.old?.event_id) delete liveRaceStateByEvent[payload.old.event_id];
      renderLiveRaceDisplay();
    })
    .on('postgres_changes',{event:'*',schema:'public',table:'race_changeovers'},()=>{void loadChangeoverLog();}).subscribe();
}
setInterval(renderLiveRaceDisplay, 1000);

async function loadRaceDay() {
  setupLiveRaceRealtime();
  const [rosterResult, ridersResult, liveStateResult] = await Promise.all([
    supabaseClient.from("roster_stints").select("id,stint_number,scheduled_start,scheduled_end,roster_notes,riders(first_name,last_name,preferred_name,photo_path),rosters!inner(id,event_id,status,race_events!inner(event_name,start_date,start_time))").in("rosters.status",["draft","published"]).order("scheduled_start",{ascending:true}),
    supabaseClient.from("riders").select("id",{count:"exact",head:true}).eq("status","active"),
    supabaseClient.from("live_race_state").select("event_id,current_roster_stint_id,previous_roster_stint_id,changed_at,changed_by,race_clock_started_at,race_clock_duration_seconds,race_clock_paused_at,current_stint_started_at")
  ]);
  if (rosterResult.error || ridersResult.error) {
    const status = document.querySelector("#race-clock-status");
    if (status) { status.textContent = "Race-day data could not be loaded. Check database access and refresh."; status.classList.add("error-state"); }
    return;
  }
  if (!liveStateResult.error) liveRaceStateByEvent = Object.fromEntries((liveStateResult.data || []).map(item => [item.event_id, item]));
  raceDayRosterStints = await Promise.all((rosterResult.data || []).map(async item => {
    const path = item.riders?.photo_path;
    if (!path) return item;
    const { data: signed, error: photoError } = await supabaseClient.storage.from("rider-photos").createSignedUrl(path, 3600);
    return { ...item, rider_photo_url: photoError ? null : signed?.signedUrl || null };
  }));
  document.querySelector("#race-day-riders").textContent = (ridersResult.count ?? 0).toLocaleString("en-AU");
  renderLiveRaceDisplay();
  await loadChangeoverLog();
}
async function loadPerformance() {
  const board=document.querySelector("#performance-leaderboard"); board.textContent="Loading performance data…";
  const [records,riders]=await Promise.all([
    supabaseClient.from("race_stints").select("rider_id,laps_completed,best_lap_seconds"),
    supabaseClient.from("riders").select("id,first_name,last_name,preferred_name")
  ]);
  if(records.error||riders.error){board.textContent="Performance data could not be loaded.";return;}
  const rows=records.data||[], names=new Map((riders.data||[]).map(r=>[r.id,r]));
  const totals=new Map();
  rows.forEach(item=>{const old=totals.get(item.rider_id)||{laps:0,stints:0,best:null};old.laps+=safeNumber(item.laps_completed);old.stints++;const best=Number(item.best_lap_seconds);if(best>0&&(old.best===null||best<old.best))old.best=best;totals.set(item.rider_id,old);});
  const sorted=[...totals.entries()].sort((a,b)=>b[1].laps-a[1].laps);
  const totalLaps=rows.reduce((sum,item)=>sum+safeNumber(item.laps_completed),0);
  document.querySelector("#performance-laps").textContent=totalLaps.toLocaleString("en-AU");
  document.querySelector("#performance-stints").textContent=rows.length.toLocaleString("en-AU");
  document.querySelector("#performance-riders").textContent=totals.size.toLocaleString("en-AU");
  document.querySelector("#performance-average").textContent=rows.length?(totalLaps/rows.length).toFixed(1):"0";
  board.replaceChildren();
  if(!sorted.length){board.textContent="No race performance data has been recorded yet.";return;}
  sorted.forEach(([id,stats],index)=>{
    const rider=names.get(id);const row=document.createElement("article");row.className="record-row";
    const name=document.createElement("strong");name.textContent=(index+1)+". "+(rider?(rider.preferred_name||rider.first_name)+" "+rider.last_name:"Unknown rider");
    const detail=document.createElement("small");detail.textContent=stats.laps+" laps · "+stats.stints+" stints · Best lap "+(stats.best===null?"—":stats.best+"s");
    row.append(name,detail);board.append(row);
  });
}

async function loadTeamVenomGmailStatus() {
  const status = document.querySelector("#team-venom-gmail-status");
  const testButton = document.querySelector("#test-team-venom-gmail");
  if (!status || !isAdministrator()) return;
  status.textContent = "Checking Gmail connection…";
  const { data, error } = await supabaseClient.functions.invoke("google-gmail-oauth-callback", { body: { action: "status" } });
  if (error || data?.error) {
    status.textContent = data?.error || error?.message || "Gmail connection status is unavailable.";
    testButton.disabled = true;
    return;
  }
  status.textContent = data.connected
    ? "Connected: " + data.sender_email + ". Account-link emails are ready."
    : "Gmail is not connected yet. Connect the approved sender account to enable email notifications.";
  testButton.disabled = !data.connected;
}
async function connectTeamVenomGmail() {
  if (!isAdministrator()) return;
  const button = document.querySelector("#connect-team-venom-gmail");
  const status = document.querySelector("#team-venom-gmail-status");
  button.disabled = true;
  status.textContent = "Preparing secure Google authorisation…";
  try {
    const { data, error } = await supabaseClient.functions.invoke("google-gmail-oauth-callback", { body: { action: "start" } });
    if (error || data?.error || !data?.authorization_url) throw new Error(data?.error || error?.message || "Could not start Gmail authorisation.");
    window.location.assign(data.authorization_url);
  } catch (error) {
    status.textContent = error?.message || "Could not connect Gmail.";
    button.disabled = false;
  }
}
async function testTeamVenomGmail() {
  if (!isAdministrator()) return;
  const button = document.querySelector("#test-team-venom-gmail");
  const status = document.querySelector("#team-venom-gmail-status");
  button.disabled = true;
  status.textContent = "Sending a test email to your signed-in administrator address…";
  try {
    const { data, error } = await supabaseClient.functions.invoke("google-gmail-oauth-callback", { body: { action: "test" } });
    if (error || data?.error) throw new Error(data?.error || error?.message || "Test email failed.");
    status.textContent = "Test email sent to " + data.recipient + " from " + data.sender + ". Check your inbox.";
  } catch (error) {
    status.textContent = error?.message || "Test email failed.";
  } finally {
    button.disabled = false;
  }
}
async function loadRiderAccounts() {
  const list = document.querySelector("#rider-account-list");
  const select = document.querySelector("#account-rider-select");
  if (!isAdministrator()) { list.textContent = "Administrator access is required."; return; }
  list.textContent = "Loading rider accounts…";
  const { data, error } = await supabaseClient.functions.invoke("rider-account-management", { body: { action: "list" } });
  if (error || data?.error) {
    list.textContent = "Rider accounts could not be loaded: " + (data?.error || error?.message || "Please try again.");
    return;
  }
  const riders = data?.riders || [];
  const available = riders.filter(rider => rider.status === "active");
  const selected = select.value;
  select.replaceChildren(new Option("Choose an active rider…", ""));
  available.forEach(rider => { const option=new Option(displayRiderName(rider),rider.id); const riderLogin=(rider.accounts||[]).find(account=>account.username)?.username||rider.account?.username; option.dataset.username=riderLogin||(rider.first_name+rider.last_name).replace(/[^a-z0-9]/gi,"").toLowerCase(); select.add(option); });
  if (available.some(item => item.id === selected)) select.value = selected;
  list.replaceChildren();
  if (!riders.length) {
    list.textContent = "No rider profiles have been created yet. Add riders in the Rider directory first.";
    return;
  }
  riders.forEach(rider => {
    const row = document.createElement("article"); row.className = "record-row";
    const heading = document.createElement("strong"); heading.textContent = displayRiderName(rider);
    const detail = document.createElement("small");
    const accounts = rider.accounts || (rider.account ? [rider.account] : []);
    detail.textContent = accounts.length
      ? accounts.map(account => (account.username ? "Rider login: " + account.username : "Email login: " + account.email) + " · " + account.status + (account.is_administrator ? " · Administrator" : " · Rider access")).join(" | ")
      : rider.status === "active" ? "No login account linked" : "Rider is not active · invitation unavailable";
    const badge = document.createElement("span");
    const activeAccounts = accounts.filter(account => account.status === "active").length;
    badge.className = "status-badge " + (activeAccounts ? "status-active" : "status-inactive");
    badge.textContent = activeAccounts ? activeAccounts + (activeAccounts === 1 ? " LOGIN ACTIVE" : " LOGINS ACTIVE") : accounts.length ? "ACCOUNT INACTIVE" : "NOT LINKED";
    row.append(heading, detail, badge);
    list.append(row);
  });
  document.querySelector("#account-management-message").textContent = available.length
    ? available.length + " active rider profile(s) available. Select one to create or reset its username and password."
    : "No active rider profiles are available.";
}
async function resendRiderInvitation(riderId, button) {
  if (!isAdministrator()) return;
  button.disabled = true;
  button.textContent = "Resending…";
  setModuleMessage("#account-management-message", "Generating a fresh secure invitation link…");
  try {
    const { data, error } = await supabaseClient.functions.invoke("rider-account-management", {
      body: { action: "resend_invitation", rider_id: riderId }
    });
    if (error || data?.error) throw new Error(data?.error || error?.message || "The invitation could not be resent.");
    setModuleMessage("#account-management-message", data.message || "A fresh invitation has been sent.");
    await loadRiderAccounts();
  } catch (error) {
    setModuleMessage("#account-management-message", error?.message || "The invitation could not be resent.", true);
    button.disabled = false;
    button.textContent = "Resend invitation";
  }
}
async function inviteRiderAccount(event) {
  event.preventDefault(); if (!isAdministrator()) return;
  const form=event.currentTarget; const button=document.querySelector("#invite-rider-account");
  button.disabled=true;button.textContent="Saving login…";setModuleMessage("#account-management-message","Creating or updating the rider login securely…");
  try {
    const {data,error}=await supabaseClient.functions.invoke("rider-account-management",{body:{action:"set_credentials",rider_id:form.elements.rider_id.value,username:form.elements.username.value,password:form.elements.password.value,contact_email:form.elements.contact_email.value.trim(),is_administrator:form.elements.is_administrator.checked}});
    if(error||data?.error)throw new Error(data?.error||error?.message||"The rider login could not be saved.");
    form.reset();
    setModuleMessage("#account-management-message",data.preserved_existing_admin_login ? data.message : data.message+" Username: "+data.username+". Keep the password available to share securely with the account holder.");
    await loadRiderAccounts();
  } catch(error) {setModuleMessage("#account-management-message",error?.message||"The rider login could not be saved.",true);}
  finally {button.disabled=false;button.textContent="Create / update rider login";}
}
async function linkExistingRiderAccount(event) {
  event.preventDefault();
  if (!isAdministrator()) return;
  const form = event.currentTarget;
  const button = document.querySelector("#link-existing-account");
  button.disabled = true; button.textContent = "Linking account…";
  setModuleMessage("#link-account-message", "Checking the existing Team Venom account…");
  try {
    const { data, error } = await supabaseClient.functions.invoke("rider-account-management", {
      body: { action: "link_existing", rider_id: form.elements.rider_id.value, email: form.elements.email.value.trim() }
    });
    if (error || data?.error) throw new Error(data?.error || error?.message || "The account could not be linked.");
    form.reset();
    setModuleMessage("#link-account-message", data.message || ("Linked " + data.email + " to " + data.rider + "."));
    await loadRiderAccounts();
  } catch (error) {
    setModuleMessage("#link-account-message", error?.message || "The account could not be linked.", true);
  } finally {
    button.disabled = false; button.textContent = "Link existing account";
  }
}
document.querySelector("#create-rider-account-form").addEventListener("submit", inviteRiderAccount);
document.querySelector("#account-rider-select").addEventListener("change",event=>{const option=event.currentTarget.selectedOptions[0];if(option?.dataset.username)document.querySelector("#account-username").value=option.dataset.username;});
document.querySelector("#refresh-rider-accounts").addEventListener("click", loadRiderAccounts);
document.querySelector("#connect-team-venom-gmail").addEventListener("click", connectTeamVenomGmail);
document.querySelector("#refresh-team-venom-gmail").addEventListener("click", loadTeamVenomGmailStatus);
document.querySelector("#test-team-venom-gmail").addEventListener("click", testTeamVenomGmail);

async function loadNotifications() {
  const list=document.querySelector("#notification-list");list.textContent="Loading notifications…";
  const {data,error}=await supabaseClient.from("notifications").select("id,title,message,channel,status,created_at,read_at").order("created_at",{ascending:false}).limit(100);
  if(error){list.textContent="Notifications could not be loaded.";return;}
  list.replaceChildren();
  if(!data?.length){list.textContent="Your inbox is clear. No notifications yet.";return;}
  data.forEach(item=>{
    const row=document.createElement("article");row.className="record-row"+(item.read_at?"":" record-unread");
    const title=document.createElement("strong");title.textContent=item.title;
    const message=document.createElement("p");message.textContent=item.message;
    const meta=document.createElement("small");meta.textContent=formatDateTime(item.created_at)+" · "+item.channel.replace("_"," ").toUpperCase();
    row.append(title,message,meta);
    if(!item.read_at){const button=document.createElement("button");button.type="button";button.className="text-button";button.textContent="Mark as read";button.addEventListener("click",async()=>{const {error:markError}=await supabaseClient.from("notifications").update({read_at:new Date().toISOString(),status:"read"}).eq("id",item.id);if(markError){setModuleMessage("#notification-message","Could not update notification: "+markError.message,true);}else await loadNotifications();});row.append(button);}
    list.append(row);
  });
  document.querySelector("#announcement-panel").hidden=!canManageNotifications();
  document.querySelector("#announcement-form").querySelectorAll("input,button").forEach(control=>{control.disabled=!canManageNotifications();});
}
async function sendAnnouncement(event) {
  event.preventDefault();if(!canManageNotifications())return;
  const form=event.currentTarget;const values=Object.fromEntries(new FormData(form).entries());
  const button=document.querySelector("#send-announcement");button.disabled=true;button.textContent="Sending…";
  const {data,error}=await supabaseClient.functions.invoke("push-notifications",{
    body:{action:"send",type:values.type,title:String(values.title||"").trim(),message:String(values.message||"").trim()}
  });
  button.disabled=false;button.textContent="Send announcement";
  if(error||data?.error){setModuleMessage("#announcement-message","Announcement could not be delivered: "+(data?.error||error?.message||"Please try again."),true);return;}
  form.reset();
  const pushCount=Number(data?.pushDevices||0), inboxCount=Number(data?.inboxRecipients||0);
  setModuleMessage("#announcement-message",pushCount
    ? `Announcement added to ${inboxCount} team inboxes and sent to ${pushCount} push-enabled device(s).`
    : `Announcement added to ${inboxCount} team inboxes. No push-enabled devices are registered yet.`);
  await loadNotifications();await loadOverview();
}
async function loadSettings() {
  if(!currentProfile||!currentUser)return;
  document.querySelector("#settings-name").textContent=currentProfile.display_name||"Team member";
  document.querySelector("#settings-email").textContent=currentUser.email||"Not available";
  document.querySelector("#settings-roles").textContent=currentRoles.join(", ");
  document.querySelector("#settings-status").textContent=currentProfile.status;
  const {data,error}=await supabaseClient.from("notification_preferences").select("channel,enabled").eq("user_id",currentUser.id);
  if(error){setModuleMessage("#preferences-message","Could not load preferences. Please refresh.",true);return;}
  const preferences=new Map((data||[]).map(item=>[item.channel,item.enabled]));
  ["in_app","email"].forEach(channel=>{const field=document.querySelector("#notification-preferences-form").elements[channel];field.checked=preferences.has(channel)?preferences.get(channel):channel==="in_app";});
  await refreshPushDeviceControl();
}
function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, character => character.charCodeAt(0));
}
async function refreshPushDeviceControl() {
  const toggle = document.querySelector("#toggle-push-device");
  const status = document.querySelector("#push-device-message");
  const testButton = document.querySelector("#test-push-device");
  if (!toggle || !status) return;
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported) {
    toggle.disabled = true;
    if (testButton) testButton.disabled = true;
    status.textContent = "This browser does not support web push notifications. Try Safari on your Mac.";
    return;
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    toggle.disabled = false;
    toggle.checked = !!subscription;
    if (testButton) testButton.disabled = !subscription;
    status.textContent = subscription
      ? "This Mac/browser is registered. Notifications will appear on this device only."
      : (Notification.permission === "denied"
          ? "Notifications are blocked in your browser or macOS settings."
          : "Notifications are currently off on this device. Turn on the switch to enable them.");
  } catch (error) {
    toggle.disabled = true;
    if (testButton) testButton.disabled = true;
    status.textContent = "This device's push settings could not be checked. Refresh and try again.";
  }
}
async function sendPushTest() {
  const button = document.querySelector("#test-push-device");
  const status = document.querySelector("#push-device-message");
  const originalLabel = button?.textContent || "Send test notification";
  let timeoutId;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) throw new Error("This device is not registered for push notifications. Turn notifications on first.");
    button.disabled = true;
    button.textContent = "Sending test…";
    const request = supabaseClient.functions.invoke("push-notifications", {
      body: { action: "test", endpoint: subscription.endpoint }
    });
    const result = await Promise.race([
      request,
      new Promise((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error("The test request timed out. Check your connection and try again.")), 20000);
      })
    ]);
    const { data, error } = result;
    if (error || data?.error) throw error || new Error(data.error);
    status.textContent = "The push service accepted a test notification for this device.";
    setModuleMessage("#preferences-message", status.textContent);
  } catch (error) {
    status.textContent = error?.message || "The test notification could not be sent.";
    setModuleMessage("#preferences-message", status.textContent, true);
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
    if (button) {
      button.disabled = false;
      button.textContent = originalLabel;
    }
    await refreshPushDeviceControl();
  }
}
async function togglePushDevice(event) {
  const toggle = event.currentTarget;
  const status = document.querySelector("#push-device-message");
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
  const enable = toggle.checked;
  toggle.disabled = true;
  try {
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    if (!enable) {
      if (existing) {
        const { error } = await supabaseClient.functions.invoke("push-notifications", {
          body: { action: "unsubscribe", endpoint: existing.endpoint }
        });
        if (error) throw error;
        await existing.unsubscribe();
      }
      status.textContent = "Notifications are now off on this device only.";
    } else if (!existing) {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notification permission was not granted. Allow notifications for this website in Safari and macOS settings.");
      const { data, error } = await supabaseClient.functions.invoke("push-notifications", { body: { action: "public-key" } });
      if (error || !data?.publicKey) throw error || new Error("The push public key could not be loaded.");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.publicKey)
      });
      const { error: saveError } = await supabaseClient.functions.invoke("push-notifications", {
        body: { action: "subscribe", subscription: subscription.toJSON() }
      });
      if (saveError) {
        await subscription.unsubscribe();
        throw saveError;
      }
      status.textContent = "Notifications are now on for this device only.";
    } else {
      status.textContent = "Notifications are already on for this device.";
    }
    await refreshPushDeviceControl();
    setModuleMessage("#preferences-message", status.textContent);
  } catch (error) {
    toggle.checked = !enable;
    status.textContent = error?.message || "This device's notification setting could not be updated.";
    setModuleMessage("#preferences-message", status.textContent, true);
  } finally {
    toggle.disabled = false;
  }
}
async function savePreferences(event) {
  event.preventDefault();const form=event.currentTarget;const button=document.querySelector("#save-preferences");button.disabled=true;button.textContent="Saving…";
  const rows=["in_app","email"].map(channel=>({user_id:currentUser.id,channel,enabled:form.elements[channel].checked,updated_at:new Date().toISOString()}));
  const {error}=await supabaseClient.from("notification_preferences").upsert(rows,{onConflict:"user_id,channel"});
  button.disabled=false;button.textContent="Save preferences";
  setModuleMessage("#preferences-message",error?"Preferences could not be saved: "+error.message:"Notification preferences saved.",!!error);
  if(!error) await refreshPushDeviceControl();
}
document.querySelector("#rider-changeover-button").addEventListener("click",startRaceFromGrid);
document.querySelector("#start-race-clock-button").addEventListener("click",startRaceClock);
document.querySelector("#stop-race-clock-button").addEventListener("click",stopRaceClock);
document.querySelector("#restart-race-clock-button").addEventListener("click",restartRaceClock);
document.querySelector("#undo-rider-changeover-button").addEventListener("click",undoRiderChangeover);
document.querySelector("#restart-live-roster-button").addEventListener("click",restartLiveRoster);
document.querySelector("#refresh-race-day").addEventListener("click",loadRaceDay);
document.querySelector("#refresh-performance").addEventListener("click",loadPerformance);
document.querySelector("#refresh-notifications").addEventListener("click",loadNotifications);
document.querySelector("#announcement-form").addEventListener("submit",sendAnnouncement);
document.querySelector("#notification-preferences-form").addEventListener("submit",savePreferences);
document.querySelector("#toggle-push-device").addEventListener("change",togglePushDevice);
document.querySelector("#test-push-device").addEventListener("click",sendPushTest);
