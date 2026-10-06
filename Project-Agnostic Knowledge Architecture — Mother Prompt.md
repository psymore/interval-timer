# PROJECT-AGNOSTIC KNOWLEDGE ARCHITECTURE
## Mother Prompt — Discovery, Decomposition, Governance & Context Architecture

You are working on an existing software repository.

Your task is to help establish or improve a **project-agnostic knowledge architecture** for that repository.

This prompt is intentionally not tied to any specific programming language, framework, application type, company, or project.

The architecture must work for repositories ranging from:

- mobile applications
- web applications
- backend systems
- game projects
- libraries
- monorepos
- multi-language repositories
- infrastructure projects
- long-lived products
- experimental projects

The objective is not to create more documentation.

The objective is to create a system in which:

> **knowledge has an identifiable home, ownership is explicit, navigation is cheap, context loading is deliberate, and no single AI instruction file becomes the accidental encyclopedia of the project.**

---

# 0. PRIMARY OBJECTIVE

Establish a documentation and knowledge architecture that answers five questions quickly:

1. **Where does this knowledge belong?**
2. **Which document is authoritative?**
3. **When should this knowledge be loaded?**
4. **How does an engineer or AI agent discover it?**
5. **What happens when the existing architecture no longer adequately represents a recurring problem?**

The final system should minimize unnecessary context loading while preserving discoverability.

The architecture should therefore optimize for:

```text
Discoverability
+
Authority
+
Ownership
+
Progressive Context Loading
+
Low Duplication
+
Low Instructional Overhead
```

Do not optimize for the number of documents.

Do not optimize for visual neatness.

Do not optimize for reducing `CLAUDE.md` at any cost.

Optimize for **correct knowledge placement**.

---

# 1. CORE PRINCIPLE

Treat the repository's knowledge as a system.

Do not treat documentation as a collection of unrelated Markdown files.

The desired conceptual model is:

```text
PURPOSE
   ↓
GOVERNANCE
   ↓
DOMAINS
   ↓
KNOWLEDGE ARTIFACTS
   ↓
FEATURES / IMPLEMENTATION
   ↓
REFERENCE
```

With navigation and context flowing around this structure:

```text
                    ┌──────────────┐
                    │   PURPOSE    │
                    └──────┬───────┘
                           ↓
                    ┌──────────────┐
                    │  GOVERNANCE  │
                    └──────┬───────┘
                           ↓
             ┌─────────────┼─────────────┐
             ↓             ↓             ↓
          DOMAINS        STATUS       CROSS-CUTTING
             ↓
       KNOWLEDGE
        ARTIFACTS
             ↓
       FEATURES / CODE
             ↓
         REFERENCE
```

This is a conceptual model, not a requirement that the repository contain exactly these folders.

Map the model onto the repository's actual needs.

Do not force the repository into a predetermined folder structure merely because the model contains those concepts.

---

# 2. FIRST RULE: DISCOVER BEFORE MODIFYING

Before changing anything:

**inspect the repository.**

Do not assume:

- what `CLAUDE.md` contains,
- what `AGENTS.md` contains,
- what documentation exists,
- which documents are authoritative,
- which documents are obsolete,
- which folders represent domains,
- which files are governance,
- which files are specifications,
- or how the current development workflow operates.

Read the repository first.

At minimum inspect:

```text
CLAUDE.md
AGENTS.md
README.md
docs/
architecture/
.github/
.github/copilot-instructions.md
```

when they exist.

Also inspect:

- existing governance documents
- documentation maps
- architecture documents
- status documents
- domain documentation
- specs
- plans
- ADRs
- known issues
- project-specific instruction files
- repository scripts related to documentation or AI workflows

Do not assume these exact paths exist.

Discover the actual structure first.

---

# 3. BUILD A KNOWLEDGE INVENTORY

Before proposing changes, create an internal inventory.

For every meaningful knowledge source determine:

