import { useState } from "react";
import { ChevronDown } from "lucide-react";

export type HowItWorksStep = {
  number: number;
  title: string;
  desc: string;
  color: string;
};

interface HowItWorksProps {
  steps: HowItWorksStep[];
  defaultOpen?: boolean;
  eyebrow?: string;
  title?: string;
}

export default function HowItWorks({
  steps,
  defaultOpen = false,
  eyebrow = "Process",
  title = "How It Works",
}: HowItWorksProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-9">
      <button
        type="button"
        className="w-full flex items-center justify-between pb-4 border-b-2 border-[#E2E6EF] mb-5"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="text-left">
          <div className="text-[11px] font-bold text-[#00338D] tracking-[2.5px] uppercase mb-1">
            {eyebrow}
          </div>
          <div className="font-bold text-[#0C233C] text-[20px] tracking-tight">
            {title}
          </div>
        </div>
        <ChevronDown
          size={22}
          className={`text-[#8492A6] transition-transform duration-200 ${open ? "" : "-rotate-90"}`}
        />
      </button>
      {open && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {steps.map((s) => (
            <div
              key={s.number}
              className="bg-white rounded-2xl border border-[#E2E6EF] shadow-sm p-6 flex flex-col gap-3"
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                style={{ background: s.color }}
              >
                {s.number}
              </div>
              <div className="font-bold text-[#0C233C] text-[15px]">{s.title}</div>
              <p className="text-[13px] text-[#5A6478] leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
