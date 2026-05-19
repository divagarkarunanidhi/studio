const pptxgen = require("pptxgenjs");

const pptx = new pptxgen();

// Theme colors
const PRIMARY = "0078D4";
const PRIMARY_DARK = "005A9E";
const ACCENT = "00B294";
const BG_DARK = "1B1F23";
const BG_LIGHT = "F5F5F5";
const TEXT_WHITE = "FFFFFF";
const TEXT_DARK = "2D2D2D";
const TEXT_MUTED = "6B7280";
const BORDER = "E5E7EB";
const SUCCESS = "16A34A";
const ERROR = "DC2626";
const WARNING = "F59E0B";

pptx.author = "BugSense AI";
pptx.company = "DHL";
pptx.subject = "AI Agent Orchestrator";
pptx.title = "AI Agent Orchestrator - Pipeline Overview";
pptx.layout = "LAYOUT_WIDE";

// ============================================================
// SLIDE 1: Title Slide
// ============================================================
let slide = pptx.addSlide();
slide.background = { fill: BG_DARK };

slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: 0.08, fill: { color: PRIMARY } });
slide.addShape(pptx.ShapeType.rect, { x: 0, y: 7.42, w: "100%", h: 0.08, fill: { color: PRIMARY } });

slide.addText("AI AGENT ORCHESTRATOR", {
    x: 0.8, y: 1.8, w: 11.5, h: 1.2,
    fontSize: 40, fontFace: "Segoe UI", bold: true, color: TEXT_WHITE,
    align: "left",
});
slide.addText("Unattended JSON-First Pipeline for Automated Failure Analysis", {
    x: 0.8, y: 3.0, w: 11.5, h: 0.7,
    fontSize: 20, fontFace: "Segoe UI Light", color: ACCENT,
    align: "left",
});
slide.addShape(pptx.ShapeType.rect, { x: 0.8, y: 3.9, w: 3, h: 0.04, fill: { color: PRIMARY } });
slide.addText("BugSense Platform  |  Next.js 15  |  GenAI Powered", {
    x: 0.8, y: 4.3, w: 11.5, h: 0.5,
    fontSize: 14, fontFace: "Segoe UI", color: TEXT_MUTED,
});
slide.addText("9 Agents  •  Sequential Pipeline  •  Full Automation", {
    x: 0.8, y: 4.8, w: 11.5, h: 0.5,
    fontSize: 14, fontFace: "Segoe UI", color: TEXT_MUTED,
});

// ============================================================
// SLIDE 2: Pipeline Overview
// ============================================================
slide = pptx.addSlide();
slide.background = { fill: TEXT_WHITE };
slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: 0.06, fill: { color: PRIMARY } });

slide.addText("Pipeline Execution Flow", {
    x: 0.5, y: 0.3, w: 12, h: 0.6,
    fontSize: 28, fontFace: "Segoe UI", bold: true, color: TEXT_DARK,
});
slide.addText("Agents execute sequentially — each depends on the output of preceding agents", {
    x: 0.5, y: 0.85, w: 12, h: 0.4,
    fontSize: 13, fontFace: "Segoe UI", color: TEXT_MUTED,
});

const agents = [
    { id: "1", name: "Execution\nFetcher", color: "4A90D9" },
    { id: "2", name: "JSON Report\nParser", color: "5B9BD5" },
    { id: "9", name: "Check Existing\nDefects", color: "6CAED8" },
    { id: "3", name: "Failure\nClassifier", color: "ED7D31" },
    { id: "4", name: "Data Healing\nAgent", color: "70AD47" },
    { id: "5", name: "GitLab Data\nSync", color: "FFC000" },
    { id: "6", name: "Pipeline\nOrchestrator", color: "9B59B6" },
    { id: "7", name: "Jira Defect\nScout", color: "E74C3C" },
    { id: "8", name: "Notification\nTrigger", color: "1ABC9C" },
];

const startX = 0.3;
const boxW = 1.18;
const gap = 0.15;
const arrowW = 0.08;
const rowY = 1.7;

agents.forEach((agent, i) => {
    const x = startX + i * (boxW + gap);
    // Card
    slide.addShape(pptx.ShapeType.roundRect, {
        x, y: rowY, w: boxW, h: 1.5,
        fill: { color: agent.color }, shadow: { type: "outer", blur: 4, offset: 2, color: "999999", opacity: 0.3 },
        rectRadius: 0.08,
    });
    // Agent ID circle
    slide.addShape(pptx.ShapeType.ellipse, {
        x: x + boxW / 2 - 0.18, y: rowY + 0.12, w: 0.36, h: 0.36,
        fill: { color: TEXT_WHITE },
    });
    slide.addText(agent.id, {
        x: x + boxW / 2 - 0.18, y: rowY + 0.12, w: 0.36, h: 0.36,
        fontSize: 12, fontFace: "Segoe UI", bold: true, color: agent.color,
        align: "center", valign: "middle",
    });
    // Agent name
    slide.addText(agent.name, {
        x: x + 0.04, y: rowY + 0.55, w: boxW - 0.08, h: 0.85,
        fontSize: 9, fontFace: "Segoe UI", bold: true, color: TEXT_WHITE,
        align: "center", valign: "middle",
    });
    // Arrow
    if (i < agents.length - 1) {
        slide.addText("→", {
            x: x + boxW, y: rowY + 0.45, w: gap, h: 0.5,
            fontSize: 16, fontFace: "Segoe UI", color: TEXT_MUTED, align: "center", valign: "middle",
        });
    }
});

// Data flow labels
const dataFlows = [
    { x: 0.45, label: "reportRef", icon: "📄" },
    { x: 1.78, label: "scenariosRef", icon: "📋" },
    { x: 3.11, label: "existingDefectsRef", icon: "🔍" },
    { x: 4.44, label: "classificationsRef", icon: "🏷️" },
    { x: 5.77, label: "preparedContent", icon: "🔧" },
    { x: 7.10, label: "GitLab Repo", icon: "📦" },
    { x: 8.43, label: "Pipeline Info", icon: "🚀" },
    { x: 9.76, label: "Jira Tickets", icon: "🎫" },
    { x: 11.09, label: "Teams Report", icon: "📨" },
];