```text
What does this document know?
Who owns that knowledge?
Is it authoritative?
Who consumes it?
When should it be loaded?
What documents depend on it?
Does another document duplicate it?
```

Classify knowledge into conceptual categories such as:

### Purpose

Why the project exists.

Examples:

- product purpose
- mission
- scope
- quality attributes
- long-term intent

### Governance

Rules that remain valid across many tasks.

Examples:

- engineering principles
- testing policy
- architecture rules
- commit/merge rules
- cross-cutting behavioral constraints

### Domains

Stable knowledge belonging to a subsystem or area.

Examples:

- engine
- UI system
- authentication
- networking
- a game
- a backend subsystem

### Status

Current, time-sensitive information.

Examples:

- roadmap
- current priorities
- known issues
- migration status

### Feature Knowledge

Knowledge specific to a feature.

Examples:

- feature specification
- feature design
- implementation plan

### Decisions

Why an architectural choice exists.

Examples:

- ADRs
- decision records
- architecture decisions

### Reference

Deep technical material that should not normally be loaded into every context.

Examples:

- generated reference
- API details
- code indexes
- implementation references
- deep WKA material

### Escalation

Knowledge describing when a recurring problem has become architectural rather than local.

Examples:

- recurring architectural problems
- escalation criteria
- architectural remediation decisions

These are conceptual categories.

Do not create documents for categories that the repository does not actually need.

---

# 4. DETERMINE AUTHORITY

For every major knowledge category, determine its canonical home.

The system should have a clear relationship:

```text
Knowledge Type
      ↓
Canonical Source
```

For example:

```text
Engineering Principle
        ↓
engineering-principles.md

Current Roadmap
        ↓
roadmap.md

Feature Design
        ↓
specs/

Implementation Plan
        ↓
plans/

Domain Architecture
        ↓
domain documentation

Recurring Architectural Problem
        ↓
architecture escalation / decision mechanism
```

These are examples, not mandatory filenames.

Use the repository's actual structure.

The critical requirement is:

> Every important class of knowledge should have one identifiable authoritative home.

---

# 5. SINGLE SOURCE OF TRUTH

Treat duplication as an architectural problem.

Do not solve duplication by making two documents "stay synchronized."

Instead:

```text
ONE KNOWLEDGE
      ↓
ONE AUTHORITY
      ↓
MANY REFERENCES
```

A routing document may point to authoritative knowledge.

It may summarize enough information to route correctly.

It should not become a second authority.

When duplicate knowledge is found:

1. identify the likely authoritative source,
2. verify the information,
3. move or consolidate knowledge only when safe,
4. replace duplicate content with routing/reference,
5. preserve information that would otherwise be lost.

Never delete knowledge merely because it appears redundant without first determining whether it contains unique information.

---

# 6. CLAUDE.md PRINCIPLE

`CLAUDE.md` is not the project's knowledge base.

Its ideal role is:

> **navigation and context-routing entry point.**

It should answer:

```text
Where should I look?
When should I look there?
What should I check before acting?
```

It should generally NOT contain:

- detailed architecture explanations
- long feature specifications
- historical narratives
- duplicated governance
- large known-issue descriptions
- implementation tutorials
- extensive domain knowledge
- detailed decision rationale

Prefer:

```text
CLAUDE.md
    ↓
Route
    ↓
Canonical Document
```

rather than:

```text
CLAUDE.md
    ↓
Everything
```

However:

**Do not reduce CLAUDE.md blindly.**

A statement should be removed only after determining where its authoritative knowledge belongs.

The objective is not:

> "Make CLAUDE.md as small as possible."

The objective is:

> "Make CLAUDE.md contain only what must be globally available for navigation and behavior."

---

# 7. AGENTS / GLOBAL INSTRUCTIONS

Determine what global instruction files actually exist.

For example:

```text
AGENTS.md
CLAUDE.md
.github/copilot-instructions.md
```

Do not assume they serve identical purposes.

Different AI tools may require different operational instructions.

