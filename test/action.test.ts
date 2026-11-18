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
    ['action.yml', ['project-dir', 'forge-ref', 'node-version', 'artifact-name', 'target', 'snap', 'locale']],
    ['publish/action.yml', ['tag', 'forge-ref', 'pattern', 'token']],
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

describe('given the build action needs the app name and version', () => {
  it('when action.yml is read, then it asks forge info and no longer reads forge.json', () => {
    const text = readFileSync('action.yml', 'utf8');
    assert.ok(!text.includes('forge.json'), 'forge.json no longer exists');
    assert.ok(text.includes('.forge/bin/forge info --project "$PROJECT_DIR" --field name'));
    assert.ok(text.includes('.forge/bin/forge info --project "$PROJECT_DIR" --field version'));
  });
});

describe('given the build action signs and notarizes', () => {
  it('when action.yml is read, then signing goes through macos-sign.sh and the secrets are optional inputs', () => {
    const text = readFileSync('action.yml', 'utf8');
    assert.ok(!text.includes('codesign --force --deep -s -'), 'signing must go through the script');
    for (const step of ['import-certificate', 'sign "$RUNNER_TEMP/forge-out/${name}.app"', 'notarize "$RUNNER_TEMP/forge-out/${name}.app"', 'staple "$RUNNER_TEMP/forge-out/${name}.app"']) {
      assert.ok(text.includes(`.forge/scripts/macos-sign.sh ${step}`), step);
    }
    for (const input of ['macos-certificate-p12', 'macos-certificate-password', 'macos-signing-identity', 'notary-key-p8', 'notary-key-id', 'notary-issuer-id']) {
      assert.match(text, new RegExp(`\\n  ${input}:`), `input ${input}`);
    }
  });
});

describe('given the build action builds the DMG', () => {
  it('when action.yml is read, then the DMG goes through macos-dmg.sh (it retries when the Finder keeps the volume busy)', () => {
    const text = readFileSync('action.yml', 'utf8');
    assert.ok(text.includes('.forge/scripts/macos-dmg.sh "$RUNNER_TEMP/forge-out/CPackConfig.cmake" "$RUNNER_TEMP/forge-cpack" "$name"'));
    const macosPackage = steps(text).find((step) => step.startsWith('name: Package\n')) ?? '';
    assert.ok(macosPackage.length > 0 && !/^\s*cpack /m.test(macosPackage), 'the macOS package step must not call cpack directly (Linux does, with CPack generators)');
  });
});

describe('given an app with language packs', () => {
  it('when action.yml is read, then the build is strict about translations and the packs travel with the release files', () => {
    const text = readFileSync('action.yml', 'utf8');
    assert.ok(text.includes('forge build --project "$PROJECT_DIR" --out "$RUNNER_TEMP/forge-src" --strict-i18n'));
    assert.ok(text.includes('cp "$RUNNER_TEMP/forge-src/lang/"*.lang "$GITHUB_WORKSPACE/dist/"'), 'the packs are copied next to the dmg and the zip');
    assert.match(text, /path: \|\n\s+dist\/\*\.dmg\n\s+dist\/\*\.zip\n\s+dist\/\*\.lang/);
  });
});

