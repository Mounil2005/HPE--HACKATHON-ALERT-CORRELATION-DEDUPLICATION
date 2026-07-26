"use client";

import { Subtitle } from "@tremor/react";
import { LinkWithIcon } from "components/LinkWithIcon";
import { Disclosure } from "@headlessui/react";
import { IoChevronUp } from "react-icons/io5";
import { IconType } from "react-icons/lib";
import clsx from "clsx";
import { IoMdGitMerge } from "react-icons/io";
import { TbTopologyRing, TbTimeline, TbChartDots3 } from "react-icons/tb";
import { LuWorkflow, LuGauge, LuBrainCircuit } from "react-icons/lu";
import { VscDebugDisconnect } from "react-icons/vsc";
import {
  AiOutlineAlert,
  AiOutlineFire,
  AiOutlineGroup,
  AiOutlineHome,
} from "react-icons/ai";
import {
  MdOutlineNotificationsActive,
  MdOutlineRuleFolder,
  MdOutlineEventBusy,
} from "react-icons/md";
import { HiOutlineCog6Tooth, HiOutlineSparkles } from "react-icons/hi2";

type NavLink = {
  href: string;
  label: string;
  icon: IconType;
  testId: string;
  isExact?: boolean;
  isDemo?: boolean;
};

type NavSection = {
  title: string;
  links: NavLink[];
};

// Sections mirror KeepHQ's sidebar grouping. `isDemo` marks surfaces backed by
// sample data rather than the AlertLens API.
const SECTIONS: NavSection[] = [
  {
    title: "OVERVIEW",
    links: [
      {
        href: "/",
        label: "Home",
        icon: AiOutlineHome,
        testId: "home",
        isExact: true,
      },
    ],
  },
  {
    title: "ALERTS",
    links: [
      { href: "/feed", label: "Alert Feed", icon: AiOutlineAlert, testId: "feed" },
      { href: "/firing", label: "Firing", icon: AiOutlineFire, testId: "firing" },
      { href: "/5xx", label: "Critical 5xx", icon: AiOutlineGroup, testId: "critical" },
    ],
  },
  {
    title: "INCIDENTS",
    links: [
      {
        href: "/incidents",
        label: "Incidents",
        icon: MdOutlineNotificationsActive,
        testId: "incidents",
      },
      { href: "/forecast", label: "Forecast", icon: LuGauge, testId: "forecast" },
      {
        href: "/timemachine",
        label: "Time Machine",
        icon: TbTimeline,
        testId: "timemachine",
      },
    ],
  },
  {
    title: "NOISE REDUCTION",
    links: [
      {
        href: "/deduplication",
        label: "Deduplication",
        icon: IoMdGitMerge,
        testId: "deduplication",
      },
      {
        href: "/correlations",
        label: "Correlations",
        icon: TbChartDots3,
        testId: "correlations",
      },
      {
        href: "/topology",
        label: "Service Topology",
        icon: TbTopologyRing,
        testId: "topology",
      },
      {
        href: "/rules",
        label: "Rules",
        icon: MdOutlineRuleFolder,
        testId: "rules",
      },
    ],
  },
  {
    title: "INSIGHTS",
    links: [
      {
        href: "/evaluation",
        label: "Evaluation",
        icon: LuBrainCircuit,
        testId: "evaluation",
      },
      { href: "/pipeline", label: "Pipeline", icon: LuWorkflow, testId: "pipeline" },
      { href: "/ai", label: "AI", icon: HiOutlineSparkles, testId: "ai" },
    ],
  },
  {
    title: "PLATFORM",
    links: [
      {
        href: "/workflows",
        label: "Workflows",
        icon: LuWorkflow,
        testId: "workflows",
      },
      {
        href: "/providers",
        label: "Providers",
        icon: VscDebugDisconnect,
        testId: "providers",
      },
      {
        href: "/notifications-hub",
        label: "Notifications",
        icon: MdOutlineNotificationsActive,
        testId: "notifications-hub",
      },
      {
        href: "/maintenance",
        label: "Maintenance",
        icon: MdOutlineEventBusy,
        testId: "maintenance",
      },
      {
        href: "/settings",
        label: "Settings",
        icon: HiOutlineCog6Tooth,
        testId: "settings",
      },
    ],
  },
];

const NavGroup = ({ title, links }: NavSection) => (
  <Disclosure as="div" className="space-y-0.5" defaultOpen>
    <Disclosure.Button className="w-full flex justify-between items-center px-2">
      {({ open }) => (
        <>
          <Subtitle className="text-xs ml-2 text-gray-900 font-medium uppercase">
            {title}
          </Subtitle>
          <IoChevronUp
            className={clsx({ "rotate-180": open }, "mr-2 text-slate-400")}
          />
        </>
      )}
    </Disclosure.Button>
    <Disclosure.Panel as="ul" className="space-y-0.5 p-1 pr-1">
      {links.map((link) => (
        <li key={link.href}>
          <LinkWithIcon
            href={link.href}
            icon={link.icon}
            testId={link.testId}
            isExact={link.isExact}
            isBeta={link.isDemo}
          >
            <Subtitle className="text-xs">{link.label}</Subtitle>
          </LinkWithIcon>
        </li>
      ))}
    </Disclosure.Panel>
  </Disclosure>
);

export const AlertLensLinks = () => (
  <>
    {SECTIONS.map((section) => (
      <NavGroup key={section.title} {...section} />
    ))}
  </>
);
