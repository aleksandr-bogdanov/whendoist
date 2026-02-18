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

import type { AppRoutersTasksTaskResponse, DomainResponse } from "@/api/model";
import { decrypt, encrypt, looksEncrypted } from "@/lib/crypto";
import { useCryptoStore } from "@/stores/crypto-store";

/**
 * Decrypt a single string field if it looks encrypted.
 */
async function decryptFieldIfNeeded(
  value: string | null | undefined,
  key: CryptoKey,
): Promise<string | null | undefined> {
  if (!value || !looksEncrypted(value)) return value;
  try {
    return await decrypt(key, value);
  } catch {
    return value; // Return original on failure
  }
}

/**
 * Decrypt task title, description, and subtask titles.
 */
export async function decryptTask(
  task: AppRoutersTasksTaskResponse,
  key: CryptoKey,
): Promise<AppRoutersTasksTaskResponse> {
  const [title, description] = await Promise.all([
    decryptFieldIfNeeded(task.title, key),
    decryptFieldIfNeeded(task.description, key),
  ]);

  let subtasks = task.subtasks;
  if (subtasks?.length) {
    subtasks = await Promise.all(
      subtasks.map(async (st) => ({
        ...st,
        title: (await decryptFieldIfNeeded(st.title, key)) ?? st.title,
      })),
    );
  }

  return {
    ...task,
    title: title ?? task.title,
    description: description ?? task.description ?? null,
    subtasks,
  };
}

/**
 * Decrypt domain name.
 */
export async function decryptDomain(
  domain: DomainResponse,
  key: CryptoKey,
): Promise<DomainResponse> {
  const name = await decryptFieldIfNeeded(domain.name, key);
  return {
    ...domain,
    name: name ?? domain.name,
  };
}

/**
 * Hook providing decrypt/encrypt helpers bound to the current crypto state.
 */
export function useCrypto() {
  const { derivedKey, encryptionEnabled, isUnlocked } = useCryptoStore();

  const canDecrypt = encryptionEnabled && isUnlocked && derivedKey !== null;

  return {
    canDecrypt,

    /**
     * Decrypt an array of tasks. Returns as-is if encryption not active.
     */
    decryptTasks: async (
      tasks: AppRoutersTasksTaskResponse[],
    ): Promise<AppRoutersTasksTaskResponse[]> => {
      if (!canDecrypt || !derivedKey) return tasks;
      return Promise.all(tasks.map((t) => decryptTask(t, derivedKey)));
    },

    /**
     * Decrypt a single task. Returns as-is if encryption not active.
     */
    decryptTask: async (
      task: AppRoutersTasksTaskResponse,
    ): Promise<AppRoutersTasksTaskResponse> => {
      if (!canDecrypt || !derivedKey) return task;
      return decryptTask(task, derivedKey);
    },

    /**
     * Decrypt an array of domains. Returns as-is if encryption not active.
     */
    decryptDomains: async (domains: DomainResponse[]): Promise<DomainResponse[]> => {
      if (!canDecrypt || !derivedKey) return domains;
      return Promise.all(domains.map((d) => decryptDomain(d, derivedKey)));
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
