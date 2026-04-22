import {
  AlertTriangle,
  BookOpen,
  Database,
  FileBarChart,
  FileSearch,
  LayoutDashboard,
  Library,
  MessageSquare,
  Scale,
  ShieldCheck,
  TestTube,
  type LucideIcon,
} from "lucide-react";

export type AppNavigationTab = {
  title: string;
  fullTitle: string;
  path: string;
  icon: LucideIcon;
};

export const APP_LAYOUT_CONTENT_CLASSNAME = "flex-1 flex flex-col min-w-0 min-h-0";
export const APP_LAYOUT_MAIN_CLASSNAME = "flex-1 min-h-0 overflow-hidden";
export const ACTIVE_PAGE_CLASSNAME = "h-full min-h-0 overflow-hidden";
export const HIDDEN_PAGE_CLASSNAME = "hidden";

export const HIDEABLE_TABS: AppNavigationTab[] = [
  { title: "Dashboard", fullTitle: "Dashboard", path: "/", icon: LayoutDashboard },
  { title: "Regulatory Library", fullTitle: "Regulatory Library", path: "/regulatory-library", icon: Library },
  { title: "Controls Library", fullTitle: "Controls Library", path: "/controls-library", icon: ShieldCheck },
  { title: "Frameworks Library", fullTitle: "Frameworks Library", path: "/frameworks-library", icon: BookOpen },
  { title: "Regulatory Testing", fullTitle: "Regulatory Testing", path: "/regulatory-testing", icon: Scale },
  { title: "Reports", fullTitle: "Reports", path: "/reports", icon: FileBarChart },
  { title: "Asset Registry", fullTitle: "Asset Registry", path: "/asset-registry", icon: Database },
  { title: "Risk Assessment", fullTitle: "Risk Assessment", path: "/risk-assessment", icon: FileSearch },
  { title: "Final Report", fullTitle: "Final Report", path: "/evidence-assessment", icon: FileSearch },
  { title: "Control Testing", fullTitle: "Control Testing", path: "/control-testing", icon: TestTube },
  { title: "Chat", fullTitle: "AI Chat", path: "/chat", icon: MessageSquare },
  { title: "Issue Management", fullTitle: "Issue Management", path: "/issue-management", icon: AlertTriangle },
];
