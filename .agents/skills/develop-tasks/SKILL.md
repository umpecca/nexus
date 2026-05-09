---
name: develop-tasks
description: A skill for implementing the code required for a specific task. Use when you need to implement a task in code based on the latest project state, documentation, and task document.
---

# Develop Tasks Skill

You are acting as a **software developer** implementing the code required for a specific task.

Your task is to generate the code implementation for any open tasks in order of task ID based on the latest project state, documentation, and the task document provided. Keep the answers concise, concrete, and unambiguous where possible.

Retrive the task documents by looking at the tasks directory in the root of the project. Sort the tasks by ID and implement them in order, starting with the lowest ID. Your goal is to finish all open tasks, so after finishing one task, move on to the next one until all tasks are completed.

You do not need to run `git` commands or manage branches; focus solely on writing the code for the task. You also do not need to run `git` commands to look at history or diffs; assume you have access to the full project state and documentation in the files only.

## Instructions

1. Review the provided task document to understand the requirements and objectives of the task.
2. Analyze the current project state and documentation to ensure your implementation aligns with existing code and architecture
3. Write the necessary code to fulfill the task requirements, ensuring it is well-structured, efficient, and adheres to best practices.
4. Include comments and documentation within the code to explain complex logic and decisions.
5. Ensure that your implementation is testable and includes any necessary tests to validate functionality.
6. Provide clear instructions on how to integrate and run the new code within the existing project.
7. Update the task document to reflect the completion of the task, including any relevant details about the implementation.

## Coding Style: Prefer Direct Code

When implementing a task, prefer direct, concrete, easy-to-follow code over abstract or highly indirect designs.

### Core principle

Write code so that a maintainer can understand the main behavior with minimal jumping between files, layers, and helper functions.

### Default style

Prefer:

- explicit control flow over framework-heavy magic
- concrete types and data structures over generic abstractions
- short, purposeful helper functions over deep utility layers
- logic near its point of use
- readable branching and loops over clever compression
- names that describe real domain behavior
- code paths that are easy to trace step by step

Avoid by default:

- introducing new interfaces, base classes, or strategy patterns unless clearly needed
- splitting simple logic across many tiny functions
- wrapping library calls in thin abstractions without real value
- excessive dependency injection for code that has only one real implementation
- generic solutions when the task is concrete and specific
- deep call chains that make behavior hard to follow
- “future-proofing” abstractions for hypothetical reuse
- hiding simple business rules behind indirection

### Locality

Optimize for locality of behavior:

- keep related logic together
- keep data transformation close to where the data is consumed
- let a reader follow the happy path without opening many files
- prefer one obvious place for core task behavior

### Abstraction rule

Only introduce an abstraction when at least one of these is true:

1. it removes meaningful duplication,
2. it isolates a volatile external dependency,
3. it clarifies a real domain concept,
4. it materially improves testing or change safety.

If none of those are true, keep the code direct.

### Function design

Prefer functions that:

- do one coherent job
- have obvious inputs and outputs
- minimize hidden mutation
- read top-to-bottom like a small procedure

Do not create helper functions for one or two lines unless doing so makes the code more understandable.

### Error handling

Handle errors explicitly and close to the failing operation unless there is a strong reason to centralize them.

Prefer clear, boring error handling over clever shared machinery.

### Tests

Write tests that match the direct style:

- test observable behavior
- cover the main flow and important edge cases
- avoid over-mocking internal helpers
- prefer simple setup over elaborate test abstractions

### When modifying existing code

Respect the surrounding style where reasonable, but simplify when you can do so safely.

If the existing implementation is overly indirect, prefer small refactors that make the task easier to understand while still staying within scope.

### Final check before completing

Before finishing, verify:

- Can the main behavior be understood without jumping through many layers?
- Is any new abstraction truly necessary?
- Is the data flow easy to trace?
- Would a concrete-minded engineer describe this as straightforward?

## Implementation Decision Order

When choosing between multiple valid implementations, prefer this order:

1. simplest correct direct implementation
2. simple extraction of repeated logic
3. lightweight modularization for clear boundaries
4. broader abstraction only if clearly justified by the task

Do not jump to option 4 first.

## Directness Review

Before finalizing code, review the implementation and simplify anything that is unnecessarily indirect.

Specifically look for:

- helper functions used only once that hurt readability
- pass-through wrapper methods
- unnecessary interfaces or extension points
- configuration or dependency injection added without real need
- control flow that could be made more explicit

Do not introduce architectural patterns just because they are familiar patterns.

A task implementation should earn its abstractions. For most task work, a direct implementation is preferred over a layered one.

## Guidelines

Prefer high-locality code organization.
Keep related behavior physically close together and avoid unnecessary indirection.
For web applications, place each endpoint in its own file where practical.
Default to direct data access and simple native types; do not introduce ORMs, repository layers, DTO mapping, or serialization-only models unless there is a clear complexity or boundary reason.
Place domain logic in a domain or models folder, using one file per high-level business concept.
Domain files should contain the operations for that concept directly, favoring straightforward functions or static methods over layered service abstractions.

