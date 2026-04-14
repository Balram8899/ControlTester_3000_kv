// kpmg_ui/client/src/components/CiaRatingWidget.tsx
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type CIALevel = "low" | "medium" | "high";

const LEVELS: CIALevel[] = ["low", "medium", "high"];

const ACTIVE: Record<CIALevel, string> = {
  low:    "bg-emerald-100 border-emerald-400 text-emerald-700 font-semibold",
  medium: "bg-amber-100 border-amber-400 text-amber-700 font-semibold",
  high:   "bg-red-100 border-red-400 text-red-700 font-semibold",
};

const GUIDANCE: Record<string, Record<CIALevel, string>> = {
  Confidentiality: {
    low:    "Disclosure causes no or minimal impact (publicly available data).",
    medium: "Disclosure causes moderate impact — limited exposure, recoverable.",
    high:   "Disclosure causes severe impact — regulatory breach, major reputational damage.",
  },
  Integrity: {
    low:    "Corruption causes minimal disruption.",
    medium: "Corruption causes noticeable errors or delays, correctable.",
    high:   "Corruption causes severe failures, safety risk, or fraud.",
  },
  Availability: {
    low:    "Outage causes minimal disruption — non-critical service.",
    medium: "Outage causes moderate disruption — SLA breach.",
    high:   "Outage causes severe disruption — business-critical service.",
  },
};

function CiaAxis({ label, value, onChange, readOnly = false }: {
  label: string; value: CIALevel; onChange: (v: CIALevel) => void; readOnly?: boolean;
}) {
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
            <p className="font-semibold mb-1">{label} Rating Guide</p>
            {LEVELS.map(l => (
              <p key={l}><span className={l === "low" ? "text-emerald-600 font-medium" : l === "medium" ? "text-amber-600 font-medium" : "text-red-600 font-medium"} style={{textTransform:"capitalize"}}>{l}:</span> {GUIDANCE[label][l]}</p>
            ))}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="flex gap-1.5">
        {LEVELS.map(level => (
          <button
            key={level}
            type="button"
            disabled={readOnly}
            onClick={() => !readOnly && onChange(level)}
            className={`px-3 py-1 rounded border text-xs capitalize transition-all ${
              value === level ? ACTIVE[level] : "border-slate-300 text-slate-500 hover:border-slate-400"
            } ${readOnly ? "cursor-default" : "cursor-pointer"}`}
          >
            {level}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function CiaRatingWidget({
  confidentiality, integrity, availability, onChange, readOnly = false,
}: {
  confidentiality: CIALevel; integrity: CIALevel; availability: CIALevel;
  onChange: (field: "confidentiality" | "integrity" | "availability", value: CIALevel) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-3 p-4 rounded-lg border border-slate-200 bg-slate-50">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">CIA Rating</p>
      <CiaAxis label="Confidentiality" value={confidentiality} onChange={v => onChange("confidentiality", v)} readOnly={readOnly} />
      <CiaAxis label="Integrity"       value={integrity}       onChange={v => onChange("integrity", v)}       readOnly={readOnly} />
      <CiaAxis label="Availability"    value={availability}    onChange={v => onChange("availability", v)}    readOnly={readOnly} />
    </div>
  );
}
