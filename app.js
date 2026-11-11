const SUPABASE_URL = "https://xqfbmioydhuycvvkafwq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_xPxK2aWz7gIkafxhiMIVGQ_mG77O6dD";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const authScreen = document.querySelector("#auth-screen");
const appShell = document.querySelector("#app-shell");
const loginForm = document.querySelector("#login-form");
const loginMessage = document.querySelector("#auth-message");
const loginButton = document.querySelector("#login-submit");
const title = document.querySelector("#page-title");
const description = document.querySelector("#page-description");
const breadcrumb = document.querySelector("#breadcrumb-current");

const pageCopy = {
  overview: ["Operations overview.", "Your central workspace for riders, rosters and race-day operations."],
  riders: ["Rider directory.", "Manage rider profiles, contact records and eligibility."],
  rosters: ["Roster management.", "Upload, validate and manage race rosters and stint allocations."],
  "race-day": ["Race-day control.", "Coordinate live operations, rider changes and stint completion."],
  performance: ["Performance centre.", "Review rider participation and team performance statistics."],
  notifications: ["Notifications.", "Manage operational alerts and important team updates."],
  settings: ["System settings.", "Configure the platform, access controls and team preferences."]
};

let currentRoles = [];
let ridersCache = [];

function showMessage(message, isError = true) {
  loginMessage.textContent = message;
  loginMessage.style.color = isError ? "#ffb6a9" : "var(--green)";
}

function selectView(view) {
  const copy = pageCopy[view] || pageCopy.overview;
  title.textContent = copy[0];
  const accent = document.createElement("span");
  title.append(accent);
  description.textContent = copy[1];
  breadcrumb.textContent = view.replace("-", " ").toUpperCase();
  document.querySelectorAll("[data-view]").forEach(button => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  document.querySelector("#overview-content").hidden = view !== "overview";
  document.querySelector("#riders-content").hidden = view !== "riders";
  document.querySelector("#rider-profile-content").hidden = true;
  document.querySelector("#rosters-content").hidden = view !== "rosters";
  document.querySelector("#module-placeholder").hidden = ["overview", "riders", "rosters"].includes(view);
  if (!["overview", "riders"].includes(view)) {
    document.querySelector("#placeholder-title").textContent = copy[0];
    document.querySelector("#placeholder-description").textContent = copy[1];
  }
  document.querySelector("#sidebar").classList.remove("open");
  if (view === "riders") loadRiders();
  if (view === "rosters") loadRosters();
}

document.querySelectorAll("[data-view]").forEach(button => {
  button.addEventListener("click", () => selectView(button.dataset.view));
});
document.querySelector("#menu-toggle").addEventListener("click", () => {
  document.querySelector("#sidebar").classList.toggle("open");
});
document.querySelector("#signout-button").addEventListener("click", async () => {
  const { error } = await supabaseClient.auth.signOut();
  if (error) showMessage("Sign out failed. Please try again.");
});

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
    row.addEventListener("click", () => openRiderProfile(rider.id));
    row.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openRiderProfile(rider.id); } });
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
  document.querySelector("#module-placeholder").hidden = true;
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
  document.querySelector("#rider-form-panel").hidden = false;
  document.querySelector("#rider-form").elements.first_name.focus();
});
document.querySelector("#cancel-add-rider").addEventListener("click", () => {
  document.querySelector("#rider-form-panel").hidden = true;
  document.querySelector("#rider-form").reset();
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

async function showAuthenticatedWorkspace(session) {
  if (!session?.user) {
    appShell.hidden = true;
    authScreen.hidden = false;
    return;
  }

  const userId = session.user.id;
  const [profileResult, roleResult] = await Promise.all([
    supabaseClient.from("member_profiles").select("display_name,status").eq("user_id", userId).maybeSingle(),
    supabaseClient.from("member_roles").select("role").eq("user_id", userId)
  ]);

  if (profileResult.error || roleResult.error) {
    appShell.hidden = true;
    authScreen.hidden = false;
    showMessage("We couldn't verify your team access. Please contact an administrator.");
    return;
  }

  const profile = profileResult.data;
  currentRoles = (roleResult.data || []).map(item => item.role);
  if (!profile || profile.status !== "active" || currentRoles.length === 0) {
    await supabaseClient.auth.signOut();
    appShell.hidden = true;
    authScreen.hidden = false;
    showMessage("Your account is not yet authorised. Please contact a Team Venom administrator.");
    return;
  }

  document.querySelector("#account-name").textContent = profile.display_name || "Team member";
  document.querySelector("#account-role").textContent = currentRoles[0].toUpperCase();
  document.querySelector("#add-rider-toggle").hidden = !canManageRiders();
  document.querySelector("#new-event-toggle").hidden = !rosterCanManage();
  document.querySelector("#roster-import-form").querySelectorAll("input,select,button").forEach(control => { control.disabled = !rosterCanManage(); });
  appShell.hidden = false;
  authScreen.hidden = true;
}

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  loginButton.disabled = true;
  loginButton.textContent = "Signing in…";
  showMessage("");
  const email = document.querySelector("#login-email").value.trim();
  const password = document.querySelector("#login-password").value;
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    showMessage("Sign-in failed. Check your email and password, then try again.");
  } else {
    await showAuthenticatedWorkspace(data.session);
  }
  loginButton.disabled = false;
  loginButton.innerHTML = 'Sign in <span>→</span>';
});

