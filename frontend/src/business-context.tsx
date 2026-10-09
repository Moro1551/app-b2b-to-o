import { createContext, useContext, useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getActiveBusinessId, setActiveBusinessId } from "./api";
import { useAuth } from "./auth-context";

type Business = {
  id: string;
  name: string;
  subtitle?: string;
  logo?: string;
  currency: string;
  color: string;
  [k: string]: any;
};

type Ctx = {
  businesses: Business[];
  activeBusiness: Business | null;
  activeId: string | null;
  isLoading: boolean;
  isError: boolean;
  refresh: () => void;
  switchBusiness: (id: string) => Promise<void>;
};

const BusinessCtx = createContext<Ctx | null>(null);

export function BusinessProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  // The business the user last picked, as saved on the device.
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["businesses"],
    queryFn: () => api.listBusinesses(),
    enabled: !!user,
  });
  const businesses: Business[] = useMemo(() => data ?? [], [data]);

  useEffect(() => {
    (async () => {
      setChosenId(await getActiveBusinessId());
      setInitialized(true);
    })();
  }, []);

  // Derived instead of synced in an effect: an effect saw the still-empty list while it loaded and
  // cleared the saved choice, so the app always reopened on the first business.
  const activeId = useMemo(() => {
    if (!initialized) return null;
    if (!data) return chosenId; // list not loaded yet: screens can already start fetching
    if (chosenId && businesses.some((b) => b.id === chosenId)) return chosenId;
    return businesses[0]?.id ?? null;
  }, [initialized, data, businesses, chosenId]);

  const activeBusiness = useMemo(
    () => businesses.find((b) => b.id === activeId) || null,
    [businesses, activeId],
  );

  const switchBusiness = useCallback(
    async (id: string) => {
      setChosenId(id);
      await setActiveBusinessId(id);
      qc.invalidateQueries();
    },
    [qc],
  );

  const refresh = useCallback(() => { refetch(); }, [refetch]);

  return (
    <BusinessCtx.Provider
      value={{ businesses, activeBusiness, activeId, isLoading, isError, refresh, switchBusiness }}
    >
      {children}
    </BusinessCtx.Provider>
  );
}

export function useBusiness() {
  const ctx = useContext(BusinessCtx);
  if (!ctx) throw new Error("useBusiness must be used inside BusinessProvider");
  return ctx;
}

export function formatMoney(amount: number, currency: string = "L") {
  const n = Number(amount || 0);
  const symbol = currency === "USD" ? "$" : "L ";
  return `${symbol}${n.toLocaleString("es-HN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
