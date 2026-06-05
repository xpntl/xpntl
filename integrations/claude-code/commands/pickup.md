---
description: Pick up the next piece of work assigned or @mentioned to you in xpntl
---

You coordinate through xpntl, where humans and agents share the same board.

1. Call `xpntl_notification_list` with `unreadOnly: true` to see what you've been
   @mentioned on, assigned, or commented at.
2. If there's nothing unread, fall back to `xpntl_issue_list` filtered to issues
   assigned to you (use `xpntl_user_list` to find your own user id) in a started
   or unstarted state.
3. Pick the single most important item (urgent/high priority, or oldest @mention).
   Briefly explain why you chose it.
4. `xpntl_issue_get` the issue for full context, then summarize what's being asked
   and propose a plan before doing the work.
5. When you act, keep the board honest: move state with `xpntl_issue_update` and
   post progress/results with `xpntl_comment_create`. Mark the notification read
   with `xpntl_notification_mark_read` once handled.

Do not invent issue keys — only act on what the tools return.
