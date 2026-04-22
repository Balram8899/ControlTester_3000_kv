export type LandingModuleIconKey =
  | "dashboard"
  | "regulatoryLibrary"
  | "reports"
  | "assetRegistry"
  | "riskAssessment"
  | "finalReporting"
  | "controlTesting"
  | "chat"
  | "issueManagement";

export type LandingModule = {
  title: string;
  path: string;
  description: string;
  eyebrow: string;
  accent: string;
  iconKey: LandingModuleIconKey;
};

export const LANDING_PAGE_CHIPS = ["9 core modules", "KPMG-aligned navigation", "Live workspace"] as const;

export const LANDING_MODULES: LandingModule[] = [
  {
    title: "Dashboard",
    path: "/",
    description: "Open the portfolio view for regulatory coverage, control posture, and current platform activity.",
    eyebrow: "Portfolio oversight",
    accent: "#00338D",
    iconKey: "dashboard",
  },
  {
    title: "Regulatory Library",
    path: "/regulatory-library",
    description: "Manage regulations, obligations, and the reference content that anchors downstream testing.",
    eyebrow: "Regulatory foundation",
    accent: "#1E49E2",
    iconKey: "regulatoryLibrary",
  },
  {
    title: "Reports",
    path: "/reports",
    description: "Review generated outputs, workpapers, and reporting artefacts from completed workflows.",
    eyebrow: "Reporting outputs",
    accent: "#0C233C",
    iconKey: "reports",
  },
  {
    title: "Asset Registry",
    path: "/asset-registry",
    description: "Access the asset inventory, ownership context, and CIA ratings used across assessments.",
    eyebrow: "Asset intelligence",
    accent: "#1E49E2",
    iconKey: "assetRegistry",
  },
  {
    title: "Risk Assessment",
    path: "/risk-assessment",
    description: "Capture risks, connect them to controls, and build structured assessment outputs.",
    eyebrow: "Risk scoring",
    accent: "#00338D",
    iconKey: "riskAssessment",
  },
  {
    title: "Final Reporting",
    path: "/evidence-assessment",
    description: "Compile evidence-backed conclusions and generate the final reporting package.",
    eyebrow: "Evidence synthesis",
    accent: "#0C233C",
    iconKey: "finalReporting",
  },
  {
    title: "Control Testing",
    path: "/control-testing",
    description: "Run AI-assisted controls testing, review evidence, and produce workpaper-ready results.",
    eyebrow: "Controls testing",
    accent: "#1E49E2",
    iconKey: "controlTesting",
  },
  {
    title: "Chat",
    path: "/chat",
    description: "Use conversational support to interrogate uploaded content, findings, and reporting context.",
    eyebrow: "Analyst support",
    accent: "#00B8F5",
    iconKey: "chat",
  },
  {
    title: "Issue Management",
    path: "/issue-management",
    description: "Track findings, remediation actions, and issue status across the active engagement.",
    eyebrow: "Action tracking",
    accent: "#00338D",
    iconKey: "issueManagement",
  },
];
