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

import { pluralize } from "@notesnook/common";
import { tryParse } from "./parse";

const DRAG_MIME_TYPE = "application/vnd.notesnook.items";
const DROP_TARGET_ACTIVE = "data-drop-active";
let isDraggingItems = false;
let activeDropTarget: Element | null = null;
let dropHighlighterInstalled = false;

function setActiveDropTarget(target: Element | null) {
  if (target === activeDropTarget) return;
  activeDropTarget?.removeAttribute(DROP_TARGET_ACTIVE);
  activeDropTarget = target;
  activeDropTarget?.setAttribute(DROP_TARGET_ACTIVE, "true");
}

function endItemsDrag() {
  isDraggingItems = false;
  document.body.classList.remove("nn-dragging-items");
  setActiveDropTarget(null);
}

/**
 * Highlights the element under the pointer that accepts dropped items
 * (marked with `data-drop-target`) using the app's accent colour, instead of
 * leaving the browser's plain drag feedback as the only cue.
 */
function installDropHighlighter() {
  if (dropHighlighterInstalled) return;
  dropHighlighterInstalled = true;
  document.addEventListener(
    "dragover",
    (e) => {
      if (!isDraggingItems) return;
      const target =
        e.target instanceof Element
          ? e.target.closest("[data-drop-target]")
          : null;
      setActiveDropTarget(target);
    },
    true
  );
  document.addEventListener(
    "dragleave",
    (e) => {
      if (!isDraggingItems) return;
      // left the window
      if (!e.relatedTarget) setActiveDropTarget(null);
    },
    true
  );
  document.addEventListener("drop", endItemsDrag, true);
  document.addEventListener("dragend", endItemsDrag, true);
}

export function setDragData(
  dataTransfer: DataTransfer,
  type: string,
  ids: string[],
  title?: string
) {
  installDropHighlighter();

  // An app-styled drag preview: a small card with the item's title and a
  // count badge, using the theme's colours (works in light & dark themes).
  const dragImage = document.createElement("div");
  dragImage.classList.add("theme-scope-base", "nn-drag-preview");

  const accentBar = document.createElement("span");
  accentBar.className = "nn-drag-preview-bar";
  dragImage.appendChild(accentBar);

  const label = document.createElement("span");
  label.className = "nn-drag-preview-title";
  label.textContent =
    title && ids.length === 1
      ? title
      : pluralize(
          ids.length,
          (["note", "notebook", "tag", "reminder"].includes(type)
            ? type
            : "item") as Parameters<typeof pluralize>[1]
        );
  dragImage.appendChild(label);

  if (ids.length > 1) {
    const badge = document.createElement("span");
    badge.className = "nn-drag-preview-badge";
    badge.textContent = String(ids.length);
    dragImage.appendChild(badge);
  }

  document.body.appendChild(dragImage);
  dataTransfer.effectAllowed = "copyMove";
  dataTransfer.setDragImage(dragImage, 12, 18);

  dataTransfer.setData(DRAG_MIME_TYPE, JSON.stringify({ type: type, ids }));

  isDraggingItems = true;
  document.body.classList.add("nn-dragging-items");

  setTimeout(() => {
    dragImage.remove();
  });
}

export function getDragData(
  dataTransfer: DataTransfer,
  type: string
): string[] {
  try {
    const data = tryParse(dataTransfer.getData(DRAG_MIME_TYPE));
    if (!data || data.type !== type || !data.ids) return [];
    return data.ids;
  } catch (e) {
    console.error(e);
    return [];
  }
}
