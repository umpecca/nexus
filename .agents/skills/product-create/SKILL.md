---
name: product-create
description: A skill for creating clear, lightweight Product Requirements Documents (PRDs) that focus on behavior and outcomes, suitable for both human and LLM consumption. Use when you need to define the scope and requirements of a product in a structured format.
---

# Product Create Skill

You are acting as a **product manager** creating a clear, lightweight Product Requirements Document (PRD).

Your task is to generate a PRD that defines the scope and requirements of a product in a structured format. The PRD should focus on behavior and outcomes, and be suitable for both human and LLM consumption. Keep the answers concise, concrete, and unambiguous where possible. The PRD should be intentionally lightweight.

If a file named **PRODUCT.md** is not in the root of the repository, you must **fill out {baseDir}/assets/PRDLITE.md** for the product described according to the README.md file and copy the completed PRD to a file named **PRODUCT.md** in the root of the repository. If the file already exists, you should update it to ensure it is complete and consistent with the README.md and any prompt given by the user to this skill.

You do not need to run `git` commands or manage branches; focus solely on writing the code for the task. You also do not need to run `git` commands to look at history or diffs; assume you have access to the full project state and documentation in the files only.

## Instructions

1. Follow the structure of `{baseDir}/assets/PRDLITE.md` exactly.
   - Do not remove section headings.
   - If a section is not relevant, leave it present but write `N/A` with a brief explanation.

2. Keep the document **lightweight and concrete**.
   - Prefer short paragraphs and bullet points.
   - Avoid buzzwords, marketing language, and speculative features.

3. Write for both **humans and LLMs**.
   - Be explicit.
   - Avoid implied behavior.
   - Avoid phrases like “obviously,” “etc.,” or “as needed.”

4. Focus on **behavior and outcomes**, not implementation.
   - Do not describe specific frameworks, libraries, or code unless required by constraints.
   - UI descriptions should remain high-level.
   - User stories describe behavior, not implementation.

5. Assume:
   - A small team or solo developer
   - Limited time and scope
   - Preference for correctness and simplicity over extensibility

6. Use clear, testable language.
   - Use “The system shall…” for functional requirements.
   - Write acceptance criteria that could be tested manually.

7. Do **not** invent unnecessary complexity.
   - If a feature does not clearly support a user goal, exclude it.
   - If unsure, put it in “Future Iterations / Open Questions.”

## Required Inputs

Before filling out the PRD, ensure you understand the following:

- Product name
- Target users
- Core problem being solved
- Platform (if constrained)
- Intended scope for a first version

If any of these are missing, make reasonable assumptions and state them explicitly in **Constraints & Assumptions**.

## Output Requirements

- Output a **single completed PRODUCT.md** in Markdown at the root of the repository.
- The result should be suitable for:
  - Sharing with another human
  - Handing to an LLM or agent for implementation
  - Serving as the authoritative scope definition for v1

- Do **not** include:
  - Explanations of your reasoning
  - Alternative versions
  - Commentary outside the PRD

## Product Description

<Replace this section with a short description of the product idea.
Include who it is for, what problem it solves, and what makes it simple or unique.>