A tool-specific instruction file may legitimately contain:

- tool-specific behavior
- workflow constraints
- safety constraints
- operational instructions
- limitations of that particular agent

Do not force tool-specific operational guidance into project-wide governance merely to make documents look symmetrical.

This distinction is important:

```text
PROJECT GOVERNANCE
        ≠
TOOL-SPECIFIC OPERATING INSTRUCTIONS
```

A Copilot instruction file may intentionally remain separate if its purpose is operational rather than architectural.

---

# 8. CONTEXT LOADING MODEL

Design a progressive context-loading model.

The goal is:

> Load enough knowledge to act correctly, but not enough knowledge to waste context.

A typical conceptual hierarchy is:

```text
ALWAYS
  ↓
SESSION START
  ↓
BEFORE IMPLEMENTATION
  ↓
DOMAIN / TASK SPECIFIC
  ↓
ESCALATION
  ↓
DEEP REFERENCE
```

Map actual repository documents into these levels.

For each document determine:

```text
Load Frequency
Typical Trigger
Expected Consumer
Reason for Loading
```

For example:

### Always

Small global routing and behavioral instructions.

### Session Start

Current project state.

### Before Implementation

Engineering rules that materially affect implementation.

### Domain Specific

Only when touching that domain.

### Escalation

Only when a recurring or architectural problem is detected.

### Deep Reference

Only when detailed investigation requires it.

Avoid turning "always loaded" into a dumping ground.

---

# 9. KNOWLEDGE GRAVITY

Watch for **knowledge gravity**.

Knowledge gravity occurs when a document becomes increasingly large because people keep adding information to the easiest-to-find location.

Typical symptoms:

```text
CLAUDE.md
    ↓
large
    ↓
more convenient
    ↓
more knowledge added
    ↓
larger context
    ↓
less useful routing
```

The architecture should actively resist this.

When knowledge is added, ask:

> Is this actually global?

If not, route it to its proper authority.

---

# 10. ROUTING MODEL

Create a clear navigation model.

A developer or AI should be able to begin with a task and discover the correct knowledge path.

Example:

```text
Task
 ↓
CLAUDE.md
 ↓
Route
 ↓
Domain / Governance / Status / Specification
 ↓
Canonical Document
 ↓
Implementation
```

Another:

```text
Recurring Problem
 ↓
Existing Domain Knowledge
 ↓
Is this becoming architectural?
 ↓
Architecture Escalation
 ↓
Decision
```

The exact path must reflect the repository's actual governance.

Do not invent routes that the repository cannot support.

---

# 11. ARCHITECTURE ESCALATION

A mature knowledge architecture needs a mechanism for recognizing when a problem is no longer merely local.

Conceptually:

```text
Local Problem
      ↓
Local Fix
      ↓
Repeated?
      ↓
Architecture-shaped?
      ↓
Escalate
      ↓
Decision
      ↓
Canonical Architecture Knowledge
```

Do not automatically create an ADR for every bug.

Do not automatically escalate every repeated issue.

Use the repository's actual escalation criteria.

The purpose is to prevent:

```text
same problem
↓
same patch
↓
same problem
↓
another patch
```

from continuing indefinitely.

---

# 12. DOMAIN OWNERSHIP

Domain documentation should describe stable knowledge belonging to that domain.

A domain may contain concepts such as:

```text
overview
decisions
known issues
architecture
constraints
```

depending on what the repository actually needs.

Do not create empty documentation structures simply because they look architecturally complete.

A new domain should earn documentation through actual knowledge.

Avoid:

```text
every folder = domain
```

and avoid:

```text
every component = domain
```

The domain boundary should represent meaningful ownership.

---

# 13. STATUS VS GOVERNANCE

Keep time-sensitive information separate from standing rules.

For example:

```text
"Always run X before committing"
        ↓
Governance

"X is currently broken"
        ↓
Status / Known Issue

"We intend to replace X next month"
        ↓
Roadmap
```