describe('given the build action supports Linux', () => {
  const text = readFileSync('action.yml', 'utf8');
  const stepNamed = (fragment: string): string => steps(text).find((step) => step.includes(fragment)) ?? '';

  it('when action.yml is read, then it has the target input (macos by default) and the snap input (true by default)', () => {
    assert.match(text, /\n {2}target:\n(?: {4}.*\n)*? {4}default: macos/);
    assert.match(text, /\n {2}snap:\n(?: {4}.*\n)*? {4}default: 'true'/);
  });

  it('when action.yml is read, then the macOS-only requirement is replaced by a runner and target consistency check', () => {
    assert.ok(!text.includes('Require macOS'));
    const check = stepNamed('runner and target');
    assert.ok(check, 'a step that checks the runner against the target');
    assert.match(check, /runner\.os/);
    assert.match(check, /exit 1/);
    assert.ok(text.indexOf('runner and target') < text.indexOf('uses: actions/checkout@v4'), 'the check runs first');
  });

  it('when the macOS steps are inspected, then they run only for target macos', () => {
    for (const fragment of ['Import the signing certificate', 'Generate sources', 'Sign, notarize', 'name: Package\n', 'name: Build\n']) {
      assert.match(stepNamed(fragment), /if: inputs\.target == 'macos'/, fragment);
    }
  });

  it('when the Linux steps are inspected, then they run only for target linux and use the tools forge CI proved', () => {
    const linuxSteps = steps(text).filter((step) => /^name: .*\(Linux\)/.test(step));
    assert.ok(linuxSteps.length >= 5, 'expected the Linux steps to be named "(Linux)"');
    for (const step of linuxSteps) assert.match(step, /if: inputs\.target == 'linux'/, step.split('\n')[0]);
    const joined = linuxSteps.join('\n');
    for (const pkg of ['cmake', 'g++', 'pkg-config', 'libgtk-4-dev', 'libsoup-3.0-dev', 'rpm', 'squashfs-tools']) assert.ok(joined.includes(pkg), pkg);
    assert.ok(joined.includes('--strict-i18n --target linux'));
    assert.ok(joined.includes('cmake --build'));
    assert.match(joined, /cpack --config "\$RUNNER_TEMP\/forge-out\/CPackConfig\.cmake" -B "\$RUNNER_TEMP\/forge-cpack"/);
    assert.ok(joined.includes('.forge/scripts/linux-appimage.sh'));
    assert.ok(joined.includes('cp "$RUNNER_TEMP/forge-src/lang/"*.lang "$GITHUB_WORKSPACE/dist/"'));
  });

  it('when the Linux outputs are named, then they follow <name>-<version>-linux-<x86_64|arm64> and the AppImage is built from a DESTDIR install', () => {
    assert.ok(text.includes('linux-${arch}'));
    assert.match(text, /x86_64\)\s+arch=x86_64/);
    assert.match(text, /aarch64\|arm64\)\s+arch=arm64/);
    assert.ok(text.includes('DESTDIR="$RUNNER_TEMP/forge-root" cmake --install'));
    assert.ok(text.includes('${name}-${version}-linux-${arch}${suffix}.AppImage'));
    assert.ok(text.includes('${name}-${version}-linux-${arch}${suffix}.snap'));
  });

  it('when the snap step is inspected, then it is optional and uses snapcore/action-build pinned by a commit sha', () => {
    const snap = stepNamed('snapcore/action-build');
    assert.match(snap, /if: inputs\.target == 'linux' && inputs\.snap == 'true'/);
    assert.match(snap, /uses: snapcore\/action-build@[0-9a-f]{40}/);
  });

  it('when the upload is inspected, then it also carries the Linux release files and the version output covers both targets', () => {
    for (const glob of ['dist/*.deb', 'dist/*.rpm', 'dist/*.tar.gz', 'dist/*.AppImage', 'dist/*.snap']) assert.ok(text.includes(glob), glob);
    assert.match(text, /value: \$\{\{ steps\.package\.outputs\.version \|\| steps\.package-linux\.outputs\.version \}\}/);
  });
});

describe('given a publish job that has not checked out the app repository', () => {
  it('when the release step is read, then it sets GH_REPO to the current repository so gh needs no checkout, and the README says so', () => {
    const text = readFileSync('publish/action.yml', 'utf8');
    const step = text.slice(text.indexOf('- name: Create the release'));
    assert.match(step, /GH_REPO: \$\{\{ github\.repository \}\}/);
    const readme = readFileSync('README.md', 'utf8');
    assert.match(readme, /needs no checkout/i);
  });
});

describe('given artifacts from a build matrix', () => {
  it('when publish/action.yml is read, then it downloads by pattern (default dist*) and merges them into dist', () => {
    const text = readFileSync('publish/action.yml', 'utf8');
    assert.match(text, /\n {2}pattern:\n(?: {4}.*\n)*? {4}default: dist\*/);
    assert.ok(text.includes('pattern: ${{ inputs.pattern }}'));
    assert.ok(text.includes('merge-multiple: true'));
    assert.ok(!text.includes('name: ${{ inputs.artifact-name }}'), 'no single-name download');
  });

  it('when the README is read, then it documents Linux and the matrix artifact names', () => {
    const text = readFileSync('README.md', 'utf8');
    for (const word of ['target: linux', 'dist-linux-arm64', 'pattern', 'ubuntu-24.04-arm', 'snap']) assert.ok(text.includes(word), word);
  });

  it('when the self-test is read, then it builds hello-world on both Linux runners and the check passes actionlint', () => {
    const text = readFileSync('.github/workflows/self-test.yml', 'utf8');
    assert.ok(text.includes('ubuntu-24.04-arm') && text.includes('ubuntu-24.04'));
    assert.ok(text.includes('target: linux'));
  });
});

