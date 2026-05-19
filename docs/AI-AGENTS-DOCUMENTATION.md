# AI Agent Orchestrator — Complete Documentation

## Overview

The **AI Agent Orchestrator** is an unattended, JSON-first pipeline that automates the end-to-end process of fetching test execution reports, analyzing failures, healing test data, syncing changes to GitLab, triggering re-runs, creating Jira defects, and sending consolidated notifications. It is built as a React client component running in a Next.js 15 application.

**File:** `src/components/pages/ai-agents-page.tsx`

---

## Pipeline Execution Order

The agents execute **sequentially** in the following order:

```
Agent 1 → Agent 2 → Agent 9 → Agent 3 → Agent 4 → Agent 5 → Agent 6 → Agent 7 → Agent 8
```

Each agent depends on the output of preceding agents. The pipeline can also run on a 5-minute auto-refresh cycle.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AI AGENT ORCHESTRATOR PIPELINE                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────┐    ┌───────────┐    ┌───────────┐    ┌───────────────────┐  │
│  │  Agent 1  │───▶│  Agent 2  │───▶│  Agent 9  │───▶│     Agent 3       │  │
│  │ Execution │    │   JSON    │    │Check Exist│    │     Failure       │  │
│  │  Fetcher  │    │  Report   │    │  Defects  │    │    Classifier     │  │
│  │           │    │  Parser   │    │           │    │                   │  │
│  └───────────┘    └───────────┘    └───────────┘    └───────────────────┘  │
│       │                │                │                     │             │
│       ▼                ▼                ▼                     ▼             │
│  [Selenium DB]   [reportRef]    [existingDefectsRef]  [classificationsRef] │
│  [Confluence ]   [scenariosRef]                                            │
│                                                                             │
│  ┌───────────┐    ┌───────────┐    ┌───────────┐    ┌───────────────────┐  │
│  │  Agent 4  │───▶│  Agent 5  │───▶│  Agent 6  │───▶│     Agent 7       │  │
│  │   Data    │    │  GitLab   │    │ Pipeline  │    │    Jira Defect    │  │
│  │  Healing  │    │Data Sync  │    │Orchestratr│    │      Scout        │  │
│  │  Agent    │    │           │    │           │    │                   │  │
│  └───────────┘    └───────────┘    └───────────┘    └───────────────────┘  │
│       │                │                │                     │             │
│       ▼                ▼                ▼                     ▼             │
│ [preparedContent] [GitLab Repo]  [GitLab Pipeline]     [Jira Tickets]     │
│ [rateRecords   ]                                                           │
│                                                                             │
│  ┌───────────────────┐                                                     │
│  │      Agent 8      │                                                     │
│  │   Notification    │                                                     │
│  │     Trigger       │                                                     │
│  └───────────────────┘                                                     │
│           │                                                                 │
│           ▼                                                                 │
│    [Microsoft Teams]                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Shared State (Data Flow Between Agents)

| Ref / State | Written By | Read By | Purpose |
|---|---|---|---|
| `reportRef` | Agent 1 | Agent 2, 4, 7 | Raw execution JSON report |
| `scenariosRef` | Agent 2 | Agent 3, 4, 9 | Parsed scenarios with pass/fail status and logs |
| `existingDefectsRef` | Agent 9 | Agent 3, 4 | Existing Jira defects linked to scenarios |
| `classificationsRef` | Agent 3 (updated by Agent 4) | Agent 4, 7 | Classification of each failure (Functional/Data/Env/Automation) |
| `preparedContentRef` | Agent 4 | Agent 5 | Healed JSON content + file path ready for commit |
| `pendingJiraDefectsRef` | Agent 7 | UI (manual create button) | Defect payloads when auto-create is disabled |
| `pipelineStartRef` | Pipeline start | Agent 8 | Timestamp for duration calculation |
| `agentsRef` | All agents | Agent 8 | Live agent state for notification summary |

---

## Agent 1: Execution Fetcher

### Purpose
Fetches the latest test execution JSON report from the Selenium Data Store (MongoDB). Falls back to Confluence if the store is unavailable.

### API Endpoints
- **Primary:** `GET /api/selenium/latest` — Fetches latest execution from MongoDB Selenium Data Store
- **Fallback:** `POST /api/confluence/fetch` — Fetches report from Confluence page attachment

