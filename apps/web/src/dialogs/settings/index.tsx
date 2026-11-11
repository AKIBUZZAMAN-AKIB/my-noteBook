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

import { Flex, Text, Button, Input, Switch } from "@theme-ui/components";
import Dialog from "../../components/dialog";
import {
  Account,
  Appearance,
  Backup,
  Behaviour,
  CellphoneLock,
  Desktop,
  Editor,
  Loading,
  ShieldLock,
  ArrowLeft,
  Close,
  FileDocument
} from "../../components/icons";
import useMobile from "../../hooks/use-mobile";
import NavigationItem from "../../components/navigation-menu/navigation-item";
import { FlexScrollContainer } from "../../components/scroll-container";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DropdownSettingComponent,
  Section,
  SectionGroup,
  SectionKeys,
  Setting,
  SettingsGroup
} from "./types";
import { ProfileSettings } from "./profile-settings";
import { useStore as useUserStore } from "../../stores/user-store";
import { BehaviourSettings } from "./behaviour-settings";
import { DesktopIntegrationSettings } from "./desktop-integration-settings";

import { BackupExportSettings } from "./backup-export-settings";
import { VaultSettings } from "./vault-settings";
import { EditorSettings } from "./editor-settings";
import { AppearanceSettings } from "./appearance-settings";
import { debounce, useIsFeatureAvailable, usePromise } from "@notesnook/common";
import { ScopedThemeProvider } from "../../components/theme-provider";
import { AppLockSettings } from "./app-lock-settings";
import { BaseDialogProps, DialogManager } from "../../common/dialog-manager";
import { strings } from "@notesnook/intl";
import { mdToHtml } from "../../utils/md";
import { withFeatureCheck } from "../../common";
import { hashNavigate } from "../../navigation";

type SettingsDialogProps = BaseDialogProps<false> & {
  activeSection?: SectionKeys;
};

// my-NoteBook is a local-only app: account, sync, subscription, server,
// notification, importer, privacy and "Other" (legal/help/about) sections
// have been removed. A single "Open source licenses" item is shown at the
// bottom of the section list instead (see LicensesLink / LicensesScreen).
const sectionGroups: SectionGroup[] = [
  {
    key: "account",
    title: strings.account(),
    sections: [{ key: "profile", title: strings.profile(), icon: Account }]
  },
  {
    key: "customization",
    title: strings.customization(),
    sections: [
      { key: "appearance", title: strings.appearance(), icon: Appearance },
      { key: "behaviour", title: strings.behaviour(), icon: Behaviour },
      { key: "editor", title: strings.editor(), icon: Editor },
      {
        key: "desktop",
        title: strings.desktopIntegration(),
        icon: Desktop,
        isHidden: () => !IS_DESKTOP_APP
      }
    ]
  },
  {
    key: "import-export",
    title: strings.importExport(),
    sections: [
      { key: "backup-export", title: strings.backupExport(), icon: Backup }
    ]
  },
  {
    key: "security",
    title: strings.privacyAndSecurity(),
    sections: [
      { key: "app-lock", title: strings.appLock(), icon: CellphoneLock },
      { key: "vault", title: strings.vault(), icon: ShieldLock }
    ]
  }
];

// Not part of the section list: opened from the small link at the bottom.
const LICENSES_TITLE = "Open source licenses";
const licensesSection: Section = {
  key: "legal",
  title: LICENSES_TITLE,
  icon: FileDocument
};

const LicensesSettings: SettingsGroup[] = [
  {
    key: "open-source-licenses",
    section: "legal",
    header: () => <LicensesScreen />,
    settings: []
  }
];

const SettingsGroups = [
  ...ProfileSettings,
  ...AppearanceSettings,
  ...BehaviourSettings,
  ...DesktopIntegrationSettings,
  ...BackupExportSettings,
  ...AppLockSettings,
  ...VaultSettings,
  ...EditorSettings,
  ...LicensesSettings
];

// Thoughts:
// 1. Settings will be conditional
//    - For example settings which have an enablement placeholder
//    - Or settings that appear after another setting is enabled.
//    - Or settings that are visible after a user signs in
// 2. Settings will be synced so their state must be serializable
// 3. Settings will be grouped
//    - Where group header is customizable
// 4. Sections/groups must be able to accommodate tips & tutorials for future.
// 5. Settings will be stateful but independent such that any one setting
// can appear independent of others (e.g. as a search result)

