import { Shield, AlertCircle, BarChart3 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import KpiCard from "@/components/KpiCard";
import {
  CHART_TOOLTIP_STYLE,
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
} from "@/lib/chartTheme";

const SEV_COLORS: Record<string, string> = {
  HIGH: "#E5001B",
  MEDIUM: "#EAAA00",
  LOW: "#009A44",
};

interface ControlTestingKpisProps {
  controlsTested: number;
  issuesIdentified: number;
  severityCounts?: { high: number; medium: number; low: number };
}

export default function ControlTestingKpis({
  controlsTested,
  issuesIdentified,
  severityCounts,
}: ControlTestingKpisProps) {
  const sevData = [
    { name: "HIGH", count: severityCounts?.high ?? 0 },
    { name: "MEDIUM", count: severityCounts?.medium ?? 0 },
    { name: "LOW", count: severityCounts?.low ?? 0 },
  ];
  const totalIssues = sevData.reduce((s, d) => s + d.count, 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <KpiCard
        label="Controls tested"
        value={controlsTested}
        subtitle="Total controls analysed"
        accentColor="var(--kpmg-blue)"
        icon={<Shield className="h-5 w-5" />}
      />
      <KpiCard
        label="Issues identified"
        value={issuesIdentified}
        subtitle="Fail and partial results"
        accentColor="#E5001B"
        icon={<AlertCircle className="h-5 w-5" />}
      />

      {/* Severity breakdown card — matches KpiCard visual style */}
      <div
        className="dashboard-panel rounded-lg border bg-card text-card-foreground p-4 card-interactive animate-fade-up"
        style={{ borderTop: "3px solid #EAAA00" }}
      >
        <div className="flex items-start justify-between">
          <div className="w-full">
            <p className="text-[12px] font-semibold text-muted-foreground">
              Severity breakdown
            </p>
            {totalIssues === 0 ? (
              <p className="text-sm text-muted-foreground mt-3">No issues found</p>
            ) : (
              <ResponsiveContainer width="100%" height={80}>
                <BarChart data={sevData} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 9, fontFamily: "var(--font-mono)", fontWeight: 600 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis hide allowDecimals={false} />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                    labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                    formatter={(v: number) => [v, "Issues"]}
                  />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={28}>
                    {sevData.map((d, i) => (
                      <Cell key={i} fill={SEV_COLORS[d.name]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <span className="text-muted-foreground/40 flex-shrink-0">
            <BarChart3 className="h-5 w-5" />
          </span>
        </div>
      </div>
    </div>
  );
}