### Configuration Fields
| Field | Description |
|---|---|
| `confluencePath` | Confluence base URL path |
| `confluencePageId` | Page ID containing the JSON attachment |
| `confluenceUser` | Confluence username |
| `confluencePassword` | Confluence API token/password |

### Input
- None (first agent in pipeline)

### Output
- Stores fetched JSON in `reportRef.current = { name: string, data: any }`
- `extraInfo`: The filename of the fetched report

### Logic Flow
1. Try fetching from Selenium Data Store (`/api/selenium/latest`)
2. If store is unavailable → try Confluence (`/api/confluence/fetch`)
3. If both fail and in simulation mode → generate mock data
4. Parse fetched content as JSON

---

## Agent 2: JSON Report Parser

### Purpose
Parses the raw execution JSON from Agent 1 to extract individual test scenarios with their pass/fail status, tags, and error logs.

### API Endpoints
- **AI Fallback:** `parseReportWithAI()` — GenAI-based structural analysis for non-standard JSON formats

### Input
- `reportRef.current.data` — Raw JSON from Agent 1

### Output
- `metrics`: `{ total, passed, failed, scenarios[] }`
- `scenariosRef.current`: Array of `{ name, status, tags[], logs? }`

### Logic Flow
1. Attempt direct traversal of `test_results[].elements[]` structure
2. For each scenario, check if any step has `status === 'failed'`
3. Extract error messages from failed steps as `logs`
4. If direct parsing yields 0 results → invoke GenAI parser (sends first 15KB of JSON)

### Scenario Object Structure
```typescript
{
  name: string;         // Scenario name
  status: 'passed' | 'failed';
  tags: string[];       // e.g., ["@TC_1", "@JIRA-123"]
  logs?: string | null; // Error message from failed step
}
```

---

## Agent 9: Check for Existing Defect

### Purpose
Searches Jira for existing defects already linked to the failed test scenarios. Scenarios with existing defects are excluded from downstream processing (classification, healing, and new defect creation).

### API Endpoints
- `POST /api/jira/search-defects` — Searches Jira for defects matching scenario names

### Configuration Fields
| Field | Description |
|---|---|
| `jiraSearchLink` | Jira base URL for search (falls back to `jiraLink`) |
| `jiraSearchUser` | Jira email for search (falls back to `jiraUser`) |
| `jiraSearchApiToken` | API token for search (falls back to `jiraApiToken`) |
| `jiraSearchProjectKey` | Project key to scope search (falls back to `jiraProjectKey`) |

### Input
- `scenariosRef.current` — Failed scenarios from Agent 2
- `reportRef.current.data.solution` — Solution name for filtering

### Output
- `existingDefectsRef.current`: Array of `{ key, summary, status, assignee, priority, scenarioName }`
- `extraInfo`: Count of unique existing defects found

### Logic Flow
1. Get all failed scenarios from `scenariosRef`
2. Build search queries including scenario names and tags (tags may contain Jira keys like `@JIRA-123`)
3. POST to `/api/jira/search-defects` with scenario names
4. Filter results: only keep defects whose summary contains the solution name
5. Deduplicate per-scenario (same defect can appear under multiple scenarios)

### Filtering Rules
- Defects are filtered by **solution name** — the defect summary must contain the solution name from the execution report
- This prevents cross-project defect matches

---

## Agent 3: Failure Classifier

### Purpose
Classifies each failed scenario into one of four categories using a multi-tier analysis engine:
- **Functional Issue** — Genuine application bug
- **Data Issue** — Test data problem (dates, missing records)
- **Environment Issue** — Infrastructure/connectivity problem
- **Automation script issue** — Test automation code problem

### API Endpoints
- `classifyFailures()` — Server-side AI flow for Tier 2/3 classification (`src/ai/flows/failure-classification-flow.ts`)

### Configuration Fields
| Field | Description |
|---|---|
| `enableTier1Rules` | Enable/disable custom rule matching (default: true) |
| `enableTier2Python` | Enable/disable Python ML classification (default: true) |
| `enableTier3Heuristics` | Enable/disable AI heuristics (default: true) |
| `failureRules` | Array of `{ pattern: string, category: string }` for Tier 1 |

### Input
- `scenariosRef.current` — Failed scenarios (excludes those with existing defects)
- `existingDefectsRef.current` — Used to exclude scenarios with linked defects
- `configData.failureRules` — User-defined classification rules

