// kpmg_ui/client/src/components/CiaRatingWidget.tsx
import { useRef } from "react";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type CIADimension = "confidentiality" | "integrity" | "availability";

const SCORE_STYLE: Record<number, string> = {
  1: "bg-emerald-100 border-emerald-400 text-emerald-700",
  2: "bg-lime-100    border-lime-400    text-lime-700",
  3: "bg-amber-100   border-amber-400   text-amber-700",
  4: "bg-orange-100  border-orange-400  text-orange-700",
  5: "bg-red-100     border-red-400     text-red-700",
};

const GUIDANCE: Record<string, Record<number, string>> = {
  Confidentiality: {
    1: "Public — disclosure causes no harm.",
    2: "Internal — limited disclosure impact.",
    3: "Sensitive — moderate disclosure impact.",
    4: "Confidential — significant harm if disclosed.",
    5: "Highly restricted — disclosure causes severe regulatory or reputational harm.",
  },
  Integrity: {
    1: "Corruption causes negligible disruption.",
    2: "Minor errors, easily corrected.",
    3: "Noticeable data errors with moderate impact.",
    4: "Significant corruption, difficult to recover.",
    5: "Corruption causes severe failures, fraud, or safety risk.",
  },
  Availability: {
    1: "Non-critical — outage tolerable.",
    2: "Low-priority — short outages acceptable.",
    3: "Moderate impact — SLA breach possible.",
    4: "High-priority — outage causes business disruption.",
    5: "Mission-critical — outage causes severe operational failure.",
  },
};

function CiaAxis({
  label, field, min, max, onChange, readOnly,
}: {
  label: string;
  field: CIADimension;
  min: number;
  max: number;
  onChange: (field: CIADimension, min: number, max: number) => void;
  readOnly: boolean;
}) {
  const dragAnchor = useRef<number | null>(null);

  function handleMouseDown(n: number) {
    if (readOnly) return;
    dragAnchor.current = n;
    onChange(field, n, n);
  }

  function handleMouseEnter(n: number) {
    if (readOnly || dragAnchor.current === null) return;
    const anchor = dragAnchor.current;
    onChange(field, Math.min(anchor, n), Math.max(anchor, n));
  }

  function handleMouseUp() {
    dragAnchor.current = null;
  }

  const rangeLabel = min === max ? `${max}` : `${min}–${max}`;

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1 w-36">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="text-slate-400 hover:text-slate-600">
              <Info className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs" side="right">
            <p className="font-semibold mb-1">{label} — Score Guide</p>
            <p className="text-slate-400 mb-1">Click a button to select. Click and drag to set a range.</p>
            {([1, 2, 3, 4, 5] as const).map(n => (
              <p key={n}><span className="font-medium">{n}:</span> {GUIDANCE[label][n]}</p>
            ))}
          </TooltipContent>
        </Tooltip>
      </div>
      <div
        className="flex gap-1 select-none"
        onMouseLeave={handleMouseUp}
        onMouseUp={handleMouseUp}
      >
        {([1, 2, 3, 4, 5] as const).map(n => {
          const inRange = n >= min && n <= max;
          const isEndpoint = n === min || n === max;
          return (
            <button
              key={n}
              type="button"
              disabled={readOnly}
              onMouseDown={() => handleMouseDown(n)}
              onMouseEnter={() => handleMouseEnter(n)}
              className={`w-8 h-8 rounded border text-xs font-medium transition-all ${
                inRange
                  ? `${SCORE_STYLE[max]} ${isEndpoint ? "ring-2 ring-offset-1 ring-current" : "opacity-70"}`
                  : "border-slate-300 text-slate-500 hover:border-slate-400"
              } ${readOnly ? "cursor-default" : "cursor-pointer"}`}
            >
              {n}
            </button>
          );
        })}
      </div>
      <span className="text-xs font-semibold text-slate-500 w-8 text-right">{rangeLabel}</span>
    </div>
  );
}

export default function CiaRatingWidget({
  confidentiality, confidentiality_min,
  integrity, integrity_min,
  availability, availability_min,
  onChange,
  readOnly = false,
}: {
  confidentiality: number;
  confidentiality_min: number;
  integrity: number;
  integrity_min: number;
  availability: number;
  availability_min: number;
  onChange: (field: CIADimension, min: number, max: number) => void;
  readOnly?: boolean;
}) {
  const total = confidentiality + integrity + availability;
  const band =
    total <= 5  ? "Low" :
    total <= 8  ? "Medium" :
    total <= 11 ? "High" : "Critical";

  const bandColor =
    band === "Low"      ? "text-emerald-700 bg-emerald-100 border-emerald-300" :
    band === "Medium"   ? "text-amber-700   bg-amber-100   border-amber-300"   :
    band === "High"     ? "text-orange-700  bg-orange-100  border-orange-300"  :
                          "text-red-700     bg-red-100     border-red-300";

  return (
    <div className="space-y-3 p-4 rounded-lg border border-slate-200 bg-slate-50">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">CIA Rating</p>
        <div className={`text-xs px-2 py-0.5 rounded border font-semibold ${bandColor}`}>
          {total}/15 · {band}
        </div>
      </div>
      {!readOnly && (
        <p className="text-[10px] text-slate-400">Click to select a value · Click and drag to set a range</p>
      )}
      <CiaAxis label="Confidentiality" field="confidentiality" min={confidentiality_min} max={confidentiality} onChange={onChange} readOnly={readOnly} />
      <CiaAxis label="Integrity"       field="integrity"       min={integrity_min}       max={integrity}       onChange={onChange} readOnly={readOnly} />
      <CiaAxis label="Availability"    field="availability"    min={availability_min}    max={availability}    onChange={onChange} readOnly={readOnly} />
    </div>
  );
}