dataFlows.forEach(df => {
    slide.addText("▼", { x: df.x, y: 3.25, w: boxW, h: 0.25, fontSize: 10, color: TEXT_MUTED, align: "center" });
    slide.addText(df.label, {
        x: df.x - 0.1, y: 3.5, w: boxW + 0.2, h: 0.35,
        fontSize: 7, fontFace: "Segoe UI", color: TEXT_MUTED, align: "center",
    });
});

// Key features box
slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.5, y: 4.2, w: 12, h: 2.8, fill: { color: BG_LIGHT }, line: { color: BORDER, width: 1 }, rectRadius: 0.1,
});
slide.addText("Key Design Principles", {
    x: 0.8, y: 4.35, w: 11, h: 0.4,
    fontSize: 16, fontFace: "Segoe UI", bold: true, color: TEXT_DARK,
});

const principles = [
    ["Sequential Execution", "Each agent depends on previous outputs — no parallel execution between agents"],
    ["Existing Defect Exclusion", "Scenarios with linked Jira defects are excluded from classification, healing, and new ticket creation"],
    ["Reclassification After Healing", 'Unhealed "Data Issues" are auto-reclassified as "Functional Issues" for Jira ticket creation'],
    ["Consolidation Logic", "Scenarios with identical normalized error logs are grouped into single Jira tickets"],
    ["Manual Override Controls", "GitLab Sync and Jira Scout have auto/manual toggle for review before action"],
    ["Multi-tier Fallback", "Agent 1 (Store→Confluence), Agent 3 (Rules→ML→AI), Agent 4 (Exact→Segment→Name)"],
];

principles.forEach((p, i) => {
    const col = i < 3 ? 0 : 1;
    const row = i % 3;
    const px = 0.9 + col * 5.8;
    const py = 4.85 + row * 0.7;
    slide.addText(`●  ${p[0]}`, { x: px, y: py, w: 5.5, h: 0.3, fontSize: 11, fontFace: "Segoe UI", bold: true, color: PRIMARY_DARK });
    slide.addText(p[1], { x: px + 0.3, y: py + 0.28, w: 5.2, h: 0.3, fontSize: 9, fontFace: "Segoe UI", color: TEXT_MUTED });
});


// ============================================================
// SLIDE 3: Agent 1 & 2
// ============================================================
slide = pptx.addSlide();
slide.background = { fill: TEXT_WHITE };
slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: 0.06, fill: { color: PRIMARY } });

slide.addText("Agent 1: Execution Fetcher  &  Agent 2: JSON Report Parser", {
    x: 0.5, y: 0.25, w: 12, h: 0.55,
    fontSize: 24, fontFace: "Segoe UI", bold: true, color: TEXT_DARK,
});

// Agent 1 box
slide.addShape(pptx.ShapeType.roundRect, { x: 0.5, y: 1.1, w: 6, h: 3.2, fill: { color: "F0F7FF" }, line: { color: "4A90D9", width: 1.5 }, rectRadius: 0.1 });
slide.addText("Agent 1: Execution Fetcher", { x: 0.7, y: 1.2, w: 5.5, h: 0.45, fontSize: 16, fontFace: "Segoe UI", bold: true, color: "4A90D9" });
slide.addText("Fetches latest test execution JSON from Selenium Data Store (MongoDB).\nFalls back to Confluence if store is unavailable.", {
    x: 0.7, y: 1.7, w: 5.5, h: 0.7, fontSize: 11, fontFace: "Segoe UI", color: TEXT_DARK,
});
slide.addText([
    { text: "Data Sources (Priority Order):\n", options: { bold: true, fontSize: 11, color: TEXT_DARK } },
    { text: "1. ", options: { bold: true, color: SUCCESS } }, { text: "Selenium Data Store  ", options: { fontSize: 10 } },
    { text: "GET /api/selenium/latest\n", options: { fontSize: 9, fontFace: "Consolas", color: TEXT_MUTED } },
    { text: "2. ", options: { bold: true, color: WARNING } }, { text: "Confluence Fallback  ", options: { fontSize: 10 } },
    { text: "POST /api/confluence/fetch\n", options: { fontSize: 9, fontFace: "Consolas", color: TEXT_MUTED } },
    { text: "3. ", options: { bold: true, color: ERROR } }, { text: "Simulation Mode  ", options: { fontSize: 10 } },
    { text: "(Mock data for testing)", options: { fontSize: 9, color: TEXT_MUTED } },
], { x: 0.7, y: 2.5, w: 5.5, h: 1.5, valign: "top", lineSpacingMultiple: 1.3 });

// Agent 2 box
slide.addShape(pptx.ShapeType.roundRect, { x: 6.8, y: 1.1, w: 6, h: 3.2, fill: { color: "F0FFF4" }, line: { color: "5B9BD5", width: 1.5 }, rectRadius: 0.1 });
slide.addText("Agent 2: JSON Report Parser", { x: 7.0, y: 1.2, w: 5.5, h: 0.45, fontSize: 16, fontFace: "Segoe UI", bold: true, color: "5B9BD5" });
slide.addText("Parses raw JSON to extract scenarios with pass/fail status, tags, and error logs.", {
    x: 7.0, y: 1.7, w: 5.5, h: 0.5, fontSize: 11, fontFace: "Segoe UI", color: TEXT_DARK,
});
slide.addText([
    { text: "Parsing Strategy:\n", options: { bold: true, fontSize: 11, color: TEXT_DARK } },
    { text: "1. ", options: { bold: true, color: SUCCESS } }, { text: "Direct traversal of test_results[].elements[]\n", options: { fontSize: 10 } },
    { text: "2. ", options: { bold: true, color: WARNING } }, { text: "GenAI fallback for non-standard formats\n\n", options: { fontSize: 10 } },
    { text: "Output → scenariosRef:\n", options: { bold: true, fontSize: 11, color: TEXT_DARK } },
    { text: "{ name, status, tags[], logs? }", options: { fontSize: 10, fontFace: "Consolas", color: TEXT_MUTED } },
], { x: 7.0, y: 2.3, w: 5.5, h: 2.0, valign: "top", lineSpacingMultiple: 1.3 });

