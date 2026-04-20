import type React from "react";

// Shared recharts color palette and styling for KPMG-branded dashboards

export const CHART_COLORS = [
  "#00338D", // kpmg blue
  "#1E49E2", // cobalt
  "#00B8F5", // pacific
  "#098E7E", // teal
  "#7213EA", // purple
  "#EAAA00", // amber
  "#009A44", // green
  "#E5001B", // red
  "#ACEAFF", // pale blue
  "#8492A6", // grey
];

export const CHART_TOOLTIP_STYLE: React.CSSProperties = {
  background: "rgba(255, 255, 255, 0.98)",
  border: "1px solid rgba(0, 51, 141, 0.12)",
  borderRadius: "14px",
  fontSize: "12px",
  fontFamily: "Arial, sans-serif",
  color: "#0C233C",
  boxShadow: "0 18px 40px -28px rgba(12, 35, 60, 0.28)",
};

// Apply these alongside contentStyle so Recharts item/label text
// matches the dark tooltip container instead of inheriting page defaults.
export const CHART_TOOLTIP_ITEM_STYLE: React.CSSProperties = {
  color: "#0C233C",
  fontFamily: "Arial, sans-serif",
  fontSize: "12px",
};

export const CHART_TOOLTIP_LABEL_STYLE: React.CSSProperties = {
  color: "#5B6B82",
  fontFamily: "Arial, sans-serif",
  fontSize: "11px",
  marginBottom: "2px",
};

export const AXIS_STYLE = {
  fontSize: 11,
  fontFamily: "Arial, sans-serif",
  fill: "#5B6B82",
};

export const GRID_STYLE = {
  strokeDasharray: "3 3",
  stroke: "rgba(0, 51, 141, 0.12)",
  strokeOpacity: 1,
};
