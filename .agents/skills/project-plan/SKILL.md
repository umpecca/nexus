---
name: project-plan
description: A skill for planning/creating/updating the tasks for the project with the current codebase, documentation, and recent changes. Use when you need to create and/or update project tasks based on the latest project state.
---

# Project Plan Skill

You are acting as a **project manager** creating or updating the tasks for the project based on the current codebase, documentation, and recent changes.

Your task is to generate a list of files that represent tasks for the project and to maintain a change log. 

The change log should reflect the current state of the project, including any new features, bug fixes, or improvements that have been made. Keep the answers concise, concrete, and unambiguous where possible. 

The task files should represent actionable items that can be assigned to team members or tracked in a project management tool. They should be specific, measurable, and achievable. Use the format provided in the **fill out {baseDir}/assets/TASK.md** file to create the tasks. The task files should be named in the following format "T_{}.md", where {} is a unique identifier for each task (e.g., T_001.md, T_002.md, etc.). The task files unique identifier should be in order of how the tasks should be completed. The task files should be stored in a directory named **tasks** in the root of the repository.

The task files and change log should be intentionally lightweight. Tasks should be made only in order, do not ever skip numbers in the task ID sequence. The end of every task should be complete, able to compile, build, and run. Task files should be independent and not overlap in scope; attempt to organize them with minimal dependencies between tasks to parallelize the work as much as possible. The change log should be concise and focused on the most important changes, without going into unnecessary detail.

If a file named **CHANGELOG.md** is not in the root of the repository, you must **fill out {baseDir}/assets/CHANGELOG.md** for the project according to the README.md file and copy the completed tasks to a file named **CHANGELOG.md** in the root of the repository. If the file already exists, you should update it to ensure it is complete and consistent with the current project state and any prompt given by the user to this skill.

Organize the task files to be completed in a logical order that reflects the dependencies and priorities of the tasks. The task files should be independent and not overlap in scope; attempt to organize them with minimal dependencies between tasks to parallalize the work as much as possible.

You do not need to run `git` commands or manage branches; focus solely on writing the code for the task. You also do not need to run `git` commands to look at history or diffs; assume you have access to the full project state and documentation in the files only.

## Instructions

1. Follow the structure of `{baseDir}/assets/CHANGELOG.md` exactly.
   - Do not remove section headings.
   - If a section is not relevant, leave it present but write `N/A` with a brief explanation.
2. Keep the document **lightweight and concrete**.
    - Prefer short paragraphs and bullet points.
    - Avoid buzzwords, marketing language, and speculative features.
3. Write for both **humans and LLMs**.
    - Be explicit.
    - Avoid implied behavior.
    - Avoid phrases like “obviously,” “etc.,” or “as needed.”
4. Create task files in the **tasks** directory using the format provided in `{baseDir}/assets/TASK.md`.
    - Ensure each task is specific, measurable, and achievable.
    - Name the task files in the format "T_{}.md" with unique identifiers in order of completion.
