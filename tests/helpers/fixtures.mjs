/**
 * Shared test fixtures for flowmcp-grading unit tests.
 *
 * No filesystem access, no real API keys. Pure factory functions returning
 * fresh objects per call (no shared mutable state).
 */

const validAutonomousEntry = () => {
    return {
        schemaId: 'demo.schema.v1',
        selectionId: null,
        gradingTier: 'autonomous',
        grader: {
            kind: 'script',
            name: 'fixture-grader',
            version: '0.0.1'
        },
        gradings: [],
        categoricalVeto: null,
        aggregateGrade: null,
        maxAttainableGrade: 'B',
        previousGradingId: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        options: {}
    }
}


const validGroupBoundEntry = () => {
    return {
        schemaId: 'selection:demo-selection',
        selectionId: 'demo-selection',
        gradingTier: 'group-bound',
        grader: {
            kind: 'script',
            name: 'fixture-grader',
            version: '0.0.1'
        },
        gradings: [],
        categoricalVeto: null,
        aggregateGrade: null,
        maxAttainableGrade: 'A',
        previousGradingId: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        options: {}
    }
}


const vetoExample = () => {
    return {
        triggeredBy: 'malicious-module',
        grader: {
            kind: 'human',
            name: 'fixture-reviewer',
            version: '0.0.1'
        },
        evidence: {
            url: 'https://example.invalid/incident-report',
            note: 'fixture evidence — not a real incident'
        },
        reasoning: null,
        recordedAt: '2026-01-01T00:00:00.000Z'
    }
}


const sampleGrading = ( { score, dimension, weight } ) => {
    return {
        dimension,
        score,
        weight,
        determinism: 'deterministic',
        recordedAt: '2026-01-01T00:00:00.000Z'
    }
}


export {
    validAutonomousEntry,
    validGroupBoundEntry,
    vetoExample,
    sampleGrading
}
