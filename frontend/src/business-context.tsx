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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  const { data: businesses = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["businesses"],
    queryFn: () => api.listBusinesses(),
    enabled: !!user,
  });

  useEffect(() => {
    (async () => {
      const stored = await getActiveBusinessId();
      setActiveId(stored);
      setInitialized(true);
    })();
  }, []);

  useEffect(() => {
    if (!initialized || !user) return;
    if (businesses.length === 0) {
      if (activeId !== null) {
        setActiveId(null);
        setActiveBusinessId(null);
      }
      return;
    }
    const exists = activeId && businesses.some((b) => b.id === activeId);
    if (!exists) {
      const first = businesses[0].id;
      setActiveId(first);
      setActiveBusinessId(first);
    }
  }, [businesses, activeId, initialized, user]);

  const activeBusiness = useMemo(
    () => businesses.find((b) => b.id === activeId) || null,
    [businesses, activeId],
  );

  const switchBusiness = useCallback(
    async (id: string) => {
      setActiveId(id);
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