supabaseClient.auth.onAuthStateChange((_event, session) => {
  setTimeout(() => showAuthenticatedWorkspace(session), 0);
});

supabaseClient.auth.getSession().then(({ data, error }) => {
  if (error) {
    showMessage("Unable to check your session. Please refresh and try again.");
    return;
  }
  showAuthenticatedWorkspace(data.session);
});


// ROSTER MANAGEMENT
let rosterEvents = [];
let rosterRiders = [];
let rosterRecords = [];

function rosterCanManage() {
  return currentRoles.some(role => ["administrator", "manager"].includes(role));
}

function rosterMessage(message, isError = false) {
  const box = document.querySelector("#roster-import-message");
  box.textContent = message;
  box.className = isError ? "inline-message error-state" : "inline-message";
}

function normaliseHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function parseRosterDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "number" && window.XLSX) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, Math.floor(parsed.S)).toISOString();
  }
  const text = String(value || "").trim();
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function loadRosters() {
  const loading = document.querySelector("#roster-loading");
  const list = document.querySelector("#roster-list");
  const empty = document.querySelector("#roster-empty");
  const error = document.querySelector("#roster-error");
  loading.hidden = false; list.hidden = true; empty.hidden = true; error.hidden = true;
  const [eventsResult, rostersResult, ridersResult] = await Promise.all([
    supabaseClient.from("race_events").select("id,event_name,season_year,venue,event_type,start_date,end_date,status").order("start_date", { ascending: false }),
    supabaseClient.from("rosters").select("id,event_id,version_number,status,source_filename,created_at,published_at").order("created_at", { ascending: false }),
    supabaseClient.from("riders").select("id,first_name,last_name,preferred_name,status").eq("status", "active").order("last_name")
  ]);
  loading.hidden = true;
  if (eventsResult.error || rostersResult.error || ridersResult.error) { error.hidden = false; return; }
  rosterEvents = eventsResult.data || [];
  rosterRecords = rostersResult.data || [];
  rosterRiders = ridersResult.data || [];
  const [stintResult] = await Promise.all([
    supabaseClient.from("roster_stints").select("id,roster_id")
  ]);
  const stintRows = stintResult.error ? [] : (stintResult.data || []);
  document.querySelector("#roster-event-count").textContent = rosterEvents.length;
  document.querySelector("#roster-count").textContent = rosterRecords.length;
  document.querySelector("#roster-stint-count").textContent = stintRows.length;
  const select = document.querySelector("#roster-event-select");
  const selected = select.value;
  select.replaceChildren(new Option("Select an event…", ""));
  rosterEvents.forEach(event => select.add(new Option(`${event.event_name} · ${event.season_year}`, event.id)));
  if (rosterEvents.some(event => event.id === selected)) select.value = selected;
  const versionInput = document.querySelector("#roster-version");
  select.addEventListener("change", () => {
    const versions = rosterRecords.filter(roster => roster.event_id === select.value).map(roster => Number(roster.version_number));
    versionInput.value = versions.length ? Math.max(...versions) + 1 : 1;
  }, { once: true });
  list.replaceChildren();
  if (!rosterEvents.length) { list.hidden = true; empty.hidden = false; return; }
  rosterEvents.forEach(event => {
    const eventRosters = rosterRecords.filter(roster => roster.event_id === event.id);
    const section = document.createElement("section");
    section.className = "roster-event-row";
    const heading = document.createElement("div");
    heading.className = "roster-event-heading";
    const title = document.createElement("strong");
    title.textContent = `${event.event_name} · ${event.season_year}`;
    const meta = document.createElement("small");
    meta.textContent = [event.venue, event.event_type, event.start_date ? new Date(event.start_date + "T00:00:00").toLocaleDateString("en-AU") : null].filter(Boolean).join(" · ") || "Event details not completed";
    heading.append(title, meta);
    section.append(heading);
    if (!eventRosters.length) {
      const noRoster = document.createElement("p");
      noRoster.className = "roster-no-version";
      noRoster.textContent = "No roster imported yet.";
      section.append(noRoster);
    }
    eventRosters.forEach(roster => {
      const row = document.createElement("div");
      row.className = "roster-version-row";
      const label = document.createElement("span");
      label.textContent = `Version ${roster.version_number} · ${roster.source_filename || "Manual roster"}`;
      const status = document.createElement("span");
      status.className = `status-badge status-${roster.status === "published" ? "active" : "inactive"}`;
      status.textContent = roster.status;
      row.append(label, status);
      section.append(row);
    });
    list.append(section);
  });
  list.hidden = false;
}

