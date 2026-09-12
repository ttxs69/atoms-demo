# Connect and use integrations

- Source: https://help.atoms.dev/en/articles/15112407-connect-and-use-integrations
- Summary: Integrations let you connect external services to your AI building experience.
- Updated: Jul 28, 2026

---

Once connected, agents can use the permissions you authorize to help with tasks such as finding information, summarizing files or tasks, creating follow-ups, updating records, or preparing project handoffs.

Available actions depend on the service, the connector, and the permissions you approve during setup.

## Connect an integration

You can connect an integration from settings.

### From settings

![](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F15112407%2F67f2e81c2ec48ecc-asynccode)

1. Open **Settings**.
2. Select **Connectors** from the left sidebar.
3. Find the connector you want to use.
4. Click **Connect**.
5. In the detail panel, click **\+ Connect**.

![](/api/public/assets?key=uploads%2Fhelpcenters%2Fb609caf5-d676-4b4e-8268-b8d59db1b941%2Fcontent%2Fintercom%2F15112407%2Fb20bb148b9afa954-asynccode)

1. Sign in to the external service if prompted.
2. Review and approve the requested permissions.
3. Return to the product and confirm the server is connected.

## Tips for working with integrations

When asking agents to use an integration, include enough context to identify the right item. Helpful details include:

- Project or team name
- Task name or issue ID
- Date range or due date
- Assignee or owner
- Status or priority level

The more specific your request, the more accurate the result.

## Linear

The [Linear](https://linear.app/docs/mcp) connector gives agents access to Linear issues, projects, teams, and engineering workflows.

Linear is suited for product and engineering teams that manage software development through issues, cycles, projects, bugs, and releases.

With Linear connected, agents can help:

- Find and summarize issues by team, status, assignee, label, priority, or project
- Review issue details, descriptions, comments, and related context
- Create issues from bug reports, specs, customer feedback, or internal notes
- Update issue fields such as status, assignee, priority, labels, or due dates
- Prepare sprint planning notes, standup summaries, release notes, or handoff briefs
- Identify open work, blockers, and upcoming priorities

**Example prompts:**

- "Summarize high-priority Linear issues assigned to me."
- "Create a Linear issue from this bug report."
- "What changed in the current cycle?"
- "Find open issues related to billing and group them by priority."

## Asana

The [Asana](https://developers.asana.com/docs/mcp-server) connector gives agents access to Asana projects, tasks, and team workflows.

Asana is suited for cross-functional teams managing projects, campaigns, launches, operations, and shared task ownership.

With Asana connected, agents can help:

- Search and summarize tasks across projects, owners, due dates, and statuses
- Create tasks from meeting notes, requests, project plans, or customer conversations
- Update task details such as assignee, due date, completion status, description, or project
- Add follow-up notes or comments to tasks
- Review project progress and identify overdue, blocked, or unassigned work
- Turn a plan, brief, or checklist into structured project tasks

**Example prompts:**

- "Create Asana tasks from this launch plan."
- "Summarize overdue tasks in the campaign project."
- "What tasks are assigned to the design team this week?"
- "Turn these meeting notes into Asana follow-ups."

## Todoist

The [Todoist](https://www.todoist.com/help) connector gives agents access to Todoist tasks, projects, labels, and personal productivity workflows.

Todoist is suited for individuals or small teams that need a lightweight way to capture, organize, and complete tasks.

With Todoist connected, agents can help:

- Create tasks from messages, notes, emails, or conversations
- Organize tasks into projects, sections, labels, or priority levels
- Set or update due dates, reminders, and recurring tasks
- Find tasks by project, status, priority, label, or due date
- Summarize what is due today, this week, or in a specific project
- Break larger goals into smaller actionable tasks

**Example prompts:**

- "Create Todoist tasks from this meeting note."
- "What do I need to finish today?"
- "Break this goal into a Todoist checklist."

## Permissions and access

Integrations use the permissions you grant during the authorization flow. Agents can only access information that is available to the connected account and supported by the connector.

To disconnect an integration, go to **Settings > Connectors** and select the connector you want to remove. Depending on the external service, you may also need to revoke access from that service's account settings.

## Troubleshooting

If an agent cannot find or update something, check the following:

- The integration is connected (verify status in **Settings > Connectors**).
- The connected account has access to the requested item in the external service.
- Your request includes enough detail, such as a project name, issue ID, or date range, for the agent to locate the correct item.
- The action you requested is supported by that connector.
