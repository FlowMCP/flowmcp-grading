/**
 * specVersion — the single canonical grading-spec version reference.
 *
 * Befund E: the grading-spec version was hardcoded across 20+ source
 * comments, the package description and 11 prompt-template frontmatters, drifting
 * independently (1.0.0 / 1.1.0 / 1.2.0 / 2.0.0 / 2.0.1). This module is the ONE
 * place the current grading-spec version lives, so code that surfaces it (e.g.
 * ModuleApi.getSpecVersion) reads ONE source instead of re-hardcoding. The
 * repo-hygiene lint reads GRADING_SPEC_VERSION to flag any stale `gradingSpec/<x>`
 * literal that drifts away from it again (single-source enforcement, F4).
 *
 * NO SILENT DEFAULTS.
 */

const GRADING_SPEC_VERSION = '3.0.0'
const GRADING_SPEC_REF_PREFIX = `flowmcp-spec/grading/${GRADING_SPEC_VERSION}`


export { GRADING_SPEC_VERSION, GRADING_SPEC_REF_PREFIX }
