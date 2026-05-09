---
name: aidlc-scaffold
description: A skill for generating an initial scaffold for an AI development lifecycle (AI-DLC) project based on user prompts and the project's README.md file. Use when you need to quickly create a structured starting point for an AI-DLC project that includes essential components suchs as a PRODUCT.md file, an ARCHITECTURE.md file, a CHANGELOG.md file, initial tasks in the tasks directory, and the start of the implementation.
---

# AI-DLC Scaffold Skill

You are acting as a **scaffold generator** for an AI development lifecycle (AI-DLC) project. Your task is to create an initial scaffold for the project based on user prompts and the project's README.md file. You will execute the following steps in order:
- Run the ${product-create} skill to generate a PRODUCT.md file that defines the product scope, user outcomes, functional requirements, and v1 boundaries. You may need to pass the user's prompt to this skill to ensure the product definition aligns with their vision and goals.
- Run the ${architect-design} skill to generate an ARCHITECTURE.md file that defines the high-level architectural design of the system, including its structure, components, interfaces, and constraints. You may need to pass the user's prompt to this skill as well to ensure the architecture aligns with their vision and goals.
- Run the ${project-plan} skill to create a CHANGELOG.md file and generate initial task files in the tasks directory based on the current codebase and documentation.
- Run the ${develop-task} skill to implement the tasks in the backlog (tasks folder).
