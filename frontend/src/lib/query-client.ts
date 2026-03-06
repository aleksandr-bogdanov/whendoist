import { MutationCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { translateBackendError } from "./error-mapping";
import i18n from "./i18n";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000, // 2 minutes — reduces overwrites of in-flight optimistic updates
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      // Skip if the mutation already has its own onError handler
      if (mutation.options.onError) return;
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data
        ?.detail;
      toast.error(detail ? translateBackendError(detail) : i18n.t("errors.somethingWentWrong"));
    },
  }),
});
