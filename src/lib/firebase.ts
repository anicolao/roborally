import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  signInAnonymously,
  type Auth,
  type User
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  initializeFirestore,
  type FirestoreSettings,
  type Firestore
} from 'firebase/firestore';
import { readFirebaseConfig } from './firebase-config';

export interface FirebaseServices {
  auth: Auth;
  db: Firestore;
  user: User;
}

let services: FirebaseServices | undefined;

type BrowserIdentity = Pick<Navigator, 'maxTouchPoints' | 'platform' | 'userAgent'>;

export function shouldUseFetchStreams(browser: BrowserIdentity | undefined): boolean {
  if (!browser) return true;
  const isIOS = /iPad|iPhone|iPod/.test(browser.userAgent) ||
    (browser.platform === 'MacIntel' && browser.maxTouchPoints > 1);
  const isMacSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(browser.userAgent);
  return !(isIOS || isMacSafari);
}

function firestoreSettings(): FirestoreSettings & { useFetchStreams: boolean } {
  // Safari can buffer streamed Firestore responses. Use non-streaming XHR
  // long polling on WebKit: https://github.com/firebase/firebase-js-sdk/issues/9789
  const useFetchStreams = shouldUseFetchStreams(
    typeof navigator === 'undefined' ? undefined : navigator
  );
  return {
    useFetchStreams,
    ...(!useFetchStreams ? { experimentalForceLongPolling: true } : {})
  };
}

export async function initializeFirebase(
  onProgress: (message: string) => void = () => {}
): Promise<FirebaseServices> {
  if (services) return services;

  const config = readFirebaseConfig(import.meta.env);
  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = initializeFirestore(app, firestoreSettings());
  const usesEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';

  if (usesEmulators) {
    connectAuthEmulator(
      auth,
      `http://${import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1'}:${
        import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_PORT ?? '9202'
      }`,
      { disableWarnings: true }
    );
    connectFirestoreEmulator(
      db,
      import.meta.env.VITE_FIRESTORE_EMULATOR_HOST ?? '127.0.0.1',
      Number(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT ?? '8188')
    );
  }

  onProgress('Connecting your account…');
  const credential = await signInAnonymously(auth);
  if (!usesEmulators) {
    onProgress('Checking the game connection…');
    await getDoc(doc(db, 'games/shell-readiness/events/probe'));
  }
  services = { auth, db, user: credential.user };
  return services;
}
