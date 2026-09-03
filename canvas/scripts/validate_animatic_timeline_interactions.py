#!/usr/bin/env python3
from __future__ import annotations

import os
import re
import sys
from pathlib import Path
from typing import Callable

from playwright.sync_api import Page, TimeoutError as PlaywrightTimeoutError, sync_playwright


APP_URL = os.environ.get("AG_ANIMATIC_TIMELINE_URL", "http://localhost:5172/")
SCREENSHOT_PATH = Path(
    os.environ.get(
        "AG_ANIMATIC_TIMELINE_SCREENSHOT",
        "/tmp/agentic-graph-animatic-timeline-interactions.png",
    )
)

WIDE_TIMELINE_MARKDOWN = """---
title: Wide Timeline Interaction Demo
kgCanvasSurfaceMode: "2d"
kgCanvasRenderMode: "2d"
kgCanvas2dRenderer: "animatic"
kgDocumentSemanticMode: "document"
kgFrontmatterModeEnabled: true
kgMultiDimTableModeEnabled: false
kgDocumentStructureBaselineLock: false
flow:
  direction: LR
  edgeType: smoothstep
  nodes:
    - id: NODE_TIMELINE
      type: Timeline
      label: Beat Timeline
    - id: NODE_CLIP_01
      type: Clip
      label: Hook Clip
      params:
        beat_ref: beat_01
    - id: WIDGET_01
      type: Overlay
      label: Hook Overlay
      params:
        beat_ref: beat_01
    - id: NODE_AUDIO_02
      type: Audio
      label: Problem Voiceover
      params:
        beat_ref: beat_02
    - id: NODE_SCENE_03
      type: Scene
      label: Proof Scene
      params:
        beat_ref: beat_03
    - id: NODE_CTA_04
      type: Overlay
      label: CTA Overlay
      params:
        beat_ref: beat_04
timeline:
  beats:
    beat_01:
      label: Hook
      start_ms: 0
      end_ms: 4000
    beat_02:
      label: Problem
      start_ms: 4000
      end_ms: 9000
    beat_03:
      label: Proof
      start_ms: 9000
      end_ms: 15000
    beat_04:
      label: CTA
      start_ms: 15000
      end_ms: 19000
    beat_05:
      label: Expand
      start_ms: 26000
      end_ms: 31000
    beat_06:
      label: Detail
      start_ms: 31000
      end_ms: 37000
    beat_07:
      label: Close
      start_ms: 37000
      end_ms: 43000
    beat_08:
      label: Outro
      start_ms: 43000
      end_ms: 49000
---

# Wide Timeline Interaction Demo
"""

INSERT_BEAT_MARKDOWN = """---
title: Insert Beat Interaction Demo
kgCanvasSurfaceMode: "2d"
kgCanvasRenderMode: "2d"
kgCanvas2dRenderer: "animatic"
kgDocumentSemanticMode: "document"
kgFrontmatterModeEnabled: true
kgMultiDimTableModeEnabled: false
kgDocumentStructureBaselineLock: false
flow:
  direction: LR
  edgeType: smoothstep
  nodes:
    - id: NODE_TIMELINE
      type: Timeline
      label: Beat Timeline
    - id: NODE_AUDIO_02
      type: Audio
      label: Problem Voiceover
      params:
        beat_ref: beat_02
    - id: NODE_SCENE_03
      type: Scene
      label: Proof Scene
      params:
        beat_ref: beat_03
    - id: NODE_CTA_04
      type: Overlay
      label: CTA Overlay
      params:
        beat_ref: beat_04
timeline:
  beats:
    beat_01:
      label: Hook
      start_ms: 0
      end_ms: 4000
    beat_02:
      label: Problem
      start_ms: 4000
      end_ms: 9000
    beat_03:
      label: Proof
      start_ms: 9000
      end_ms: 15000
    beat_04:
      label: CTA
      start_ms: 15000
      end_ms: 19000
---

# Insert Beat Interaction Demo
"""

DELETE_BEAT_MARKDOWN = """---
title: Delete Beat Interaction Demo
kgCanvasSurfaceMode: "2d"
kgCanvasRenderMode: "2d"
kgCanvas2dRenderer: "animatic"
kgDocumentSemanticMode: "document"
kgFrontmatterModeEnabled: true
kgMultiDimTableModeEnabled: false
kgDocumentStructureBaselineLock: false
flow:
  direction: LR
  edgeType: smoothstep
  nodes:
    - id: NODE_TIMELINE
      type: Timeline
      label: Beat Timeline
    - id: NODE_CLIP_01
      type: Clip
      label: Hook Clip
      params:
        beat_ref: beat_01
    - id: NODE_AUDIO_02
      type: Audio
      label: Problem Voiceover
      params:
        beat_ref: beat_02
    - id: NODE_SCENE_03
      type: Scene
      label: Proof Scene
      params:
        beat_ref: beat_03
    - id: NODE_CTA_04
      type: Overlay
      label: CTA Overlay
      params:
        beat_ref: beat_04
timeline:
  beats:
    beat_01:
      label: Hook
      start_ms: 0
      end_ms: 4000
    beat_02:
      label: Problem
      start_ms: 4000
      end_ms: 9000
    beat_03:
      label: Proof
      start_ms: 9000
      end_ms: 15000
    beat_04:
      label: CTA
      start_ms: 15000
      end_ms: 19000
    beat_05:
      label: Empty
      start_ms: 19000
      end_ms: 20000
    beat_06:
      label: Expand
      start_ms: 20000
      end_ms: 25000
---

# Delete Beat Interaction Demo
"""

