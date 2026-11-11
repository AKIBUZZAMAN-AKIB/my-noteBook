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

import React, {
  useCallback,
  useRef,
  useEffect,
  useState,
  PropsWithChildren
} from "react";
import { Box, FlexProps, Text } from "@theme-ui/components";
import { LazyMenuItemsLoader, MenuButtonItem, MenuItem } from "./types.js";
import { useFocus } from "./use-focus.js";
import { MenuSeparator } from "./menu-separator.js";
import { MenuButton } from "./menu-button.js";
import {
  PopupPresenter,
  PopupPresenterProps
} from "../popup-presenter/index.js";
import { ScrollContainer } from "../scroll-container/index.js";

type MenuProps = MenuContainerProps & {
  items?: MenuItem[];
  onClose: () => void;
};

export function Menu(props: MenuProps) {
  const { items = [], onClose, ...containerProps } = props;
  const hoverTimeout = useRef<number>();
  const onAction = useCallback(
    (e?: Event, item?: MenuButtonItem) => {
      e?.stopPropagation();

      if (item?.onClick) {
        item.onClick();
      }
      if (onClose) onClose();
    },
    [onClose]
  );

  const { focusIndex, setFocusIndex, isSubmenuOpen, setIsSubmenuOpen } =
    useFocus(
      items,
      (e) => {
        const item = items[focusIndex];
        if (item && item.type === "button") onAction(e, item);
      },
      () => onClose()
    );
  const focusedItem = items[focusIndex];

  const subMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const item = items[focusIndex];
    if (!item || !subMenuRef.current) return;

    const menuItemElement = document.getElementById(`menu-item-${item.key}`);
    if (!menuItemElement) return;

    if (!isSubmenuOpen) {
      subMenuRef.current.style.visibility = "hidden";
      return;
    }

    function repositionSubmenu() {
      if (!subMenuRef.current || !menuItemElement) return;

      const { top, left } = getSubmenuPosition(
        subMenuRef.current,
        menuItemElement
      );
      subMenuRef.current.style.top = `${top}px`;
      subMenuRef.current.style.left = `${left}px`;
    }

    repositionSubmenu();
    subMenuRef.current.style.visibility = "visible";

    const observer = new ResizeObserver(() => repositionSubmenu());
    observer.observe(subMenuRef.current);
    return () => observer.disconnect();
  }, [isSubmenuOpen, focusIndex, items]);

  return (
    <>
      <MenuContainer {...containerProps}>
        {items.map(function mapper(item, index) {
          if (item.isHidden) return null;

          switch (item.type) {
            case "lazy-loader":
              return (
                <LazyLoader
                  key={item.key}
                  item={item}
                  mapper={(item, itemIndex) => mapper(item, itemIndex + index)}
                />
              );
            case "separator":
              return <MenuSeparator key={item.key} />;
            case "button":
              return (
                <MenuButton
                  key={item.key}
                  item={item}
                  onClick={(e) => {
                    if (item.menu) {
                      setFocusIndex(index);
                      setIsSubmenuOpen(true);
                    } else onAction(e, item);
                  }}
                  isFocused={focusIndex === index}
                  onMouseEnter={() => {
                    if (item.isDisabled) {
                      setFocusIndex(-1);
                      return;
                    }
                    if (!isSubmenuOpen) setFocusIndex(index);

                    clearTimeout(hoverTimeout.current);
                    hoverTimeout.current = setTimeout(() => {
                      if (isSubmenuOpen) {
                        setFocusIndex(index);
                      } else {
                        setIsSubmenuOpen(true);
                      }

                      if (!item.menu) {
                        setIsSubmenuOpen(false);
                      }
                    }, 200) as unknown as number;
                  }}
                  onMouseLeave={() => {
                    clearTimeout(hoverTimeout.current);
                  }}
                />
              );
            case "popup":
              return (
                <item.component key={item.key} onClick={(e) => onAction(e)} />
              );
          }
        })}
      </MenuContainer>
      {focusedItem?.type === "button" && focusedItem?.menu && isSubmenuOpen && (
        <Menu
          menuRef={subMenuRef}
          sx={{
            position: "absolute",
            width: "max-content",
            visibility: "hidden"
          }}
          items={focusedItem.menu.items}
          onClose={onClose}
        />
      )}
    </>
  );
}

const VIEWPORT_MARGIN = 8;
/**
 * Places a submenu next to its parent item while keeping it fully inside
 * the viewport:
 * 1. to the right of the item when it fits (default, desktop behaviour)
 * 2. otherwise to the left of the parent menu
 * 3. otherwise (narrow phone screens) stacked just below the item,
 *    slightly indented and clamped inside the screen.
 * The returned position is relative to the submenu's offset parent.
 */