Do not mix these categories.

A roadmap should not become a governance document.

A known issue should not become an engineering principle.

A governance document should not become a project diary.

---

# 14. FEATURES VS ARCHITECTURE

Do not allow feature documentation to silently become architecture.

Separate:

```text
WHY / WHAT
    ↓
Feature Specification

HOW WE PLAN TO BUILD IT
    ↓
Implementation Plan

WHY THE SYSTEM IS STRUCTURED THIS WAY
    ↓
Architecture / Decision

WHAT IS CURRENTLY TRUE
    ↓
Status / Domain Knowledge
```

If a feature decision changes a lasting architectural rule, escalate that knowledge into the appropriate architectural authority.

---

# 15. DECISION OWNERSHIP

Architectural decisions should have an identifiable home.

A decision should answer:

```text
What was decided?
Why?
What alternatives existed?
What consequences follow?
```

Do not duplicate the full decision across:

- CLAUDE.md
- roadmap
- domain overview
- feature spec
- implementation plan

Instead, reference the decision.

---

# 16. DOCUMENTATION MAP

If the repository benefits from a documentation map, it should function as:

```text
INDEX
```

not:

```text
ENCYCLOPEDIA
```

It should help answer:

```text
Where does this knowledge live?
Who owns it?
When should I read it?
```

The map should not duplicate large sections of the documents it indexes.

---

# 17. FILE SIZE IS NOT THE PRIMARY METRIC

Do not optimize documentation architecture based purely on line count.

A 20-line document containing duplicated authority can be worse than a 100-line routing map.

Use these questions instead:

```text
Is the knowledge authoritative?
Is ownership clear?
Is the route obvious?
Is context loading appropriate?
Is duplication minimized?
Can an AI find the right information without loading everything?
```

Size is a signal, not the goal.

---

# 18. PROJECT-AGNOSTIC DESIGN

Do not hard-code assumptions about:

- React
- React Native
- Expo
- TypeScript
- Python
- C#
- .NET
- mobile
- web
- games
- backend
- monorepos

The architecture must emerge from the repository.

Technology-specific knowledge belongs in the appropriate domain or technical documentation.

The knowledge architecture itself should remain technology-neutral.

---

# 19. PRESERVE EXISTING KNOWLEDGE

This is a migration, not a deletion exercise.

Before removing or moving content:

```text
Identify
↓
Classify
↓
Determine authority
↓
Relocate / consolidate
↓
Replace with route
↓
Verify
```

Never use:

```text
"this looks redundant"
↓
delete
```

without verifying the information's ownership.

No knowledge should disappear merely because the architecture is being simplified.

---

# 20. NO INVENTED GOVERNANCE

This is one of the most important constraints.

Do not invent:

- new engineering principles
- new policies
- new governance rules
- new ownership models
- new architectural decisions
- new project priorities

unless explicitly instructed to design them.

Your task is primarily:

```text
DISCOVER
CLASSIFY
ROUTE
CONSOLIDATE
VALIDATE
```

not:

```text
INVENT
```

If the repository lacks enough information to establish a rule, report the gap.

Do not silently fill it with generic best practices.

---

# 21. NO SECOND SOURCE OF TRUTH

Any visualization, map, summary, generated index, or AI instruction file must remain subordinate to the canonical knowledge.

Use:

```text
Canonical Document
       ↑
       |
Reference / Route / Visualization
```

Never:

```text
Canonical Document
       ↕
Visualization
       ↕
CLAUDE.md
```

with conflicting authority.

If a summary differs from the canonical document, the canonical document wins.

---

# 22. MIGRATION STRATEGY

Work incrementally.

Do not perform a giant documentation rewrite.

Prefer phases such as:

```text
Phase 0
Discovery

Phase 1
Knowledge Inventory

Phase 2
Authority & Ownership Model

Phase 3
Routing Architecture

Phase 4
CLAUDE.md Reduction

Phase 5
Validation

Phase 6
Closeout
```

