"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Eye,
  EyeOff,
  LogOut,
  type LucideIcon,
  Moon,
  Search,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";

import { logout } from "@/app/actions";
import { SECTIONS } from "@/components/nav-links";
import { toggleAmounts, useAmountsHidden } from "@/components/privacy-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Command = {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  run: () => void;
};

const PAGES = SECTIONS.flatMap((section) =>
  (section.pages ?? [{ href: section.href, label: section.label }]).map((page) => ({
    ...page,
    icon: section.icon,
    hint: section.pages ? section.label : undefined,
  })),
);

export function CommandMenu({
  basePath = "",
  canSignOut = false,
}: {
  basePath?: string;
  canSignOut?: boolean;
}) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const hidden = useAmountsHidden();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const commands = useMemo(() => {
    const go = (href: string) => () =>
      router.push(`${basePath}${href === "/" ? "" : href}` || "/");
    const trimmed = query.trim();
    const pages: Command[] = PAGES.map((page) => ({
      id: page.href,
      label: page.label,
      hint: page.hint,
      icon: page.icon,
      run: go(page.href),
    }));
    const actions: Command[] = [
      {
        id: "amounts",
        label: hidden ? "Show amounts" : "Hide amounts",
        icon: hidden ? Eye : EyeOff,
        run: toggleAmounts,
      },
      {
        id: "theme",
        label: resolvedTheme === "dark" ? "Use light theme" : "Use dark theme",
        icon: resolvedTheme === "dark" ? Sun : Moon,
        run: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
      },
    ];
    if (canSignOut) {
      actions.push({
        id: "sign-out",
        label: "Sign out",
        icon: LogOut,
        run: () => void logout(),
      });
    }
    const needle = trimmed.toLocaleLowerCase();
    const matches = [...pages, ...actions].filter(
      (command) =>
        !needle ||
        command.label.toLocaleLowerCase().includes(needle) ||
        command.hint?.toLocaleLowerCase().includes(needle),
    );
    if (trimmed) {
      matches.push({
        id: "search",
        label: `Search transactions for “${trimmed}”`,
        icon: Search,
        run: go(`/transactions?q=${encodeURIComponent(trimmed)}`),
      });
    }
    return matches;
  }, [basePath, canSignOut, hidden, query, resolvedTheme, router, setTheme]);

  function close() {
    setOpen(false);
    setQuery("");
    setActive(0);
  }

  function runCommand(command: Command | undefined) {
    if (!command) return;
    close();
    command.run();
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      const next = (active + step + commands.length) % commands.length;
      setActive(next);
      list.current
        ?.querySelector(`[data-index="${next}"]`)
        ?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter") {
      event.preventDefault();
      runCommand(commands[active]);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => (value ? setOpen(true) : close())}
    >
      <Dialog.Trigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="hidden h-8 gap-2 px-2.5 text-muted-foreground sm:inline-flex"
        >
          <Search />
          Search
          <kbd className="rounded border bg-card px-1 text-xs font-medium">
            ⌘K
          </kbd>
        </Button>
      </Dialog.Trigger>
      <Dialog.Trigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="sm:hidden"
          aria-label="Search"
        >
          <Search />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/25 data-open:animate-in data-open:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-x-4 top-[12vh] z-50 mx-auto max-w-lg overflow-hidden rounded-xl border bg-popover shadow-2xl data-open:animate-in data-open:fade-in-0"
        >
          <Dialog.Title className="sr-only">Search and commands</Dialog.Title>
          <div className="flex items-center gap-2.5 border-b px-4">
            <Search className="size-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={onInputKeyDown}
              placeholder="Go to a page or search transactions"
              aria-label="Go to a page or search transactions"
              role="combobox"
              aria-expanded="true"
              aria-controls="command-list"
              aria-activedescendant={
                commands[active] ? `command-${commands[active].id}` : undefined
              }
              className="h-12 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div
            id="command-list"
            ref={list}
            role="listbox"
            aria-label="Results"
            className="max-h-80 overflow-y-auto p-1.5"
          >
            {commands.map((command, index) => (
              <button
                key={command.id}
                id={`command-${command.id}`}
                type="button"
                role="option"
                aria-selected={index === active}
                data-index={index}
                onMouseMove={() => setActive(index)}
                onClick={() => runCommand(command)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm",
                  index === active && "bg-accent text-accent-foreground",
                )}
              >
                <command.icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{command.label}</span>
                {command.hint && (
                  <span className="text-xs text-muted-foreground">
                    {command.hint}
                  </span>
                )}
              </button>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
