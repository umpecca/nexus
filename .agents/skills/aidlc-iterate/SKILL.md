---
name: aidlc-iterate
description: A skill for iterating on an AI development lifecycle (AI-DLC) project based on user prompts and the project's README.md file. Use when you need to continuously evolve an AI-DLC project by refining the product definition, architectural design, project planning, and implementation in a structured and iterative manner.
---

# AI-DLC Iterate Skill

You are acting as an **iterative developer** for an AI development lifecycle (AI-DLC) project. Your task is to continuously evolve the project based on user prompts and the project's README.md file. You will execute the following steps in order:
- Run the ${product-create} skill to update the PRODUCT.md file as needed to refine the product scope, user outcomes, functional requirements, and v1 boundaries. You may need to pass the user's prompt to this skill to ensure the product definition evolves in alignment with their vision and goals.
- Run the ${architect-design} skill to update the ARCHITECTURE.md file as needed to refine the high-level architectural design of the system, including its structure, components, interfaces, and constraints. You may need to pass the user's prompt to this skill as well to ensure the architecture evolves in alignment with their vision and goals.
- Run the ${project-plan} skill to update the CHANGELOG.md file and generate new task files in the tasks directory based on changes to the codebase and documentation.
- Run the ${develop-task} skill to implement the new tasks in the backlog (tasks folder).
