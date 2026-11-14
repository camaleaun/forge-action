# forge-action

GitHub Actions for [forge](https://github.com/camaleaun/forge) apps.

Status: macOS runners only (arm64 `.dmg` + portable `.zip`). Linux and Windows follow the forge targets.

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

Inputs: `project-dir`, `forge-ref`, `node-version` (default 24), `artifact-name` (default `dist`). Output: `version`.
The job uploads `dist/` with `<app>-<version>-darwin-arm64.dmg` and `.zip`. Without signing inputs the app is signed ad-hoc and not notarized (macOS asks the user to confirm on first launch).

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

It writes `latest.json` (sha256 and URL per platform, read by the app's auto-updater) and creates the release for the tag.
Tags with a hyphen (`v1.0.0-rc.1`) are published as prereleases.

## Tests
`npm test` checks the action metadata; `actionlint` lints the self-test workflow. No npm packages are installed.

## License
MIT
