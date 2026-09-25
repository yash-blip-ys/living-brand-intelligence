# Product Specification

## 1. Product Name

Working name: Living Brand Intelligence System

The final product name has not been decided yet.

---

## 2. Product Thesis

We are building an AI-powered living brand intelligence system for founders and early-stage startups.

The product takes a rough startup idea, discovers and structures what the startup actually is, turns that understanding into brand decisions, and preserves the reasoning behind those decisions.

When the startup learns something new or changes direction, the system identifies which existing brand decisions may be affected and allows the founder to review and approve the changes.

The goal is not simply to generate a brand.

The goal is to help a startup build and continuously evolve a coherent brand without losing the context behind it.

---

## 3. Core Problem

Early-stage founders often start with an incomplete or messy idea.

They may know:

- What they are trying to build
- A problem they have noticed
- A rough target audience
- A possible solution
- Some differentiating idea

But they may not yet know:

- Exactly who their primary customer is
- How to position the product
- What makes the product meaningfully different
- What the brand should stand for
- How the product should communicate
- Which brand decisions are based on facts versus assumptions

AI can generate polished branding quickly, but generic AI-generated branding can lose the specific characteristics that make a startup different.

A second problem appears later.

Startups learn.

The target customer may change.
The problem may become clearer.
The business model may change.
The product mechanism may change.
A new differentiator may emerge.

A brand system that does not understand this evolution can become disconnected from what the startup actually is.

---

## 4. Product Goal

The product should create a persistent, structured understanding of the startup and connect that understanding to brand decisions.

The system should make it possible to answer:

- What does this startup actually do?
- Who is it for?
- What problem does it solve?
- Why does that problem matter?
- How does it solve the problem?
- What makes it different?
- What assumptions are still unconfirmed?
- What brand decisions have already been made?
- Why were those decisions made?
- What changed since those decisions were made?
- Which existing brand decisions may need to change?

---

## 5. Core Product Loop

The core workflow is:

Raw Startup Idea
        ↓
Discovery
        ↓
Structured Startup Context
        ↓
Brand Strategy
        ↓
Brand Decisions
        ↓
Persistent Brand Context
        ↓
New Evidence / New Information
        ↓
Change Detection
        ↓
Impact Analysis
        ↓
Founder Review
        ↓
Approved Brand Evolution

The system should preserve the history of important decisions while allowing the current brand to evolve.

---

## 6. Primary User

The primary user is an early-stage founder or creator who has an idea and wants to develop a clear, differentiated brand around it.

The user may have:

- A rough startup idea
- An existing startup
- An early product
- An evolving target audience
- Unclear positioning
- Existing branding that may need revision

The MVP should optimize for a founder working alone rather than enterprise brand teams.

---

## 7. Core User Journey

### Step 1 — Introduce the Idea

The founder enters a rough description of the startup.

The input does not need to be polished.

Example:

> "I want to build a platform that helps college students find people to build hackathon projects with."

The system should not immediately generate a complete brand.

---

### Step 2 — Discovery Interview

The AI asks focused questions to understand the startup.

Questions should explore areas such as:

- Target users
- Problem
- Existing alternatives
- Current solution
- Differentiation
- User motivation
- Business model
- Founder assumptions
- Evidence
- Uncertainty

The interview should adapt based on previous answers rather than asking a fixed generic questionnaire.

---

### Step 3 — Build Structured Startup Context

The system converts the conversation into structured information.

Context should distinguish:

- FACT
- INFERENCE
- HYPOTHESIS
- DECISION
- REJECTED
- SUPERSEDED

The founder should be able to inspect and correct important context.

---

### Step 4 — Generate Brand Strategy

Using the structured startup context, the AI proposes:

- Target audience
- Positioning
- Value proposition
- Differentiation
- Brand personality
- Messaging direction
- Naming directions
- Tagline/pitch directions

These are proposals, not automatically accepted decisions.

---

### Step 5 — Founder Approval

The founder reviews important recommendations.

The founder can:

- Approve
- Reject
- Modify
- Ask for alternatives

Approved strategic decisions become part of the persistent brand context.

---

### Step 6 — Explain Decisions

Important brand decisions should have a "Why?" capability.

For example:

Positioning:
> "The platform is positioned around compatible team formation rather than generic hackathon discovery."

The user should be able to inspect why this positioning was proposed.

The reasoning should connect back to relevant startup context.

---

### Step 7 — Startup Evolves

The founder can introduce new information.

Example:

> "We discovered that hackathon organizers, rather than students, are the customers who actually pay us."

The system should compare this new information against the existing startup context.

---

### Step 8 — Detect Brand Impact

The system identifies potentially affected decisions.

For example:

New information:
> Hackathon organizers are the paying customers.

Potentially affected:

- Target audience
- Positioning
- Value proposition
- Messaging
- Brand personality

The system should explain why these areas may be affected.

It must NOT silently rewrite the brand.

---

### Step 9 — Founder Review

The founder reviews the proposed changes.

The founder decides which changes to accept.