DUPLICATE_BEAT_MARKDOWN = """---
title: Duplicate Beat Interaction Demo
kgCanvasSurfaceMode: "2d"
kgCanvasRenderMode: "2d"
kgCanvas2dRenderer: "animatic"
kgDocumentSemanticMode: "document"
kgFrontmatterModeEnabled: true
kgMultiDimTableModeEnabled: false
kgDocumentStructureBaselineLock: false
flow:
  direction: LR
  edgeType: smoothstep
  nodes:
    - id: NODE_TIMELINE
      type: Timeline
      label: Beat Timeline
    - id: NODE_AUDIO_02
      type: Audio
      label: Problem Voiceover
      params:
        beat_ref: beat_02
    - id: NODE_CTA_03
      type: Overlay
      label: CTA Overlay
      params:
        beat_ref: beat_03
timeline:
  beats:
    beat_01:
      label: Hook
      start_ms: 0
      end_ms: 4000
    beat_02:
      label: Proof
      start_ms: 4000
      end_ms: 9000
    beat_03:
      label: CTA
      start_ms: 9000
      end_ms: 12000
---

# Duplicate Beat Interaction Demo
"""

SPLIT_BEAT_MARKDOWN = """---
title: Split Beat Interaction Demo
kgCanvasSurfaceMode: "2d"
kgCanvasRenderMode: "2d"
kgCanvas2dRenderer: "animatic"
kgDocumentSemanticMode: "document"
kgFrontmatterModeEnabled: true
kgMultiDimTableModeEnabled: false
kgDocumentStructureBaselineLock: false
flow:
  direction: LR
  edgeType: smoothstep
  nodes:
    - id: NODE_TIMELINE
      type: Timeline
      label: Beat Timeline
    - id: NODE_AUDIO_02
      type: Audio
      label: Problem Voiceover
      params:
        beat_ref: beat_02
timeline:
  beats:
    beat_01:
      label: Hook
      start_ms: 0
      end_ms: 4000
    beat_02:
      label: Proof
      start_ms: 4000
      end_ms: 9000
    beat_03:
      label: CTA
      start_ms: 9000
      end_ms: 12000
---

# Split Beat Interaction Demo
"""

MERGE_BEAT_MARKDOWN = """---
title: Merge Beat Interaction Demo
kgCanvasSurfaceMode: "2d"
kgCanvasRenderMode: "2d"
kgCanvas2dRenderer: "animatic"
kgDocumentSemanticMode: "document"
kgFrontmatterModeEnabled: true
kgMultiDimTableModeEnabled: false
kgDocumentStructureBaselineLock: false
flow:
  direction: LR
  edgeType: smoothstep
  nodes:
    - id: NODE_TIMELINE
      type: Timeline
      label: Beat Timeline
    - id: NODE_CTA_03
      type: Overlay
      label: CTA Overlay
      params:
        beat_ref: beat_03
timeline:
  beats:
    beat_01:
      label: Hook
      start_ms: 0
      end_ms: 4000
    beat_02:
      label: Empty
      start_ms: 4000
      end_ms: 7000
    beat_03:
      label: CTA
      start_ms: 7000
      end_ms: 9000
---

# Merge Beat Interaction Demo
"""

REMOVE_GAP_MARKDOWN = """---
title: Remove Gap Interaction Demo
kgCanvasSurfaceMode: "2d"
kgCanvasRenderMode: "2d"
kgCanvas2dRenderer: "animatic"
kgDocumentSemanticMode: "document"
kgFrontmatterModeEnabled: true
kgMultiDimTableModeEnabled: false
kgDocumentStructureBaselineLock: false
flow:
  direction: LR
  edgeType: smoothstep
  nodes:
    - id: NODE_TIMELINE
      type: Timeline
      label: Beat Timeline
    - id: NODE_AUDIO_02
      type: Audio
      label: Problem Voiceover
      params:
        beat_ref: beat_02
    - id: NODE_CTA_03
      type: Overlay
      label: CTA Overlay
      params:
        beat_ref: beat_03
timeline:
  beats:
    beat_01:
      label: Hook
      start_ms: 0
      end_ms: 4000
    beat_02:
      label: Proof
      start_ms: 5500
      end_ms: 9000
    beat_03:
      label: CTA
      start_ms: 9000
      end_ms: 12000
---

# Remove Gap Interaction Demo
"""

LANE_CONTROLS_MARKDOWN = """---
title: Lane Controls Interaction Demo
kgCanvasSurfaceMode: "2d"
kgCanvasRenderMode: "2d"
kgCanvas2dRenderer: "animatic"
kgDocumentSemanticMode: "document"
kgFrontmatterModeEnabled: true
kgMultiDimTableModeEnabled: false
kgDocumentStructureBaselineLock: false
flow:
  direction: LR
  edgeType: smoothstep
  nodes:
    - id: NODE_TIMELINE
      type: Timeline
      label: Beat Timeline
    - id: NODE_CLIP_01
      type: Clip
      label: Hook Clip
      params:
        beat_ref: beat_01
    - id: NODE_AUDIO_01
      type: Audio
      label: Hook Audio
      params:
        beat_ref: beat_01
    - id: WIDGET_01
      type: Overlay
      label: Hook Overlay
      params:
        beat_ref: beat_01
timeline:
  beats:
    beat_01:
      label: Hook
      start_ms: 0
      end_ms: 4000
---

# Lane Controls Interaction Demo
"""

BEAT_TIMESTAMP_PATTERN = re.compile(r"(beat_\d+).*?(\d{2}:\d{2}\.\d{2}) -> (\d{2}:\d{2}\.\d{2})")


def evaluate(page: Page, script: str, arg: object | None = None) -> object:
    if arg is None:
        return page.evaluate(script)
    return page.evaluate(script, arg)


def apply_markdown_document(page: Page, name: str, text: str) -> None:
    evaluate(
        page,
        """
        async ({ name, text }) => {
          if (typeof window.agenticGraphWorkspaceCommand !== 'object') {
            throw new Error('window.agenticGraphWorkspaceCommand is unavailable');
          }
          await window.agenticGraphWorkspaceCommand.applyMarkdownDocument({
            name,
            text,
            applyToGraph: true,
            forceApplyToGraph: true,
            applyViewPreset: true,
            canvasRenderMode: '2d',
            canvas2dRenderer: 'animatic',
            documentSemanticMode: 'document',
            frontmatterModeEnabled: true,
            workspaceViewMode: 'canvas',
            workspaceCanvasPaneOpen: true,
          });
          return true;
        }
        """,
        {"name": name, "text": text},
    )
    page.wait_for_selector(".timeline-editor")