// Connection arrow
slide.addText("reportRef  →", { x: 5.5, y: 4.5, w: 3, h: 0.4, fontSize: 12, fontFace: "Segoe UI", bold: true, color: PRIMARY, align: "center" });

// Config table
slide.addText("Configuration (Agent 1)", { x: 0.5, y: 4.6, w: 5, h: 0.35, fontSize: 13, fontFace: "Segoe UI", bold: true, color: TEXT_DARK });
const a1Config = [
    [{ text: "Field", options: { bold: true, fill: { color: PRIMARY }, color: TEXT_WHITE, fontSize: 9 } }, { text: "Description", options: { bold: true, fill: { color: PRIMARY }, color: TEXT_WHITE, fontSize: 9 } }],
    [{ text: "confluencePath", options: { fontFace: "Consolas", fontSize: 9 } }, { text: "Confluence base URL", options: { fontSize: 9 } }],
    [{ text: "confluencePageId", options: { fontFace: "Consolas", fontSize: 9 } }, { text: "Page ID with JSON attachment", options: { fontSize: 9 } }],
    [{ text: "confluenceUser", options: { fontFace: "Consolas", fontSize: 9 } }, { text: "Username for authentication", options: { fontSize: 9 } }],
    [{ text: "confluencePassword", options: { fontFace: "Consolas", fontSize: 9 } }, { text: "API token / password", options: { fontSize: 9 } }],
];
slide.addTable(a1Config, { x: 0.5, y: 5.0, w: 5.5, colW: [2.2, 3.3], border: { type: "solid", color: BORDER, pt: 0.5 }, rowH: 0.32 });


// ============================================================
// SLIDE 4: Agent 9 & 3
// ============================================================
slide = pptx.addSlide();
slide.background = { fill: TEXT_WHITE };
slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: 0.06, fill: { color: PRIMARY } });

slide.addText("Agent 9: Check Existing Defects  &  Agent 3: Failure Classifier", {
    x: 0.5, y: 0.25, w: 12, h: 0.55,
    fontSize: 24, fontFace: "Segoe UI", bold: true, color: TEXT_DARK,
});

// Agent 9
slide.addShape(pptx.ShapeType.roundRect, { x: 0.5, y: 1.1, w: 6, h: 2.8, fill: { color: "FFF7ED" }, line: { color: "6CAED8", width: 1.5 }, rectRadius: 0.1 });
slide.addText("Agent 9: Check for Existing Defect", { x: 0.7, y: 1.2, w: 5.5, h: 0.4, fontSize: 16, fontFace: "Segoe UI", bold: true, color: "6CAED8" });
slide.addText([
    { text: "Searches Jira for existing linked defects.\nMatched scenarios are ", options: { fontSize: 11 } },
    { text: "excluded", options: { fontSize: 11, bold: true, color: ERROR } },
    { text: " from downstream agents.\n\n", options: { fontSize: 11 } },
    { text: "API: ", options: { bold: true, fontSize: 10 } },
    { text: "POST /api/jira/search-defects\n\n", options: { fontFace: "Consolas", fontSize: 9, color: TEXT_MUTED } },
    { text: "Filtering: ", options: { bold: true, fontSize: 10 } },
    { text: "Defect summary must contain the solution name\nfrom the execution report → prevents cross-project matches", options: { fontSize: 10, color: TEXT_MUTED } },
], { x: 0.7, y: 1.65, w: 5.5, h: 2.1, valign: "top", lineSpacingMultiple: 1.2 });

// Agent 3
slide.addShape(pptx.ShapeType.roundRect, { x: 6.8, y: 1.1, w: 6, h: 2.8, fill: { color: "FFF5F5" }, line: { color: "ED7D31", width: 1.5 }, rectRadius: 0.1 });
slide.addText("Agent 3: Failure Classifier", { x: 7.0, y: 1.2, w: 5.5, h: 0.4, fontSize: 16, fontFace: "Segoe UI", bold: true, color: "ED7D31" });
slide.addText("Multi-tier classification engine for failed scenarios:", { x: 7.0, y: 1.65, w: 5.5, h: 0.35, fontSize: 11, fontFace: "Segoe UI", color: TEXT_DARK });

// Tier boxes
const tiers = [
    { label: "Tier 1: Custom Rules", desc: "User-defined string patterns", color: SUCCESS },
    { label: "Tier 2: Python ML", desc: "Server-side AI/ML classification", color: WARNING },
    { label: "Tier 3: AI Heuristics", desc: "GenAI reasoning fallback", color: "9B59B6" },
];
tiers.forEach((t, i) => {
    const ty = 2.1 + i * 0.65;
    slide.addShape(pptx.ShapeType.roundRect, { x: 7.2, y: ty, w: 5.2, h: 0.55, fill: { color: BG_LIGHT }, line: { color: t.color, width: 1 }, rectRadius: 0.06 });
    slide.addText(t.label, { x: 7.4, y: ty + 0.02, w: 2.5, h: 0.25, fontSize: 10, fontFace: "Segoe UI", bold: true, color: t.color });
    slide.addText(t.desc, { x: 7.4, y: ty + 0.26, w: 4.8, h: 0.22, fontSize: 9, fontFace: "Segoe UI", color: TEXT_MUTED });
});

