"use client";

import { ElementRef, Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, List, ListItem, Subtitle } from "@tremor/react";
import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  Transition,
} from "@headlessui/react";
import { UserGroupIcon } from "@heroicons/react/24/outline";
import { VscDebugDisconnect } from "react-icons/vsc";
import { LuWorkflow, LuGauge, LuBrainCircuit } from "react-icons/lu";
import { AiOutlineAlert, AiOutlineGroup } from "react-icons/ai";
import {
  MdOutlineSearchOff,
  MdOutlineNotificationsActive,
} from "react-icons/md";
import { IoMdGitMerge } from "react-icons/io";
import { TbTopologyRing, TbTimeline, TbChartDots3 } from "react-icons/tb";
import { AlertLensMark } from "@/components/AlertLensMark";

const NAVIGATION_OPTIONS = [
  {
    icon: AiOutlineAlert,
    label: "Go to alert feed",
    shortcut: ["f"],
    navigate: "/feed",
  },
  {
    icon: MdOutlineNotificationsActive,
    label: "Go to incidents",
    shortcut: ["i"],
    navigate: "/incidents",
  },
  {
    icon: IoMdGitMerge,
    label: "Go to deduplication",
    shortcut: ["d"],
    navigate: "/deduplication",
  },
  {
    icon: TbChartDots3,
    label: "Go to correlations",
    shortcut: ["c"],
    navigate: "/correlations",
  },
  {
    icon: TbTopologyRing,
    label: "Go to service topology",
    shortcut: ["t"],
    navigate: "/topology",
  },
  {
    icon: LuGauge,
    label: "Go to forecast",
    shortcut: ["fc"],
    navigate: "/forecast",
  },
  {
    icon: TbTimeline,
    label: "Go to time machine",
    shortcut: ["tm"],
    navigate: "/timemachine",
  },
  {
    icon: LuBrainCircuit,
    label: "Go to evaluation",
    shortcut: ["e"],
    navigate: "/evaluation",
  },
  {
    icon: LuWorkflow,
    label: "Go to the pipeline page",
    shortcut: ["p"],
    navigate: "/pipeline",
  },
  {
    icon: AiOutlineGroup,
    label: "Go to dashboards",
    shortcut: ["db"],
    navigate: "/dashboard",
  },
  {
    icon: VscDebugDisconnect,
    label: "Go to the providers page",
    shortcut: ["pr"],
    navigate: "/providers",
  },
  {
    icon: UserGroupIcon,
    label: "Go to settings",
    shortcut: ["s"],
    navigate: "/settings",
  },
];

