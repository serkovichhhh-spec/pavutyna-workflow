# Task dialog update

SVG attachments, explicit result saving without changing the task lane, owner completion from ready, and accessible task dismissal.

## Release

Publish this frontend together with `task-dialog-update.sql` on the CMO backend. The incremental SQL patches the existing task-tools function with guarded replacements and preserves grants, private Storage access and its size limit. It is transactional and safe to repeat against this function version. Do not rerun the original task-tools bootstrap on an existing database: its policies already exist.

`task-tools.sql` includes the same logic for a fresh installation. Executor result edits still require work permission and the current task version. Completion still requires owner permission, accepted subtasks and approved creative versions.

## Verification

- `npm test`: 37 tests passed.
- `CMO_TEST_NODE_MODULES=<jsdom node_modules path> node tests/task-dialog-dom.mjs`: full-app save, drafts, save conflict, review → ready → done passed.
- Existing creative/Inbox, board and progress DOM checks passed.
- New `tests/task-dialog.sql` and original `tests/task-tools.sql` passed with the incremental patch in rolled-back backend probes. No release applied to the live backend.

Retest SVG physical upload/download and task-header layout on a real phone after publication. Mobile CSS and pointer dismissal are implemented; real-device acceptance remains open.

## Responsive task board

Statuses stay in one horizontal row instead of wrapping below the longest task column. Columns adapt between 220–300 px, fill their tracks, and scroll inside the board. Compact spacing depends on workspace width; phone columns use up to 84vw with proximity snap. Recheck actual geometry at desktop widths 1920, 1366, 1060, 820 and phone widths 390, 320 after publication. Syntax and full-app DOM integration passed; real viewport rendering remains open.