// Classification categories
slide.addText("Classification Categories", { x: 0.5, y: 4.2, w: 12, h: 0.4, fontSize: 16, fontFace: "Segoe UI", bold: true, color: TEXT_DARK });
const categories = [
    { name: "Functional Issue", desc: "Genuine application bug → Jira ticket", color: ERROR, icon: "🐛" },
    { name: "Data Issue", desc: "Test data problem → Data healing", color: WARNING, icon: "📊" },
    { name: "Environment Issue", desc: "Infrastructure / connectivity", color: "9B59B6", icon: "🌐" },
    { name: "Automation Script", desc: "Test automation code problem", color: TEXT_MUTED, icon: "⚙️" },
];
categories.forEach((c, i) => {
    const cx = 0.5 + i * 3.15;
    slide.addShape(pptx.ShapeType.roundRect, { x: cx, y: 4.7, w: 2.95, h: 1.3, fill: { color: BG_LIGHT }, line: { color: c.color, width: 1.5 }, rectRadius: 0.08 });
    slide.addText(c.icon, { x: cx + 0.15, y: 4.8, w: 0.5, h: 0.4, fontSize: 20 });
    slide.addText(c.name, { x: cx + 0.6, y: 4.82, w: 2.1, h: 0.35, fontSize: 12, fontFace: "Segoe UI", bold: true, color: c.color });
    slide.addText(c.desc, { x: cx + 0.15, y: 5.3, w: 2.6, h: 0.55, fontSize: 10, fontFace: "Segoe UI", color: TEXT_MUTED });
});


// ============================================================
// SLIDE 5: Agent 4 - Data Healing
// ============================================================
slide = pptx.addSlide();
slide.background = { fill: TEXT_WHITE };
slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: 0.06, fill: { color: PRIMARY } });

slide.addText("Agent 4: Data Healing Agent", {
    x: 0.5, y: 0.25, w: 12, h: 0.55,
    fontSize: 28, fontFace: "Segoe UI", bold: true, color: TEXT_DARK,
});
slide.addText("Identifies test data files, performs OTM date gap healing and rate record injection", {
    x: 0.5, y: 0.75, w: 12, h: 0.35, fontSize: 13, fontFace: "Segoe UI", color: TEXT_MUTED,
});

// Two healing types
slide.addShape(pptx.ShapeType.roundRect, { x: 0.5, y: 1.4, w: 6, h: 2.5, fill: { color: "F0FFF4" }, line: { color: SUCCESS, width: 1.5 }, rectRadius: 0.1 });
slide.addText("🔧  OTM Date Gap Healing", { x: 0.7, y: 1.5, w: 5.5, h: 0.4, fontSize: 15, fontFace: "Segoe UI", bold: true, color: SUCCESS });
slide.addText([
    { text: "Ensures minimum 4-day gap between dates:\n\n", options: { fontSize: 11 } },
    { text: "• LATEPICKUPDATE - EARLYPICKUPDATE ≥ 4\n", options: { fontSize: 10, fontFace: "Consolas" } },
    { text: "• LATEDELIVERYDATE - EARLYDELIVERYDATE ≥ 4\n\n", options: { fontSize: 10, fontFace: "Consolas" } },
    { text: "Heals gaps automatically by adjusting late dates", options: { fontSize: 10, color: TEXT_MUTED } },
], { x: 0.7, y: 1.95, w: 5.5, h: 1.8, valign: "top" });

slide.addShape(pptx.ShapeType.roundRect, { x: 6.8, y: 1.4, w: 6, h: 2.5, fill: { color: "FFF7ED" }, line: { color: WARNING, width: 1.5 }, rectRadius: 0.1 });
slide.addText("📋  Rate Record Injection", { x: 7.0, y: 1.5, w: 5.5, h: 0.4, fontSize: 15, fontFace: "Segoe UI", bold: true, color: WARNING });
slide.addText([
    { text: "For planning failure scenarios:\n\n", options: { fontSize: 11 } },
    { text: "1. Query MongoDB PlanningHistory\n", options: { fontSize: 10 } },
    { text: "2. 3-tier fallback matching:\n", options: { fontSize: 10 } },
    { text: "   Exact → Env segment → Scenario name\n", options: { fontSize: 9, fontFace: "Consolas", color: TEXT_MUTED } },
    { text: "3. Inject Rate Record ID + Constraints flag\n", options: { fontSize: 10 } },
], { x: 7.0, y: 1.95, w: 5.5, h: 1.8, valign: "top" });

// Reclassification box
slide.addShape(pptx.ShapeType.roundRect, { x: 0.5, y: 4.2, w: 12.3, h: 1.2, fill: { color: "FEF2F2" }, line: { color: ERROR, width: 1.5 }, rectRadius: 0.1 });
slide.addText("⚠️  Reclassification Logic", { x: 0.7, y: 4.3, w: 5, h: 0.35, fontSize: 14, fontFace: "Segoe UI", bold: true, color: ERROR });
slide.addText([
    { text: 'If a scenario classified as "Data Issue" has ', options: { fontSize: 11 } },
    { text: "NO data healed", options: { fontSize: 11, bold: true, color: ERROR } },
    { text: ' (no dates fixed, no rate record injected), it is automatically reclassified as "', options: { fontSize: 11 } },
    { text: "Functional Issue", options: { fontSize: 11, bold: true, color: ERROR } },
    { text: '" → ensuring Agent 7 creates a Jira ticket for it.', options: { fontSize: 11 } },
], { x: 0.7, y: 4.7, w: 11.8, h: 0.6 });

