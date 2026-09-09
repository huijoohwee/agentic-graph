# Production mirror seal refresh

Release verification run `34393215405` reached Pages sync, then rejected the
Git checkout's 22 legacy exact files against the 23-file filesystem seal.
The additional file is the explicitly declared, ignored
`image/knowgrph/.DS_Store`; GitHub checkout does not contain it.

Sync now chooses the existing Git-only seal when no declared live-only file is
present. A filesystem containing the live-only file must still match the full
23-file seal. Missing tracked files, changed bytes, partially retired groups,
and changed live-only bytes remain errors. The source never creates a missing
metadata file or derives an accepted seal from unreviewed runtime input.

Both seals also include the reviewed document update in protected mirror
[PR #62](https://github.com/huijoohwee/huijoohwee/pull/62), merged as
`b7b6c39ce0b5844a43042026a910f7552477c8ff` after Runtime Readiness Gate passed.
Only `docs/agenticgraph-agentic-os-demo.md` changed among these sealed paths;
the diff makes local validation commands portable. Substituting that file's
parent revision reproduces both previous seals exactly, confirming the change
is fully accounted for. Namespace migration preserves this reviewed document
byte-for-byte at its canonical destination before removing the legacy path.

The new Git-only digest is
`602db438f63b1c96b6f859b3476e852696a5882dd3adfb4a6c466bf226633756`;
the filesystem digest is
`6a6d199c005128666b721a983f2c733a9cba2ebb84669e42ed39ba3b9a370da1`.
This source correction grants no production mutation or human authorization.

Validation: 29 existing migration/artifact tests and `ci:integration` passed.
Read-only probes against the protected mirror accepted the 22- and 23-file
inventories and rejected missing tracked files, modified tracked/live-only
bytes, and the previous document bytes. An isolated Git copy passed publish
sync, source-to-mirror parity, Functions compilation and artifact-manifest
creation. All six migrated documents matched their source bytes exactly.
The canonical mirror and its ignored metadata were preserved.
