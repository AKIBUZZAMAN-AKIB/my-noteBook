/*
This file is part of the Notesnook project (https://notesnook.com/)

Copyright (C) 2023 Streetwriters (Private) Limited

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

/**
 * Single-tab mode (browsers without SharedWorker, e.g. most Android browsers)
 * opens the OPFS database file directly from this tab's worker. OPFS lets only
 * one worker hold the file, so a second tab used to crash with
 * "NoModificationAllowedError: ... Access Handles cannot be created ...".
 *
 * We serialize ownership with a Web Lock. The newest tab asks the current
 * owner to hand the database over; the owner finishes its current query,
 * closes the database, shows a notice and releases the lock. If the owner
 * does not answer (for example the tab is frozen in the background), we fail
 * with a clear error instead of a raw OPFS error.
 */

export const DATABASE_IN_USE_ERROR =
  "DatabaseInUseError: my-NoteBook is already open in another tab of this browser.";

const TAKEOVER_TIMEOUT_MS = 10000;
const NOTICE_ID = "notesnook-opened-elsewhere";

type ReleaseHandler = () => Promise<void>;

export async function acquireTabOwnership(
  dbName: string,
  onRelease: ReleaseHandler
): Promise<void> {
  if (!("locks" in navigator) || typeof BroadcastChannel === "undefined")
    return;

  const lockName = `notesnook-db-owner-${dbName}`;
  const channel = new BroadcastChannel(lockName);
  let releaseLock: (() => void) | undefined;

  const request = (options: LockOptions) =>
    new Promise<boolean>((resolve, reject) => {
      navigator.locks
        .request(lockName, options, (lock) => {
          if (!lock) {
            resolve(false);
            return;
          }
          resolve(true);
          // hold the lock until we hand the database over (or the tab dies)
          return new Promise<void>((done) => (releaseLock = done));
        })
        .catch(reject);
    });

  let acquired = await request({ mode: "exclusive", ifAvailable: true });
  if (!acquired) {
    channel.postMessage({ type: "takeover" });
    try {
      acquired = await request({
        mode: "exclusive",
        signal: AbortSignal.timeout(TAKEOVER_TIMEOUT_MS)
      });
    } catch (e) {
      channel.close();
      if (e instanceof DOMException && e.name === "TimeoutError")
        throw new Error(DATABASE_IN_USE_ERROR);
      throw e;
    }
  }

  channel.onmessage = async (event) => {
    if (event.data?.type !== "takeover" || !releaseLock) return;
    channel.onmessage = null;
    try {
      await onRelease();
    } catch (e) {
      console.error("Failed to hand the database over", e);
    } finally {
      showOpenedElsewhereNotice();
      releaseLock();
      releaseLock = undefined;
      channel.close();
    }
  };
}

function showOpenedElsewhereNotice() {
  if (typeof document === "undefined") return;
  // the app has more than one database (notes and logs), show one notice
  if (document.getElementById(NOTICE_ID)) return;
  const overlay = document.createElement("div");
  overlay.id = NOTICE_ID;
  overlay.setAttribute("role", "alertdialog");
  overlay.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483647",
    "display:flex",
    "flex-direction:column",
    "align-items:center",
    "justify-content:center",
    "gap:12px",
    "padding:24px",
    "text-align:center",
    "background:var(--background, #fff)",
    "color:var(--paragraph, #202124)",
    "font-family:inherit"
  ].join(";");
  const title = document.createElement("h2");
  title.textContent = "my-NoteBook is open in another tab";
  title.style.cssText = "margin:0;font-size:20px";
  const body = document.createElement("p");
  body.textContent =
    "Your notes can only be open in one tab at a time. Close this tab, or tap the button to use my-NoteBook here.";
  body.style.cssText = "margin:0;max-width:420px;font-size:14px;opacity:.8";
  const button = document.createElement("button");
  button.textContent = "Use here";
  button.style.cssText =
    "padding:10px 24px;border:0;border-radius:8px;font-size:15px;cursor:pointer;background:var(--accent, #008837);color:var(--accentForeground, #fff)";
  button.onclick = () => window.location.reload();
  overlay.append(title, body, button);
  document.body.appendChild(overlay);
}
