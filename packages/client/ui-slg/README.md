# @deepseek-ai/dsh-client-ui-slg · beta v0.2

English | [中文](README.zh.md)

Turns the DeepSeek Harness conversation surface into a live-stream-style room. This package registers into the frame's `conversation` slot at a shadowing priority, replacing the default chat thread outright (no extra tab); disabling the package restores the default chat view.

## Features

- **Stream frame**: host card (avatar, editable streamer name, LIVE badge, room title) + `tok used` badge + danmaku/gift toggles + model switcher (with reasoning effort)
- **Portrait reactions**: seven emotion portraits and six invisible tap zones that swap the expression and route a reaction line
- **Danmaku system**: display region (top/middle/bottom), density, opacity, font size, speed, and a stack/no-stack toggle
- **Gift danmaku**: tool calls fly across as "tipped" danmaku instead of a bottom float
- **Chat log**: Markdown rendering, expandable tool details (arguments + result), summarized thinking (collapsed when long, expandable), auto-scroll to bottom + a back-to-bottom button
- **Speech bar + input line**: visual-novel subtitle with send/stop
- **Settings popover**: opens from the avatar or name to rename the streamer and tune danmaku

## Install

Copy the sentence below and send it to any AI assistant to have it install this for you:

> Please install `@deepseek-ai/dsh-client-ui-slg` (beta v0.2, a live-stream-style room conversation surface) into my DeepSeek Harness web client: put this repository's source under harness `packages/client/ui-slg/`; register `- id: ui-slg`, `name: '@deepseek-ai/dsh-client-ui-slg'` at the end of the client plugin list in `packages/bundle/web-app/cordis.patch.yml`; add the dependency `"@deepseek-ai/dsh-client-ui-slg": "workspace:^"` to `packages/bundle/web-app/package.json`; then run `pnpm install`, `pnpm --filter @deepseek-ai/dsh-client-ui-slg bundle`, restart dsh web, and hard-refresh the page.

## Model Experience

None. This package only renders existing session data and forwards user input to the conversation service; it reaches no model request and adds no session event.

## Known Limitations

- The seven portraits load from the Web shell public dir via absolute URLs (`/portraits/*.png`).
- The streamer name and danmaku settings are local session state and are not persisted across sessions.
- Replacing the `conversation` slot removes the resident composer and its extra seats (plan, input docks); the room ships its own input line, so sessions can still send.
