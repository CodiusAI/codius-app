import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  CodiusModelAccessStatus,
  UpdateCodiusModelAccessInput,
} from "@codius.ai/protocol/messages";
import { useFetchQuery } from "@/data/query";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";

function codiusModelAccessQueryKey(serverId: string) {
  return ["codius-model-access", serverId] as const;
}

interface UseCodiusModelAccessResult {
  status: CodiusModelAccessStatus | null;
  isLoading: boolean;
  update: (input: UpdateCodiusModelAccessInput) => Promise<CodiusModelAccessStatus>;
}

export function useCodiusModelAccess(serverId: string): UseCodiusModelAccessResult {
  const client = useHostRuntimeClient(serverId);
  const isConnected = useHostRuntimeIsConnected(serverId);
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => codiusModelAccessQueryKey(serverId), [serverId]);
  const query = useFetchQuery({
    queryKey,
    enabled: Boolean(client && isConnected),
    dataShape: "value",
    staleTimeMs: 60_000,
    queryFn: async () => {
      if (!client) {
        throw new Error("The host is not connected.");
      }
      const response = await client.getCodiusModelAccess();
      if (response.error) {
        throw new Error(response.error);
      }
      return response.status;
    },
  });

  const update = useCallback(
    async (input: UpdateCodiusModelAccessInput) => {
      if (!client) {
        throw new Error("The host is not connected.");
      }
      const response = await client.updateCodiusModelAccess(input);
      if (response.error) {
        throw new Error(response.error);
      }
      queryClient.setQueryData(queryKey, response.status);
      return response.status;
    },
    [client, queryClient, queryKey],
  );

  return {
    status: query.data ?? null,
    isLoading: query.isLoading,
    update,
  };
}
