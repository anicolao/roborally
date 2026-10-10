import { beforeEach, describe, expect, it, vi } from 'vitest';

const firebase = vi.hoisted(() => ({
  app: {},
  auth: { currentUser: null },
  db: {},
  user: { uid: 'transport-test-user' },
  doc: vi.fn(),
  getDoc: vi.fn(),
  initializeApp: vi.fn(),
  getAuth: vi.fn(),
  initializeFirestore: vi.fn(),
  signInAnonymously: vi.fn()
}));

vi.mock('firebase/app', () => ({
  initializeApp: firebase.initializeApp
}));

vi.mock('firebase/auth', () => ({
  connectAuthEmulator: vi.fn(),
  getAuth: firebase.getAuth,
  signInAnonymously: firebase.signInAnonymously
}));

vi.mock('firebase/firestore', () => ({
  connectFirestoreEmulator: vi.fn(),
  initializeFirestore: firebase.initializeFirestore,
  doc: firebase.doc,
  getDoc: firebase.getDoc
}));

vi.mock('./firebase-config', () => ({
  readFirebaseConfig: vi.fn(() => ({ projectId: 'test-project' }))
}));

describe('initializeFirebase', () => {
  beforeEach(() => {
    firebase.initializeApp.mockReturnValue(firebase.app);
    firebase.getAuth.mockReturnValue(firebase.auth);
    firebase.initializeFirestore.mockReturnValue(firebase.db);
    firebase.signInAnonymously.mockResolvedValue({ user: firebase.user });
    firebase.getDoc.mockResolvedValue(undefined);
  });

  it('uses the selected transport when initializing Firestore', async () => {
    const { initializeFirebase, shouldUseFetchStreams } = await import('./firebase');

    await initializeFirebase();

    expect(firebase.initializeFirestore).toHaveBeenCalledWith(
      firebase.app,
      { useFetchStreams: shouldUseFetchStreams(navigator) }
    );
  });

  it('disables Fetch Streams in desktop Safari and iOS WebKit browsers', async () => {
    const { shouldUseFetchStreams } = await import('./firebase');

    expect(shouldUseFetchStreams({
      userAgent: 'Mozilla/5.0 (Macintosh) Version/26.5 Safari/626.2.5',
      platform: 'MacIntel',
      maxTouchPoints: 0
    })).toBe(false);
    expect(shouldUseFetchStreams({
      userAgent: 'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/26.5 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 5
    })).toBe(false);
    expect(shouldUseFetchStreams({
      userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 CriOS/140.0 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5
    })).toBe(false);
  });

  it('keeps Fetch Streams enabled in Chromium', async () => {
    const { shouldUseFetchStreams } = await import('./firebase');

    expect(shouldUseFetchStreams({
      userAgent: 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/140.0 Safari/537.36',
      platform: 'MacIntel',
      maxTouchPoints: 0
    })).toBe(true);
  });
});
