# Team Venom Rider Management System

Private team operations platform for rider records, roster allocation, race-day tracking, notifications and performance reporting.

## Current status

**Phase 1: Interface foundation**

The repository currently contains a static dashboard shell. It is not yet connected to Supabase and does not store real rider information. Dashboard figures are intentionally shown as unavailable rather than fabricated.

## Files

- `index.html` — application entry point
- `styles.css` — responsive Team Venom interface
- `app.js` — navigation interactions

## Planned architecture

- Frontend: static web application hosted through GitHub Pages
- Authentication and data: Supabase Auth and PostgreSQL
- Authorisation: server-enforced role policies using Supabase Row Level Security
- Data imports: validated roster import workflow with preview and error reporting
- Operations: rider directory, roster/stint allocation, race-day tracking, notifications and analytics

## Security principles

- Never commit Supabase service-role or secret keys.
- Browser clients may use only the Supabase publishable key.
- Protect all private data with Row Level Security policies.
- Do not rely on hidden buttons or frontend role checks for authorisation.
- Keep personal rider information out of public repositories and logs.

## Development

The interface is a foundation only. Authentication, database schema, role assignment and operational modules must be implemented and tested before real team data is entered.