### Output
- `classificationsRef.current`: Array of `{ scenarioName, classification, reasoning }`
- `classificationSummary`: `{ functionalCount, dataCount, environmentCount, automationCount }`

### Multi-Tier Logic
```
Tier 1: Custom Rules (User-defined string patterns)
  └─ Match error log against user-defined patterns → immediate classification
  
Tier 2: Python ML Engine (Server-side)
  └─ Unmatched scenarios sent to AI/ML for classification
  
Tier 3: AI Heuristics (Fallback)
  └─ Final classification attempt using GenAI reasoning
```

### Exclusion Logic
- Scenarios with existing linked defects (from Agent 9) are **excluded** from classification
- Only scenarios without existing defects proceed through the classification tiers

---

## Agent 4: Data Healing Agent

### Purpose
Identifies the test data JSON file from the execution report, fetches it from GitLab, and performs two types of healing:
1. **OTM Date Gap Healing** — Ensures minimum 4-day gap between pickup/delivery dates
2. **Rate Record Injection** — Fetches rate records from MongoDB Planning History and injects them into test data

### API Endpoints
- `POST /api/gitlab/update` — Fetches JSON from GitLab, heals dates, injects rate records
- `POST /api/mongo/planning-history` — Queries MongoDB for rate records

### Configuration Fields
| Field | Description |
|---|---|
| `gitlabToken` | GitLab private access token |
| `gitlabProjectId` | GitLab project ID |
| `gitlabBranch` | Target branch (default: `main`) |
| `gitlabBaseUrl` | GitLab instance URL (default: `https://gitlab.com`) |
| `gitlabInsecureTls` | Skip TLS verification (default: false) |
| `gitlabFilePathPrefix` | Path prefix for test data files in the repo |

### Input
- `classificationsRef.current` — Only processes classified scenarios
- `reportRef.current.data` — To find `testDataFile` path from step outputs
- MongoDB `PlanningHistory` collection — For rate records

### Output
- `preparedContentRef.current`: `{ content: string, filePath: string }` — Healed JSON ready for commit
- Updates `classificationsRef.current` — Reclassifies unhealed "Data Issue" scenarios as "Functional Issue"
- `extraInfo`: `"X Repaired | Y Dates Healed"`

### Logic Flow
1. Filter scenarios to only those in `classificationsRef` (excludes linked defect scenarios)
2. Extract test data file path from report's step output (pattern: `testDataFile : /path/to/file.json`)
3. Detect planning failure scenarios (logs contain "Total Number of Order Failed to Plan")
4. Query `/api/mongo/planning-history` for rate records (3-tier fallback: exact match → env segment match → scenario name only)
5. Call `/api/gitlab/update` with scenario names and rate records
6. The update API:
   - Fetches the JSON file from GitLab
   - Matches scenarios by name (key matching in OTM JSON structure)
   - Heals dates: ensures `LATEPICKUPDATE - EARLYPICKUPDATE >= 4` and `LATEDELIVERYDATE - EARLYDELIVERYDATE >= 4`
   - Injects rate records as `"Rate Record ID=<value>"` and `"Update Value in Constraints tab=Yes"` entries
   - Returns updated content with heal counts
7. **Reclassification**: Scenarios classified as "Data Issue" that had NO data healed (no dates fixed, no rate record injected) are reclassified as "Functional Issue"

### OTM JSON Format
Test data files use scenario names as keys mapping to arrays of `"KEY=VALUE"` strings:
```json
{
  "ST-29A_Verify the automated cost allocation": [
    "EARLYPICKUPDATE=0",
    "LATEPICKUPDATE=4",
    "EARLYDELIVERYDATE=5",
    "LATEDELIVERYDATE=9",
    "Rate Record ID=TTS_LTL_KG_LTL_DEU_TURESK_20241231_RR",
    "Update Value in Constraints tab=Yes"
  ]
}
```

### MongoDB Planning History Schema
```json
{
  "Scenario Name": "ST-29A_Verify...",
  "Environment": "DEV",
  "Solution": "FORD_KOC",
  "RateRecord": "TTS_LTL_KG_LTL_DEU_TURESK_20241231_RR",
  "DestinationLocation": "...",
  "Itenary": "...",
  "Mode": "...",
  "RateOffering": "...",
  "ServiceProvider": "...",
  "ShipmentID": "...",
  "SourceLocation": "..."
}
```

