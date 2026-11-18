/**
 * Conductor core — the parts of the course that run identically wherever they
 * are invoked.
 *
 * Grading, SQLite, and the Boot interpreter live here rather than in the
 * renderer because two very different callers need them: the app, which grades
 * what a learner typed, and the harness, which grades every authored reference
 * solution in CI. Sharing the module makes "CI runs exactly the grader the
 * learner runs" structurally true instead of a convention someone has to
 * remember.
 *
 * Nothing in this package may import React, Electron, or the DOM.
 */

export * from './grading'
import './grading/graders'
import './grading/sql-graders'
import './grading/python-graders'
import './grading/api-graders'
export * from './sql/engine'
export * from './python/boot-python'