document.querySelector("#new-event-toggle").addEventListener("click", () => {
  document.querySelector("#event-form-panel").hidden = false;
  document.querySelector("#event-form").elements.event_name.focus();
});
document.querySelector("#cancel-event").addEventListener("click", () => {
  document.querySelector("#event-form-panel").hidden = true;
  document.querySelector("#event-form").reset();
});
document.querySelector("#event-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!rosterCanManage()) return;
  const form = event.currentTarget;
  const button = document.querySelector("#save-event");
  const message = document.querySelector("#event-message");
  const values = Object.fromEntries(new FormData(form).entries());
  values.event_name = values.event_name.trim();
  values.season_year = Number(values.season_year);
  values.venue = values.venue.trim() || null;
  values.event_type = values.event_type.trim() || null;
  values.start_date = values.start_date || null;
  values.end_date = values.end_date || null;
  values.status = "planning";
  values.created_by = (await supabaseClient.auth.getUser()).data.user?.id;
  button.disabled = true; button.textContent = "Creating…";
  const { error } = await supabaseClient.from("race_events").insert(values);
  button.disabled = false; button.textContent = "Create event";
  if (error) {
    message.textContent = error.code === "23514" ? "The end date must be on or after the start date." : "Event could not be created. Check the details and your access.";
    message.className = "inline-message error-state";
    return;
  }
  message.textContent = "Race event created successfully.";
  message.className = "inline-message success-message";
  form.reset();
  form.elements.season_year.value = new Date().getFullYear();
  await loadRosters();
});

document.querySelector("#download-roster-template").addEventListener("click", () => {
  const csv = "stint_number,rider_name,scheduled_start,scheduled_end,roster_notes\n1,Alex Example,2026-11-19 12:00,2026-11-19 13:00,Opening stint\n";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = "team-venom-roster-template.csv"; link.click();
  URL.revokeObjectURL(url);
});

