import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const hasActionlint = spawnSync('actionlint', ['--version']).status === 0;

// Plain-text checks: this repo has no YAML parser on purpose (no npm packages).
function steps(text: string): string[] {
  return text.split(/\n {4}- /).slice(1);
}

describe('given each composite action', () => {
  for (const [file, inputs] of [
    ['action.yml', ['project-dir', 'forge-ref', 'node-version', 'artifact-name']],
    ['publish/action.yml', ['tag', 'forge-ref', 'artifact-name', 'token']],
  ] as const) {
    it(`when ${file} is read, then it is a composite action with the documented inputs`, () => {
      assert.ok(existsSync(file), `${file} is missing`);
      const text = readFileSync(file, 'utf8');
      assert.match(text, /using: composite/);
      for (const input of inputs) assert.match(text, new RegExp(`\\n  ${input}:`), `input ${input}`);
    });

    it(`when every step of ${file} that runs a command is inspected, then it declares a shell`, () => {
      const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
      const runSteps = steps(text).filter((step) => /\n {6}run:/.test(step) || step.startsWith('run:'));
      assert.ok(runSteps.length > 0, 'expected at least one run step');
      for (const step of runSteps) assert.match(step, /\n {6}shell: bash/, step.split('\n')[0]);
    });
  }
});

describe('given the self-test workflow', () => {
  it('when linted with actionlint, then it reports nothing (inputs match action.yml)', { skip: !hasActionlint && 'actionlint not installed' }, () => {
    assert.ok(existsSync('.github/workflows/self-test.yml'), 'self-test.yml is missing');
    const result = spawnSync('actionlint', ['.github/workflows/self-test.yml'], { encoding: 'utf8' });
    assert.equal(result.stdout + result.stderr, '');
    assert.equal(result.status, 0);
  });
});

describe('given the build action packages and uploads', () => {
  it('when action.yml is read, then CPack stages outside dist and only the release files are uploaded', () => {
    const text = readFileSync('action.yml', 'utf8');
    // CPack's DragNDrop staging dir contains a symlink to /Applications; uploading dist/* would follow it.
    assert.ok(!/cpack[^\n]*-B "\$GITHUB_WORKSPACE\/dist"/.test(text), 'cpack must not use dist as its build directory');
    assert.ok(!/path: dist\/\*\s*$/m.test(text), 'upload only dist/*.dmg and dist/*.zip');
  });
});
