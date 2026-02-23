/**
 * Custom hook that integrates encryption with TanStack Query.
 *
 * Pattern:
 * - Fetch: API response -> decrypt title/description/domain.name -> return plaintext
 * - Mutate: plaintext -> encrypt before sending to API
 *
 * Only decrypts fields that look encrypted (38+ base64 chars).
 * Uses derivedKey from crypto-store.
 */

import { toast } from "sonner";
import type { DomainResponse, TaskResponse } from "@/api/model";
import { decrypt, encrypt, looksEncrypted } from "@/lib/crypto";
import { useCryptoStore } from "@/stores/crypto-store";

/**
 * Decrypt a single string field if it looks encrypted.
 * Returns [decryptedValue, didFail] tuple.
 */
async function decryptFieldIfNeeded(
  value: string | null | undefined,
  key: CryptoKey,
): Promise<[string | null | undefined, boolean]> {
  if (!value || !looksEncrypted(value)) return [value, false];
  try {
    return [await decrypt(key, value), false];
  } catch {
    return [value, true]; // Return original on failure
  }
}

/**
 * Decrypt task title, description, and subtask titles.
 * Returns [decryptedTask, failureCount].
 */
export async function decryptTask(
  task: TaskResponse,
  key: CryptoKey,
): Promise<[TaskResponse, number]> {
  let failures = 0;
  const [[title, titleFailed], [description, descFailed]] = await Promise.all([
    decryptFieldIfNeeded(task.title, key),
    decryptFieldIfNeeded(task.description, key),
  ]);
  if (titleFailed) failures++;
  if (descFailed) failures++;

  let subtasks = task.subtasks;
  if (subtasks?.length) {
    subtasks = await Promise.all(
      subtasks.map(async (st) => {
        const [decrypted, failed] = await decryptFieldIfNeeded(st.title, key);
        if (failed) failures++;
        return { ...st, title: decrypted ?? st.title };
      }),
    );
  }

  return [
    {
      ...task,
      title: title ?? task.title,
      description: description ?? task.description ?? null,
      subtasks,
    },
    failures,
  ];
}

/**
 * Decrypt domain name.
 * Returns [decryptedDomain, failureCount].
 */
export async function decryptDomain(
  domain: DomainResponse,
  key: CryptoKey,
): Promise<[DomainResponse, number]> {
  const [name, failed] = await decryptFieldIfNeeded(domain.name, key);
  return [{ ...domain, name: name ?? domain.name }, failed ? 1 : 0];
}

/**
 * Hook providing decrypt/encrypt helpers bound to the current crypto state.
 */
export function useCrypto() {
  const {
    derivedKey,
    encryptionEnabled,
    isUnlocked,
    decryptionFailures,
    incrementDecryptionFailures,
  } = useCryptoStore();

  const canDecrypt = encryptionEnabled && isUnlocked && derivedKey !== null;

  const reportFailures = (count: number) => {
    if (count > 0) {
      incrementDecryptionFailures();
      // Show toast only on the first failure batch (not per field)
      if (decryptionFailures === 0) {
        toast.warning("Some data couldn't be decrypted. Try re-entering your passphrase.");
      }
    }
  };

  return {
    canDecrypt,

    /**
     * Decrypt an array of tasks. Returns as-is if encryption not active.
     */
    decryptTasks: async (tasks: TaskResponse[]): Promise<TaskResponse[]> => {
      if (!canDecrypt || !derivedKey) return tasks;
      const results = await Promise.all(tasks.map((t) => decryptTask(t, derivedKey)));
      const totalFailures = results.reduce((sum, [, f]) => sum + f, 0);
      reportFailures(totalFailures);
      return results.map(([task]) => task);
    },

    /**
     * Decrypt a single task. Returns as-is if encryption not active.
     */
    decryptTask: async (task: TaskResponse): Promise<TaskResponse> => {
      if (!canDecrypt || !derivedKey) return task;
      const [decrypted, failures] = await decryptTask(task, derivedKey);
      reportFailures(failures);
      return decrypted;
    },

    /**
     * Decrypt an array of domains. Returns as-is if encryption not active.
     */
    decryptDomains: async (domains: DomainResponse[]): Promise<DomainResponse[]> => {
      if (!canDecrypt || !derivedKey) return domains;
      const results = await Promise.all(domains.map((d) => decryptDomain(d, derivedKey)));
      const totalFailures = results.reduce((sum, [, f]) => sum + f, 0);
      reportFailures(totalFailures);
      return results.map(([domain]) => domain);
    },

    /**
     * Encrypt a string field for mutation. Returns as-is if encryption not active.
     */
    encryptFieldValue: async (value: string | null): Promise<string | null> => {
      if (!canDecrypt || !derivedKey || !value) return value;
      return await encrypt(derivedKey, value);
    },

    /**
     * Encrypt task title and description for create/update mutations.
     */
    encryptTaskFields: async (fields: {
      title?: string;
      description?: string | null;
    }): Promise<{ title?: string; description?: string | null }> => {
      if (!canDecrypt || !derivedKey) return fields;
      const result: { title?: string; description?: string | null } = { ...fields };
      if (fields.title) {
        result.title = await encrypt(derivedKey, fields.title);
      }
      if (fields.description) {
        result.description = await encrypt(derivedKey, fields.description);
      }
      return result;
    },

    /**
     * Encrypt domain name for create/update mutations.
     */
    encryptDomainName: async (name: string): Promise<string> => {
      if (!canDecrypt || !derivedKey) return name;
      return await encrypt(derivedKey, name);
    },
  };
}