def read_timeline_state(page: Page) -> dict[str, object]:
    return evaluate(
        page,
        """
        () => {
          const scrollEl = document.querySelector('.timeline-editor');
          const beatOptions = [...document.querySelectorAll('[aria-label="Animatic timeline beats"] [role="option"]')];
          const ctaBeat = beatOptions.find(option => option.textContent?.includes('beat_04'));
          return {
            scrollLeft: scrollEl?.scrollLeft ?? 0,
            scrollWidth: scrollEl?.scrollWidth ?? 0,
            clientWidth: scrollEl?.clientWidth ?? 0,
            ctaText: ctaBeat?.textContent?.replace(/\\s+/g, ' ').trim() ?? null,
            beatTexts: beatOptions.map(option => option.textContent?.replace(/\\s+/g, ' ').trim() ?? ''),
            moveButtonExists: !![...document.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === 'Move CTA'),
            resizeButtonExists: !![...document.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === 'Resize CTA end'),
          };
        }
        """,
    )


def drag_button_to_right_edge(
    page: Page,
    button_name: str,
    hold_ms: float,
    state_reader: Callable[[Page], dict[str, object]] | None = None,
) -> dict[str, object]:
    read_state = state_reader or read_timeline_state
    timeline = page.locator(".timeline-editor")
    button = page.get_by_role("button", name=button_name, exact=True)
    timeline_box = timeline.bounding_box()
    button_box = button.bounding_box()
    if timeline_box is None or button_box is None:
        raise AssertionError(f"missing bounding box for {button_name}")
    start_x = button_box["x"] + button_box["width"] / 2
    start_y = button_box["y"] + button_box["height"] / 2
    edge_x = timeline_box["x"] + timeline_box["width"] - 8
    page.mouse.move(start_x, start_y)
    page.mouse.down()
    page.mouse.move(edge_x, start_y, steps=8)
    page.wait_for_timeout(hold_ms)
    during_hold_state = read_state(page)
    page.mouse.up()
    page.wait_for_timeout(200)
    after_release_state = read_state(page)
    return {
        "during_hold": during_hold_state,
        "after_release": after_release_state,
    }


def assert_edge_hold_autoscroll(interaction_name: str, result: dict[str, object], initial_state: dict[str, object]) -> None:
    during_hold = result["during_hold"]
    if during_hold["scrollLeft"] <= initial_state["scrollLeft"]:
        raise AssertionError(f"{interaction_name}: expected scrollLeft to increase during edge hold, got {during_hold['scrollLeft']}")


def assert_resize_commit(result: dict[str, object], initial_state: dict[str, object]) -> None:
    after_release = result["after_release"]
    if after_release["ctaText"] == initial_state["ctaText"]:
        raise AssertionError("resize: expected CTA beat timing text to change after release")


def read_lane_item_state(page: Page, item_title: str, beat_ref: str) -> dict[str, object]:
    return evaluate(
        page,
        """
        ({ itemTitle, beatRef }) => {
          const article = [...document.querySelectorAll('article.timeline-editor-action')].find(
            node => node.textContent?.includes(itemTitle)
          );
          const beatOption = [...document.querySelectorAll('[aria-label="Animatic timeline beats"] [role="option"]')].find(
            option => option.textContent?.includes(beatRef)
          );
          const rect = article?.getBoundingClientRect();
          return {
            width: rect?.width ?? null,
            x: rect?.x ?? null,
            beatText: beatOption?.textContent?.replace(/\\s+/g, ' ').trim() ?? null,
            resizeButtonExists: !![...document.querySelectorAll('button')].find(
              button => button.getAttribute('aria-label') === `Resize ${itemTitle} end`
            ),
          };
        }
        """,
        {"itemTitle": item_title, "beatRef": beat_ref},
    )


def assert_lane_item_resize_commit(
    result: dict[str, object],
    initial_state: dict[str, object],
    item_title: str,
) -> None:
    after_release = result["after_release"]
    if after_release["width"] == initial_state["width"] and after_release["beatText"] == initial_state["beatText"]:
        raise AssertionError(f"resize: expected {item_title} lane item timing to change after release")


def find_beat_option(page: Page, beat_ref: str) -> object:
    return page.locator('[aria-label="Animatic timeline beats"] [role="option"]').filter(has_text=beat_ref).first


def hover_beat_option(page: Page, beat_ref: str) -> object:
    beat_option = find_beat_option(page, beat_ref)
    beat_option.hover()
    page.wait_for_timeout(120)
    return beat_option


def click_quick_action(button: object) -> None:
    button.evaluate("(element) => element.click()")


def parse_timestamp_ms(value: str) -> int:
    minute_text, remainder = value.split(":")
    second_text, centisecond_text = remainder.split(".")
    return (int(minute_text) * 60 * 1000) + (int(second_text) * 1000) + (int(centisecond_text) * 10)


def parse_beat_entries(state: dict[str, object]) -> list[dict[str, str | int]]:
    beat_entries: list[dict[str, str | int]] = []
    for beat_text in state.get("beatTexts", []):
        text = str(beat_text or "")
        match = BEAT_TIMESTAMP_PATTERN.search(text)
        if match is None:
            continue
        start = match.group(2)
        end = match.group(3)
        beat_entries.append(
            {
                "beatRef": match.group(1),
                "start": start,
                "end": end,
                "startMs": parse_timestamp_ms(start),
                "endMs": parse_timestamp_ms(end),
                "text": text,
            }
        )
    return beat_entries


def read_runtime_command_state(page: Page) -> dict[str, object]:
    return evaluate(
        page,
        """
        () => {
          if (typeof window.agenticGraphWorkspaceCommand !== 'object') {
            throw new Error('window.agenticGraphWorkspaceCommand is unavailable');
          }
          return window.agenticGraphWorkspaceCommand.readState();
        }
        """,
    )


