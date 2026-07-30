import { expect, type Page, type TestInfo } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface Verification {
  spec: string;
  check: () => Promise<void>;
}

export interface StepOptions {
  description: string;
  verifications: Verification[];
  status?: 'connecting' | 'synced' | 'offline' | 'error' | 'skip';
}

interface DocStep {
  title: string;
  image: string;
  specs: string[];
}

export class TestStepHelper {
  private stepCount = 0;
  private steps: DocStep[] = [];
  private metadataTitle = '';
  private metadataDescription = '';

  constructor(
    private page: Page,
    private testInfo: TestInfo
  ) {}

  setMetadata(title: string, description: string) {
    this.metadataTitle = title;
    this.metadataDescription = description;
  }

  async step(id: string, options: StepOptions) {
    for (const verification of options.verifications) {
      await verification.check();
    }

    const expectedStatus = options.status ?? 'synced';
    if (expectedStatus !== 'skip') {
      await expect(this.page.locator('[role="status"][data-status]')).toHaveAttribute(
        'data-status',
        expectedStatus
      );
    }

    await this.page.mouse.move(0, 0);
    await this.page.evaluate(async () => {
      for (let pass = 0; pass < 3; pass += 1) {
        const finiteAnimations = document.getAnimations().filter((animation) => {
          const timing = animation.effect?.getTiming();
          return timing?.iterations !== Infinity && timing?.duration !== Infinity;
        });
        for (const animation of finiteAnimations) {
          try {
            animation.finish();
          } catch {
            // Detached animations can disappear while the view settles.
          }
        }
        if (pass < 2) {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
      }

      const root = document.documentElement;
      if (root.scrollWidth > window.innerWidth + 1 || root.scrollHeight > window.innerHeight + 1) {
        throw new Error(
          `page scrolls: ${root.scrollWidth}x${root.scrollHeight} inside ` +
            `${window.innerWidth}x${window.innerHeight}`
        );
      }
      if (window.scrollX !== 0 || window.scrollY !== 0) {
        throw new Error(`page is scrolled to ${window.scrollX},${window.scrollY}`);
      }

      for (const element of document.querySelectorAll<HTMLElement>('[data-e2e-layout] *')) {
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (
          rect.left < -1 ||
          rect.right > window.innerWidth + 1 ||
          rect.top < -1 ||
          rect.bottom > window.innerHeight + 1
        ) {
          throw new Error(
            `${element.tagName}.${element.className} is outside ` +
              `${window.innerWidth}x${window.innerHeight}`
          );
        }
      }

      const controls = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[data-e2e-layout] button:not([disabled]), [data-e2e-layout] input:not([disabled])'
        )
      ).filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          rect.width > 0 &&
          rect.height > 0
        );
      });
      for (let left = 0; left < controls.length; left += 1) {
        const first = controls[left].getBoundingClientRect();
        for (let right = left + 1; right < controls.length; right += 1) {
          const second = controls[right].getBoundingClientRect();
          const overlapWidth = Math.min(first.right, second.right) - Math.max(first.left, second.left);
          const overlapHeight =
            Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
          if (overlapWidth > 1 && overlapHeight > 1) {
            throw new Error(`${controls[left].tagName} overlaps ${controls[right].tagName}`);
          }
        }
      }
    });

    const paddedIndex = String(this.stepCount++).padStart(3, '0');
    const platform = process.platform === 'linux' ? '-linux' : '';
    const filename =
      `${paddedIndex}-${id.replaceAll('_', '-')}-${this.testInfo.project.name}${platform}.png`;
    await expect(this.page).toHaveScreenshot(filename);

    this.steps.push({
      title: options.description,
      image: `./screenshots/${filename}`,
      specs: options.verifications.map((verification) => verification.spec)
    });
  }

  generateDocs() {
    if (this.testInfo.project.name !== 'desktop') return;

    const testDirectory = path.dirname(this.testInfo.file);
    let content = `# ${this.metadataTitle}\n\n${this.metadataDescription}\n\n`;

    for (const step of this.steps) {
      content += `## ${step.title}\n\n`;
      content += `![${step.title}](${step.image})\n\n`;
      content += '**Verifications:**\n\n';
      for (const specification of step.specs) content += `- [x] ${specification}\n`;
      content += '\n';
    }

    fs.writeFileSync(path.join(testDirectory, 'README.md'), `${content.trimEnd()}\n`);
  }
}
