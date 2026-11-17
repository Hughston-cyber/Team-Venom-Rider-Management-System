# Team Venom Offline for macOS

Apple Silicon build (M1/M2/M3/M4 family). This is a separate desktop app and does not modify the live web application.

## Requirements
- macOS on Apple Silicon
- Node.js and npm

## Run locally
From this folder:

```bash
npm install
npm start
```

## Build the Mac installer
```bash
npm run dist:mac
```

The Apple Silicon DMG will be created in `dist/`.

## Current offline edition scope
- Local Race Control dashboard
- 24-hour race clock with start, stop and restart
- Local rider order and changeovers
- Local activity log
- JSON backup import/export
- Data persists on this Mac between launches

## Important limitations
This first desktop edition is deliberately local-only. It does not sign in to Supabase, read the live roster, synchronise changes to other devices, or send push notifications. The live website remains unchanged. Keep exported backups somewhere safe. Online sync should be added only after server-side conflict handling and permissions have been implemented and tested.