export const Search = () => {
  const [query, setQuery] = useState<string>("");
  const [, setSelectedOption] = useState<string | null>(null);
  const router = useRouter();
  const comboboxInputRef = useRef<ElementRef<"input">>(null);
  const OPTIONS = NAVIGATION_OPTIONS;

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (comboboxInputRef.current) {
          comboboxInputRef.current.focus();
        }
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const onOptionSelection = (value: string | null) => {
    setSelectedOption(value);
    if (value && comboboxInputRef.current) {
      comboboxInputRef.current.blur();
      router.push(value);
    }
  };

  const onLeave = () => {
    setQuery("");

    if (comboboxInputRef.current) {
      comboboxInputRef.current.blur();
    }
  };

  const queriedOptions = query.length
    ? OPTIONS.filter((option) =>
        option.label
          .toLowerCase()
          .replace(/\s+/g, "")
          .includes(query.toLowerCase().replace(/\s+/g, ""))
      )
    : OPTIONS;

  const NoQueriesFoundResult = () => {
    if (query.length && queriedOptions.length === 0) {
      return (
        <ListItem className="flex flex-col items-center justify-center cursor-default select-none px-4 py-2 text-gray-700 h-72">
          <Icon color="orange" size="xl" icon={MdOutlineSearchOff} />
          Nothing found.
        </ListItem>
      );
    }

    return null;
  };

  const FilteredResults = () => {
    if (query.length && queriedOptions.length) {
      return (
        <>
          {queriedOptions.map((option) => (
            <ComboboxOption
              key={option.label}
              as={Fragment}
              value={option.navigate}
            >
              {({ active }) => (
                <ListItem className="flex items-center justify-start space-x-3 cursor-default select-none p-2 ui-active:bg-orange-400 ui-active:text-white ui-not-active:text-gray-900">
                  <Icon
                    className={`py-2 px-0 ${
                      active ? "bg-orange-400 text-white" : "text-gray-900"
                    }`}
                    icon={option.icon}
                    color="orange"
                  />
                  <span className="text-left">{option.label}</span>
                </ListItem>
              )}
            </ComboboxOption>
          ))}
        </>
      );
    }

    return null;
  };

  const DefaultResults = () => {
    if (query.length) {
      return null;
    }

    return (
      <ListItem className="flex flex-col">
        <List>
          <ListItem className="pl-2">
            <Subtitle>Navigate</Subtitle>
          </ListItem>
          {NAVIGATION_OPTIONS.map((option) => (
            <ComboboxOption
              key={option.label}
              as={Fragment}
              value={option.navigate}
            >
              {({ active }) => (
                <ListItem className="flex items-center justify-start space-x-3 cursor-default select-none p-2 ui-active:bg-orange-400 ui-active:text-white ui-not-active:text-gray-900">
                  <Icon
                    className={`py-2 px-0 ${
                      active ? "bg-orange-400 text-white" : "text-gray-900"
                    }`}
                    icon={option.icon}
                    color="orange"
                  />
                  <span className="text-left">{option.label}</span>
                </ListItem>
              )}
            </ComboboxOption>
          ))}
        </List>
      </ListItem>
    );
  };

  const isMac = () => {
    const platform = navigator.platform.toLowerCase();
    const userAgent = navigator.userAgent.toLowerCase();
    return (
      platform.includes("mac") ||
      (platform.includes("iphone") && !userAgent.includes("windows"))
    );
  };

  const [placeholderText, setPlaceholderText] = useState("Search");

  // Using effect to avoid mismatch on hydration. TODO: context provider for user agent
  useEffect(function updatePlaceholderText() {
    if (!isMac()) {
      return;
    }
    setPlaceholderText("Search (or ⌘K)");
  }, []);

  return (
    <div className="flex items-center w-full py-3 px-2 border-b border-gray-300">
      <div className="flex-shrink-0 flex items-center">
        <Link href="/" className="flex items-center">
          <AlertLensMark className="w-8 h-8" />
        </Link>
      </div>

      <div className="flex-grow ml-4">
        <Combobox
          value={query}
          onChange={onOptionSelection}
          as="div"
          className="relative w-full"
          immediate
        >
          {({ open }) => (
            <>
              {open && (
                <div
                  className="fixed inset-0 bg-black/40 z-10"
                  aria-hidden="true"
                />
              )}

              <ComboboxInput
                className="z-20 tremor-TextInput-root relative flex items-center w-full outline-none rounded-tremor-default transition duration-100 border shadow-tremor-input dark:shadow-dark-tremor-input bg-tremor-background dark:bg-dark-tremor-background hover:bg-tremor-background-muted dark:hover:bg-dark-tremor-background-muted text-tremor-content dark:text-dark-tremor-content border-tremor-border dark:border-dark-tremor-border tremor-TextInput-input bg-transparent focus:outline-none focus:ring-0 text-tremor-default py-2 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none pr-3 pl-3 placeholder:text-tremor-content dark:placeholder:text-dark-tremor-content"
                placeholder={placeholderText}
                color="orange"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                ref={comboboxInputRef}
              />

              <Transition
                as={Fragment}
                beforeLeave={onLeave}
                leave="transition ease-in duration-100"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
              >
                <ComboboxOptions
                  className="absolute mt-1 max-h-screen overflow-auto rounded-md bg-white shadow-lg ring-1 ring-black/5 focus:outline-none z-20 w-96"
                  as={List}
                >
                  <NoQueriesFoundResult />
                  <FilteredResults />
                  <DefaultResults />
                </ComboboxOptions>
              </Transition>
            </>
          )}
        </Combobox>
      </div>
    </div>
  );
};
