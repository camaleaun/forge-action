# forge-action

GitHub Actions for [forge](https://github.com/camaleaun/forge) apps.

Status: macOS (arm64 `.dmg` + portable `.zip`) and Linux (x86_64 and arm64: `.deb`, `.rpm`, `.tar.gz`, `.AppImage`, `.snap`). Windows follows the forge targets.

## Build and package

```yaml
jobs:
  build:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: camaleaun/forge-action@v1
        with:
          project-dir: .          # holds package.json, App.tsx and App.css
          forge-ref: trunk        # commit, tag or branch of camaleaun/forge
```

Inputs: `project-dir`, `forge-ref`, `node-version` (default 24), `target` (`macos` default, or `linux`), `snap` (Linux only, default `true`), `artifact-name` (default `dist`). Output: `version`.
The runner must match the target: the action fails early otherwise.
The job uploads `dist/` with `<app>-<version>-darwin-arm64.dmg` and `.zip`. Without signing inputs the app is signed ad-hoc and not notarized (macOS asks the user to confirm on first launch).

## Linux and build matrix

`target: linux` runs on `ubuntu-24.04` (x86_64) and `ubuntu-24.04-arm` (arm64). It installs GTK 4 and the build tools with apt, runs `forge build --target linux`, builds with cmake and packages with CPack plus forge's `scripts/linux-appimage.sh`. Files in `dist/`:
`<app>-<version>-linux-<x86_64|arm64>.deb`, `.rpm`, `.tar.gz`, `.AppImage` and `.snap`, plus the `*.lang` packs of an app with i18n.
The `.snap` is built by `snapcore/action-build` (pinned by commit); pass `snap: false` to skip it.

Artifact names must be unique per job, so give each matrix job its own `artifact-name` (`dist-macos`, `dist-linux-x86_64`, `dist-linux-arm64`):

```yaml
jobs:
  build:
    strategy:
      matrix:
        include:
          - { os: macos-latest, target: macos, artifact: dist-macos }
          - { os: ubuntu-24.04, target: linux, artifact: dist-linux-x86_64 }
          - { os: ubuntu-24.04-arm, target: linux, artifact: dist-linux-arm64 }
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: camaleaun/forge-action@v1
        with:
          target: ${{ matrix.target }}
          artifact-name: ${{ matrix.artifact }}
  publish:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: camaleaun/forge-action/publish@v1   # downloads dist* and merges them
```

## Signing and notarization (optional)
Pass the Apple credentials as inputs and the app and the `.dmg` are signed with a Developer ID, notarized and stapled:

```yaml
      - uses: camaleaun/forge-action@v1
        with:
          macos-certificate-p12: ${{ secrets.MACOS_CERTIFICATE_P12 }}
          macos-certificate-password: ${{ secrets.MACOS_CERTIFICATE_PASSWORD }}
          macos-signing-identity: ${{ secrets.MACOS_SIGNING_IDENTITY }}
          notary-key-p8: ${{ secrets.NOTARY_KEY_P8 }}
          notary-key-id: ${{ secrets.NOTARY_KEY_ID }}
          notary-issuer-id: ${{ secrets.NOTARY_ISSUER_ID }}
```
Needs a paid Apple Developer account. The steps live in forge's `scripts/macos-sign.sh`.

## Publish a release

```yaml
  publish:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: camaleaun/forge-action/publish@v1
```

Input `pattern` (default `dist*`) selects the artifacts to download; all matches are merged (`merge-multiple`) into one release. It replaces the old `artifact-name` input.
It writes `latest.json` (sha256 and URL per platform, read by the app's auto-updater) and creates the release for the tag.
Tags with a hyphen (`v1.0.0-rc.1`) are published as prereleases. Since v1.2.1 the publish action needs no checkout of the app repository (it sets `GH_REPO` for `gh`).

## Tests
`npm test` checks the action metadata; `actionlint` lints the self-test workflow. No npm packages are installed.

## License
MIT
