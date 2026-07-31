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
  getFirestore,
  type Firestore
} from 'firebase/firestore';
import { readFirebaseConfig } from './firebase-config';

export interface FirebaseServices {
  auth: Auth;
  db: Firestore;
  user: User;
}

let services: FirebaseServices | undefined;

export async function initializeFirebase(): Promise<FirebaseServices> {
  if (services) return services;

  const config = readFirebaseConfig(import.meta.env);
  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
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

  const credential = await signInAnonymously(auth);
  if (!usesEmulators) {
    await getDoc(doc(db, 'games/shell-readiness/events/probe'));
  }
  services = { auth, db, user: credential.user };
  return services;
}
