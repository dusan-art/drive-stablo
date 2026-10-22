# Drive stablo 🌳📁

**A fast, Explorer-style tree view for Google Drive**, running as your own private Google Apps Script web app.
Folders expand in place with arrows, files show next to them, and everyday file operations work without leaving the tree.

[![Support me on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/dusanart)

> 🇷🇸 Uputstvo na srpskom: [README.sr.md](README.sr.md)

## Features

- **Tree view** of *My Drive*, *Shared with me*, *Shared drives* and *Starred*. Folders open instantly because the next level is preloaded in the background.
- **Preview panel**: click a file to preview it (PDF, Office, images, Google Docs/Sheets/Slides), use ↑/↓ to browse, Esc to close. Double-click opens the file in a small editing window.
- **Full-Drive search** by name and content, using Google's index.
- **File operations**: new folder, new Google Doc, rename (F2), cut/copy/paste (Ctrl+X/C/V, including whole folders), delete to Trash with undo, drag & drop to move.
- **Upload** files or whole folders by button or by dragging them from your desktop. Files go straight from the browser to Drive with a progress indicator.
- **Folder colors** (synced with Google Drive), **custom folder icons** (any emoji), **stars**.
- **Two tabs side by side** (e.g. Chrome split view): drag between them, copy/paste between them, and both stay in sync.
- **Open in desktop app** (optional, Windows): with Google Drive for desktop installed, the 🖥️ button opens a `.docx`/`.xlsx`/`.pdf`… from the `G:` drive in Word, Excel and so on. Changes sync back automatically.

## How it works and what it can access

- The app runs **in your own Google account**, as an Apps Script web app deployed as *Execute as: Me* with *Access: Only myself*. No server, no third party, no data leaves Google.
- It uses the Drive API (advanced service) with your permission to list, move, copy, rename and trash files in your Drive.
- **Uploads** use a short-lived OAuth token of your account, which the page receives only after the server checks that the person opening the page is the script owner.
- **Delete** moves items to the Drive Trash. Nothing is permanently deleted.

## Installation (about 3 minutes)

### Option A: make a copy of the template (easiest)

1. Open the **[Drive stablo template](https://script.google.com/d/1p9MQE5Wfqr3r9fYu3wVVf_newyeX8kyHw5N4in6IDlQu43Es-_GchyLH/edit?usp=sharing)** while signed in to your Google account.
2. On the left, click **Overview** (ⓘ), then **Make a copy** (📄 icon, top right). You now have your own private copy; rename it to *Drive stablo* if you like.
3. **Deploy → New deployment →** ⚙️ **Web app**, with *Execute as*: **Me** and *Who has access*: **Only myself**.
4. Click **Deploy** → **Authorize access**. You will see *"Google hasn't verified this app"*. That is expected for a script you own: click **Advanced → Go to Drive stablo (unsafe) → Allow**.
5. Open the **Web app URL**. Optionally, in Chrome use ⋮ → *Cast, save and share* → **Install page as app** to get a taskbar icon.

Your copy runs only in your account. The template's owner cannot see your copy or your Drive.

### Option A2: copy and paste the code

1. Open [script.google.com](https://script.google.com) → **New project**, then rename it to *Drive stablo*.
2. Replace the content of `Code.gs` with [`src/Code.gs`](src/Code.gs).
3. Click **+** next to *Files* → **HTML**, name it **`Index`** (without `.html`), and paste [`src/Index.html`](src/Index.html).
4. Click **+** next to *Services* → **Drive API** → **Add**. Keep Identifier `Drive`, version `v3`.
5. Continue with steps 3–5 of Option A.

### Option B: with clasp (for developers)

```bash
npm install -g @google/clasp
clasp login
clasp create --type webapp --title "Drive stablo" --rootDir src
clasp push
clasp deploy
```

The manifest [`src/appsscript.json`](src/appsscript.json) already enables the Drive advanced service and sets the web app to *Execute as me / Only myself*.

### Updating to a new version

Replace the files (or run `clasp push`), then **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. The URL stays the same.

## Optional: "open in desktop app" helper (Windows)

> **Requirements:** Windows, **[Google Drive for desktop](https://www.google.com/drive/download/) installed and signed in with the same Google account**, and this helper. Without them everything else in Drive stablo works normally; only the 🖥️ button does nothing, and you can still open files in the browser with ↗.

1. Install [Google Drive for desktop](https://www.google.com/drive/download/) in its default *Stream files* mode.
2. Download [`windows-helper/DriveStablo-instalacija.cmd`](windows-helper/DriveStablo-instalacija.cmd), double-click it and press **Enter**. No admin rights are needed.
3. In the tree, hover over a file and click 🖥️. The first time, Chrome asks *"Open Drive stablo?"*: tick **Always allow**.

What the helper does:

- It compiles a tiny `otvori.exe` from C# source embedded in the `.cmd`, which you can read in any text editor, and saves it to `%LOCALAPPDATA%\DriveStablo`.
- It registers the `drivestablo:` link handler for your Windows user only (HKCU).
- It opens **only documents, images, media and archives** located on the Google Drive disk. It never opens programs or scripts.
- To uninstall, run the same `.cmd` and type **U**.

## Tips and known limitations

- **Preview asks for cookies**: allow third-party cookies for `script.google.com` (`chrome://settings/cookies` → *Allowed to use third-party cookies*).
- **Several Google accounts in one Chrome profile** can break Apps Script web apps. Use one Chrome profile per account, and give each account its own copy of the script.
- Drag & drop and copy/paste between tabs work only when both tabs use the **same Google account**.
- Folder icons are stored as a Drive file property (`dsIcon`). Drive itself does not show them.
- Search shows at most 300 results. Copying very large folders stops after about 4.5 minutes (an Apps Script limit) and reports how much was copied.
- Tested in Chrome and Edge. It should work in Firefox, which has no split view and stricter cookie defaults.

## Contributing

Issues and pull requests are welcome, including translations of the interface.

## Support

If Drive stablo saves you time, you can buy me a coffee ☕

[![Support me on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/dusanart)

## License

[MIT](LICENSE) © 2026 Dušan Bašić

*Not affiliated with or endorsed by Google. Google Drive is a trademark of Google LLC.*