describe('given a language variant (the locale input)', () => {
  const text = readFileSync('action.yml', 'utf8');
  const stepNamed = (fragment: string): string => steps(text).find((step) => step.includes(fragment)) ?? '';

  it('when action.yml is read, then locale is optional and empty by default', () => {
    assert.match(text, /\n {2}locale:\n(?: {4}.*\n)*? {4}default: ''/);
  });

  it('when the check step runs, then a locale that is not a plain tag (pt-BR, fr, zh-Hant-TW) is refused before anything is built', () => {
    const check = stepNamed('runner and target');
    assert.match(check, /LOCALE: \$\{\{ inputs\.locale \}\}/);
    assert.match(check, /\[A-Za-z\]\{2,3\}/);
    assert.match(check, /exit 1/);
  });

  it('when forge build runs on either target, then the locale is passed as --bundle-locale only when it is set', () => {
    for (const fragment of ['name: Generate sources\n', 'name: Generate sources (Linux)']) {
      const step = stepNamed(fragment);
      assert.match(step, /LOCALE: \$\{\{ inputs\.locale \}\}/, fragment);
      assert.ok(step.includes('${LOCALE:+--bundle-locale "$LOCALE"}'), fragment);
    }
  });

  it('when cmake configures on either target, then FORGE_VARIANT carries the locale (empty means the default package)', () => {
    for (const fragment of ['name: Build\n', 'name: Build (Linux)']) {
      const step = stepNamed(fragment);
      assert.match(step, /LOCALE: \$\{\{ inputs\.locale \}\}/, fragment);
      assert.ok(step.includes('-DFORGE_VARIANT="$LOCALE"'), fragment);
    }
  });

  it('when the macOS files are named, then dmg and zip get the -<tag> suffix and nothing changes without a locale', () => {
    const step = stepNamed('name: Package\n');
    assert.ok(step.includes('suffix="${LOCALE:+-$LOCALE}"'));
    assert.ok(step.includes('${name}-${version}-darwin-arm64${suffix}.dmg'));
    assert.ok(step.includes('${name}-${version}-darwin-arm64${suffix}.zip'));
  });

  it('when the Linux files are named, then every package and the snap get the suffix', () => {
    const packaging = stepNamed('Package deb, rpm, tar.gz and AppImage (Linux)');
    assert.ok(packaging.includes('suffix="${LOCALE:+-$LOCALE}"'));
    assert.ok(packaging.includes('${name}-${version}-linux-${arch}${suffix}".{deb,rpm,tar.gz}'));
    assert.ok(stepNamed('Name the snap (Linux)').includes('suffix="${LOCALE:+-$LOCALE}"'));
  });

  it('when a variant is built, then the language packs are not copied again (the default build publishes them)', () => {
    assert.equal((text.match(/if \[ -z "\$LOCALE" \] && compgen -G/g) ?? []).length, 2);
  });

  it('when the README is read, then it documents the locale input, the file names and the artifact names', () => {
    const readme = readFileSync('README.md', 'utf8');
    for (const word of ['locale: pt-BR', 'FORGE_VARIANT', 'dist-macos-pt-BR', '-pt-BR.dmg', 'variants']) assert.ok(readme.includes(word), word);
  });

  it('when the self-test is read, then it also builds a variant (locale: pt-BR) on macOS and Linux', () => {
    const selfTest = readFileSync('.github/workflows/self-test.yml', 'utf8');
    assert.match(selfTest, /locale: pt-BR/);
    assert.ok(selfTest.includes('macos-latest') && selfTest.includes('dist-macos-pt-BR') && selfTest.includes('dist-linux-x86_64-pt-BR'));
  });
});
