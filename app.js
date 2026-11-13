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
  rosters: ["Roster management.", "Build, review and publish race rosters and stint allocations."],
  "race-day": ["Race-day control.", "Record actual stints, laps and race activity."],
  performance: ["Performance centre.", "Review rider participation and team performance statistics."],
  notifications: ["Notifications.", "View in-app updates and send team announcements."],
  settings: ["System settings.", "Review account access and notification preferences."]
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
  const views = ["overview","riders","rosters","race-day","performance","notifications","settings"];
  views.forEach(name => {
    const node = document.querySelector("#" + (name === "race-day" ? "race-day" : name) + "-content");
    if (node) node.hidden = view !== name;
  });
  document.querySelector("#rider-profile-content").hidden = true;
  document.querySelector("#sidebar").classList.remove("open");
  if (view === "overview") loadOverview();
  if (view === "riders") loadRiders();
  if (view === "rosters") loadRosters();
  if (view === "race-day") loadRaceDay();
  if (view === "performance") loadPerformance();
  if (view === "notifications") loadNotifications();
  if (view === "settings") loadSettings();
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
  currentProfile = profile;
  currentUser = session.user;
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
  loadOverview();
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
      if (roster.status === "draft" && rosterCanManage()) {
        const publish = document.createElement("button");
        publish.type = "button";
        publish.className = "text-button";
        publish.textContent = "Publish roster";
        publish.addEventListener("click", async () => {
          if (!confirm("Publish this roster? Team members will be able to view its scheduled stints.")) return;
          publish.disabled = true;
          const { error } = await supabaseClient.from("rosters").update({ status: "published", published_at: new Date().toISOString() }).eq("id", roster.id);
          if (error) {
            setRosterMessage("#manual-roster-message", "Roster could not be published. Check permissions and try again.", true);
            publish.disabled = false;
            return;
          }
          setRosterMessage("#manual-roster-message", `Roster version ${roster.version_number} published successfully.`);
          await loadRosters();
        });
        row.append(publish);
      }
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


let bulkRosterPreview = null;

