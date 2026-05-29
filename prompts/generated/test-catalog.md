# Code-Test-Katalog (autogeneriert)

> Quelle: `prompts/generated/questions.json` — generiert via `scripts/build-test-catalog.mjs`
> Beantwortete Frage F5 (REV-03) — Katalog wird aus Fragen abgeleitet, NICHT manuell.
> generatedAt: 2026-05-29T22:46:36.154Z

## Mapping Frage → Code-Test-Bucket

| Frage-ID | Area | Dimension | Determinism | Code-Test-Bucket |
|----------|------|-----------|-------------|------------------|
| Q-single-test-01 | single-test | docsUrlReachable | deterministic | tests/unit/v1/validation.test.mjs (route-level) |
| Q-single-test-02 | single-test | outputSchemaMatch | deterministic | tests/unit/v1/validation.test.mjs (route-level) |
| Q-single-test-03 | single-test | apiKeyDomainMatch | deterministic | tests/unit/v1/validation.test.mjs (route-level) |
| Q-tools-aggregate-schema-01 | tools-aggregate-schema | routesUniqueNames | deterministic | tests/unit/v1/schemaValidator.test.mjs |
| Q-tools-aggregate-namespace-01 | tools-aggregate-namespace | domainCoverage | deterministic | tests/integration/namespace.test.mjs |
| Q-about-namespace-01 | about-namespace | aboutRouteExists | deterministic | tests/integration/aboutConsistency.test.mjs |
| Q-about-selection-01 | about-selection | aboutRouteExists | deterministic | tests/integration/aboutConsistency.test.mjs |
| Q-single-test-04 | single-test | descriptionClarity | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-single-test-05 | single-test | descriptionSpecConformance | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-single-test-06 | single-test | paramConsistency | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-single-test-07 | single-test | exampleQuality | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-single-test-08 | single-test | toolNameSemantic | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-single-test-09 | single-test | errorCasesDocumented | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-single-test-10 | single-test | verbPrefixConsistent | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-tools-aggregate-schema-02 | tools-aggregate-schema | namingConsistency | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-tools-aggregate-schema-03 | tools-aggregate-schema | tagCoherence | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-tools-aggregate-schema-04 | tools-aggregate-schema | requiredServerParamsConsistent | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-tools-aggregate-schema-05 | tools-aggregate-schema | routesCoherence | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-tools-aggregate-schema-06 | tools-aggregate-schema | descriptionVoice | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-namespace-description-01 | namespace-description | namespaceDescriptionClarity | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-namespace-description-02 | namespace-description | namespaceDescriptionClarity | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-namespace-description-03 | namespace-description | namespaceDescriptionClarity | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-namespace-description-04 | namespace-description | namespaceDescriptionClarity | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-tools-aggregate-namespace-02 | tools-aggregate-namespace | domainCoverage | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-tools-aggregate-namespace-03 | tools-aggregate-namespace | domainCoverage | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-tools-aggregate-namespace-04 | tools-aggregate-namespace | domainCoverage | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-tools-aggregate-namespace-05 | tools-aggregate-namespace | domainCoverage | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-about-namespace-02 | about-namespace | personaReference | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-about-namespace-03 | about-namespace | valueProposition | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-about-namespace-04 | about-namespace | useCaseClarity | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-about-namespace-05 | about-namespace | useCaseClarity | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-about-namespace-06 | about-namespace | useCaseClarity | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-about-namespace-07 | about-namespace | useCaseClarity | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-about-selection-02 | about-selection | personaReference | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-about-selection-03 | about-selection | personaReference | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-about-selection-04 | about-selection | useCaseClarity | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-about-selection-05 | about-selection | useCaseClarity | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-about-selection-06 | about-selection | useCaseClarity | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-about-selection-07 | about-selection | useCaseClarity | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-selection-skills-L1-01 | selection-skills-L1 | coverage | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-selection-skills-L1-02 | selection-skills-L1 | coverage | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-selection-skills-L1-03 | selection-skills-L1 | personaFit | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-selection-skills-L1-04 | selection-skills-L1 | personaFit | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-selection-skills-L2-01 | selection-skills-L2 | personaFit | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-selection-skills-L2-02 | selection-skills-L2 | personaFit | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-selection-skills-L2-03 | selection-skills-L2 | skillAdequacy | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-selection-skills-L2-04 | selection-skills-L2 | skillAdequacy | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-selection-skills-L2-05 | selection-skills-L2 | skillAdequacy | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-selection-skills-L3-01 | selection-skills-L3 | skillAdequacy | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-selection-skills-L3-02 | selection-skills-L3 | skillAdequacy | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-selection-skills-L3-03 | selection-skills-L3 | skillAdequacy | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-selection-skills-L3-04 | selection-skills-L3 | domainAlignment | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-selection-skills-L3-05 | selection-skills-L3 | domainAlignment | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-selection-skills-L3-06 | selection-skills-L3 | domainAlignment | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-namespace-skills-01 | namespace-skills | skillAdequacy | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-namespace-skills-02 | namespace-skills | skillAdequacy | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-namespace-skills-03 | namespace-skills | skillAdequacy | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-namespace-skills-04 | namespace-skills | domainAlignment | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-namespace-skills-05 | namespace-skills | domainAlignment | non-deterministic | no-code-test (eval-question, LLM-only) |
| Q-namespace-skills-06 | namespace-skills | domainAlignment | non-deterministic | no-code-test (eval-question, LLM-only) |
