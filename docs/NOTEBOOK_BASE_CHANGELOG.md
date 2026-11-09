# Notebook base changelog

The notebook base is the set of files in `notebook-base.manifest` (under
`notebook-base/`), synced into notebook workshops by
`scripts/sync-notebook-base.ts` (workspace). Its version line is independent
of the shared base's (`docs/BASE_CHANGELOG.md`).

## notebook-base-v2 (2026-11-08)

`validate-notebook-base.yml` picks its runner from the organization variable `LWC_RUNNER`: `runs-on: ${{ vars.LWC_RUNNER || 'ubuntu-latest' }}`. The org sets `LWC_RUNNER = lwc-small` for private repositories only, so private notebook workshops run on the shared runner set; a repo without the variable runs on GitHub-hosted runners as before. Ships alongside base-v41, which makes the same change to the shared base's workflows.

## notebook-base-v1

The first notebook base; no entry was written when it was cut.
