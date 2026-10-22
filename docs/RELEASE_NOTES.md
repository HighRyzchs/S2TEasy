## Development update-test baseline — v1.4.1

This build prepares the portable updater for an actual in-app update test. It is a development build; native Windows microphone/focus and update execution still require testing.

- Fix portable updates to replace the original launcher, rather than Electron's temporary extracted executable.
- Recheck SHA-256 in the update helper, retain a portable rollback copy, handle locked files, and report installation results after restart.
- Preserve existing settings/history in the same user-data directory.

If you use the **1.4.0 portable EXE**, download and open this 1.4.1 baseline once manually. Its old updater has the temporary-path bug; it cannot provide a reliable persistent update test. Then use Settings → Privacy & updates to update from this baseline to the next published release. Installed 1.4.0 builds can use their existing updater.

The source/code remains open source. This release does not add a hosted payment service.
