---
name: lesson-01
description: TEMPLATE walker for Lesson 1. Replace this skill in your workshop with a real walker that guides the learner through the lesson when they invoke it from the cloned project repo.
---

# Lesson 1 — Template walker

> TODO: replace this entire file with the real walker for Lesson 1.

A walker skill is loaded by Claude Code when a learner asks for help on a
specific lesson. It should:

1. Briefly restate the lesson outcome (what the learner is about to build).
2. Point them at the relevant files (`workshop/lesson_NN_<slug>/README.md`,
   the `targetFiles` listed in `lesson.yaml`).
3. Walk them through the implementation in small steps, asking before
   moving on.
4. When they think they're done, run the verify command and read the output
   together.

Tone: collaborative, not lecturing. Assume the learner reads code.
