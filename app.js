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
  document.querySelector("#create-manual-roster-form").querySelectorAll("input,select,button").forEach(control => { control.disabled = !rosterCanManage(); });
document.querySelector("#manual-stint-form").querySelectorAll("input,select,button").forEach(control => { control.disabled = !rosterCanManage(); });
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

async function loadManualRosterOptions() {
  const select = document.querySelector("#manual-roster-select");
  const selected = select.value;
  select.replaceChildren(new Option("Select a draft roster…", ""));
  rosterRecords.filter(roster => roster.status === "draft").forEach(roster => {
    const event = rosterEvents.find(item => item.id === roster.event_id);
    select.add(new Option(`${event?.event_name || "Race event"} · Version ${roster.version_number}`, roster.id));
  });
  if (rosterRecords.some(roster => roster.id === selected && roster.status === "draft")) select.value = selected;
  await loadManualStints();
}

async function loadManualStints() {
  const rosterId = document.querySelector("#manual-roster-select").value;
  const list = document.querySelector("#manual-stint-list");
  const empty = document.querySelector("#manual-stint-empty");
  list.replaceChildren();
  empty.hidden = true;
  if (!rosterId) {
    empty.hidden = false;
    empty.textContent = "Select a draft roster to view or add its stints.";
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
  if (!data?.length) {
    empty.hidden = false;
    empty.textContent = "No stints have been added to this draft yet.";
    return;
  }
  data.forEach(stint => {
    const rider = rosterRiders.find(item => item.id === stint.rider_id);
    const row = document.createElement("article");
    row.className = "roster-version-row";
    const info = document.createElement("span");
    const name = rider ? (rider.preferred_name ? `${rider.preferred_name} ${rider.last_name}` : `${rider.first_name} ${rider.last_name}`) : "Unknown rider";
    const start = stint.scheduled_start ? new Date(stint.scheduled_start).toLocaleString("en-AU") : "No start";
    const end = stint.scheduled_end ? new Date(stint.scheduled_end).toLocaleString("en-AU") : "No end";
    info.textContent = `Stint ${stint.stint_number} · ${name} · ${start} – ${end}${stint.roster_notes ? " · " + stint.roster_notes : ""}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "text-button";
    remove.textContent = "Remove";
    remove.addEventListener("click", async () => {
      if (!rosterCanManage()) return;
      remove.disabled = true;
      const { error: deleteError } = await supabaseClient.from("roster_stints").delete().eq("id", stint.id);
      if (deleteError) {
        rosterMessage("That stint could not be removed. Check your access and try again.", true);
        remove.disabled = false;
        return;
      }
      rosterMessage(`Stint ${stint.stint_number} removed from the draft.`);
      await loadManualStints();
      await loadRosters();
    });
    row.append(info, remove);
    list.append(row);
  });
}

function populateManualRiderSelect() {
  const select = document.querySelector("#manual-rider-select");
  select.replaceChildren(new Option("Choose a rider…", ""));
  rosterRiders.forEach(rider => {
    const name = rider.preferred_name ? `${rider.preferred_name} ${rider.last_name}` : `${rider.first_name} ${rider.last_name}`;
    select.add(new Option(name, rider.id));
  });
}

document.querySelector("#create-manual-roster-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!rosterCanManage()) return;
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form).entries());
  const eventId = values.event_id;
  const version = Number(values.version_number);
  const message = document.querySelector("#manual-roster-message");
  const button = document.querySelector("#create-manual-roster");
  if (!eventId || !Number.isInteger(version) || version < 1) {
    message.textContent = "Choose an event and a valid version number.";
    message.className = "inline-message error-state";
    return;
  }
  const existing = rosterRecords.filter(item => item.event_id === eventId).map(item => Number(item.version_number));
  if (existing.includes(version)) {
    message.textContent = `Version ${version} already exists. Choose version ${Math.max(...existing) + 1}.`;
    message.className = "inline-message error-state";
    return;
  }
  button.disabled = true;
  button.textContent = "Creating draft…";
  const user = (await supabaseClient.auth.getUser()).data.user;
  const { data, error } = await supabaseClient.from("rosters").insert({
    event_id: eventId,
    version_number: version,
    status: "draft",
    source_filename: "Manual entry",
    uploaded_by: user?.id
  }).select("id").single();
  button.disabled = false;
  button.textContent = "Create draft roster";
  if (error || !data) {
    message.textContent = "The draft roster could not be created. Check your permissions and try again.";
    message.className = "inline-message error-state";
    return;
  }
  form.reset();
  await loadRosters();
  document.querySelector("#manual-roster-select").value = data.id;
  await loadManualStints();
  message.textContent = "Draft roster created. You can now add stints individually.";
  message.className = "inline-message success-message";
});

document.querySelector("#manual-roster-select").addEventListener("change", loadManualStints);

document.querySelector("#manual-stint-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!rosterCanManage()) return;
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form).entries());
  const rosterId = values.roster_id;
  const stintNumber = Number(values.stint_number);
  const start = new Date(values.scheduled_start);
  const end = new Date(values.scheduled_end);
  const message = document.querySelector("#manual-stint-message");
  const button = document.querySelector("#save-manual-stint");
  if (!rosterId || !values.rider_id || !Number.isInteger(stintNumber) || stintNumber < 1 || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    message.textContent = "Complete all required fields and make sure the end time is after the start time.";
    message.className = "inline-message error-state";
    return;
  }
  const { data: existing, error: existingError } = await supabaseClient.from("roster_stints").select("stint_number,rider_id,scheduled_start,scheduled_end").eq("roster_id", rosterId);
  if (existingError) {
    message.textContent = "Existing stints could not be checked. Please try again.";
    message.className = "inline-message error-state";
    return;
  }
  if ((existing || []).some(item => Number(item.stint_number) === stintNumber)) {
    message.textContent = `Stint number ${stintNumber} is already in this roster.`;
    message.className = "inline-message error-state";
    return;
  }
  const conflict = (existing || []).find(item => item.rider_id === values.rider_id && start < new Date(item.scheduled_end) && end > new Date(item.scheduled_start));
  if (conflict) {
    message.textContent = "This rider already has a stint that overlaps with the selected time.";
    message.className = "inline-message error-state";
    return;
  }
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
    message.textContent = "The stint could not be saved. Check your access and try again.";
    message.className = "inline-message error-state";
    return;
  }
  const nextNumber = stintNumber + 1;
  form.reset();
  form.elements.roster_id.value = rosterId;
  form.elements.stint_number.value = nextNumber;
  message.textContent = `Stint ${stintNumber} saved successfully.`;
  message.className = "inline-message success-message";
  await loadManualStints();
  await loadRosters();
  document.querySelector("#manual-roster-select").value = rosterId;
});

document.querySelector("#refresh-rosters").addEventListener("click", async () => { await loadRosters(); await loadManualStints(); });
document.querySelector("#new-event-toggle").hidden = !rosterCanManage();
document.querySelector("#roster-import-form").querySelectorAll("input,select,button").forEach(control => { control.disabled = !rosterCanManage(); });
