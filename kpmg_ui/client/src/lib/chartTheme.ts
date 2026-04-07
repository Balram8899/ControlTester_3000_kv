import type React from "react";

// Shared recharts color palette and styling for OSINT-themed charts

export const CHART_COLORS = [
  "#00B8F5", // pacific
  "#1E49E2", // cobalt
  "#7213EA", // purple
  "#098E7E", // teal
  "#00338D", // kpmg blue
  "#EAAA00", // amber
  "#009A44", // green
  "#E5001B", // red
  "#00FF88", // terminal green
  "#8492A6", // grey
];

export const CHART_TOOLTIP_STYLE: React.CSSProperties = {
  background: "hsl(222 45% 7% / 0.95)",
  border: "1px solid hsl(222 35% 20%)",
  borderRadius: "8px",
  fontSize: "12px",
  fontFamily: "'JetBrains Mono', monospace",
  color: "#e2e8f0",
  boxShadow: "0 8px 25px -5px rgba(0, 184, 245, 0.15)",
};

// Apply these alongside contentStyle so Recharts item/label text
// matches the dark tooltip container instead of inheriting page defaults.
export const CHART_TOOLTIP_ITEM_STYLE: React.CSSProperties = {
  color: "#e2e8f0",
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: "12px",
};

export const CHART_TOOLTIP_LABEL_STYLE: React.CSSProperties = {
  color: "#94a3b8",
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: "11px",
  marginBottom: "2px",
};

export const AXIS_STYLE = {
  fontSize: 10,
  fontFamily: "'JetBrains Mono', monospace",
  fill: "#8492A6",
};

export const GRID_STYLE = {
  strokeDasharray: "3 3",
  stroke: "hsl(222 30% 20%)",
  strokeOpacity: 0.5,
};