Previous decisions should remain available as history and can become:

- REJECTED
- SUPERSEDED

This preserves the evolution of the startup.

---

## 8. Anti-Generic Principle

The product must actively prevent generic AI branding.

A brand statement should be grounded in the startup's actual context.

For example:

> "Empowering the next generation of innovators."

is weak if it could describe thousands of unrelated startups.

The system should prefer statements grounded in:

- Specific users
- Specific problems
- Specific mechanisms
- Specific differentiators
- Specific business context
- Confirmed founder decisions

The system should be able to flag potentially generic outputs and explain what startup-specific information is missing.

---

## 9. Core Product Objects

The MVP should conceptually contain:

### Startup

The overall startup/project being developed.

### Context Item

A piece of structured knowledge about the startup.

Examples:

- Fact
- Inference
- Hypothesis
- Decision
- Rejected
- Superseded

### Brand Decision

A strategic brand decision derived from startup context.

Examples:

- Positioning
- Audience
- Value proposition
- Personality
- Messaging
- Naming direction
- Visual direction

### Evidence

The source or reasoning supporting a context item or decision.

### Change

New information that may affect existing context or brand decisions.

### Impact

The relationship between a change and affected brand decisions.

---

## 10. MVP Features

The MVP must demonstrate the following end-to-end workflow:

1. Enter a rough startup idea.
2. Conduct an AI discovery interview.
3. Extract structured startup context.
4. Generate brand strategy.
5. Allow the founder to approve important decisions.
6. Persist the approved decisions.
7. Show the reasoning/context behind important decisions.
8. Introduce new startup information.
9. Detect potentially affected brand decisions.
10. Explain the impact.
11. Allow the founder to approve or reject proposed changes.
12. Preserve decision history.

The MVP should prioritize this workflow over additional features.

---

## 11. Explicit Non-Goals

The product is NOT primarily:

- A generic AI chatbot
- A logo generator
- A website builder
- A social media scheduler
- A generic copywriting assistant
- A generic brand-book generator
- A collection of unrelated AI branding tools

Visual identity, launch content, and other brand assets may eventually be generated from the brand intelligence system, but they should remain connected to the underlying startup context.

---

## 12. AI Workflow

AI should be used where reasoning is valuable.

AI responsibilities include:

- Discovery questioning
- Context extraction
- Strategic interpretation
- Brand strategy generation
- Alternative generation
- Contradiction detection
- Genericity detection
- Decision explanation
- Change detection
- Brand impact analysis
- Strategic critique

Deterministic application code should handle:

- CRUD
- Database operations
- Filtering
- Sorting
- Validation
- Status changes
- Relationships
- Timestamps
- UI state

---

## 13. Human-in-the-Loop Principle

The founder remains the final decision maker.

AI can:

- Suggest
- Infer
- Challenge
- Compare
- Explain
- Detect possible problems

AI should not silently change important strategic decisions.

Important decisions should have an explicit state such as:

- Proposed
- Approved
- Rejected
- Superseded

---

## 14. Product Differentiation

The core differentiation is not simply:

> "AI generates your brand."

The product differentiates itself by maintaining a structured and evolving understanding of the startup and connecting that understanding to brand decisions.

The key product question is:

> "If the startup changes, does the brand understand what needs to change?"

The system should preserve both:

1. The current understanding of the startup.
2. The history of how that understanding and its brand decisions evolved.

---

## 15. Design Principles

The product should feel:

- Clear
- Strategic
- Intelligent
- Trustworthy
- Founder-focused
- Explainable
- Lightweight

The interface should make the AI workflow visible.

Avoid making the product look like a generic chatbot where the user simply types prompts and receives large blocks of text.

The UI should visually communicate relationships between:

Startup Context
→ Brand Decisions
→ Evidence
→ Changes
→ Impact
→ Approval

---

## 16. Technical Direction

The initial implementation should use a simple architecture.

Preferred stack:

- Next.js
- React
- TypeScript
- Tailwind CSS
- Supabase
- PostgreSQL
- Hosted LLM API

The MVP should avoid unnecessary infrastructure.

Do not introduce:

- Microservices
- Redis
- Message queues
- Vector databases
- Complex agent frameworks
- Event buses
- Elaborate state machines

unless a concrete MVP requirement makes one necessary.

---

## 17. Success Criteria

A successful MVP should allow a judge to understand the following within a few minutes:

1. The founder starts with an unclear/raw idea.
2. AI actively discovers what the startup actually is.
3. The system structures that understanding.
4. Brand decisions are generated from that context.
5. The founder can see why decisions exist.
6. The startup can evolve.
7. The system detects when new information affects the brand.
8. The founder remains in control of changes.
9. Previous decisions are not simply erased.
10. The AI workflow is visible and clearly contributes to the product.

The product should demonstrate a complete working loop rather than a collection of disconnected AI features.

---

## 18. Core Product Statement

The product can be summarized as:

> A living AI brand intelligence system that understands what your startup is, remembers why your brand decisions exist, and helps your brand evolve when the startup evolves.