export const SettingsDialog = DialogManager.register(function SettingsDialog(
  props: SettingsDialogProps
) {
  // sections that were removed (e.g. old links to /settings/servers) fall back
  // to the default screen instead of showing an empty page.
  const activeSection =
    props.activeSection && findSection(props.activeSection)
      ? props.activeSection
      : undefined;
  const [activeSettings, setActiveSettings] = useState<SettingsGroup[]>(
    SettingsGroups.filter(
      (g) => g.section === (activeSection || "profile")
    )
  );
  const isMobile = useMobile();
  // On phones the menu and the settings are shown as two separate screens
  // (list -> detail), like a native settings app.
  const [mobileScreen, setMobileScreen] = useState<"menu" | "section">(
    activeSection ? "section" : "menu"
  );
  const [isSearching, setIsSearching] = useState(false);
  const [route, setRoute] = useState<SectionKeys>(
    activeSection || "profile"
  );

  const content = (
    <FlexScrollContainer
      id="settings-scrollbar"
      style={{
        display: "flex",
        backgroundColor: "var(--background)",
        flex: 1,
        flexDirection: "column",
        padding: isMobile ? 16 : 20,
        gap: 20,
        minHeight: "auto",
        minWidth: 0,
        overflow: "auto"
      }}
    >
      {activeSettings.length > 0 ? (
        activeSettings.map((group) => (
          <SettingsGroupComponent key={group.key} item={group} />
        ))
      ) : (
        <Text variant="body" sx={{ color: "paragraph-secondary" }}>
          {strings.noResultsFound()}
        </Text>
      )}
    </FlexScrollContainer>
  );

  const showMenu = !isMobile || mobileScreen === "menu";
  const showContent =
    !isMobile || mobileScreen === "section" || isSearching;

  return (
    <Dialog
      isOpen={true}
      width={"968px"}
      onClose={() => props.onClose(false)}
      noScroll
      sx={{ bg: isMobile ? "background" : "transparent" }}
    >
      {isMobile ? (
        <MobileSettingsHeader
          title={
            mobileScreen === "section"
              ? findSection(route)?.title || strings.settings()
              : strings.settings()
          }
          onBack={
            mobileScreen === "section"
              ? () => setMobileScreen("menu")
              : undefined
          }
          onClose={() => props.onClose(false)}
        />
      ) : null}
      <Flex
        sx={{
          height: isMobile ? "auto" : "80vw",
          flex: isMobile ? 1 : undefined,
          minHeight: 0,
          flexDirection: isMobile ? "column" : "row",
          overflow: "hidden"
        }}
      >
        {showMenu ? (
          <SettingsSideBar
            activeSection={route}
            isMobile={isMobile}
            isSearching={isSearching}
            onSearchStateChange={setIsSearching}
            onRouteChange={(section) => {
              setRoute(section);
              if (isMobile) setMobileScreen("section");
            }}
            onNavigate={(settings) => {
              const scrollbar = document.getElementById("settings-scrollbar");
              if (scrollbar !== null) scrollbar.scrollTop = 0;
              setActiveSettings(settings);
            }}
          />
        ) : null}
        {showContent ? content : null}
      </Flex>
    </Dialog>
  );
});

function MobileSettingsHeader(props: {
  title: string;
  onBack?: () => void;
  onClose: () => void;
}) {
  const { title, onBack, onClose } = props;
  return (
    <Flex
      data-test-id="settings-mobile-header"
      sx={{
        alignItems: "center",
        gap: 1,
        px: 1,
        minHeight: 52,
        flexShrink: 0,
        bg: "background",
        borderBottom: "1px solid var(--separator)"
      }}
    >
      {onBack ? (
        <Button
          variant="icon"
          data-test-id="settings-back"
          title={strings.back()}
          aria-label={strings.back()}
          onClick={onBack}
          sx={{ p: 2, borderRadius: "default" }}
        >
          <ArrowLeft size={20} />
        </Button>
      ) : (
        <span style={{ width: 8 }} />
      )}
      <Text
        variant="heading"
        sx={{
          flex: 1,
          minWidth: 0,
          fontSize: "subheading",
          color: "heading",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        }}
      >
        {title}
      </Text>
      <Button
        variant="icon"
        data-test-id="settings-close"
        title={strings.close()}
        aria-label={strings.close()}
        onClick={onClose}
        sx={{ p: 2, borderRadius: "default" }}
      >
        <Close size={20} />
      </Button>
    </Flex>
  );
}

