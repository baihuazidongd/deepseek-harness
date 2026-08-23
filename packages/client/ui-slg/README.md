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
- **Permission chip**: access-mode selector on the input line — reads the same host-computed `permissions` projection and writes through the same `/permission` command as the composer chip; Full access is gated behind the risk confirmation
- **Approvals & questions**: pending tool approvals and ask-user questions take over above the speech bar, answering through the runtime carriers with the same wire encoding as the composer chain (a question outranks an approval)
- **Queue & steering**: sending while busy parks the text in the transient queue (strip with send-now/remove per row); Ctrl/Cmd+Enter steers the live turn on ordinary transports
- **Plan mode**: a `Plan ×` chip on the input line while the session is in plan mode (reads the host-folded `plan` projection, including the pending fold); clicking exits through `/plan off`; deployments without plan-mode render nothing
- **Context ring**: a 14px ring beside the send button fed by the `contextPressure` projection (numerator prefers `projectedTokens`, with the TUI's integer rounding and upper clamp); clicking opens a panel with the token figures and the `contextBreakdown` system/tools/messages composition rows
- **Slash command menu**: a `/` button on the input line pulls the session's host command directory (`remote.commands.list`) with name filtering; commands advertising an input hint refill the draft, bare ones execute directly; the entry disables/hides for subagents or an empty catalog
- **Settings popover**: opens from the avatar or name to rename the streamer and tune danmaku (persisted across remounts and reloads)

## Install

Copy the sentence below and send it to any AI assistant to have it install this for you:

> Please install `@deepseek-ai/dsh-client-ui-slg` (beta v0.2, a live-stream-style room conversation surface) into my DeepSeek Harness web client: put this repository's source under harness `packages/client/ui-slg/`; run `pnpm install` and `pnpm --filter @deepseek-ai/dsh-client-ui-slg bundle`; then install it into the profile with `pnpm dsh plugin --profile web add link:<absolute path to packages/client/ui-slg>` (the package ships its own bundle patch); restart dsh web and hard-refresh the page. Afterwards manage it like any installed plugin: enable/disable from the plugins panel (persists across restarts), remove with `pnpm dsh plugin --profile web remove @deepseek-ai/dsh-client-ui-slg`.

## Model Experience

None, as this package only renders existing session data and forwards user input to the conversation service; it reaches no model request and adds no session event.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- The seven portraits load from the Web shell public dir via absolute URLs (`/portraits/*.png`).
- Replacing the `conversation` slot removes the resident composer and its extra seats (plan, input docks); the room ships its own input line, so sessions can still send.
