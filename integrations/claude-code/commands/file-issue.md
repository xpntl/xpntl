---
description: File a well-formed xpntl issue from the current context (bug, task, or feature)
argument-hint: [short description of the issue]
---

Create an xpntl issue capturing: $ARGUMENTS

Before creating it:
1. Call `xpntl_project_list` and `xpntl_workflow_state_list` so you use a real
   project and a valid triage/backlog state id.
2. Write a clear title and a markdown description with context, repro/steps or
   acceptance criteria, and any relevant file references from this session.
3. Choose a sensible `type` (bug/task/feature) and `priority`.

Then call `xpntl_issue_create`. Report back the new issue key and a one-line
summary. If something is ambiguous (which project, priority), ask first rather
than guessing.