The exact phase names may change if the repository requires something different.

Every phase should be independently reviewable.

Where practical, each phase should be:

- small
- reversible
- understandable
- validated before the next phase

---

# 23. PHASE 0 — DISCOVERY

Before modifying files:

inspect the repository.

Produce an internal understanding of:

```text
Current instruction hierarchy
Current documentation hierarchy
Current governance
Current domains
Current status documents
Current feature documentation
Current decision records
Current routing
Current duplication
Current dead links
Current orphaned documents
```

Do not modify files during discovery unless explicitly instructed.

---

# 24. PHASE 1 — KNOWLEDGE INVENTORY

Build a classification of existing knowledge.

For each significant document determine:

```text
Path
Category
Purpose
Authority
Owner
Consumers
Load Frequency
Dependencies
Potential Duplication
```

Identify:

### Canonical knowledge

The document that should own the information.

### Routing knowledge

Information whose purpose is to direct readers elsewhere.

### Derived knowledge

Generated or summarized information.

### Historical knowledge

Information that explains evolution but should not govern current behavior.

### Obsolete knowledge

Information that no longer represents the repository.

Do not delete obsolete material automatically.

Verify first.

---

# 25. PHASE 2 — AUTHORITY MODEL

Define the repository's actual authority hierarchy.

The hierarchy should answer:

```text
What outranks what?
Where does a conflict get resolved?
Which document wins?
```

Do not create an elaborate hierarchy if the repository doesn't need one.

The result should be understandable by both humans and AI agents.

---

# 26. PHASE 3 — ROUTING ARCHITECTURE

Design the navigation layer.

The desired experience is:

```text
Question
 ↓
Routing Entry Point
 ↓
Knowledge Category
 ↓
Canonical Source
```

The routing layer should be concise.

It should not absorb the knowledge it routes to.

---

# 27. PHASE 4 — CLAUDE.md DECOMPOSITION

Only now reduce `CLAUDE.md`.

For every substantive section ask:

```text
Is this global instruction?
Is this routing?
Is this canonical knowledge?
Is this status?
Is this domain knowledge?
Is this feature knowledge?
Is this historical information?
```

Then:

### If global instruction:

Keep it.

### If routing:

Keep it.

### If canonical knowledge:

Move responsibility to the canonical document and leave a route.

### If status:

Move to status.

### If domain knowledge:

Move to domain ownership.

### If feature knowledge:

Move to feature documentation.

### If decision rationale:

Move to decision ownership.

### If obsolete:

Verify before removal.

The final `CLAUDE.md` should become a **small operational map**, not a compressed copy of the repository.

---

# 28. CLAUDE.md TARGET SHAPE

A healthy final structure commonly resembles:

```text
@AGENTS.md

Project identity / purpose pointer

Where things live

Before you start

Current priorities / status pointers
```

This is an example, not a rigid template.

The actual structure must reflect the repository.

---

# 29. VALIDATION

After migration, perform a cold-read validation.

Pretend you are a new AI agent entering the repository.

Test realistic questions such as:

```text
Where are the engineering rules?

Where are current priorities?

Where is the architecture of subsystem X?

Where is the specification for feature Y?

Where is the implementation plan?

Where is the reason for architectural decision Z?

What should I read before modifying subsystem X?

What should I do if I encounter a recurring architectural problem?
```

For every question:

```text
Can the answer be discovered quickly?
Is the destination authoritative?
Is the destination correct?
Does the route terminate?
```

---

# 30. ROUTING DEAD-END CHECK

Every route must terminate in an actual knowledge source.

Detect:

```text
broken links
missing files
stale paths
orphaned references
circular routing
ambiguous ownership
duplicate authorities
```

Do not accept:

```text
"See documentation"
```

if there is no clear destination.

---

# 31. KNOWLEDGE-LOSS CHECK

After reducing CLAUDE.md:

read the original and final versions.

For every substantive piece of knowledge in the original ask:

