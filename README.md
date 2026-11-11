<p align="center">
<img src="./apps/web/public/android-chrome-512x512.png" alt="my-NoteBook logo" width="100" />
</p>

<h1 align="center">my-NoteBook</h1>
<h3 align="center">A private, encrypted, local-only note taking app for the web.</h3>

## Overview

my-NoteBook keeps your notes only on your own device. There is no account, no login, no sync server and no paid plan: the app opens straight to your notes.

- Notes are stored in an encrypted SQLite database inside the browser (OPFS, with IndexedDB as fallback).
- Attachments and images are encrypted with a per-device key and stored in IndexedDB.
- Notebooks, tags, colors, reminders, the rich text editor, themes, app lock, vault, and backup/restore (including attachments) all work offline.
- The interface is tuned for phones: full-screen Settings, attachment manager, and menus that always stay on screen.

Because everything stays in the browser, each device (and each web address the app is served from) has its own data. Use **Settings → Backup & export** to move notes between devices.

## Run it locally

Requirements: Node.js 20+ and npm.

```sh
npm install
npm run bootstrap -- --scope=web
npm run start:web
```

Production build (output in `apps/web/build`):

```sh
npm run build:web
```

The build is a static site and can be served by any static file server.

## Repository layout

| Path                                   | Description                         |
| -------------------------------------- | ----------------------------------- |
| [/apps/web](/apps/web)                 | Web app                             |
| [/packages/core](/packages/core)       | Database, storage and backup logic  |
| [/packages/editor](/packages/editor)   | Rich text editor                    |
| [/packages/theme](/packages/theme)     | Themes                              |
| [/packages/intl](/packages/intl)       | UI strings and translations         |
| [/packages/crypto](/packages/crypto)   | Encryption                          |

## License

my-NoteBook is a modified version of [Notesnook](https://github.com/streetwriters/notesnook) by Streetwriters (Private) Limited and is licensed under the [GNU GPL v3](./LICENSE).