---

## Agent 5: GitLab Data Sync

### Purpose
Commits the healed test data JSON (prepared by Agent 4) back to the GitLab repository. Supports both auto-commit and manual commit modes.

### API Endpoints
- `POST /api/gitlab/commit` — Commits file content to GitLab via API

### Configuration Fields
| Field | Description |
|---|---|
| `gitlabAutoCommit` | Auto-commit toggle (default: true). When disabled, shows "Commit Now" button |
| (inherits all GitLab config from Agent 4) | |

### Input
- `preparedContentRef.current` — `{ content, filePath }` from Agent 4

### Output
- `extraInfo`: `"Data Synchronized"` (auto-commit) or `"Pending Commit"` (manual mode)
- `updatedContent`: The JSON string (for "View JSON" preview)

### Logic Flow
```
IF auto-commit enabled (default):
  → POST /api/gitlab/commit with content and filePath
  → Log commit hash on success
ELSE (manual mode):
  → Store content as pending
  → Show "Commit Now" button on agent card
  → User clicks button → triggers commit
```

### Manual Commit UI
When `gitlabAutoCommit` is `false`:
- Agent card shows status "Pending Commit"
- "View JSON" button allows reviewing the healed content
- "Commit Now" button triggers the actual GitLab commit

---

## Agent 6: Pipeline Orchestrator

### Purpose
Triggers a targeted rerun of the test pipeline in GitLab by invoking a pipeline schedule by its description/name. After triggering, fetches and reports the pipeline details.

### API Endpoints
- `POST /api/gitlab/trigger-schedule` — Finds schedule by description and triggers it, returns pipeline info

### Configuration Fields
| Field | Description |
|---|---|
| `gitlabPipelineScheduleDescription` | The description/name of the GitLab pipeline schedule to trigger |
| (inherits GitLab connection config) | |

### Input
- `configData.gitlabPipelineScheduleDescription` — Schedule name to trigger

### Output
- `extraInfo`: `"Pipeline #<id> (<status>)"` or `"Triggered: <schedule_name>"`
- Logs include pipeline ID, status, branch, and URL

### Logic Flow
1. Fetch all pipeline schedules from GitLab (`GET /api/v4/projects/:id/pipeline_schedules`)
2. Find schedule matching the configured description (case-insensitive)
3. Trigger it via `POST /pipeline_schedules/:id/play`
4. Wait 2 seconds, then fetch latest pipeline (`GET /pipelines?per_page=1&order_by=id&sort=desc`)
5. Return pipeline details (id, status, ref, web_url, created_at)

### Pipeline Info in Consolidated Report
The triggered pipeline URL is included in the Teams notification as a clickable link.

---

## Agent 7: Jira Defect Scout

### Purpose
Creates Jira tickets for scenarios classified as "Functional Issue". Consolidates scenarios with identical root causes into single tickets. Supports auto-create and manual review modes.

### API Endpoints
- `POST /api/jira/create` — Creates a Jira issue with optional screenshot attachment

### Configuration Fields
| Field | Description |
|---|---|
| `jiraLink` | Jira base URL |
| `jiraUser` | Jira email |
| `jiraApiToken` | Jira API token |
| `jiraProjectKey` | Jira project key (e.g., "TSTAUTO") |
| `jiraIssueType` | Issue type (default: "Bug") |
| `jiraAutoCreate` | Auto-create toggle (default: true). When disabled, shows "Create Defects" button |

### Input
- `classificationsRef.current` — Only scenarios with `classification === 'Functional Issue'`
- `reportRef.current.data` — For scenario step details and screenshots
- `scenariosRef.current` — For failure logs

### Output
- `extraInfo`: `"X Unique Tickets Created"` (auto) or `"X Pending Review"` (manual)
- `pendingJiraDefectsRef.current`: Stored payloads when in manual mode

### Logic Flow
1. Filter `classificationsRef` to only "Functional Issue" scenarios
2. **Consolidation**: Group scenarios by normalized error logs (mask timestamps, UUIDs, numbers)
   - Identical root causes → single consolidated ticket
3. For each unique group, build a Jira ticket:
   - Summary: `[Consolidated] AI FAILURE: <representative> (+N more)` or `AI FAILURE: <name>`
   - Description includes: reproducible steps, failure logs, impacted test case list
   - Screenshot: extracted from failed step embeddings (base64 → File)