document.querySelector("#roster-import-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!rosterCanManage()) { rosterMessage("Only administrators and managers can import rosters.", true); return; }
  const eventId = document.querySelector("#roster-event-select").value;
  const file = document.querySelector("#roster-file").files[0];
  const version = Number(document.querySelector("#roster-version").value);
  const report = document.querySelector("#roster-validation");
  report.hidden = true; report.replaceChildren();
  if (!eventId || !file || !Number.isInteger(version) || version < 1) { rosterMessage("Choose an event, file and valid roster version.", true); return; }
  if (file.size > 10 * 1024 * 1024) { rosterMessage("Please keep roster files under 10 MB.", true); return; }
  const submit = document.querySelector("#validate-roster");
  submit.disabled = true; submit.textContent = "Reading file…";
  rosterMessage("");
  try {
    if (!window.XLSX) throw new Error("The spreadsheet reader did not load. Refresh the page and try again.");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });
    if (!rawRows.length) throw new Error("The first worksheet is empty.");
    const rows = rawRows.map((raw, index) => {
      const row = {};
      Object.entries(raw).forEach(([key, value]) => row[normaliseHeader(key)] = value);
      const riderName = String(row.rider_name || row.rider || row.name || "").trim().toLowerCase();
      const rider = rosterRiders.find(item => {
        const names = [`${item.first_name} ${item.last_name}`, `${item.preferred_name || item.first_name} ${item.last_name}`].map(name => name.toLowerCase());
        return names.includes(riderName);
      });
      return { line: index + 2, stint_number: Number(row.stint_number || row.stint || index + 1), rider_id: rider?.id, rider_name: String(row.rider_name || row.rider || row.name || ""), scheduled_start: parseRosterDate(row.scheduled_start || row.start || row.start_time), scheduled_end: parseRosterDate(row.scheduled_end || row.end || row.end_time), roster_notes: String(row.roster_notes || row.notes || "").trim() || null };
    });
    const issues = [];
    const seenNumbers = new Set();
    rows.forEach(row => {
      if (!Number.isInteger(row.stint_number) || row.stint_number < 1) issues.push(`Row ${row.line}: stint number must be a positive whole number.`);
      if (seenNumbers.has(row.stint_number)) issues.push(`Row ${row.line}: duplicate stint number ${row.stint_number}.`);
      seenNumbers.add(row.stint_number);
      if (!row.rider_id) issues.push(`Row ${row.line}: rider "${row.rider_name}" does not match an active rider.`);
      if (!row.scheduled_start || !row.scheduled_end) issues.push(`Row ${row.line}: start and end dates must be valid.`);
      else if (new Date(row.scheduled_end) <= new Date(row.scheduled_start)) issues.push(`Row ${row.line}: end must be after start.`);
    });
    const byRider = new Map();
    rows.filter(row => row.rider_id && row.scheduled_start && row.scheduled_end).forEach(row => {
      if (!byRider.has(row.rider_id)) byRider.set(row.rider_id, []);
      byRider.get(row.rider_id).push(row);
    });
    byRider.forEach(riderRows => {
      const sorted = riderRows.sort((a,b) => new Date(a.scheduled_start)-new Date(b.scheduled_start));
      for (let i=1;i<sorted.length;i++) if (new Date(sorted[i].scheduled_start) < new Date(sorted[i-1].scheduled_end)) issues.push(`Rider ${sorted[i].rider_name} has overlapping stints ${sorted[i-1].stint_number} and ${sorted[i].stint_number}.`);
    });
    if (issues.length) {
      report.hidden = false;
      const heading = document.createElement("strong"); heading.textContent = `Validation found ${issues.length} issue(s). No data was imported.`;
      const ul = document.createElement("ul"); issues.forEach(issue => { const li=document.createElement("li"); li.textContent=issue; ul.append(li); });
      report.append(heading,ul);
      rosterMessage("Fix the spreadsheet and import it again.", true);
      return;
    }
    const existing = rosterRecords.filter(item => item.event_id === eventId).map(item => Number(item.version_number));
    if (existing.includes(version)) throw new Error(`Version ${version} already exists for this event. Choose version ${Math.max(...existing)+1}.`);
    submit.textContent = "Saving roster…";
    const user = (await supabaseClient.auth.getUser()).data.user;
    const { data: roster, error: rosterError } = await supabaseClient.from("rosters").insert({ event_id:eventId, version_number:version, status:"draft", source_filename:file.name, uploaded_by:user?.id }).select("id").single();
    if (rosterError || !roster) throw new Error("The roster record could not be created. Check your permissions and version number.");
    const stintPayload = rows.map(row => ({ roster_id:roster.id, rider_id:row.rider_id, stint_number:row.stint_number, scheduled_start:row.scheduled_start, scheduled_end:row.scheduled_end, roster_notes:row.roster_notes }));
    const { error: stintError } = await supabaseClient.from("roster_stints").insert(stintPayload);
    if (stintError) {
      await supabaseClient.from("rosters").delete().eq("id", roster.id);
      throw new Error("The roster header was created but its stints could not be saved. The draft was rolled back; check the spreadsheet and database permissions.");
    }
    rosterMessage(`Successfully imported ${rows.length} stints as draft version ${version}. Review it before publishing.`);
    document.querySelector("#roster-import-form").reset();
    await loadRosters();
  } catch (error) {
    rosterMessage(error.message || "The roster could not be imported.", true);
  } finally {
    submit.disabled = false; submit.textContent = "Validate & import roster";
  }
});
document.querySelector("#refresh-rosters").addEventListener("click", loadRosters);
document.querySelector("#new-event-toggle").hidden = !rosterCanManage();
document.querySelector("#roster-import-form").querySelectorAll("input,select,button").forEach(control => { control.disabled = !rosterCanManage(); });
