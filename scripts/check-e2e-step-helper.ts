import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const repositoryRoot = join(import.meta.dir, '..');
const e2eRoot = join(repositoryRoot, 'tests', 'e2e');
const scenarioDirectoryPattern = /^\d{3}-.+/;
const specFilePattern = /^\d{3}-.+\.spec\.ts$/;

const requirements = [
  {
    description: 'import TestStepHelper',
    pattern: /import\s+\{[^}]*\bTestStepHelper\b[^}]*\}\s+from\s+['"]\.\.\/helpers\/test-step-helper['"]/s
  },
  {
    description: 'instantiate TestStepHelper',
    pattern: /new\s+TestStepHelper\s*\(/
  },
  {
    description: 'call setMetadata',
    pattern: /\b\w+\.setMetadata\s*\(/
  },
  {
    description: 'capture at least one step',
    pattern: /\b\w+\.step\s*\(/
  },
  {
    description: 'call generateDocs',
    pattern: /\b\w+\.generateDocs\s*\(/
  }
] as const;

const specFiles = readdirSync(e2eRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && scenarioDirectoryPattern.test(entry.name))
  .flatMap((entry) =>
    readdirSync(join(e2eRoot, entry.name), { withFileTypes: true })
      .filter((candidate) => candidate.isFile() && specFilePattern.test(candidate.name))
      .map((candidate) => join(e2eRoot, entry.name, candidate.name))
  )
  .sort();

if (specFiles.length === 0) {
  console.error('No numbered E2E spec files were found.');
  process.exit(1);
}

const violations = specFiles.flatMap((file) => {
  const source = readFileSync(file, 'utf8');
  return requirements
    .filter(({ pattern }) => !pattern.test(source))
    .map(({ description }) => `${relative(repositoryRoot, file)}: must ${description}`);
});

if (violations.length > 0) {
  console.error('E2E step-helper convention violations:\n');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(`Checked ${specFiles.length} E2E spec files for documented screenshot steps.`);
