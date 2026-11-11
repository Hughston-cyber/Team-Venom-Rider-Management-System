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
function selectView(view) {
  const copy = pageCopy[view] || pageCopy.overview;
  title.textContent = copy[0];
  const accent = document.createElement("span");
  accent.textContent = "";
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