// API endpoints
slide.addText("API Endpoints", { x: 0.5, y: 5.6, w: 5, h: 0.35, fontSize: 14, fontFace: "Segoe UI", bold: true, color: TEXT_DARK });
const a4Apis = [
    [{ text: "Endpoint", options: { bold: true, fill: { color: PRIMARY }, color: TEXT_WHITE, fontSize: 9 } }, { text: "Purpose", options: { bold: true, fill: { color: PRIMARY }, color: TEXT_WHITE, fontSize: 9 } }],
    [{ text: "POST /api/gitlab/update", options: { fontFace: "Consolas", fontSize: 9 } }, { text: "Fetch JSON from GitLab, heal dates, inject rate records", options: { fontSize: 9 } }],
    [{ text: "POST /api/mongo/planning-history", options: { fontFace: "Consolas", fontSize: 9 } }, { text: "Query MongoDB for rate records (3-tier fallback)", options: { fontSize: 9 } }],
];
slide.addTable(a4Apis, { x: 0.5, y: 6.0, w: 12.3, colW: [4, 8.3], border: { type: "solid", color: BORDER, pt: 0.5 }, rowH: 0.32 });


// ============================================================
// SLIDE 6: Agent 5 & 6
// ============================================================
slide = pptx.addSlide();
slide.background = { fill: TEXT_WHITE };
slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: 0.06, fill: { color: PRIMARY } });

slide.addText("Agent 5: GitLab Data Sync  &  Agent 6: Pipeline Orchestrator", {
    x: 0.5, y: 0.25, w: 12, h: 0.55,
    fontSize: 24, fontFace: "Segoe UI", bold: true, color: TEXT_DARK,
});

// Agent 5
slide.addShape(pptx.ShapeType.roundRect, { x: 0.5, y: 1.1, w: 6, h: 3.5, fill: { color: "FFFBEB" }, line: { color: "FFC000", width: 1.5 }, rectRadius: 0.1 });
slide.addText("Agent 5: GitLab Data Sync", { x: 0.7, y: 1.2, w: 5.5, h: 0.4, fontSize: 16, fontFace: "Segoe UI", bold: true, color: "B8860B" });
slide.addText("Commits healed JSON back to GitLab repository.", { x: 0.7, y: 1.65, w: 5.5, h: 0.3, fontSize: 11, color: TEXT_DARK });

slide.addText([
    { text: "Auto-commit Mode (default):\n", options: { bold: true, fontSize: 11, color: SUCCESS } },
    { text: "→ Commits immediately on pipeline run\n→ Logs commit hash\n\n", options: { fontSize: 10, color: TEXT_MUTED } },
    { text: "Manual Mode (gitlabAutoCommit = false):\n", options: { bold: true, fontSize: 11, color: WARNING } },
    { text: '→ Shows "Pending Commit" status\n→ "View JSON" button for review\n→ "Commit Now" button to push', options: { fontSize: 10, color: TEXT_MUTED } },
], { x: 0.7, y: 2.1, w: 5.5, h: 2.3, valign: "top", lineSpacingMultiple: 1.2 });

// Agent 6
slide.addShape(pptx.ShapeType.roundRect, { x: 6.8, y: 1.1, w: 6, h: 3.5, fill: { color: "F5F0FF" }, line: { color: "9B59B6", width: 1.5 }, rectRadius: 0.1 });
slide.addText("Agent 6: Pipeline Orchestrator", { x: 7.0, y: 1.2, w: 5.5, h: 0.4, fontSize: 16, fontFace: "Segoe UI", bold: true, color: "9B59B6" });
slide.addText("Triggers GitLab pipeline reruns and fetches pipeline details.", { x: 7.0, y: 1.65, w: 5.5, h: 0.3, fontSize: 11, color: TEXT_DARK });

slide.addText([
    { text: "Execution Steps:\n", options: { bold: true, fontSize: 11, color: TEXT_DARK } },
    { text: "1. List all pipeline schedules from GitLab\n", options: { fontSize: 10 } },
    { text: "2. Find schedule by description (case-insensitive)\n", options: { fontSize: 10 } },
    { text: "3. Trigger via POST /pipeline_schedules/:id/play\n", options: { fontSize: 10 } },
    { text: "4. Wait 2s → fetch latest pipeline details\n", options: { fontSize: 10 } },
    { text: "5. Return: id, status, branch, web_url\n\n", options: { fontSize: 10 } },
    { text: "Pipeline URL included in Teams notification\nas a clickable link.", options: { fontSize: 10, color: TEXT_MUTED } },
], { x: 7.0, y: 2.1, w: 5.5, h: 2.3, valign: "top", lineSpacingMultiple: 1.2 });

// Config table
slide.addText("Configuration", { x: 0.5, y: 4.9, w: 5, h: 0.35, fontSize: 14, fontFace: "Segoe UI", bold: true, color: TEXT_DARK });
const a56Config = [
    [{ text: "Field", options: { bold: true, fill: { color: PRIMARY }, color: TEXT_WHITE, fontSize: 9 } }, { text: "Agent", options: { bold: true, fill: { color: PRIMARY }, color: TEXT_WHITE, fontSize: 9 } }, { text: "Description", options: { bold: true, fill: { color: PRIMARY }, color: TEXT_WHITE, fontSize: 9 } }],
    [{ text: "gitlabAutoCommit", options: { fontFace: "Consolas", fontSize: 9 } }, { text: "5", options: { fontSize: 9 } }, { text: "Toggle auto/manual commit (default: true)", options: { fontSize: 9 } }],
    [{ text: "gitlabToken", options: { fontFace: "Consolas", fontSize: 9 } }, { text: "4,5,6", options: { fontSize: 9 } }, { text: "GitLab private access token", options: { fontSize: 9 } }],
    [{ text: "gitlabProjectId", options: { fontFace: "Consolas", fontSize: 9 } }, { text: "4,5,6", options: { fontSize: 9 } }, { text: "GitLab project ID", options: { fontSize: 9 } }],
    [{ text: "gitlabPipelineScheduleDescription", options: { fontFace: "Consolas", fontSize: 9 } }, { text: "6", options: { fontSize: 9 } }, { text: "Schedule name to trigger", options: { fontSize: 9 } }],
    [{ text: "gitlabInsecureTls", options: { fontFace: "Consolas", fontSize: 9 } }, { text: "4,5,6", options: { fontSize: 9 } }, { text: "Skip TLS verification (default: false)", options: { fontSize: 9 } }],
];
slide.addTable(a56Config, { x: 0.5, y: 5.3, w: 12.3, colW: [4.5, 1, 6.8], border: { type: "solid", color: BORDER, pt: 0.5 }, rowH: 0.3 });


