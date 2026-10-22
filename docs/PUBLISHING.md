# Publishing S2Teasy

## Public repository

The project lives at https://github.com/HighRyzchs/S2TEasy. The README, MIT license, contribution guide, code of conduct, issue templates, pull request template, security policy, source, and project website are committed together.

`private: true` in package.json only prevents accidentally publishing this desktop app to npm. It does not make the GitHub repository private.

## Project website

The Pages URL is https://highryzchs.github.io/S2TEasy/. GitHub Pages must have **Settings → Pages → Build and deployment → Source → GitHub Actions** selected. The repository owner enabled this during initial publication.

Changes under `docs/` on `main` run the **Publish project website** workflow. The workflow can also be run manually from Actions. It uploads the static website and assets, then deploys to the `github-pages` environment. A successful deployment provides its URL in the Actions run. An initial deployment failed before Pages was enabled; this is separate from the current deployment outcome.

The connected integration can push source and run workflows, but GitHub rejected attempts to edit the repository's About metadata or enable private vulnerability reporting. Those are owner settings. If desired, add the Pages URL to About and enable private reporting under the repository security settings. No personal access token needs to be shared in chat.

## Windows development builds

A push to `main` runs **Build Windows EXE**. The Ubuntu job runs installation, tests, and type checks using Node 22. After it passes, Windows builds a portable EXE and NSIS installer. Download the **S2Teasy-windows** artifact from a successful run; GitHub requires sign-in for workflow artifacts.

A successful compiler/packager run does not establish real microphone, focus, paste, or recognition behavior. Complete WINDOWS_TESTING.md before describing a build as release-ready. No stable release is published by an ordinary push.

## Tagged releases

1. Run the Windows checklist and inspect the resulting binaries. Use synthetic recordings and never put API keys or private audio in release evidence.
2. Choose and update the package version, keep the lockfile root version consistent, and commit the change. Use a prerelease version until native behavior is verified.
3. Tag the reviewed commit with its matching `v...` version and push the tag. The existing **Release Windows** workflow builds and publishes the executables. Review its release settings before using it for a prerelease.
4. Arrange Windows signing and verify release assets and SHA-256 digests. The in-app updater refuses a binary with a missing or mismatched GitHub SHA-256 digest.

Cloud environment publication is separate from GitHub source publication, Pages deployment, and executable releases. Saving an environment draft does not perform any of those actions.
