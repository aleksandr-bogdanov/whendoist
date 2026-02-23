import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000, // 2 minutes — reduces overwrites of in-flight optimistic updates
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
