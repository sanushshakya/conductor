import type { ExerciseResult, GraderConfig, GraderKind, ConductorApi } from '@conductor/shared';
/**
 * The grading registry.
 *
 * Every exercise in the course is graded by one of these, and the harness
 * executes every authored reference solution through this same path in CI —
 * so a grader that is wrong fails the build rather than failing a learner.
 *
 * Graders are registered rather than imported directly because they have very
 * different dependencies: quizzes need nothing, SQL graders need a WASM
 * database, Python graders need the sidecar. Registration keeps those
 * dependencies out of the lesson player entirely.
 */
export interface GradeContext {
    exerciseId: string;
    /** XP awarded on a pass. */
    xp: number;
    /** Present in the app; absent in unit tests that grade pure submissions. */
    host?: ConductorApi;
    /** Resolves a named SQL fixture to a live engine. Required by sql-* graders. */
    sqlEngineFor?: (fixture: string) => Promise<import('../sql/engine').SqlEngine>;
    /** Overrides the default code runner. Used by the harness and by tests. */
    runCode?: (code: string, stdin?: string) => Promise<{
        ok: boolean;
        stdout: string;
        stderr: string;
    }>;
}
export type Grader = (submission: string, config: GraderConfig, ctx: GradeContext) => Promise<ExerciseResult>;
export declare const UnknownGraderError = "UnknownGraderError";
export declare function registerGrader(kind: GraderKind, grader: Grader): void;
export declare function registeredKinds(): string[];
export declare function grade(submission: string, config: GraderConfig, ctx: GradeContext): Promise<ExerciseResult>;
/** Builds a result from checks, awarding XP only when every check passed. */
export declare function resultFrom(checks: ExerciseResult['checks'], xp: number): ExerciseResult;
