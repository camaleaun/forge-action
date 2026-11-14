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
The job uploads `dist/` with `<app>-<version>-darwin-arm64.dmg` and `.zip`. The app is ad-hoc signed, not notarized.

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
