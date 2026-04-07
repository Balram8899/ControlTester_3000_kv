import { createContext, useContext, useState } from "react";

interface CrossNavContextValue {
  pendingControlId: string | null;
  setPendingControlId: (id: string | null) => void;
  pendingObligationId: string | null;
  setPendingObligationId: (id: string | null) => void;
  pendingQualityAnalysis: boolean;
  setPendingQualityAnalysis: (v: boolean) => void;
}

const CrossNavContext = createContext<CrossNavContextValue>({
  pendingControlId: null,
  setPendingControlId: () => {},
  pendingObligationId: null,
  setPendingObligationId: () => {},
  pendingQualityAnalysis: false,
  setPendingQualityAnalysis: () => {},
});

export function CrossNavProvider({ children }: { children: React.ReactNode }) {
  const [pendingControlId, setPendingControlId] = useState<string | null>(null);
  const [pendingObligationId, setPendingObligationId] = useState<string | null>(null);
  const [pendingQualityAnalysis, setPendingQualityAnalysis] = useState(false);

  return (
    <CrossNavContext.Provider value={{
      pendingControlId, setPendingControlId,
      pendingObligationId, setPendingObligationId,
      pendingQualityAnalysis, setPendingQualityAnalysis,
    }}>
      {children}
    </CrossNavContext.Provider>
  );
}

export function useCrossNav() {
  return useContext(CrossNavContext);
}
