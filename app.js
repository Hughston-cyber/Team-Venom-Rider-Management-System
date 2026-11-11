const SUPABASE_URL = "https://xqfbmioydhuycvvkafwq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_xPxK2aWz7gIkafxhiMIVGQ_mG77O6dD";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const authScreen = document.querySelector("#auth-screen");
const appShell = document.querySelector("#app-shell");
const loginForm = document.querySelector("#login-form");
const loginMessage = document.querySelector("#auth-message");
const loginButton = document.querySelector("#login-submit");

const pageCopy = {
  overview: ["Operations overview.", "Your central workspace for riders, rosters and race-day operations."],
  riders: ["Rider directory.", "Manage rider profiles, contact records and eligibility."],
  rosters: ["Roster management.", "Upload, validate and manage race rosters and stint allocations."],
  "race-day": ["Race-day control.", "Coordinate live operations, rider changes and stint completion."],
  performance: ["Performance centre.", "Review rider participation and team performance statistics."],
  notifications: ["Notifications.", "Manage operational alerts and important team updates."],
  settings: ["System settings.", "Configure the platform, access controls and team preferences."]
};

const title = document.querySelector("#page-title");
const description = document.querySelector("#page-description");
const breadcrumb = document.querySelector("#breadcrumb-current");

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
  document.querySelector("#sidebar").classList.remove("open");
}

document.querySelectorAll("[data-view]").forEach(button => {
  button.addEventListener("click", () => selectView(button.dataset.view));
});
document.querySelector("#menu-toggle").addEventListener("click", () => {
  document.querySelector("#sidebar").classList.toggle("open");
});
document.querySelector("#signout-button").addEventListener("click", async () => {
  const { error } = await supabase.auth.signOut();
  if (error) showMessage("Sign out failed. Please try again.");
});

async function showAuthenticatedWorkspace(session) {
  if (!session?.user) {
    appShell.hidden = true;
    authScreen.hidden = false;
    return;
  }

  const userId = session.user.id;
  const [profileResult, roleResult] = await Promise.all([
    supabase.from("member_profiles").select("display_name,status").eq("user_id", userId).maybeSingle(),
    supabase.from("member_roles").select("role").eq("user_id", userId)
  ]);

  if (profileResult.error || roleResult.error) {
    appShell.hidden = true;
    authScreen.hidden = false;
    showMessage("We couldn't verify your team access. Please contact an administrator.");
    return;
  }

  const profile = profileResult.data;
  const roles = (roleResult.data || []).map(item => item.role);
  if (!profile || profile.status !== "active" || roles.length === 0) {
    await supabase.auth.signOut();
    appShell.hidden = true;
    authScreen.hidden = false;
    showMessage("Your account is not yet authorised. Please contact a Team Venom administrator.");
    return;
  }

  document.querySelector("#account-name").textContent = profile.display_name || "Team member";
  document.querySelector("#account-role").textContent = roles[0].toUpperCase();
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
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    showMessage("Sign-in failed. Check your email and password, then try again.");
  } else {
    await showAuthenticatedWorkspace(data.session);
  }
  loginButton.disabled = false;
  loginButton.innerHTML = 'Sign in <span>→</span>';
});

supabase.auth.onAuthStateChange((_event, session) => {
  // Defer database lookups so the auth callback does not block token refresh.
  setTimeout(() => showAuthenticatedWorkspace(session), 0);
});

supabase.auth.getSession().then(({ data, error }) => {
  if (error) {
    showMessage("Unable to check your session. Please refresh and try again.");
    return;
  }
  showAuthenticatedWorkspace(data.session);
});
