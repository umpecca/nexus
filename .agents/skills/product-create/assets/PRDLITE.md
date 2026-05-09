# Product Requirements Document (PRD) Template

# <Product Name>

## 1. Product Summary

**<Product Name>** is a <short description of what the product does> for <primary users> who want <primary benefit> without <key pain points or tradeoffs avoided>.

## 2. Business Requirements

### 2.1 Problem Statement

Describe the core problem this product solves.

- Who experiences this problem?
- In what situations does it occur?
- Why do existing solutions fall short?

### 2.2 Business Objectives

What this product aims to achieve.

Examples:
- Validate a concept or hypothesis
- Provide a small but high-retention utility
- Serve as a learning or experimentation project
- Support a broader product or platform

### 2.3 Success Metrics

How success will be measured.

Examples:
- Time to first meaningful action
- Engagement frequency
- Reliability or crash-free usage
- Session length or task completion rate

### 2.4 Scope

#### In Scope
List features or capabilities explicitly included in this version.

#### Out of Scope
List features or capabilities intentionally excluded.

### 2.5 Constraints & Assumptions

Explicit limits or assumptions for this project.

Examples:
- Platform or framework constraints
- Offline vs online requirements
- Privacy or data collection rules
- Target audience constraints (e.g. kid-friendly, accessibility-first)
- Team size or time constraints

## 3. User Requirements

### 3.1 User Personas

Describe the primary user types.

For each persona:
- Who they are
- How they use the product
- What they care about most

### 3.2 User Goals

What users want to accomplish using the product.

Examples:
- Complete a task quickly
- Avoid setup or configuration
- Trust results or outputs
- Repeat actions with minimal friction

### 3.3 User Stories

Write user stories in the following format.

**Story <N>**
> As a <type of user>,  
> I want <capability>,  
> so that <benefit>.

#### Acceptance Criteria
- Given <context>  
- When <action>  
- Then <expected outcome>  

### 3.4 Functional Requirements

List system behaviors in clear, testable language.

Examples:
- The system shall allow…
- The system shall generate…
- The system shall persist…
- The system shall prevent…

#### 3.4.x Specialized Logic or Modes (Optional)

If the product includes:
- Multiple modes
- Configuration options
- Deterministic vs non-deterministic behavior
- Security vs convenience tradeoffs

Describe them here.

For each mode:
- What it does
- When it is used
- How it is selected
- Whether it persists across sessions

### 3.5 Non-Functional / Experience Requirements

Constraints on performance, usability, and experience.

Examples:
- Launch time expectations
- Interaction latency
- Accessibility requirements
- Offline capability
- Sound, animation, or haptics expectations

## 4. Process Flow (Optional)

Describe the primary user flow as simple steps.

Example:
1. Launch product  
2. Configure input  
3. Perform action  
4. View result  
5. Repeat or exit  

## 5. UI / Design Notes (Optional)

High-level design guidance (not pixel-perfect specs).

Examples:
- Screen count expectations
- Visual hierarchy
- Discoverability vs minimalism
- Avoided UI patterns (e.g. modals, onboarding)

## 6. Edge Cases

Scenarios that may stress the system or UX.

Examples:
- Extremely large inputs
- Rapid repeated actions
- Accessibility extremes
- Offline or degraded environments

## 7. Future Iterations / Open Questions

Ideas intentionally deferred or unresolved questions.

Examples:
- Features to explore later
- Platform expansions
- Monetization possibilities
- Known unknowns

## 8. Notes for LLM-Assisted Development (Optional)

If this PRD is intended for LLM-assisted development:

- Favor simplicity over abstraction
- Prefer explicit behavior over inferred behavior
- Assume a small team or agent-driven workflow
- Optimize for correctness and readability over cleverness