# Agent Note: Session selection survives a masked gap

Status: implemented

English | [中文](2026-08-23-session-selection-survives-masked-gap.zh.md)

## Problem

`SessionRuntime` projects the current real-Session selection as `list.current`, and mirrors it into the persisted browser cell `dsh.sessions.current` so a reload reopens the same session. The projection defines a "masked gap": a selected id that is momentarily absent from the projected items — during reconnect, a membership refetch, or a composition reload — falls out of `current` but stays held in the manager's in-memory selection, so it resurfaces once the id reappears. The persistence write conflated that gap with an explicit clear: whenever `current` was `undefined` it wrote `{}` into the cell, wiping it. A composition reload (a hot-apply plugin toggle) that transiently masked the selected session therefore erased `dsh.sessions.current`, and the next reload landed on a blank 新会话 — the "chat history disappeared" symptom, even though the session data on disk was intact.

## Decision

`SessionManager` exposes the in-memory selection as a read-only `get selectedId()`: it is `undefined` only after an explicit `clearSelection()` (or before any selection), and stays set while the id is merely masked. `SessionRuntime.projectList` now wipes the persisted cell only when `current === undefined` **and** `this.manager.selectedId === undefined` — an explicit clear. A masked gap (`current === undefined` with the manager still holding the id) leaves the cell alone, so the id resurfaces in the same session and in a later reload.

## Alternatives considered

**Track an explicit `wasCleared` flag beside the selection.** Rejected: the manager's `selected` field already encodes exactly that fact (only `clearSelection()` and construction leave it `undefined`), so a second flag would be redundant lifecycle state to keep synchronized.

**Suppress the wipe only inside known transient windows (reconnect, refetch).** Rejected: the mask can be produced by any projection churn, including composition reloads and host-driven list refreshes; enumerating windows is brittle and leaves the same bug reachable through an unlisted path.

## Consequences

A transient masked gap no longer erases the persisted selection, so a plugin hot-apply or list refetch cannot drop the user onto a blank session. An explicit clear (the new-session affordance) still wipes the cell, and a fresh boot with no prior selection still lands on empty. The restored cell keeps the pre-existing tolerance for a lingering dead id: the projection ignores an absent id, so `current` stays `undefined` with the same UX as a wipe until the id reappears. A focused test pins the kept cell across a mask and its resurfacing, alongside the existing clear-wipes test.