type SettingsSideBarProps = {
  onNavigate: (settings: SettingsGroup[]) => void;
  onRouteChange?: (section: SectionKeys) => void;
  onSearchStateChange?: (isSearching: boolean) => void;
  activeSection?: SectionKeys;
  isMobile?: boolean;
  isSearching?: boolean;
};
function SettingsSideBar(props: SettingsSideBarProps) {
  const {
    onNavigate,
    activeSection,
    onRouteChange,
    onSearchStateChange,
    isMobile,
    isSearching
  } = props;
  const [route, setRoute] = useState<SectionKeys>(activeSection || "profile");
  useUserStore((store) => store.isLoggedIn);

  useEffect(() => {
    hashNavigate(`/settings/${route}`, {
      notify: false
    });
  }, [route, activeSection]);

  return (
    <FlexScrollContainer
      id="settings-side-menu"
      className="theme-scope-navigationMenu"
      style={{
        width: isMobile ? "100%" : 240,
        flex: isMobile && !isSearching ? 1 : undefined,
        flexShrink: 0,
        minHeight: isMobile && isSearching ? undefined : "auto",
        overflow: isMobile && isSearching ? "visible" : "auto",
        backgroundColor: "var(--background)"
      }}
      data-test-id="settings-navigation-menu"
    >
      <ScopedThemeProvider scope="navigationMenu" injectCssVars={false}>
        <Flex
          sx={{
            flexDirection: "column",
            display: "flex",
            overflow: "hidden",
            gap: 2
          }}
        >
          <Input
            id="search"
            name="search"
            autoFocus={!isMobile}
            placeholder={strings.search()}
            data-test-id="settings-search"
            sx={{
              m: 1,
              width: "auto",
              bg: "background",
              py: "7px"
            }}
            onChange={(e) => {
              const query = e.target.value.toLowerCase().trim();
              onSearchStateChange?.(!!query);
              if (!query)
                return onNavigate(
                  SettingsGroups.filter((g) => g.section === route)
                );

              let groups: SettingsGroup[] = [];
              for (const group of SettingsGroups) {
                const section = findSection(group.section);
                if (section?.isHidden?.() || group.isHidden?.()) continue;

                const isTitleMatch =
                  typeof group.header === "string" &&
                  group.header.toLowerCase().includes(query);
                const isSectionMatch = group.section
                  .toLowerCase()
                  .includes(query);

                if (isTitleMatch || isSectionMatch) {
                  groups.push(group);
                  continue;
                }

                const settings = group.settings.filter((setting) => {
                  const description =
                    typeof setting.description === "function"
                      ? setting.description()
                      : setting.description;

                  return [
                    description || "",
                    setting.keywords?.join(" ") || "",
                    setting.title
                  ]
                    .join(" ")
                    ?.toLowerCase()
                    .includes(query);
                });
                if (!settings.length) continue;
                groups.push({ ...group, settings });
              }
              const matchedSections = findSections(query);
              if (matchedSections.length > 0) {
                const matchedGroups = SettingsGroups.filter((g) =>
                  matchedSections.some((s) => s.key === g.section)
                );
                // remove groups whose sections were matched to avoid duplicate
                // entries.
                groups = groups.filter(
                  (g) => !matchedGroups.some((mg) => mg.section === g.section)
                );
                groups.push(...matchedGroups);
              }
              onNavigate(groups);
            }}
          />
          {isMobile && isSearching
            ? null
            : sectionGroups.map((group) => (
            <Flex
              key={group.key}
              sx={{ flexDirection: "column", mx: 1, gap: "small" }}
            >
              <Text
                variant={"subBody"}
                sx={{
                  fontWeight: "bold",
                  color: "heading",
                  mb: 1,
                  ml: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  wordSpacing: "nowrap"
                }}
              >
                {group.title}
              </Text>
              {group.sections.map(
                (section) =>
                  (!section.isHidden || !section.isHidden()) && (
                    <NavigationItem
                      key={section.key}
                      icon={section.icon}
                      title={section.title}
                      selected={section.key === route}
                      onClick={() => {
                        onNavigate(
                          SettingsGroups.filter(
                            (g) => g.section === section.key
                          )
                        );
                        setRoute(section.key);
                        onRouteChange?.(section.key);
                      }}
                    />
                  )
              )}
            </Flex>
          ))}
          {isMobile && isSearching ? null : (
            <LicensesLink
              selected={route === "legal"}
              onClick={() => {
                onNavigate(SettingsGroups.filter((g) => g.section === "legal"));
                setRoute("legal");
                onRouteChange?.("legal");
              }}
            />
          )}
        </Flex>
      </ScopedThemeProvider>
    </FlexScrollContainer>
  );
}

