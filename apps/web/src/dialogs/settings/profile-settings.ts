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

import { strings } from "@notesnook/intl";
import { db } from "../../common/db";
import { AttachmentsDialog } from "../attachments-dialog";
import { ConfirmDialog } from "../confirm";
import { UserProfile } from "./components/user-profile";
import { SettingsGroup } from "./types";
import Config from "../../utils/config";

// my-NoteBook is local-only: there is no account, so the profile section only
// manages data stored on this device.
const DELETE_ALL_DATA_TITLE = "Delete all data";
const DELETE_ALL_DATA_DESC =
  "Permanently delete all notes, notebooks, tags, reminders, attachments and settings saved on this device. This cannot be undone, so create a backup first if you want to keep anything.";

export const ProfileSettings: SettingsGroup[] = [
  {
    key: "user-profile",
    section: "profile",
    header: UserProfile,
    settings: [
      {
        key: "manage-attachments",
        title: strings.attachments(),
        description: strings.manageAttachments(),
        keywords: ["files", "images", "attachments", "storage"],
        components: [
          {
            type: "button",
            title: strings.open(),
            variant: "secondary",
            action: () => AttachmentsDialog.show({})
          }
        ]
      },
      {
        key: "delete-data-for-not-logged-in-user",
        title: DELETE_ALL_DATA_TITLE,
        description: DELETE_ALL_DATA_DESC,
        keywords: [
          DELETE_ALL_DATA_TITLE,
          strings.deleteData(),
          strings.clear(),
          "reset"
        ],
        components: [
          {
            type: "button",
            variant: "error",
            title: DELETE_ALL_DATA_TITLE,
            action: async () => {
              const ok = await ConfirmDialog.show({
                title: `${DELETE_ALL_DATA_TITLE}?`,
                message: DELETE_ALL_DATA_DESC,
                positiveButtonText: DELETE_ALL_DATA_TITLE,
                negativeButtonText: strings.cancel()
              });
              if (ok) {
                Config.clear();
                await db.reset();
                window.location.reload();
              }
            }
          }
        ]
      }
    ]
  }
];
