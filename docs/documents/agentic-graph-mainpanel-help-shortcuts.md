# agentic-graph MainPanel Help Shortcuts

Editable MainPanel Help shortcut Values used by KTV rows.

Keep `Key` aligned to the Help shortcut text key in source. Keep `Type` aligned to the shared MainPanel Help Icon Library. Keep `Value` concise for the MainPanel Help KTV row. Put longer explanatory copy in `Details`.

| Key | Type | Value | Details |
| --- | --- | --- | --- |
| precedence.space-pan | ktv.type.static | Space pans | When Space is held, pointer drag pans the viewport and selection actions are suppressed. |
| precedence.wheel-zoom | ktv.type.static | Wheel zoom rules | In the default preset, wheel zooms. In the design preset, Cmd/Ctrl + wheel zooms; plain wheel pans. |
| precedence.modifiers-marquee | ktv.type.static | Marquee modifiers | Shift adds to selection; Alt removes; no modifier replaces. |
| xr.object-choreography | floatingPanel.animation | Shared object choreography | Selected cast lane marks reuse normalized WASD/arrow movement; Shift uses the shared fine-motion profile and hold uses frame-rate-independent motion. |
| xr.camera-framing | floatingPanel.camera | Shared Camera framing | With Camera open and no Camera mark selected, WASD/arrows orbit shared framing; Shift uses the shared fine-orbit profile. |
| xr.camera-choreography | floatingPanel.camera | Shared Camera choreography | With a Camera lane mark selected, WASD/arrows update that mark instead of changing the framing camera. |
| other.included | ktv.type.action | Included shortcut | Included in the Help shortcut bundle. |