// GPL-3.0 section 5 asks interactive programs to show "Appropriate Legal
// Notices". my-NoteBook keeps exactly one small item for that at the very
// bottom of Settings; the notice itself lives on its own screen.
const SOURCE_CODE_URL = "https://github.com/AKIBUZZAMAN-AKIB/my-noteBook";
const LICENSE_TEXT_URL = "https://www.gnu.org/licenses/gpl-3.0.html";

function LicensesLink(props: { selected: boolean; onClick: () => void }) {
  return (
    <Button
      variant="secondary"
      data-test-id="open-source-licenses"
      onClick={props.onClick}
      sx={{
        alignSelf: "flex-start",
        bg: "transparent",
        mx: 2,
        mt: 2,
        mb: 3,
        px: 1,
        py: "2px",
        color: props.selected ? "accent" : "paragraph-secondary",
        fontSize: "0.75rem",
        fontWeight: "normal",
        textDecoration: "underline",
        ":hover": { bg: "transparent", color: "accent" }
      }}
    >
      {LICENSES_TITLE}
    </Button>
  );
}

function LicensesScreen() {
  const linkStyle = {
    color: "var(--accent)",
    textDecoration: "underline",
    fontSize: "inherit"
  };
  return (
    <Flex
      data-test-id="licenses-screen"
      sx={{ flexDirection: "column", gap: 3, maxWidth: 640 }}
    >
      <Text
        variant="subBody"
        sx={{
          fontSize: 11,
          fontWeight: "bold",
          letterSpacing: 0.3,
          color: "accent"
        }}
      >
        {LICENSES_TITLE.toUpperCase()}
      </Text>
      <Text variant="body" sx={{ fontWeight: "medium", color: "heading" }}>
        my-NoteBook
      </Text>
      <Text as="p" variant="body" sx={{ color: "paragraph" }}>
        Copyright (C) 2023 Streetwriters (Private) Limited
        <br />
        Modifications copyright (C) 2026 AKIBUZZAMAN AKIB
      </Text>
      <Text as="p" variant="body" sx={{ color: "paragraph" }}>
        This app is a modified version of software by Streetwriters (Private)
        Limited. It is free software: you can redistribute it and/or modify it
        under the terms of the GNU General Public License as published by the
        Free Software Foundation, either version 3 of the License, or (at your
        option) any later version.
      </Text>
      <Text as="p" variant="body" sx={{ color: "paragraph" }}>
        This program is distributed in the hope that it will be useful, but
        WITHOUT ANY WARRANTY; without even the implied warranty of
        MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
        General Public License for more details.
      </Text>
      <Flex
        sx={{ flexDirection: "column", gap: 2, fontFamily: "body", fontSize: "body" }}
      >
        <a
          href={SOURCE_CODE_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={linkStyle}
        >
          Source code
        </a>
        <a
          href={LICENSE_TEXT_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={linkStyle}
        >
          GNU General Public License v3
        </a>
      </Flex>
    </Flex>
  );
}

function SettingsGroupComponent(props: { item: SettingsGroup }) {
  const { item } = props;
  const { onRender, onStateChange } = item;

  const [_, setState] = useState<unknown>();

  useEffect(() => {
    onRender?.();
  }, [onRender]);

  useEffect(() => {
    const unsubscribe = onStateChange?.(setState);
    return () => {
      unsubscribe?.();
    };
  }, [onStateChange]);

  const allHidden = item.settings.every((s) => s.isHidden?.());
  const hasComponentHeader = typeof item.header !== "string";
  if (item.isHidden?.() || (allHidden && !hasComponentHeader)) return null;

  return (
    <Flex
      sx={{
        flexDirection: "column",
        flexShrink: 0,
        gap: 2,
        overflow: "hidden"
      }}
    >
      {typeof item.header === "string" ? (
        <Text
          variant="subBody"
          sx={{
            fontSize: 11,
            fontWeight: "bold",
            letterSpacing: 0.3,
            color: "accent"
          }}
        >
          {item.header.toUpperCase()}
        </Text>
      ) : (
        <item.header />
      )}
      {item.settings.map((setting) => (
        <SettingItem key={setting.key} item={setting} />
      ))}
    </Flex>
  );
}

function SettingItem(props: { item: Setting }) {
  const { item } = props;
  const [state, setState] = useState<unknown>();
  const [workIndex, setWorkIndex] = useState<number>();
  const feature = useIsFeatureAvailable(item.featureId);

  useEffect(() => {
    if (!item.onStateChange) return;
    const unsubscribe = item.onStateChange((state) => setState(state));
    return () => {
      unsubscribe?.();
    };
  }, [item]);

  const workWithLoading = useCallback(
    async (index: number, action: () => Promise<unknown> | void) => {
      if (workIndex) return;
      try {
        setWorkIndex(index);
        await action();
      } finally {
        setWorkIndex(undefined);
      }
    },
    [workIndex]
  );

  if (item.isHidden && item.isHidden(state)) return null;

  const components =
    typeof item.components === "function"
      ? item.components(state)
      : item.components;

  return (
    <Flex
      sx={{
        flexDirection: "column",
        pb: 4,
        borderBottom: "1px solid var(--separator)"
      }}
      data-test-id={`setting-${item.key}`}
    >
      <Flex
        sx={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "start",
          // on narrow screens the controls move below the title instead of
          // being pushed out of the visible area
          flexWrap: "wrap",
          columnGap: 4,
          rowGap: 2
        }}
      >
        <Flex sx={{ flexDirection: "column", flex: "1 1 180px", minWidth: 0 }}>
          <Flex sx={{ alignItems: "center", gap: 1 }}>
            <Text
              variant={"body"}
              sx={{ fontWeight: "medium", color: "heading" }}
            >
              {item.title}
            </Text>
          </Flex>
          {item.description && (
            <Text
              as={"div"}
              variant={"body"}
              sx={{ mt: 1, color: "paragraph", whiteSpace: "pre-wrap" }}
              dangerouslySetInnerHTML={{
                __html: mdToHtml(
                  typeof item.description === "function"
                    ? item.description(state)
                    : item.description
                )
              }}
            />
          )}
        </Flex>

        <Flex
          sx={{
            alignItems: "center",
            justifyContent: "end",
            flexWrap: "wrap",
            gap: 2,
            maxWidth: "100%",
            minWidth: 0,
            ml: "auto",
            "& > label": { width: "auto" },
            "& > *": { flexShrink: 0, maxWidth: "100%" }
          }}
        >
          {components.map((component, index) => {
            switch (component.type) {
              case "button":
                return (
                  <Button
                    disabled={workIndex === index}
                    title={component.title}
                    variant={component.variant}
                    onClick={withFeatureCheck(feature, () =>
                      workWithLoading(index, component.action)
                    )}
                  >
                    {workIndex === index ? (
                      <Loading size={18} sx={{ mr: 2 }} />
                    ) : (
                      component.title
                    )}
                  </Button>
                );
              case "toggle":
                return (
                  <Switch
                    sx={{
                      m: 0,
                      background: component.isToggled()
                        ? "accent"
                        : "icon-secondary"
                    }}
                    disabled={workIndex === index}
                    onChange={withFeatureCheck(feature, () =>
                      workWithLoading(index, component.toggle)
                    )}
                    checked={component.isToggled()}
                    data-checked={component.isToggled()}
                  />
                );
              case "dropdown":
                return (
                  <SelectComponent
                    {...component}
                    onSelectionChanged={withFeatureCheck(feature, (value) =>
                      component.onSelectionChanged(value)
                    )}
                  />
                );
              case "input":
                return component.inputType === "number" ? (
                  <NumberInput
                    key={component.defaultValue()}
                    min={component.min}
                    max={component.max}
                    step={component.step}
                    defaultValue={component.defaultValue()}
                    onChange={(value) => component.onChange(value)}
                  />
                ) : (
                  <Input
                    type={"text"}
                    defaultValue={component.defaultValue()}
                    sx={{ width: 250, maxWidth: "100%", mr: 1 }}
                    onChange={debounce(
                      (e) => component.onChange(e.target.value),
                      500
                    )}
                    onBlur={(e) => component.onChange(e.target.value)}
                  />
                );
              case "icon":
                return (
                  <component.icon
                    size={component.size}
                    color={component.color}
                  />
                );
              default:
                return null;
            }
          })}
        </Flex>
      </Flex>
      {components.map((component) =>
        component.type === "custom" ? (
          <component.component key={item.key} />
        ) : null
      )}
    </Flex>
  );
}

export function SelectComponent(props: Omit<DropdownSettingComponent, "type">) {
  const { onSelectionChanged, options } = props;
  const selectedOption = usePromise(() => props.selectedOption(), [props]);

  return (
    <select
      style={{
        backgroundColor: "var(--background-secondary)",
        outline: "none",
        border: "1px solid var(--border-secondary)",
        borderRadius: "5px",
        color: "var(--paragraph)",
        padding: "5px",
        overflow: "hidden",
        maxWidth: "100%",
        minWidth: 0,
        textOverflow: "ellipsis"
      }}
      value={
        selectedOption.status === "fulfilled" ? selectedOption.value : undefined
      }
      onChange={(e) =>
        onSelectionChanged((e.target as HTMLSelectElement).value)
      }
    >
      {options.map((option) => (
        <option
          key={option.value}
          value={option.value}
          disabled={option.disabled}
        >
          {option.title}
        </option>
      ))}
    </select>
  );
}

type NumberInputProps = {
  min: number;
  max: number;
  step?: number;
  defaultValue: number;
  onChange: (value: number) => void;
};

function NumberInput({
  min,
  max,
  step,
  defaultValue,
  onChange
}: NumberInputProps) {
  const [isInputValid, setIsInputValid] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Flex sx={{ flexDirection: "column", alignItems: "flex-end" }}>
      <Input
        ref={inputRef}
        type={"number"}
        min={min}
        max={max}
        step={step}
        defaultValue={defaultValue}
        sx={{
          width: 80,
          mr: 1,
          outline: isInputValid
            ? undefined
            : "2px solid var(--accent-error) !important"
        }}
        onChange={debounce((e) => {
          const value = e.target.valueAsNumber;
          const isValid = !Number.isNaN(value) && value >= min && value <= max;
          setIsInputValid(isValid);
          if (isValid) onChange(value);
        }, 500)}
        onBlur={(e) => {
          const raw = e.target.valueAsNumber;
          const clamped =
            Number.isNaN(raw) || raw < min ? min : raw > max ? max : raw;
          if (inputRef.current) inputRef.current.value = String(clamped);
          setIsInputValid(true);
          onChange(clamped);
        }}
      />
      {!isInputValid && (
        <Text
          variant="subBody"
          sx={{ fontSize: 11, color: "error", mt: 1, mr: 1 }}
        >
          {strings.valueMustBeBetween(min, max)}
        </Text>
      )}
    </Flex>
  );
}

function findSection(key: SectionKeys) {
  if (key === licensesSection.key) return licensesSection;
  for (const group of sectionGroups) {
    const section = group.sections.find((s) => s.key === key);
    if (section) return section;
  }
  return null;
}

function findSections(query: string) {
  const sections: Section[] = [];
  for (const group of sectionGroups) {
    for (const section of group.sections) {
      if (section.isHidden?.()) continue;
      if (section.title.toLowerCase().includes(query)) sections.push(section);
    }
  }
  return sections;
}
