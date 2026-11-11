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

function renderRosterRecords() {
  const list = document.querySelector("#roster-list");
  const empty = document.querySelector("#roster-empty");
  list.replaceChildren();
  const eventsWithRosters = rosterEvents.map(event => ({
    event,
    rosters: rosterRecords.filter(roster => roster.event_id === event.id)
  })).filter(group => group.rosters.length);
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
    group.rosters.forEach(roster => {
      const row = document.createElement("div");
      row.className = "roster-version-row";
      const info = document.createElement("span");
      info.textContent = `Version ${roster.version_number} · ${roster.status.toUpperCase()} · ${new Date(roster.created_at).toLocaleDateString("en-AU")}`;
      row.append(info);
      section.append(row);
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

document.querySelector("#refresh-rosters").addEventListener("click", loadRosters);
document.querySelector("#new-event-toggle").hidden = !rosterCanManage();
document.querySelector("#create-manual-roster-form").querySelectorAll("input,select,button").forEach(control => { control.disabled = !rosterCanManage(); });
document.querySelector("#manual-stint-form").querySelectorAll("input,select,button").forEach(control => { control.disabled = !rosterCanManage(); });
