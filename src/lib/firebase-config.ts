export interface FirebasePublicConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

type PublicEnvironment = Record<string, string | boolean | undefined>;

const fields = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'VITE_FIREBASE_APP_ID'
} as const;

export function readFirebaseConfig(environment: PublicEnvironment): FirebasePublicConfig {
  const values = Object.fromEntries(
    Object.entries(fields).map(([field, variable]) => [field, environment[variable]])
  ) as Partial<FirebasePublicConfig>;

  const missing = Object.entries(values)
    .filter(([, value]) => typeof value !== 'string' || value.length === 0)
    .map(([field]) => fields[field as keyof typeof fields]);

  if (missing.length > 0) {
    throw new Error(`Missing Firebase configuration: ${missing.join(', ')}`);
  }

  return values as FirebasePublicConfig;
}