function getSubmenuPosition(submenu: HTMLElement, item: HTMLElement) {
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  const viewportHeight =
    document.documentElement.clientHeight || window.innerHeight;
  const itemRect = item.getBoundingClientRect();
  const parentMenu = item.closest(".menuContainer");
  const menuRect = parentMenu ? parentMenu.getBoundingClientRect() : itemRect;
  const offsetParent = (submenu.offsetParent as HTMLElement) || document.body;
  const parentRect = offsetParent.getBoundingClientRect();

  const maxHeight = viewportHeight - VIEWPORT_MARGIN * 2;
  if (submenu.scrollHeight > maxHeight)
    submenu.style.maxHeight = `${maxHeight}px`;
  const width = submenu.offsetWidth;
  const height = Math.min(submenu.offsetHeight, maxHeight);

  let left: number;
  let top = itemRect.top;
  if (menuRect.right + width <= viewportWidth - VIEWPORT_MARGIN) {
    left = menuRect.right;
  } else if (menuRect.left - width >= VIEWPORT_MARGIN) {
    left = menuRect.left - width;
  } else {
    left = itemRect.left + 16;
    top = itemRect.bottom;
  }

  left = Math.min(left, viewportWidth - VIEWPORT_MARGIN - width);
  left = Math.max(left, VIEWPORT_MARGIN);
  if (top + height > viewportHeight - VIEWPORT_MARGIN)
    top = viewportHeight - VIEWPORT_MARGIN - height;
  top = Math.max(top, VIEWPORT_MARGIN);

  return {
    left:
      left - parentRect.left - offsetParent.clientLeft + offsetParent.scrollLeft,
    top: top - parentRect.top - offsetParent.clientTop + offsetParent.scrollTop
  };
}

type MenuContainerProps = FlexProps & {
  title?: string;
  menuRef?: React.Ref<HTMLDivElement>;
};
function MenuContainer(props: PropsWithChildren<MenuContainerProps>) {
  const { children, title, sx, menuRef, ...flexProps } = props;

  return (
    <Box
      ref={menuRef}
      className="menuContainer"
      data-test-id="menu-container"
      as="ul"
      tabIndex={-1}
      sx={{
        bg: "background",
        py: 1,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        listStyle: "none",
        padding: 0,
        margin: 0,
        borderRadius: "default",
        boxShadow: "menu",
        border: "1px solid var(--border)",
        minWidth: 220,
        maxWidth: "min(95vw, 350px)",
        maxHeight: "80vh",
        ...sx
      }}
      {...flexProps}
    >
      {title && (
        <Text
          data-test-id="menu-title"
          sx={{
            fontFamily: "body",
            fontSize: "subtitle",
            color: "accent",
            py: "8px",
            px: 3,
            borderBottom: "1px solid",
            borderBottomColor: "border",
            wordWrap: "break-word"
          }}
        >
          {title}
        </Text>
      )}
      <ScrollContainer suppressScrollX>{children}</ScrollContainer>
      {/* <FlexScrollContainer>{children}</FlexScrollContainer> */}
    </Box>
  );
}

export type MenuPresenterProps = Omit<
  PopupPresenterProps,
  "movable" | "scope"
> &
  MenuProps & { container?: HTMLElement };
export function MenuPresenter(props: PropsWithChildren<MenuPresenterProps>) {
  const {
    items = [],
    position,
    isOpen,
    onClose,
    blocking,
    focusOnRender,
    isMobile,
    container,
    ...restProps
  } = props;

  useEffect(() => {
    if (!isOpen) return;
    console.log(isOpen);
    function onContextMenu(e: MouseEvent) {
      console.log("CONTEXT", e);
      if (
        e.target instanceof HTMLElement &&
        !!e.target.closest(".ReactModal__Overlay")
      )
        onClose();
    }
    window.addEventListener("contextmenu", onContextMenu);
    return () => {
      window.removeEventListener("contextmenu", onContextMenu);
    };
  }, [isOpen, onClose]);

  return (
    <PopupPresenter
      scope="contextMenu"
      position={position}
      isOpen={isOpen}
      onClose={onClose}
      blocking={blocking}
      container={container}
      focusOnRender={focusOnRender}
      isMobile={isMobile}
    >
      {props.children ? (
        props.children
      ) : (
        <Menu items={items} onClose={onClose} {...restProps} />
      )}
    </PopupPresenter>
  );
}

function LazyLoader(props: {
  item: LazyMenuItemsLoader;
  mapper: (item: MenuItem, index: number) => JSX.Element | null;
}) {
  const { item, mapper } = props;
  const [isLoading, setIsLoading] = useState(true);
  const [items, setItems] = useState<MenuItem[]>([]);

  useEffect(() => {
    (async function () {
      setItems(await item.items());
      setIsLoading(false);
    })();
  }, [item]);

  return isLoading ? (
    item.loader ? (
      <>{item.loader}</>
    ) : (
      <></>
    )
  ) : (
    <>{items.map(mapper)}</>
  );
}

export * from "./types.js";
export * from "./menu-button.js";
export * from "./menu-separator.js";