def read_lane_state(page: Page) -> dict[str, object]:
    return evaluate(
        page,
        """
        () => {
          const laneRoot = document.querySelector('[aria-label="Animatic timeline lanes"]');
          const laneRows = laneRoot ? [...laneRoot.children] : [];
          const readLaneButtonState = label => {
            const button = [...document.querySelectorAll('button')].find(entry => entry.getAttribute('aria-label') === label);
            return button
              ? {
                  exists: true,
                  disabled: button.hasAttribute('disabled'),
                }
              : {
                  exists: false,
                  disabled: null,
                };
          };
          const lanes = laneRows.map(row => {
            const labelNode = row.querySelector('[title^="Tab to focus "]');
            const label = labelNode?.textContent?.replace(/\\s+/g, ' ').trim() ?? '';
            return {
              label,
              text: row.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
              hiddenText: labelNode?.className?.includes('line-through') ?? false,
              labelClassName: labelNode?.className ?? '',
            };
          });
          return {
            lanes,
            hideAudio: readLaneButtonState('Hide Audio'),
            showAudio: readLaneButtonState('Show Audio'),
            muteOverlay: readLaneButtonState('Mute Overlay'),
            unmuteOverlay: readLaneButtonState('Unmute Overlay'),
            soloClip: readLaneButtonState('Solo Clip'),
            unsoloClip: readLaneButtonState('Unsolo Clip'),
            moveClipUp: readLaneButtonState('Move Clip up'),
            moveClipDown: readLaneButtonState('Move Clip down'),
            moveOverlayDown: readLaneButtonState('Move Overlay down'),
            moveAudioUp: readLaneButtonState('Move Audio up'),
            moveAudioDown: readLaneButtonState('Move Audio down'),
            soloFilteredCount: [...document.querySelectorAll('.timeline-editor-edit-row')].filter(row => row.textContent?.includes('Solo filtered')).length,
            mutedLaneCount: [...document.querySelectorAll('.timeline-editor-edit-row')].filter(row => row.textContent?.includes('Muted lane')).length,
            laneEmptyCount: [...document.querySelectorAll('.timeline-editor-edit-row')].filter(row => row.textContent?.includes('No ')).length,
          };
        }
        """,
    )


def find_beat_entry(entries: list[dict[str, str | int]], beat_ref: str) -> dict[str, str | int] | None:
    for entry in entries:
        if entry["beatRef"] == beat_ref:
            return entry
    return None


def assert_insert_before_compaction(page: Page) -> dict[str, object]:
    apply_markdown_document(
        page,
        "workspace:/local/agentic-graph-timeline-insert-beat-demo.md",
        INSERT_BEAT_MARKDOWN,
    )
    initial_state = read_timeline_state(page)
    initial_entries = parse_beat_entries(initial_state)
    if len(initial_entries) != 4:
        raise AssertionError(f"insert-before: expected four initial beats, got {initial_entries}")
    click_quick_action(hover_beat_option(page, "beat_02").get_by_role("button", name="Insert beat before Problem", exact=True))
    page.wait_for_timeout(500)
    after_insert_state = read_timeline_state(page)
    after_insert_entries = parse_beat_entries(after_insert_state)
    if len(after_insert_entries) != 5:
        raise AssertionError(f"insert-before: expected five beats after insert, got {after_insert_entries}")
    insert_order = [entry["beatRef"] for entry in after_insert_entries]
    if insert_order[:3] != ["beat_01", "beat_05", "beat_02"]:
        raise AssertionError(f"insert-before: expected beat_05 to appear before beat_02, got {insert_order}")
    initial_target = find_beat_entry(initial_entries, "beat_02")
    inserted = find_beat_entry(after_insert_entries, "beat_05")
    shifted_target = find_beat_entry(after_insert_entries, "beat_02")
    if initial_target is None or inserted is None or shifted_target is None:
        raise AssertionError(f"insert-before: missing mounted beat entries, got {after_insert_entries}")
    if inserted["startMs"] != initial_target["startMs"]:
        raise AssertionError(f"insert-before: expected inserted beat to start at the target boundary, got {inserted}")
    if shifted_target["startMs"] != inserted["endMs"]:
        raise AssertionError(f"insert-before: expected inserted beat to end where beat_02 now starts, got {after_insert_entries}")
    shift_ms = int(shifted_target["startMs"]) - int(initial_target["startMs"])
    if shift_ms <= 0:
        raise AssertionError(f"insert-before: expected beat_02 to shift forward, got {after_insert_entries}")
    if int(shifted_target["endMs"]) != int(initial_target["endMs"]) + shift_ms:
        raise AssertionError(
            "insert-before: expected beat_02 end to preserve duration after the forward shift, "
            f"got {after_insert_entries}"
        )
    return {
        "initial": initial_state,
        "after_insert": after_insert_state,
    }


def assert_delete_compaction(page: Page) -> dict[str, object]:
    apply_markdown_document(
        page,
        "workspace:/local/agentic-graph-timeline-delete-beat-demo.md",
        DELETE_BEAT_MARKDOWN,
    )
    initial_state = read_timeline_state(page)
    initial_entries = parse_beat_entries(initial_state)
    if len(initial_entries) != 6:
        raise AssertionError(f"delete: expected six initial beats, got {initial_entries}")
    cta_delete_button = hover_beat_option(page, "beat_04").get_by_role(
        "button",
        name="Delete is available only for empty beats",
        exact=True,
    )
    if cta_delete_button.is_disabled() is not True:
        raise AssertionError("delete: expected CTA delete quick action to remain disabled for non-empty beats")
    empty_delete_button = hover_beat_option(page, "beat_05").get_by_role("button", name="Delete Empty", exact=True)
    if empty_delete_button.is_disabled() is True:
        raise AssertionError("delete: expected Empty beat delete quick action to be enabled")
    click_quick_action(empty_delete_button)
    page.wait_for_timeout(500)
    after_delete_state = read_timeline_state(page)
    after_delete_entries = parse_beat_entries(after_delete_state)
    if len(after_delete_entries) != 5:
        raise AssertionError(f"delete: expected five beats after delete, got {after_delete_entries}")
    if find_beat_entry(after_delete_entries, "beat_05") is not None:
        raise AssertionError(f"delete: expected beat_05 to be removed, got {after_delete_entries}")
    initial_empty = find_beat_entry(initial_entries, "beat_05")
    initial_expand = find_beat_entry(initial_entries, "beat_06")
    compacted_expand = find_beat_entry(after_delete_entries, "beat_06")
    if initial_empty is None or initial_expand is None or compacted_expand is None:
        raise AssertionError(f"delete: missing mounted beat entries, got {after_delete_entries}")
    removed_duration_ms = int(initial_empty["endMs"]) - int(initial_empty["startMs"])
    if removed_duration_ms <= 0:
        raise AssertionError(f"delete: expected beat_05 to contribute positive duration, got {initial_empty}")
    if int(compacted_expand["startMs"]) != int(initial_expand["startMs"]) - removed_duration_ms:
        raise AssertionError(f"delete: expected beat_06 to compact backward after delete, got {after_delete_entries}")
    if int(compacted_expand["endMs"]) != int(initial_expand["endMs"]) - removed_duration_ms:
        raise AssertionError(f"delete: expected beat_06 end to compact backward after delete, got {after_delete_entries}")
    return {
        "initial": initial_state,
        "after_delete": after_delete_state,
    }


