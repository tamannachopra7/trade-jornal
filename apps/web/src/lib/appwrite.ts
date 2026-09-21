import { Client as ServerClient, Databases, Account } from 'node-appwrite';
import { Client as WebClient, Databases as WebDatabases, Account as WebAccount } from 'appwrite';

const APPWRITE_ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1';
const APPWRITE_PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || '';
const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY || '';

// Server-side Appwrite Client (Node SDK - requires API Key)
export function createAdminClient() {
  const client = new ServerClient()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID)
    .setKey(APPWRITE_API_KEY);

  return {
    get account() {
      return new Account(client);
    },
    get databases() {
      return new Databases(client);
    },
  };
}

// Client-side Appwrite Client (Web SDK - no API Key)
export function createSessionClient() {
  const client = new WebClient()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID);

  return {
    get account() {
      return new WebAccount(client);
    },
    get databases() {
      return new WebDatabases(client);
    },
  };
}
