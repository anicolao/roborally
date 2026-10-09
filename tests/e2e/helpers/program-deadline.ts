import { expect } from '@playwright/test';

export async function rewindSubmissionDeadline(roomCode: string) {
  const collectionUrl =
    `http://127.0.0.1:8188/v1/projects/roborally-e2e/databases/(default)/documents/` +
    `games/${roomCode.toLowerCase()}/events`;

  await expect
    .poll(async () => {
      const response = await fetch(collectionUrl, {
        headers: { Authorization: 'Bearer owner' }
      });
      const body = (await response.json()) as {
        documents?: { name: string; fields: { type?: { stringValue?: string } } }[];
      };
      return body.documents?.find(
        ({ fields }) => fields.type?.stringValue === 'program/submitted'
      )?.name;
    })
    .not.toBeUndefined();

  const response = await fetch(collectionUrl, {
    headers: { Authorization: 'Bearer owner' }
  });
  const body = (await response.json()) as {
    documents: {
      name: string;
      fields: {
        type?: { stringValue?: string };
        createdAt?: { timestampValue?: string };
      };
    }[];
  };
  const submission = body.documents.find(
    ({ fields }) => fields.type?.stringValue === 'program/submitted'
  );
  if (!submission) throw new Error('Program submission was not persisted.');

  const patches = await Promise.all(
    body.documents.map((document) => {
      const timestamp = document.fields.createdAt?.timestampValue;
      if (!timestamp) throw new Error(`Event ${document.name} has no canonical timestamp.`);
      return fetch(
        `http://127.0.0.1:8188/v1/${document.name}?updateMask.fieldPaths=createdAt`,
        {
          method: 'PATCH',
          headers: {
            Authorization: 'Bearer owner',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fields: {
              createdAt: {
                timestampValue: new Date(Date.parse(timestamp) - 31_000).toISOString()
              }
            }
          })
        }
      );
    })
  );
  for (const patch of patches) {
    if (!patch.ok) {
      throw new Error(`Could not inject emulator timestamp: ${await patch.text()}`);
    }
  }
}
