import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { useBusiness } from "./business-context";

/** The active business' product categories, alphabetical, each with its product count. */
export function useCategories() {
  const { activeId } = useBusiness();
  return useQuery({
    queryKey: ["categories", activeId],
    queryFn: () => api.listCategories(activeId!),
    enabled: !!activeId,
  });
}

/** Category names are compared ignoring case and extra spaces, as the server does. */
export const sameCategory = (a?: string, b?: string) =>
  (a || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("es") === (b || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