// ============================================================
// SLIDE 7: Agent 7 - Jira Defect Scout
// ============================================================
slide = pptx.addSlide();
slide.background = { fill: TEXT_WHITE };
slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: 0.06, fill: { color: PRIMARY } });

slide.addText("Agent 7: Jira Defect Scout", {
    x: 0.5, y: 0.25, w: 12, h: 0.55,
    fontSize: 28, fontFace: "Segoe UI", bold: true, color: TEXT_DARK,
});
slide.addText("Creates Jira tickets for functional failures with steps, logs, and screenshots", {
    x: 0.5, y: 0.75, w: 12, h: 0.35, fontSize: 13, fontFace: "Segoe UI", color: TEXT_MUTED,
});

// Consolidation flow
slide.addShape(pptx.ShapeType.roundRect, { x: 0.5, y: 1.4, w: 7.5, h: 3.0, fill: { color: "FEF2F2" }, line: { color: "E74C3C", width: 1.5 }, rectRadius: 0.1 });
slide.addText("🔄  Consolidation Algorithm", { x: 0.7, y: 1.5, w: 7, h: 0.4, fontSize: 15, fontFace: "Segoe UI", bold: true, color: "E74C3C" });
slide.addText([
    { text: "Scenarios with identical root causes → single Jira ticket\n\n", options: { fontSize: 11 } },
    { text: "1. ", options: { bold: true } }, { text: "Get error log from each scenario\n", options: { fontSize: 10 } },
    { text: "2. ", options: { bold: true } }, { text: "Normalize: timestamps→<ts>, UUIDs→<uuid>, numbers→#\n", options: { fontSize: 10 } },
    { text: "3. ", options: { bold: true } }, { text: "Use normalized string as grouping key\n", options: { fontSize: 10 } },
    { text: "4. ", options: { bold: true } }, { text: "First scenario = representative (provides steps/screenshot)\n", options: { fontSize: 10 } },
    { text: "5. ", options: { bold: true } }, { text: "Others = listed as impacted test cases\n\n", options: { fontSize: 10 } },
    { text: "Summary: ", options: { bold: true, fontSize: 10, color: "E74C3C" } },
    { text: "[Consolidated] AI FAILURE: <name> (+N more)", options: { fontSize: 10, fontFace: "Consolas" } },
], { x: 0.7, y: 1.95, w: 7, h: 2.3, valign: "top", lineSpacingMultiple: 1.2 });

// Mode toggle
slide.addShape(pptx.ShapeType.roundRect, { x: 8.3, y: 1.4, w: 4.5, h: 3.0, fill: { color: BG_LIGHT }, line: { color: BORDER, width: 1 }, rectRadius: 0.1 });
slide.addText("⚙️  Auto/Manual Mode", { x: 8.5, y: 1.5, w: 4, h: 0.4, fontSize: 14, fontFace: "Segoe UI", bold: true, color: TEXT_DARK });

slide.addShape(pptx.ShapeType.roundRect, { x: 8.5, y: 2.0, w: 4.1, h: 1.0, fill: { color: "F0FFF4" }, line: { color: SUCCESS, width: 1 }, rectRadius: 0.06 });
slide.addText([
    { text: "Auto-create ON\n", options: { bold: true, fontSize: 11, color: SUCCESS } },
    { text: "Creates tickets immediately\nduring pipeline execution", options: { fontSize: 9, color: TEXT_MUTED } },
], { x: 8.6, y: 2.05, w: 3.9, h: 0.9, valign: "middle" });

slide.addShape(pptx.ShapeType.roundRect, { x: 8.5, y: 3.15, w: 4.1, h: 1.1, fill: { color: "FFFBEB" }, line: { color: WARNING, width: 1 }, rectRadius: 0.06 });
slide.addText([
    { text: "Auto-create OFF\n", options: { bold: true, fontSize: 11, color: WARNING } },
    { text: 'Shows "X Pending Review" status\n"Create Defects" button on card\nUser reviews → clicks to submit', options: { fontSize: 9, color: TEXT_MUTED } },
], { x: 8.6, y: 3.2, w: 3.9, h: 1.0, valign: "middle" });

// Ticket content
slide.addText("Jira Ticket Content", { x: 0.5, y: 4.7, w: 5, h: 0.35, fontSize: 14, fontFace: "Segoe UI", bold: true, color: TEXT_DARK });
const ticketParts = [
    { label: "Reproducible Steps", desc: "Step-by-step from scenario with PASSED/FAILED status", icon: "📝" },
    { label: "Failure Log", desc: "Full error message / stack trace", icon: "📋" },
    { label: "Impacted Test Cases", desc: "All consolidated scenario names", icon: "📊" },
    { label: "Screenshot", desc: "Auto-extracted from failed step embeddings", icon: "📸" },
];
ticketParts.forEach((tp, i) => {
    const tx = 0.5 + i * 3.15;
    slide.addShape(pptx.ShapeType.roundRect, { x: tx, y: 5.1, w: 2.95, h: 1.1, fill: { color: BG_LIGHT }, line: { color: BORDER, width: 1 }, rectRadius: 0.06 });
    slide.addText(`${tp.icon}  ${tp.label}`, { x: tx + 0.1, y: 5.15, w: 2.7, h: 0.35, fontSize: 10, fontFace: "Segoe UI", bold: true, color: TEXT_DARK });
    slide.addText(tp.desc, { x: tx + 0.1, y: 5.5, w: 2.7, h: 0.55, fontSize: 9, fontFace: "Segoe UI", color: TEXT_MUTED });
});


