import { EMPTY_DEFAULTS, type JournalDefaults } from "@/lib/journal-defaults";
import {
  AI_DEFAULT_MODELS,
  isAiProvider,
  type AiProvider,
  type AiSettingsPayload,
} from "@/lib/ai-settings";
import { decryptJson, encryptJson } from "./crypto";
import { createAdminClient } from "@/lib/appwrite";

const DATABASE_ID = 'trade_journal';
const COLLECTION_ID = 'settings';

export const getJournalDefaults = async (): Promise<JournalDefaults> => {
  try {
    return { ...EMPTY_DEFAULTS, ...JSON.parse((await getSetting("journalDefaults")) ?? "{}") };
  } catch {
    return EMPTY_DEFAULTS;
  }
};

export const getSetting = async (key: string): Promise<string | null> => {
  const { databases } = createAdminClient();
  try {
    const doc = await databases.getDocument(DATABASE_ID, COLLECTION_ID, key);
    return doc.value;
  } catch {
    return null;
  }
};

export const setSetting = async (key: string, value: string): Promise<void> => {
  const { databases } = createAdminClient();
  try {
    await databases.updateDocument(DATABASE_ID, COLLECTION_ID, key, { value });
  } catch (err: any) {
    if (err.code === 404) {
      await databases.createDocument(DATABASE_ID, COLLECTION_ID, key, { value });
    }
  }
};

export const deleteSetting = async (key: string): Promise<void> => {
  const { databases } = createAdminClient();
  try {
    await databases.deleteDocument(DATABASE_ID, COLLECTION_ID, key);
  } catch (e) {
    // Ignore
  }
};

export const getTimeZone = async (): Promise<string> => (await getSetting("timeZone")) ?? "UTC";

export const getImportTimeZone = async (): Promise<string> => (await getSetting("importTimeZone")) ?? (await getTimeZone());

export const getMultipliers = async (): Promise<Record<string, number>> => {
  const raw = await getSetting("multipliers");
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return {};
  }
};

export const aiKeyEnvironment = (provider: AiProvider): string | null =>
  (provider === "openai" ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY)?.trim() ||
  null;

export const getAiKey = async (provider: AiProvider): Promise<string | null> => {
  const environment = aiKeyEnvironment(provider);
  if (environment) return environment;
  const envelope = await getSetting(`${provider}KeyEnc`);
  if (!envelope) return null;
  try {
    const key = decryptJson<unknown>(envelope);
    return typeof key === "string" ? key.trim() || null : null;
  } catch {
    return null;
  }
};

export const setAiKey = async (provider: AiProvider, key: string | null): Promise<void> => {
  if (key === null) await deleteSetting(`${provider}KeyEnc`);
  else await setSetting(`${provider}KeyEnc`, encryptJson(key.trim()));
};

export const getAnthropicKey = async (): Promise<string | null> => getAiKey("anthropic");
export const setAnthropicKey = async (key: string | null): Promise<void> => setAiKey("anthropic", key);

export const getAiProvider = async (): Promise<AiProvider> => {
  const selected = await getSetting("aiProvider");
  if (isAiProvider(selected)) return selected;
  return !(await getAiKey("anthropic")) && (await getAiKey("openai")) ? "openai" : "anthropic";
};

export const aiModelSetting = (provider: AiProvider): string =>
  provider === "anthropic" ? "aiModel" : "openaiModel";

export const getAiModel = async (provider: AiProvider): Promise<string> =>
  (await getSetting(aiModelSetting(provider)))?.trim() || AI_DEFAULT_MODELS[provider];

export const getAiSettings = async (): Promise<AiSettingsPayload> => {
  const aiProvider = await getAiProvider();
  
  const connection = async (provider: AiProvider) => {
    const key = await getAiKey(provider);
    return {
      configured: Boolean(key),
      source: aiKeyEnvironment(provider)
        ? ("environment" as const)
        : key
          ? ("saved" as const)
          : null,
      model: await getAiModel(provider),
    };
  };

  const anthropicConfig = await connection("anthropic");
  const openaiConfig = await connection("openai");
  
  const aiConnections = { anthropic: anthropicConfig, openai: openaiConfig };
  
  return {
    aiProvider,
    aiConfigured: aiConnections[aiProvider].configured,
    aiModel: aiConnections[aiProvider].model,
    aiConnections,
  };
};

export interface NotionSettings {
  secret: string | null;
  databaseId: string | null;
}

export const getNotionSettings = async (): Promise<NotionSettings> => {
  const secretEnv = await getSetting("notionSecretEnc");
  const databaseId = await getSetting("notionDatabaseId");
  let secret = null;
  if (secretEnv) {
    try {
      const key = decryptJson<unknown>(secretEnv);
      secret = typeof key === "string" ? key.trim() || null : null;
    } catch {
      // Ignore
    }
  }
  return { secret, databaseId: databaseId?.trim() || null };
};

export const setNotionSettings = async (secret: string | null, databaseId: string | null): Promise<void> => {
  if (secret === null) await deleteSetting("notionSecretEnc");
  else await setSetting("notionSecretEnc", encryptJson(secret.trim()));

  if (databaseId === null) await deleteSetting("notionDatabaseId");
  else await setSetting("notionDatabaseId", databaseId.trim());
};
