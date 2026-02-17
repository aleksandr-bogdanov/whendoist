/**
 * Manual query hook for GET /api/v1/me.
 *
 * This will be replaced by orval-generated code once the server
 * OpenAPI spec is regenerated. The interface is kept compatible.
 */
import { useQuery } from "@tanstack/react-query";
import type {
  DataTag,
  QueryKey,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query";
import { apiClient } from "../../../lib/api-client";

export interface MeResponse {
  name: string | null;
  email: string;
  is_demo_user: boolean;
  encryption_enabled: boolean;
  calendar_connected: boolean;
}

export const getMeApiV1MeGet = (signal?: AbortSignal) => {
  return apiClient<MeResponse>({
    url: "/api/v1/me",
    method: "GET",
    signal,
  });
};

export const getGetMeApiV1MeGetQueryKey = () => {
  return ["/api/v1/me"] as const;
};

export function useGetMeApiV1MeGet<
  TData = Awaited<ReturnType<typeof getMeApiV1MeGet>>,
  TError = unknown,
>(
  options?: {
    query?: Partial<
      UseQueryOptions<
        Awaited<ReturnType<typeof getMeApiV1MeGet>>,
        TError,
        TData
      >
    >;
  },
): UseQueryResult<TData, TError> & {
  queryKey: DataTag<QueryKey, TData, TError>;
} {
  const { query: queryOptions } = options ?? {};
  const queryKey = queryOptions?.queryKey ?? getGetMeApiV1MeGetQueryKey();

  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => getMeApiV1MeGet(signal),
    ...queryOptions,
  }) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
  };

  return { ...query, queryKey: queryKey as DataTag<QueryKey, TData, TError> };
}
