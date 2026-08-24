# @deepseek-ai/dsh-client-ui-message-jump

English | [中文](README.zh.md)

Message-jump plugin, browser half: a single session-header control in `conversation.session.header.actions` that jumps the conversation scroll between the user's own sent messages — the Codex-style "where did I say that" navigation. It ships as a user-installed library plugin (installed into the profile with `dsh plugin add`, never a `web-app` bundle row), so the plugin manager classifies it as `library`.

The control is a strip of numbered cells, one per message you sent, showing at most five at a time: with more messages, the mouse wheel over the control pages the visible window back and forth without scrolling the conversation beneath; hovering or keyboard-focusing a cell previews that message's text in a bubble (image-only and other non-text messages show placeholder copy); clicking a cell scrolls the conversation to that message row. The cell for the message currently at the top of the conversation viewport stays highlighted, and the window follows along when the active message leaves the visible cells. Ordinary user messages and in-turn steering messages count; injected `context` does not. The refs come from the live chat snapshot the framework `useSession` hook exposes, and the jump targets come from the rendered flow rows inside the `[data-conversation-scroll]` scrollport the chat view owns — the header is that scrollport's sibling, so jumping is a direct scroll write with no conversation service in between. Clicking jumps the scrollport so the target message sits just below the top edge; the highlight follows the scrollport's scroll events.

The package owns no conversation state and no refresh chain: it reads the chat snapshot and scrolls the scrollport only. It renders nothing while the session has no user messages. Because it only scrolls the chat view's rendered flow, the control is a no-op when a non-chat view (for example the trajectory view) is active — the user rows simply are not in the DOM.

## Model Experience

No model-visible effect. The control reads the already-assembled chat snapshot and writes only the browser scroll position; no prompt content, request, or session event is produced.

#### KV Cache effect

None — no request is issued, so provider-side cache reuse is untouched.

## Known Limitations and Deferred Work

- **Requires the chat view to be mounted** — the jump targets are the chat flow rows, so switching away from the default Chat view leaves nothing to scroll to; the control degrades to a no-op rather than forcing a view change.
- **Works inside the loaded window only** — older pages not yet loaded through `loadOlder` are not counted or jumpable.