def assert_duplicate_compaction(page: Page) -> dict[str, object]:
    apply_markdown_document(
        page,
        "workspace:/local/agentic-graph-timeline-duplicate-beat-demo.md",
        DUPLICATE_BEAT_MARKDOWN,
    )
    initial_state = read_timeline_state(page)
    initial_entries = parse_beat_entries(initial_state)
    if len(initial_entries) != 3:
        raise AssertionError(f"duplicate: expected three initial beats, got {initial_entries}")
    click_quick_action(hover_beat_option(page, "beat_02").get_by_role("button", name="Duplicate Proof", exact=True))
    page.wait_for_timeout(500)
    after_duplicate_state = read_timeline_state(page)
    after_duplicate_entries = parse_beat_entries(after_duplicate_state)
    if len(after_duplicate_entries) != 4:
        raise AssertionError(f"duplicate: expected four beats after duplicate, got {after_duplicate_entries}")
    duplicate_order = [entry["beatRef"] for entry in after_duplicate_entries]
    if duplicate_order != ["beat_01", "beat_02", "beat_04", "beat_03"]:
        raise AssertionError(f"duplicate: expected duplicate beat to appear after beat_02, got {duplicate_order}")
    source_entry = find_beat_entry(initial_entries, "beat_02")
    duplicated_entry = find_beat_entry(after_duplicate_entries, "beat_04")
    shifted_following_entry = find_beat_entry(after_duplicate_entries, "beat_03")
    initial_following_entry = find_beat_entry(initial_entries, "beat_03")
    if source_entry is None or duplicated_entry is None or shifted_following_entry is None or initial_following_entry is None:
        raise AssertionError(f"duplicate: missing mounted beat entries, got {after_duplicate_entries}")
    source_duration_ms = int(source_entry["endMs"]) - int(source_entry["startMs"])
    if source_duration_ms <= 0:
        raise AssertionError(f"duplicate: expected source beat to have positive duration, got {source_entry}")
    if int(duplicated_entry["startMs"]) != int(source_entry["endMs"]):
        raise AssertionError(f"duplicate: expected duplicate to start at source end, got {duplicated_entry}")
    if int(duplicated_entry["endMs"]) != int(source_entry["endMs"]) + source_duration_ms:
        raise AssertionError(f"duplicate: expected duplicate to preserve source duration, got {duplicated_entry}")
    if "Copy" not in str(duplicated_entry["text"]):
        raise AssertionError(f"duplicate: expected duplicated beat label to include Copy, got {duplicated_entry}")
    if int(shifted_following_entry["startMs"]) != int(initial_following_entry["startMs"]) + source_duration_ms:
        raise AssertionError(f"duplicate: expected following beat to shift forward by duplicated duration, got {after_duplicate_entries}")
    if int(shifted_following_entry["endMs"]) != int(initial_following_entry["endMs"]) + source_duration_ms:
        raise AssertionError(f"duplicate: expected following beat end to shift forward by duplicated duration, got {after_duplicate_entries}")
    return {
        "initial": initial_state,
        "after_duplicate": after_duplicate_state,
    }


def assert_split_midpoint(page: Page) -> dict[str, object]:
    apply_markdown_document(
        page,
        "workspace:/local/agentic-graph-timeline-split-beat-demo.md",
        SPLIT_BEAT_MARKDOWN,
    )
    initial_state = read_timeline_state(page)
    initial_entries = parse_beat_entries(initial_state)
    if len(initial_entries) != 3:
        raise AssertionError(f"split: expected three initial beats, got {initial_entries}")
    click_quick_action(hover_beat_option(page, "beat_02").get_by_role("button", name="Split Proof at the midpoint", exact=True))
    page.wait_for_timeout(500)
    after_split_state = read_timeline_state(page)
    after_split_entries = parse_beat_entries(after_split_state)
    if len(after_split_entries) != 4:
        raise AssertionError(f"split: expected four beats after split, got {after_split_entries}")
    split_order = [entry["beatRef"] for entry in after_split_entries]
    if split_order != ["beat_01", "beat_02", "beat_04", "beat_03"]:
        raise AssertionError(f"split: expected split beat to appear after beat_02, got {split_order}")
    initial_source_entry = find_beat_entry(initial_entries, "beat_02")
    split_source_entry = find_beat_entry(after_split_entries, "beat_02")
    split_entry = find_beat_entry(after_split_entries, "beat_04")
    following_entry = find_beat_entry(after_split_entries, "beat_03")
    initial_following_entry = find_beat_entry(initial_entries, "beat_03")
    if initial_source_entry is None or split_source_entry is None or split_entry is None or following_entry is None or initial_following_entry is None:
        raise AssertionError(f"split: missing mounted beat entries, got {after_split_entries}")
    if int(split_source_entry["startMs"]) != int(initial_source_entry["startMs"]):
        raise AssertionError(f"split: expected original beat start to stay fixed, got {split_source_entry}")
    if int(split_entry["endMs"]) != int(initial_source_entry["endMs"]):
        raise AssertionError(f"split: expected split beat to preserve original end boundary, got {split_entry}")
    if int(split_source_entry["endMs"]) != int(split_entry["startMs"]):
        raise AssertionError(f"split: expected split boundary continuity between original and part 2, got {after_split_entries}")
    if int(split_source_entry["endMs"]) <= int(split_source_entry["startMs"]):
        raise AssertionError(f"split: expected original segment to retain positive duration, got {split_source_entry}")
    if int(split_entry["endMs"]) <= int(split_entry["startMs"]):
        raise AssertionError(f"split: expected new segment to retain positive duration, got {split_entry}")
    if "Part 2" not in str(split_entry["text"]):
        raise AssertionError(f"split: expected split beat label to include Part 2, got {split_entry}")
    if int(following_entry["startMs"]) != int(initial_following_entry["startMs"]) or int(following_entry["endMs"]) != int(initial_following_entry["endMs"]):
        raise AssertionError(f"split: expected following beat timing to stay unchanged after in-place split, got {after_split_entries}")
    return {
        "initial": initial_state,
        "after_split": after_split_state,
    }


