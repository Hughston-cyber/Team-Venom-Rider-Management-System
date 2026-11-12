# Team Venom Rider Management System

Private Team Venom operations workspace built with HTML, CSS, JavaScript and Supabase.

## Release status

**Beta release for controlled testing.** The website is connected to Supabase Auth and PostgreSQL with role-based Row Level Security. Test all workflows with non-critical records before relying on it during a live event.

## Included modules

- Secure sign-in and active-member role verification
- Rider directory with search, status filters, profile pages and private administrator/manager notes
- Rider photo upload to the private `rider-photos` storage bucket
- Race event creation and manually built roster versions
- Individual stint allocation with duplicate-number and same-rider overlap checks
- Draft roster review, publishing and removal of individual stints
- Race-day entry for actual stint times, laps, best lap and notes
- Performance summary and rider lap leaderboard
- In-app notifications and manager announcements
- Account details and notification preference storage
- Responsive Team Venom black and green interface

## Architecture

- Frontend: static website in this private GitHub repository
- Authentication: Supabase Auth
- Database: Supabase PostgreSQL
- Authorisation: database Row Level Security policies
- Photo storage: private Supabase Storage bucket
- Browser key: Supabase publishable key only

## Important limitations

- Email and push notification delivery are not configured. The website currently stores preferences only and supports in-app announcements.
- Race-day and performance reports depend on actual race-stint records being entered.
- The app has not yet completed full cross-browser, permission-matrix or live-event testing.
- GitHub Pages hosting for a private repository depends on the GitHub plan. Local testing is available with a simple static server.
- Do not enter sensitive or operationally critical data until the team has completed its testing and access review.

## Local testing

From the project folder:

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

Open http://localhost:8000.

## Security

- Never commit Supabase service-role keys, database passwords or other secrets.
- Only the publishable key belongs in the browser.
- Row Level Security is the authority for data access; hiding controls in the interface is not security.
- Keep this repository private.
- Use test records until the system has been validated.