function parseRosterClock(value) {
  const match = String(value || "").trim().match(/^(\\d{1,2}):(\\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function parseRosterDuration(value) {
  const match = String(value || "").trim().match(/^(\\d+(?:\\.\\d+)?)\\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours)?$/i);
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
  const lines = String(text || "").split(/\\r?\\n/).map(line => line.trimEnd()).filter(line => line.trim());
  if (lines.length < 2) return { error: "Paste the roster including its header row and at least one stint." };
  const rows = lines.map(line => line.split("\\t").map(cell => cell.trim()));
  const headers = rows[0].map(value => value.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const findColumn = names => headers.findIndex(header => names.includes(header));
  const columns = {
    number: findColumn(["#", "stint", "stintnumber", "number"]),
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
  let previousStart = null;
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
    if (previousStart !== null && startClock < previousStart) dayOffset += 1;
    const start = rosterDateTime(eventRecord.start_date, startClock, dayOffset);
    let endDayOffset = dayOffset + (endClock <= startClock ? 1 : 0);
    const end = rosterDateTime(eventRecord.start_date, endClock, endDayOffset);
    const actualDuration = (end.getTime() - start.getTime()) / 60000;
    if (Math.abs(actualDuration - duration) > 0.01) errors.push(`Row ${lineNumber}: duration says ${duration} minutes but the times span ${actualDuration} minutes.`);
    if (previousStart !== null && start.getTime() < previousStart) errors.push(`Row ${lineNumber}: roster times are not in chronological order.`);
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
    previousStart = start.getTime();
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
document.querySelector("#new-event-toggle").hidden = !rosterCanManage();
document.querySelector("#create-manual-roster-form").querySelectorAll("input,select,button").forEach(control => { control.disabled = !rosterCanManage(); });
document.querySelector("#manual-stint-form").querySelectorAll("input,select,button").forEach(control => { control.disabled = !rosterCanManage(); });

/* APPLICATION MODULES */
let currentProfile = null;
let currentUser = null;
let raceDayRosterStints = [];

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
async function loadRaceDay() {
  const list = document.querySelector("#race-record-list");
  list.textContent = "Loading race records…";
  const [rosterResult, recordResult, ridersResult] = await Promise.all([
    supabaseClient.from("roster_stints").select("id,stint_number,scheduled_start,scheduled_end,roster_notes,riders(first_name,last_name,preferred_name),rosters!inner(id,event_id,status,race_events!inner(event_name))").in("rosters.status",["draft","published"]).order("scheduled_start",{ascending:true}),
    supabaseClient.from("race_stints").select("id,event_id,rider_id,actual_start,actual_end,laps_completed,best_lap_seconds,entry_notes,riders(first_name,last_name,preferred_name),race_events(event_name)").order("created_at",{ascending:false}).limit(100),
    supabaseClient.from("riders").select("id",{count:"exact",head:true}).eq("status","active")
  ]);
  if (rosterResult.error || recordResult.error || ridersResult.error) {
    list.textContent = "Race-day data could not be loaded. Check database access and refresh.";
    return;
  }
  raceDayRosterStints = rosterResult.data || [];
  const select = document.querySelector("#race-record-roster-stint");
  const previous = select.value;
  select.replaceChildren(new Option("Choose a scheduled stint…",""));
  raceDayRosterStints.forEach(item => {
    const rider = item.riders;
    const event = item.rosters?.race_events;
    const name = rider ? (rider.preferred_name || rider.first_name) + " " + rider.last_name : "Rider";
    select.add(new Option((event?.event_name || "Event") + " · Stint " + item.stint_number + " · " + name,item.id));
  });
  if (raceDayRosterStints.some(item => item.id === previous)) select.value = previous;
  const records = recordResult.data || [];
  document.querySelector("#race-day-total").textContent = records.length.toLocaleString("en-AU");
  document.querySelector("#race-day-laps").textContent = records.reduce((sum,item)=>sum+safeNumber(item.laps_completed),0).toLocaleString("en-AU");
  document.querySelector("#race-day-riders").textContent = (ridersResult.count ?? 0).toLocaleString("en-AU");
  list.replaceChildren();
  if (!records.length) {
    list.textContent = "No actual race stints have been recorded yet.";
  } else records.forEach(item => {
    const row = document.createElement("article");
    row.className = "record-row";
    const heading = document.createElement("strong");
    heading.textContent = (item.race_events?.event_name || "Race event") + " · " + (item.riders?.preferred_name || item.riders?.first_name || "Rider") + " " + (item.riders?.last_name || "");
    const detail = document.createElement("small");
    detail.textContent = [item.actual_start ? formatDateTime(item.actual_start) : null,item.laps_completed !== null ? item.laps_completed + " laps" : null,item.best_lap_seconds ? "Best lap " + item.best_lap_seconds + "s" : null].filter(Boolean).join(" · ");
    row.append(heading,detail);
    if (item.entry_notes) { const note=document.createElement("small"); note.textContent=item.entry_notes; row.append(note); }
    list.append(row);
  });
  document.querySelector("#race-record-form").querySelectorAll("input,select,button").forEach(control=>{control.disabled=!canManageOperations();});
}
async function saveRaceRecord(event) {
  event.preventDefault();
  if (!canManageOperations()) return;
  const form=event.currentTarget;
  const values=Object.fromEntries(new FormData(form).entries());
  const planned=raceDayRosterStints.find(item=>item.id===values.roster_stint_id);
  if (!planned) { setModuleMessage("#race-record-message","Choose a scheduled roster stint.",true); return; }
  const start=values.actual_start ? new Date(values.actual_start) : null;
  const end=values.actual_end ? new Date(values.actual_end) : null;
  if (start && Number.isNaN(start.getTime()) || end && Number.isNaN(end.getTime()) || start && end && end<=start) {
    setModuleMessage("#race-record-message","Check the actual start and end times.",true); return;
  }
  const {data:auth}=await supabaseClient.auth.getUser();
  const payload={event_id:planned.rosters.event_id,rider_id:planned.rider_id,roster_stint_id:planned.id,actual_start:start?start.toISOString():null,actual_end:end?end.toISOString():null,laps_completed:values.laps_completed===""?null:Number(values.laps_completed),best_lap_seconds:values.best_lap_seconds===""?null:Number(values.best_lap_seconds),entry_notes:values.entry_notes.trim()||null,entered_by:auth.user?.id};
  const button=document.querySelector("#save-race-record"); button.disabled=true; button.textContent="Saving…";
  const {error}=await supabaseClient.from("race_stints").insert(payload);
  button.disabled=false; button.textContent="Save race record";
  if(error){setModuleMessage("#race-record-message","Race record could not be saved: "+error.message,true);return;}
  form.reset(); setModuleMessage("#race-record-message","Race record saved."); await loadRaceDay(); await loadPerformance(); await loadOverview();
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
  const {data:members,error:membersError}=await supabaseClient.from("member_profiles").select("user_id").eq("status","active");
  if(membersError||!members?.length){button.disabled=false;button.textContent="Send announcement";setModuleMessage("#announcement-message","Active team members could not be loaded. No announcement was sent.",true);return;}
  const payload=members.map(member=>({recipient_user_id:member.user_id,title:values.title.trim(),message:values.message.trim(),channel:"in_app",status:"sent",sent_at:new Date().toISOString()}));
  const {error}=await supabaseClient.from("notifications").insert(payload);
  button.disabled=false;button.textContent="Send announcement";
  if(error){setModuleMessage("#announcement-message","Announcement could not be saved: "+error.message,true);return;}
  form.reset();setModuleMessage("#announcement-message","Announcement delivered to "+members.length+" active member inbox(es).");await loadNotifications();await loadOverview();
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
  ["in_app","email","push"].forEach(channel=>{const field=document.querySelector("#notification-preferences-form").elements[channel];field.checked=preferences.has(channel)?preferences.get(channel):channel==="in_app";});
}
async function savePreferences(event) {
  event.preventDefault();const form=event.currentTarget;const button=document.querySelector("#save-preferences");button.disabled=true;button.textContent="Saving…";
  const rows=["in_app","email","push"].map(channel=>({user_id:currentUser.id,channel,enabled:form.elements[channel].checked,updated_at:new Date().toISOString()}));
  const {error}=await supabaseClient.from("notification_preferences").upsert(rows,{onConflict:"user_id,channel"});
  button.disabled=false;button.textContent="Save preferences";
  setModuleMessage("#preferences-message",error?"Preferences could not be saved: "+error.message:"Notification preferences saved.",!!error);
}
document.querySelector("#race-record-form").addEventListener("submit",saveRaceRecord);
document.querySelector("#refresh-race-day").addEventListener("click",loadRaceDay);
document.querySelector("#refresh-performance").addEventListener("click",loadPerformance);
document.querySelector("#refresh-notifications").addEventListener("click",loadNotifications);
document.querySelector("#announcement-form").addEventListener("submit",sendAnnouncement);
document.querySelector("#notification-preferences-form").addEventListener("submit",savePreferences);