// ============================================================
// SLIDE 8: Agent 8 & Notification
// ============================================================
slide = pptx.addSlide();
slide.background = { fill: TEXT_WHITE };
slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: 0.06, fill: { color: PRIMARY } });

slide.addText("Agent 8: Notification Trigger — Teams Consolidated Report", {
    x: 0.5, y: 0.25, w: 12, h: 0.55,
    fontSize: 26, fontFace: "Segoe UI", bold: true, color: TEXT_DARK,
});
slide.addText("Sends comprehensive pipeline execution summary to Microsoft Teams via webhook", {
    x: 0.5, y: 0.75, w: 12, h: 0.35, fontSize: 13, fontFace: "Segoe UI", color: TEXT_MUTED,
});

// Report sections
slide.addText("Report Sections", { x: 0.5, y: 1.3, w: 5, h: 0.4, fontSize: 16, fontFace: "Segoe UI", bold: true, color: TEXT_DARK });

const reportSections = [
    { icon: "📊", name: "Header & Metrics", desc: "Solution, report name, duration, Total/Passed/Failed" },
    { icon: "🏷️", name: "Classification Breakdown", desc: "Functional / Data / Env / Automation counts" },
    { icon: "🔧", name: "Data Healing Summary", desc: "File path, dates healed, rate records injected" },
    { icon: "📦", name: "GitLab Commit Info", desc: "Commit hash or pending status" },
    { icon: "🚀", name: "Pipeline Orchestrator", desc: "Pipeline ID, status, clickable URL" },
    { icon: "🎫", name: "Jira Status", desc: "Tickets created or pending review count" },
    { icon: "❌", name: "Failed Scenarios", desc: "Top 10 failed scenario names" },
    { icon: "🤖", name: "Per-Agent Details", desc: "Status, result, and recent logs for each agent" },
];

reportSections.forEach((rs, i) => {
    const col = i < 4 ? 0 : 1;
    const row = i % 4;
    const rx = 0.5 + col * 6.3;
    const ry = 1.85 + row * 0.95;
    slide.addShape(pptx.ShapeType.roundRect, { x: rx, y: ry, w: 6, h: 0.82, fill: { color: BG_LIGHT }, line: { color: BORDER, width: 1 }, rectRadius: 0.06 });
    slide.addText(`${rs.icon}  ${rs.name}`, { x: rx + 0.15, y: ry + 0.05, w: 5.5, h: 0.35, fontSize: 12, fontFace: "Segoe UI", bold: true, color: TEXT_DARK });
    slide.addText(rs.desc, { x: rx + 0.55, y: ry + 0.4, w: 5.2, h: 0.35, fontSize: 10, fontFace: "Segoe UI", color: TEXT_MUTED });
});

// Message format
slide.addShape(pptx.ShapeType.roundRect, { x: 0.5, y: 5.85, w: 12.3, h: 1.3, fill: { color: "F0F7FF" }, line: { color: PRIMARY, width: 1 }, rectRadius: 0.1 });
slide.addText("Teams Message Format", { x: 0.7, y: 5.95, w: 5, h: 0.3, fontSize: 13, fontFace: "Segoe UI", bold: true, color: PRIMARY });
slide.addText([
    { text: "• Office 365 MessageCard format (@type: MessageCard)\n", options: { fontSize: 10 } },
    { text: "• Color-coded theme: ", options: { fontSize: 10 } },
    { text: "Red", options: { fontSize: 10, bold: true, color: ERROR } },
    { text: " if failures > 0, ", options: { fontSize: 10 } },
    { text: "Blue", options: { fontSize: 10, bold: true, color: PRIMARY } },
    { text: " otherwise\n", options: { fontSize: 10 } },
    { text: "• Sections with key-value fact pairs  •  Markdown support  •  Clickable pipeline URL", options: { fontSize: 10 } },
], { x: 0.7, y: 6.3, w: 11.5, h: 0.7, valign: "top" });


// ============================================================
// SLIDE 9: External Dependencies & API Summary
// ============================================================
slide = pptx.addSlide();
slide.background = { fill: TEXT_WHITE };
slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: 0.06, fill: { color: PRIMARY } });

slide.addText("External Dependencies & API Endpoints", {
    x: 0.5, y: 0.25, w: 12, h: 0.55,
    fontSize: 26, fontFace: "Segoe UI", bold: true, color: TEXT_DARK,
});

// Dependencies
slide.addText("External Systems", { x: 0.5, y: 1.0, w: 5, h: 0.35, fontSize: 15, fontFace: "Segoe UI", bold: true, color: TEXT_DARK });
const deps = [
    [{ text: "System", options: { bold: true, fill: { color: PRIMARY }, color: TEXT_WHITE, fontSize: 9 } }, { text: "Purpose", options: { bold: true, fill: { color: PRIMARY }, color: TEXT_WHITE, fontSize: 9 } }, { text: "Connection", options: { bold: true, fill: { color: PRIMARY }, color: TEXT_WHITE, fontSize: 9 } }],
    [{ text: "MongoDB", options: { fontSize: 9, bold: true } }, { text: "Selenium Store, Planning History", options: { fontSize: 9 } }, { text: "localhost:27017 / bugsense DB", options: { fontSize: 9 } }],
    [{ text: "GitLab", options: { fontSize: 9, bold: true } }, { text: "Test data repo, Pipelines", options: { fontSize: 9 } }, { text: "REST API v4 + Private Token", options: { fontSize: 9 } }],
    [{ text: "Jira (Atlassian)", options: { fontSize: 9, bold: true } }, { text: "Defect search & creation", options: { fontSize: 9 } }, { text: "REST API v2 + Basic Auth", options: { fontSize: 9 } }],
    [{ text: "Confluence", options: { fontSize: 9, bold: true } }, { text: "Report storage (fallback)", options: { fontSize: 9 } }, { text: "REST API + Basic Auth", options: { fontSize: 9 } }],
    [{ text: "Microsoft Teams", options: { fontSize: 9, bold: true } }, { text: "Notifications", options: { fontSize: 9 } }, { text: "Incoming Webhook", options: { fontSize: 9 } }],
    [{ text: "Firebase Firestore", options: { fontSize: 9, bold: true } }, { text: "Configuration storage", options: { fontSize: 9 } }, { text: "Firebase SDK", options: { fontSize: 9 } }],
    [{ text: "GenAI (Genkit)", options: { fontSize: 9, bold: true } }, { text: "Report parsing, Classification", options: { fontSize: 9 } }, { text: "Server-side AI flows", options: { fontSize: 9 } }],
];
slide.addTable(deps, { x: 0.5, y: 1.4, w: 12.3, colW: [2.5, 4, 5.8], border: { type: "solid", color: BORDER, pt: 0.5 }, rowH: 0.32 });