def assert_merge_next(page: Page) -> dict[str, object]:
    apply_markdown_document(
        page,
        "workspace:/local/agentic-graph-timeline-merge-beat-demo.md",
        MERGE_BEAT_MARKDOWN,
    )
    initial_state = read_timeline_state(page)
    initial_entries = parse_beat_entries(initial_state)
    if len(initial_entries) != 3:
        raise AssertionError(f"merge: expected three initial beats, got {initial_entries}")
    disabled_merge_button = hover_beat_option(page, "beat_02").get_by_role(
        "button",
        name="Merge Next is available only when the next beat is empty",
        exact=True,
    )
    if disabled_merge_button.is_disabled() is not True:
        raise AssertionError("merge: expected empty beat merge quick action to stay disabled when the next beat is not empty")
    click_quick_action(hover_beat_option(page, "beat_01").get_by_role("button", name="Merge Hook with next empty beat", exact=True))
    page.wait_for_timeout(500)
    after_merge_state = read_timeline_state(page)
    after_merge_entries = parse_beat_entries(after_merge_state)
    if len(after_merge_entries) != 2:
        raise AssertionError(f"merge: expected two beats after merge, got {after_merge_entries}")
    if find_beat_entry(after_merge_entries, "beat_02") is not None:
        raise AssertionError(f"merge: expected adjacent empty beat to be removed, got {after_merge_entries}")
    merged_entry = find_beat_entry(after_merge_entries, "beat_01")
    following_entry = find_beat_entry(after_merge_entries, "beat_03")
    initial_empty_entry = find_beat_entry(initial_entries, "beat_02")
    initial_following_entry = find_beat_entry(initial_entries, "beat_03")
    if merged_entry is None or following_entry is None or initial_empty_entry is None or initial_following_entry is None:
        raise AssertionError(f"merge: missing mounted beat entries, got {after_merge_entries}")
    if int(merged_entry["endMs"]) != int(initial_empty_entry["endMs"]):
        raise AssertionError(f"merge: expected active beat to extend through merged empty beat window, got {merged_entry}")
    if int(following_entry["startMs"]) != int(initial_following_entry["startMs"]) or int(following_entry["endMs"]) != int(initial_following_entry["endMs"]):
        raise AssertionError(f"merge: expected following beat timing to stay unchanged after merge, got {after_merge_entries}")
    return {
        "initial": initial_state,
        "after_merge": after_merge_state,
    }


def assert_remove_gap(page: Page) -> dict[str, object]:
    apply_markdown_document(
        page,
        "workspace:/local/agentic-graph-timeline-remove-gap-demo.md",
        REMOVE_GAP_MARKDOWN,
    )
    initial_state = read_timeline_state(page)
    initial_entries = parse_beat_entries(initial_state)
    if len(initial_entries) != 3:
        raise AssertionError(f"remove-gap: expected three initial beats, got {initial_entries}")
    disabled_remove_gap_button = hover_beat_option(page, "beat_01").get_by_role(
        "button",
        name="Remove Gap is available only when Hook has a positive leading gap",
        exact=True,
    )
    if disabled_remove_gap_button.is_disabled() is not True:
        raise AssertionError("remove-gap: expected first beat remove-gap quick action to stay disabled without a leading gap")
    initial_target_entry = find_beat_entry(initial_entries, "beat_02")
    initial_following_entry = find_beat_entry(initial_entries, "beat_03")
    previous_entry = find_beat_entry(initial_entries, "beat_01")
    if initial_target_entry is None or initial_following_entry is None or previous_entry is None:
        raise AssertionError(f"remove-gap: missing initial mounted beat entries, got {initial_entries}")
    gap_ms = int(initial_target_entry["startMs"]) - int(previous_entry["endMs"])
    if gap_ms <= 0:
        raise AssertionError(f"remove-gap: expected a positive leading gap before beat_02, got {initial_entries}")
    click_quick_action(
        hover_beat_option(page, "beat_02").get_by_role(
            "button",
            name=f"Remove {gap_ms}ms gap before Proof",
            exact=True,
        )
    )
    page.wait_for_timeout(500)
    after_remove_gap_state = read_timeline_state(page)
    after_remove_gap_entries = parse_beat_entries(after_remove_gap_state)
    if len(after_remove_gap_entries) != 3:
        raise AssertionError(f"remove-gap: expected beat count to stay unchanged, got {after_remove_gap_entries}")
    compacted_target_entry = find_beat_entry(after_remove_gap_entries, "beat_02")
    compacted_following_entry = find_beat_entry(after_remove_gap_entries, "beat_03")
    if compacted_target_entry is None or compacted_following_entry is None:
        raise AssertionError(f"remove-gap: missing compacted mounted beat entries, got {after_remove_gap_entries}")
    if int(compacted_target_entry["startMs"]) != int(initial_target_entry["startMs"]) - gap_ms:
        raise AssertionError(f"remove-gap: expected active beat to shift back by removed gap, got {after_remove_gap_entries}")
    if int(compacted_target_entry["endMs"]) != int(initial_target_entry["endMs"]) - gap_ms:
        raise AssertionError(f"remove-gap: expected active beat end to shift back by removed gap, got {after_remove_gap_entries}")
    if int(compacted_following_entry["startMs"]) != int(initial_following_entry["startMs"]) - gap_ms:
        raise AssertionError(f"remove-gap: expected following beat start to shift back by removed gap, got {after_remove_gap_entries}")
    if int(compacted_following_entry["endMs"]) != int(initial_following_entry["endMs"]) - gap_ms:
        raise AssertionError(f"remove-gap: expected following beat end to shift back by removed gap, got {after_remove_gap_entries}")
    return {
        "initial": initial_state,
        "after_remove_gap": after_remove_gap_state,
    }