4. **Auto-create mode**: POST each ticket to `/api/jira/create` immediately
5. **Manual mode**: Store payloads in `pendingJiraDefectsRef` → show "Create Defects" button

### Consolidation Algorithm
```
For each functional failure:
  1. Get error log from scenario
  2. Normalize: replace timestamps → <timestamp>, UUIDs → <uuid>, numbers → #
  3. Use normalized string as grouping key
  4. First scenario in group = representative (provides steps/screenshot)
  5. Other scenarios = "affected" (listed in description)
```

### Jira Ticket Format
```
Summary: [Consolidated] AI FAILURE: ST-29A_Verify... (+2 more)

Description:
AI Automated Failure Report (Consolidated)

--- REPRODUCIBLE STEPS (Representative Scenario) ---
1. [PASSED] Given I navigate to OTM
2. [PASSED] When I search for shipment
3. [FAILED] Then the cost should be calculated

--- DETAILED FAILURE LOG ---
java.lang.AssertionError: Expected 5 but found 3

--- IMPACTED TEST CASES (3) ---
1. ST-29A_Verify the automated cost allocation
2. ST-29B_Verify the manual cost allocation
3. ST-29C_Verify the batch cost allocation
```

---

## Agent 8: Notification Trigger

### Purpose
Sends a comprehensive, consolidated pipeline execution summary to a Microsoft Teams channel via webhook. The report covers all agent results, metrics, and actionable links.

### API Endpoints
- `POST /api/notifications/teams` — Formats and sends an Adaptive Card to Teams webhook

### Configuration Fields
| Field | Description |
|---|---|
| `teamsWebhookUrl` | Microsoft Teams Incoming Webhook URL |

### Input
- All agent states (via `buildNotificationSummary()`)
- `reportRef`, `pipelineStartRef`, `classificationCounts`, etc.

### Output
- `extraInfo`: `"Comprehensive Teams Report Sent"`

### Report Contents
The Teams MessageCard includes:
| Section | Content |
|---|---|
| Header | Solution name, report name, start/finish times, duration |
| Metrics | Total/Passed/Failed scenario counts |
| Classification Breakdown | Functional/Data/Env/Automation counts |
| Data Healing | File path, heal counts |
| GitLab Commit | Commit info or pending status |
| Pipeline Orchestrator | Pipeline ID, status, clickable URL |
| Jira Status | Tickets created or pending count |
| Failed Scenarios | Top 10 failed scenario names |
| Per-Agent Details | Status, result, recent logs for each agent |

### Teams Message Format
Uses Office 365 MessageCard format (`@type: MessageCard`) with:
- Color-coded theme: Red if failures > 0, Blue otherwise
- Multiple sections with facts (key-value pairs)
- Markdown support for formatting

---

## Configuration Storage

All configuration is stored in **Firebase Firestore** under:
```
Collection: appConfiguration
Document: global
```

Configuration is loaded via `useDoc<AppConfiguration>(configRef)` and can be overridden locally via `configOverrides` state.

### Full Configuration Schema
```typescript
{
  // Confluence (Agent 1 fallback)
  confluencePath?: string;
  confluencePageId?: string;
  confluenceUser?: string;
  confluencePassword?: string;

  // Jira - Defect Creation (Agent 7)
  jiraLink?: string;
  jiraUser?: string;
  jiraApiToken?: string;
  jiraProjectKey?: string;
  jiraIssueType?: string;          // default: "Bug"
  jiraAutoCreate?: boolean;         // default: true

  // Jira - Search (Agent 9)
  jiraSearchLink?: string;
  jiraSearchUser?: string;
  jiraSearchApiToken?: string;
  jiraSearchProjectKey?: string;

  // GitLab (Agents 4, 5, 6)
  gitlabToken?: string;
  gitlabBaseUrl?: string;           // default: "https://gitlab.com"
  gitlabProjectId?: string;
  gitlabBranch?: string;            // default: "main"
  gitlabFilePathPrefix?: string;    // default: ""
  gitlabInsecureTls?: boolean;      // default: false
  gitlabAutoCommit?: boolean;       // default: true
  gitlabPipelineScheduleDescription?: string;

  // Teams (Agent 8)
  teamsWebhookUrl?: string;

  // Failure Classifier (Agent 3)
  failureRules?: { pattern: string; category: string }[];
  enableTier1Rules?: boolean;       // default: true
  enableTier2Python?: boolean;      // default: true
  enableTier3Heuristics?: boolean;  // default: true
}
```