```text
Where does this knowledge live now?
```

Every answer must be one of:

```text
Canonical document
Valid reference
Verified obsolete
Explicitly tool-specific
```

If the answer is:

```text
Nowhere
```

stop the migration and investigate.

---

# 32. CONTEXT-LOADING VALIDATION

Measure the conceptual loading cost.

Determine whether the architecture allows:

```text
Always loaded
        ↓
small

Session context
        ↓
small

Implementation context
        ↓
targeted

Domain context
        ↓
targeted

Deep reference
        ↓
on demand
```

The architecture fails if ordinary tasks require loading the entire documentation tree.

---

# 33. TOOL-SPECIFIC INSTRUCTIONS

Treat AI tools as consumers of the knowledge architecture.

Examples:

```text
Claude
Copilot
Cursor
other agents
```

may have separate operational instruction files.

Those files may contain tool-specific behavior.

Do not force all tool instructions into the project governance layer.

However, if a tool-specific instruction contains genuine project governance, identify that duplication and determine whether it should instead reference the canonical governance document.

---

# 34. GENERATED / INDEXED KNOWLEDGE

If the repository contains:

- code indexes
- generated maps
- documentation maps
- knowledge graphs
- architecture visualizations
- generated summaries

treat them as **derived views** unless explicitly designated otherwise.

The model should be:

```text
Canonical Knowledge
       ↓
Derived Representation
       ↓
AI / Human Consumption
```

not the reverse.

Generated views should never silently become the authoritative source.

---

# 35. AUTOMATION PRINCIPLE

Where repetitive documentation operations exist, prefer deterministic automation.

Examples:

```text
link validation
document discovery
index generation
code indexing
structure validation
schema validation
```

But automation must not silently invent knowledge.

Prefer:

```text
repository data
      ↓
deterministic transformation
      ↓
derived artifact
```

over:

```text
AI guess
      ↓
new authority
```

---

# 36. AI CONTEXT EFFICIENCY

The architecture should specifically support AI-assisted development.

The ideal workflow is:

```text
Task
 ↓
Small global context
 ↓
Route
 ↓
Targeted knowledge
 ↓
Relevant code
 ↓
Implementation
```

not:

```text
Task
 ↓
Read entire repository documentation
 ↓
Read everything
 ↓
Implement
```

The architecture should make the **correct context cheap to discover**.

---

# 37. REVIEW DISCIPLINE

Before changing an architectural document, ask:

```text
Is this actually the correct authority?
Does another document already own this?
Will this create duplication?
Does this change governance?
Does this change routing?
Does this change context loading?
Does this affect another domain?
```

If yes, stop and evaluate the impact before editing.

---

# 38. DO NOT OVER-ARCHITECT

A documentation architecture can itself become bureaucracy.

Avoid:

```text
document for every concept
folder for every category
ADR for every decision
index for every folder
governance for every behavior
```

The system should be as small as possible while preserving:

```text
authority
discoverability
ownership
context efficiency
```

---

# 39. FINAL ARCHITECTURAL TEST

The architecture should pass this thought experiment:

A new engineer arrives.

They ask:

> "I need to change something."

Can they discover:

```text
where to start
      ↓
what to read
      ↓
what rules apply
      ↓
which domain owns the knowledge
      ↓
where the feature specification lives
      ↓
where the implementation plan lives
      ↓
where architectural decisions live
      ↓
what to do if the existing architecture is insufficient
```

without reading the entire repository?

If yes, the architecture is working.

---

# 40. FINAL OUTPUT REQUIREMENTS

When executing this mother prompt:

### First response

Do not immediately modify files.

Report:

1. Current knowledge architecture
2. Current instruction hierarchy
3. Current CLAUDE.md responsibilities
4. Major knowledge categories discovered
5. Existing canonical sources
6. Existing routing mechanisms
7. Duplication / ownership conflicts
8. Context-loading problems
9. Potential migration risks
10. Proposed migration phases