def assert_lane_controls_restore(page: Page) -> dict[str, object]:
    apply_markdown_document(
        page,
        "workspace:/local/agentic-graph-timeline-lane-controls-demo.md",
        LANE_CONTROLS_MARKDOWN,
    )
    initial_lane_state = read_lane_state(page)
    click_quick_action(page.get_by_role("button", name="Hide Audio", exact=True))
    click_quick_action(page.get_by_role("button", name="Mute Overlay", exact=True))
    page.wait_for_timeout(250)
    muted_lane_state = read_lane_state(page)
    click_quick_action(page.get_by_role("button", name="Solo Clip", exact=True))
    page.wait_for_timeout(500)
    mutated_lane_state = read_lane_state(page)
    runtime_state = read_runtime_command_state(page)
    mutated_markdown_text = str(runtime_state.get("markdownDocumentText") or "")
    if "lane_controls:" not in mutated_markdown_text:
        raise AssertionError(f"lane-controls: expected mutated markdown to persist lane_controls, got {mutated_markdown_text}")
    if "hidden:" not in mutated_markdown_text or "- audio" not in mutated_markdown_text:
        raise AssertionError(f"lane-controls: expected hidden audio persistence, got {mutated_markdown_text}")
    if "muted:" not in mutated_markdown_text or "- overlay" not in mutated_markdown_text:
        raise AssertionError(f"lane-controls: expected muted overlay persistence, got {mutated_markdown_text}")
    if "solo: clip" not in mutated_markdown_text:
        raise AssertionError(f"lane-controls: expected solo clip persistence, got {mutated_markdown_text}")
    if not mutated_lane_state["showAudio"]["exists"]:
        raise AssertionError(f"lane-controls: expected hidden audio lane to expose Show Audio, got {mutated_lane_state}")
    if not mutated_lane_state["unmuteOverlay"]["exists"]:
        raise AssertionError(f"lane-controls: expected muted overlay lane to expose Unmute Overlay, got {mutated_lane_state}")
    if not mutated_lane_state["unsoloClip"]["exists"]:
        raise AssertionError(f"lane-controls: expected solo clip lane to expose Unsolo Clip, got {mutated_lane_state}")
    if int(mutated_lane_state["soloFilteredCount"]) <= 0:
        raise AssertionError(f"lane-controls: expected non-solo lanes to show solo-filtered state, got {mutated_lane_state}")
    muted_overlay_lane = next((lane for lane in muted_lane_state["lanes"] if lane["label"] == "Overlay"), None)
    if muted_overlay_lane is None or "text-slate-400" not in str(muted_overlay_lane["labelClassName"]):
        raise AssertionError(f"lane-controls: expected overlay lane label to carry muted styling before solo is applied, got {muted_lane_state}")
    apply_markdown_document(
        page,
        "workspace:/local/agentic-graph-timeline-lane-controls-demo.md",
        LANE_CONTROLS_MARKDOWN,
    )
    page.wait_for_timeout(300)
    reset_lane_state = read_lane_state(page)
    if not reset_lane_state["hideAudio"]["exists"] or reset_lane_state["showAudio"]["exists"]:
        raise AssertionError(f"lane-controls: expected original markdown reapply to clear hidden state, got {reset_lane_state}")
    if not reset_lane_state["muteOverlay"]["exists"] or reset_lane_state["unmuteOverlay"]["exists"]:
        raise AssertionError(f"lane-controls: expected original markdown reapply to clear muted state, got {reset_lane_state}")
    if not reset_lane_state["soloClip"]["exists"] or reset_lane_state["unsoloClip"]["exists"]:
        raise AssertionError(f"lane-controls: expected original markdown reapply to clear solo state, got {reset_lane_state}")
    if int(reset_lane_state["soloFilteredCount"]) != 0:
        raise AssertionError(f"lane-controls: expected original markdown reapply to clear solo-filtered rows, got {reset_lane_state}")
    apply_markdown_document(
        page,
        "workspace:/local/agentic-graph-timeline-lane-controls-demo.md",
        mutated_markdown_text,
    )
    page.wait_for_timeout(300)
    restored_lane_state = read_lane_state(page)
    if not restored_lane_state["showAudio"]["exists"] or restored_lane_state["hideAudio"]["exists"]:
        raise AssertionError(f"lane-controls: expected hidden audio lane to restore after reapply, got {restored_lane_state}")
    if not restored_lane_state["unmuteOverlay"]["exists"] or restored_lane_state["muteOverlay"]["exists"]:
        raise AssertionError(f"lane-controls: expected muted overlay lane to restore after reapply, got {restored_lane_state}")
    if not restored_lane_state["unsoloClip"]["exists"] or restored_lane_state["soloClip"]["exists"]:
        raise AssertionError(f"lane-controls: expected solo clip lane to restore after reapply, got {restored_lane_state}")
    if int(restored_lane_state["soloFilteredCount"]) <= 0:
        raise AssertionError(f"lane-controls: expected restored lane state to preserve solo-filtered rows, got {restored_lane_state}")
    return {
        "initial": initial_lane_state,
        "muted": muted_lane_state,
        "mutated": mutated_lane_state,
        "reset": reset_lane_state,
        "restored": restored_lane_state,
    }