---

## API Endpoints Summary

| Endpoint | Method | Used By | Purpose |
|---|---|---|---|
| `/api/selenium/latest` | GET | Agent 1 | Fetch latest execution JSON |
| `/api/confluence/fetch` | POST | Agent 1 | Fetch report from Confluence |
| `/api/jira/search-defects` | POST | Agent 9 | Search for existing defects |
| `/api/mongo/planning-history` | POST | Agent 4 | Query rate records from MongoDB |
| `/api/gitlab/update` | POST | Agent 4 | Fetch JSON from GitLab, heal dates, inject rates |
| `/api/gitlab/commit` | POST | Agent 5 | Commit healed JSON to GitLab |
| `/api/gitlab/trigger-schedule` | POST | Agent 6 | Trigger GitLab pipeline schedule |
| `/api/jira/create` | POST | Agent 7 | Create Jira issue with screenshot |
| `/api/notifications/teams` | POST | Agent 8 | Send Teams notification |
| `/api/gitlab/test` | POST | Settings | Test GitLab connection |
| `/api/jira/test` | POST | Settings | Test Jira connection |

---

## Key Design Decisions

### 1. Sequential Execution
Agents run one after another because each depends on the previous agent's output. There is no parallel execution between agents.

### 2. Reclassification After Healing
If Agent 4 (Data Healing) cannot heal a scenario classified as "Data Issue" (no dates fixed, no rate record found), it reclassifies that scenario as "Functional Issue" so Agent 7 will create a Jira ticket for it.

### 3. Existing Defect Exclusion
Scenarios with existing linked Jira defects (found by Agent 9) are excluded from:
- Classification (Agent 3)
- Data Healing (Agent 4)
- New defect creation (Agent 7)

This prevents duplicate Jira tickets.

### 4. Consolidation Logic
Agent 7 groups scenarios with identical normalized error logs into single Jira tickets. This avoids creating N tickets for N scenarios that all fail for the same root cause.

### 5. Manual Override Controls
- **Agent 5** (GitLab Sync): `gitlabAutoCommit` toggle — allows review before committing
- **Agent 7** (Jira Scout): `jiraAutoCreate` toggle — allows review before creating tickets

### 6. Fallback Strategies
- Agent 1: Selenium Store → Confluence → Simulation Mode
- Agent 2: Direct JSON traversal → GenAI parser
- Agent 3: Tier 1 rules → Tier 2 Python ML → Tier 3 AI Heuristics
- Agent 4 (Planning History): Exact env+solution match → Env segment match → Scenario name only

---

## Error Handling

Each agent catches its own errors and reports them via `addLog()`. An agent failure sets `executionStatus = 'error'` but does **not** stop the pipeline — subsequent agents still execute (they may just have less data to work with).

---

## UI Features

### Agent Cards
Each agent has a card showing:
- Status indicator (idle/running/success/error)
- Last run time
- Extra info badge (scenario count, ticket count, etc.)
- Settings gear icon (opens configuration dialog)
- Action buttons (View JSON, Commit Now, Create Defects, Preview Report)

### Scenario List Views
- Click on passed/failed counts → opens scenario list with search
- Click on classification counts → opens filtered classification list
- Existing defects shown per-scenario with clickable Jira links

### Consolidated Report Preview
Agent 8 card has "Preview Consolidated Report" button showing the full Teams notification payload before sending.

---

## External Dependencies

| System | Purpose | Connection Method |
|---|---|---|
| MongoDB (local) | Selenium Data Store, Planning History | `mongodb://localhost:27017` / `bugsense` DB |
| GitLab | Test data repo, Pipeline schedules | REST API v4 with Private Token |
| Jira (Atlassian) | Defect search & creation | REST API v2 with Basic Auth |
| Confluence | Report storage (fallback) | REST API with Basic Auth |
| Microsoft Teams | Notifications | Incoming Webhook |
| Firebase Firestore | Configuration storage | Firebase SDK |
| GenAI (Genkit) | Report parsing, Failure classification | Server-side AI flows |