// API endpoints
slide.addText("API Endpoints", { x: 0.5, y: 4.3, w: 5, h: 0.35, fontSize: 15, fontFace: "Segoe UI", bold: true, color: TEXT_DARK });
const apis = [
    [{ text: "Endpoint", options: { bold: true, fill: { color: PRIMARY }, color: TEXT_WHITE, fontSize: 8 } }, { text: "Method", options: { bold: true, fill: { color: PRIMARY }, color: TEXT_WHITE, fontSize: 8 } }, { text: "Agent", options: { bold: true, fill: { color: PRIMARY }, color: TEXT_WHITE, fontSize: 8 } }, { text: "Purpose", options: { bold: true, fill: { color: PRIMARY }, color: TEXT_WHITE, fontSize: 8 } }],
    [{ text: "/api/selenium/latest", options: { fontFace: "Consolas", fontSize: 8 } }, { text: "GET", options: { fontSize: 8 } }, { text: "1", options: { fontSize: 8 } }, { text: "Fetch latest execution JSON", options: { fontSize: 8 } }],
    [{ text: "/api/confluence/fetch", options: { fontFace: "Consolas", fontSize: 8 } }, { text: "POST", options: { fontSize: 8 } }, { text: "1", options: { fontSize: 8 } }, { text: "Fetch report from Confluence", options: { fontSize: 8 } }],
    [{ text: "/api/jira/search-defects", options: { fontFace: "Consolas", fontSize: 8 } }, { text: "POST", options: { fontSize: 8 } }, { text: "9", options: { fontSize: 8 } }, { text: "Search for existing defects", options: { fontSize: 8 } }],
    [{ text: "/api/mongo/planning-history", options: { fontFace: "Consolas", fontSize: 8 } }, { text: "POST", options: { fontSize: 8 } }, { text: "4", options: { fontSize: 8 } }, { text: "Query rate records from MongoDB", options: { fontSize: 8 } }],
    [{ text: "/api/gitlab/update", options: { fontFace: "Consolas", fontSize: 8 } }, { text: "POST", options: { fontSize: 8 } }, { text: "4", options: { fontSize: 8 } }, { text: "Fetch, heal dates, inject rates", options: { fontSize: 8 } }],
    [{ text: "/api/gitlab/commit", options: { fontFace: "Consolas", fontSize: 8 } }, { text: "POST", options: { fontSize: 8 } }, { text: "5", options: { fontSize: 8 } }, { text: "Commit healed JSON to GitLab", options: { fontSize: 8 } }],
    [{ text: "/api/gitlab/trigger-schedule", options: { fontFace: "Consolas", fontSize: 8 } }, { text: "POST", options: { fontSize: 8 } }, { text: "6", options: { fontSize: 8 } }, { text: "Trigger GitLab pipeline schedule", options: { fontSize: 8 } }],
    [{ text: "/api/jira/create", options: { fontFace: "Consolas", fontSize: 8 } }, { text: "POST", options: { fontSize: 8 } }, { text: "7", options: { fontSize: 8 } }, { text: "Create Jira issue with screenshot", options: { fontSize: 8 } }],
    [{ text: "/api/notifications/teams", options: { fontFace: "Consolas", fontSize: 8 } }, { text: "POST", options: { fontSize: 8 } }, { text: "8", options: { fontSize: 8 } }, { text: "Send Teams notification", options: { fontSize: 8 } }],
];
slide.addTable(apis, { x: 0.5, y: 4.7, w: 12.3, colW: [3.5, 1, 0.8, 7], border: { type: "solid", color: BORDER, pt: 0.5 }, rowH: 0.28 });


// ============================================================
// SLIDE 10: Thank You
// ============================================================
slide = pptx.addSlide();
slide.background = { fill: BG_DARK };
slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: 0.08, fill: { color: PRIMARY } });
slide.addShape(pptx.ShapeType.rect, { x: 0, y: 7.42, w: "100%", h: 0.08, fill: { color: PRIMARY } });

slide.addText("Thank You", {
    x: 0.8, y: 2.2, w: 11.5, h: 1.0,
    fontSize: 44, fontFace: "Segoe UI", bold: true, color: TEXT_WHITE, align: "center",
});
slide.addShape(pptx.ShapeType.rect, { x: 5.5, y: 3.3, w: 2.2, h: 0.04, fill: { color: ACCENT } });
slide.addText("AI Agent Orchestrator  —  BugSense Platform", {
    x: 0.8, y: 3.7, w: 11.5, h: 0.5,
    fontSize: 16, fontFace: "Segoe UI Light", color: ACCENT, align: "center",
});
slide.addText("9 Agents  •  End-to-End Automation  •  GenAI Powered", {
    x: 0.8, y: 4.3, w: 11.5, h: 0.5,
    fontSize: 14, fontFace: "Segoe UI", color: TEXT_MUTED, align: "center",
});

// Write file
const outputPath = "./docs/AI-Agent-Orchestrator.pptx";
pptx.writeFile({ fileName: outputPath })
    .then(() => console.log(`PPT created: ${outputPath}`))
    .catch((err) => console.error("Error:", err));