def assert_lane_order_restore(page: Page) -> dict[str, object]:
    apply_markdown_document(
        page,
        "workspace:/local/agentic-graph-timeline-lane-order-demo.md",
        LANE_CONTROLS_MARKDOWN,
    )
    initial_lane_state = read_lane_state(page)
    initial_lane_order = [str(lane["label"]) for lane in initial_lane_state["lanes"]]
    if initial_lane_order != ["Clip", "Overlay", "Audio"]:
        raise AssertionError(f"lane-order: expected initial lane order Clip, Overlay, Audio, got {initial_lane_order}")
    if initial_lane_state["moveClipUp"]["disabled"] is not True:
        raise AssertionError(f"lane-order: expected top lane Move Clip up to stay disabled, got {initial_lane_state}")
    if initial_lane_state["moveAudioDown"]["disabled"] is not True:
        raise AssertionError(f"lane-order: expected bottom lane Move Audio down to stay disabled, got {initial_lane_state}")
    click_quick_action(page.get_by_role("button", name="Move Audio up", exact=True))
    page.wait_for_timeout(400)
    mutated_lane_state = read_lane_state(page)
    mutated_lane_order = [str(lane["label"]) for lane in mutated_lane_state["lanes"]]
    if mutated_lane_order != ["Clip", "Audio", "Overlay"]:
        raise AssertionError(f"lane-order: expected Audio to move into the middle slot, got {mutated_lane_order}")
    runtime_state = read_runtime_command_state(page)
    mutated_markdown_text = str(runtime_state.get("markdownDocumentText") or "")
    if "lane_order:" not in mutated_markdown_text:
        raise AssertionError(f"lane-order: expected mutated markdown to persist lane_order, got {mutated_markdown_text}")
    if "lane_order:\n    - clip\n    - audio\n    - overlay" not in mutated_markdown_text:
        raise AssertionError(f"lane-order: expected persisted lane order clip,audio,overlay, got {mutated_markdown_text}")
    apply_markdown_document(
        page,
        "workspace:/local/agentic-graph-timeline-lane-order-demo.md",
        LANE_CONTROLS_MARKDOWN,
    )
    page.wait_for_timeout(300)
    reset_lane_state = read_lane_state(page)
    reset_lane_order = [str(lane["label"]) for lane in reset_lane_state["lanes"]]
    if reset_lane_order != ["Clip", "Overlay", "Audio"]:
        raise AssertionError(f"lane-order: expected original markdown reapply to clear lane order mutation, got {reset_lane_order}")
    apply_markdown_document(
        page,
        "workspace:/local/agentic-graph-timeline-lane-order-demo.md",
        mutated_markdown_text,
    )
    page.wait_for_timeout(300)
    restored_lane_state = read_lane_state(page)
    restored_lane_order = [str(lane["label"]) for lane in restored_lane_state["lanes"]]
    if restored_lane_order != ["Clip", "Audio", "Overlay"]:
        raise AssertionError(f"lane-order: expected mutated lane order to restore after markdown reapply, got {restored_lane_order}")
    return {
        "initial": initial_lane_state,
        "mutated": mutated_lane_state,
        "reset": reset_lane_state,
        "restored": restored_lane_state,
    }


def main() -> int:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 960})
        try:
            page.goto(APP_URL, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_function("typeof window.agenticGraphWorkspaceCommand === 'object'")

            apply_markdown_document(
                page,
                "workspace:/local/agentic-graph-timeline-wide-interaction-demo.md",
                WIDE_TIMELINE_MARKDOWN,
            )
            initial_state = read_timeline_state(page)
            if initial_state["scrollWidth"] <= initial_state["clientWidth"]:
                raise AssertionError(f"expected overflowed timeline, got {initial_state}")
            if not initial_state["moveButtonExists"] or not initial_state["resizeButtonExists"]:
                raise AssertionError(f"expected CTA move/resize controls, got {initial_state}")

            move_result = drag_button_to_right_edge(page, "Move CTA", 420)
            assert_edge_hold_autoscroll("move", move_result, initial_state)

            apply_markdown_document(
                page,
                "workspace:/local/agentic-graph-timeline-wide-interaction-demo.md",
                WIDE_TIMELINE_MARKDOWN,
            )
            resize_initial_state = read_timeline_state(page)
            resize_result = drag_button_to_right_edge(page, "Resize CTA end", 420)
            assert_edge_hold_autoscroll("resize", resize_result, resize_initial_state)
            assert_resize_commit(resize_result, resize_initial_state)

            apply_markdown_document(
                page,
                "workspace:/local/agentic-graph-timeline-wide-interaction-demo.md",
                WIDE_TIMELINE_MARKDOWN,
            )
            hook_overlay_initial_state = read_lane_item_state(page, "Hook Overlay", "beat_01")
            if not hook_overlay_initial_state["resizeButtonExists"]:
                raise AssertionError(f"expected Hook Overlay resize handle, got {hook_overlay_initial_state}")
            hook_overlay_resize_result = drag_button_to_right_edge(
                page,
                "Resize Hook Overlay end",
                220,
                lambda current_page: read_lane_item_state(current_page, "Hook Overlay", "beat_01"),
            )
            assert_lane_item_resize_commit(hook_overlay_resize_result, hook_overlay_initial_state, "Hook Overlay")
            insert_result = assert_insert_before_compaction(page)
            delete_result = assert_delete_compaction(page)
            duplicate_result = assert_duplicate_compaction(page)
            split_result = assert_split_midpoint(page)
            merge_result = assert_merge_next(page)
            remove_gap_result = assert_remove_gap(page)
            lane_controls_result = assert_lane_controls_restore(page)
            lane_order_result = assert_lane_order_restore(page)

            page.locator(".timeline-editor").screenshot(path=str(SCREENSHOT_PATH))
            print(
                {
                    "url": APP_URL,
                    "move": move_result,
                    "resize": resize_result,
                    "hook_overlay_resize": hook_overlay_resize_result,
                    "insert_before": insert_result,
                    "delete": delete_result,
                    "duplicate": duplicate_result,
                    "split": split_result,
                    "merge": merge_result,
                    "remove_gap": remove_gap_result,
                    "lane_controls": lane_controls_result,
                    "lane_order": lane_order_result,
                    "screenshot": str(SCREENSHOT_PATH),
                }
            )
            return 0
        except PlaywrightTimeoutError as error:
            print(f"timeout: {error}", file=sys.stderr)
            return 1
        finally:
            browser.close()


if __name__ == "__main__":
    raise SystemExit(main())