Then wait for approval before performing destructive or broad changes unless explicitly instructed otherwise.

---

# 41. CHANGE SAFETY

During implementation:

- keep changes small,
- preserve existing knowledge,
- avoid unrelated code changes,
- do not modify application code,
- do not redesign unrelated tooling,
- do not introduce new governance without evidence,
- do not delete documents without verification,
- do not silently change meaning,
- validate every migration stage.

Each phase should clearly state:

```text
Goal
Files affected
Files not affected
Expected result
Validation
Rollback
```

---

# 42. DEFINITION OF DONE

The migration is complete only when:

### Authority

Every major knowledge category has a recognizable owner.

### Routing

A developer or AI can navigate from the entry point to the correct authority.

### CLAUDE.md

`CLAUDE.md` is primarily a router and global operational instruction layer rather than an encyclopedia.

### Context

Documents are loaded progressively rather than indiscriminately.

### Duplication

Important knowledge does not exist in multiple competing authoritative locations.

### Domains

Stable domain knowledge has meaningful ownership.

### Status

Current information is separated from standing governance.

### Decisions

Architectural decisions have an identifiable home.

### Features

Feature knowledge does not silently become architecture.

### Escalation

Recurring architectural problems have a defined escalation mechanism.

### Integrity

No knowledge was accidentally lost during migration.

### Validation

Cold-read navigation succeeds.

### Maintainability

The architecture can evolve without requiring `CLAUDE.md` to grow continuously.

---

# 43. ABSOLUTE CONSTRAINTS

These constraints override convenience.

## Do not invent authority.

## Do not delete knowledge without verification.

## Do not create duplicate sources of truth.

## Do not turn CLAUDE.md into an architecture encyclopedia.

## Do not force tool-specific instructions into project governance.

## Do not force a predetermined folder structure onto the repository.

## Do not design future WKA capabilities unless explicitly requested.

## Do not optimize for document count.

## Do not optimize for line count alone.

## Do not make broad changes before understanding the current architecture.

## Do not modify unrelated application code.

## Do not treat summaries or visualizations as authoritative unless explicitly designated.

## Do not silently resolve contradictions.

When contradictions are discovered:

```text
STOP
↓
IDENTIFY CONFLICT
↓
REPORT IT
↓
DETERMINE AUTHORITY
↓
ONLY THEN CHANGE
```

---

# 44. THE FUNDAMENTAL MODEL

Keep the following model in mind throughout the entire task:

```text
                 PURPOSE
                    │
                    ▼
               GOVERNANCE
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
      DOMAIN      STATUS     CROSS-CUTTING
        │
        ▼
   KNOWLEDGE ARTIFACTS
        │
   ┌────┼─────┬──────┐
   ▼    ▼     ▼      ▼
 SPECS PLANS DECISIONS ISSUES
   │
   ▼
IMPLEMENTATION
   │
   ▼
 REFERENCE
```

And the navigation principle:

```text
                 ┌───────────────┐
                 │   TASK START  │
                 └───────┬───────┘
                         │
                         ▼
                 ┌───────────────┐
                 │   CLAUDE.md   │
                 │    ROUTER     │
                 └───────┬───────┘
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
         GOVERNANCE    DOMAIN     STATUS
              │          │          │
              └──────────┼──────────┘
                         ▼
                 CANONICAL SOURCE
                         │
                         ▼
                   IMPLEMENTATION
                         │
                         ▼
                     REFERENCE
```

The fundamental rule is:

> **The entry point should tell you where knowledge lives, not attempt to contain all the knowledge itself.**

And the fundamental context rule is:

> **Load knowledge according to the task's need, not according to its existence.**

And the fundamental ownership rule is:

> **One class of knowledge → one canonical authority → many references.**

And the fundamental migration rule is:

> **Discover first. Classify second. Establish authority third. Route fourth. Simplify last.**

This is the operating philosophy for the entire knowledge-architecture migration.