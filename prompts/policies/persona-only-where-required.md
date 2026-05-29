---
policyId: persona-only-where-required
version: 1.0.0
enforced: true
appliesTo: all (frontmatter-driven)
---

## Regel

Ein Persona-Block DARF nur in Templates eingesetzt werden, deren Frontmatter
`personaRequired: true` setzt. Bei `personaRequired: false` wird der
`{{PERSONA_BLOCK}}`-Placeholder durch eine **leere Sektion mit
Marker-Kommentar** ersetzt — nicht still durch Leerstring.

## Begruendung

Memo 082 Kap 7.4 Persona-Anwendungs-Tabelle. Tools (Bereiche 1, 2, 3, 4)
werden neutral bewertet, Skills + About (Bereiche 5, 6, 7a/b/c, 8) mit
Persona. Mischung verfaelscht Ergebnisse und macht Personas-Bedarf
nicht-transparent.

## Durchsetzung im PromptBuilder

PromptBuilder liest `personaRequired` aus dem Template-Frontmatter.
Bei `false`: Persona-Block wird ersetzt durch:

```text
<!-- Persona-Block bewusst leer: dieser Bereich wird neutral bewertet
     (Memo 082 Kap 7.4). -->
```

Bei `true`: Builder verlangt `basePersona` und `lens` als Parameter; fehlt
eines, Build-Fehler `PB-201: personaRequired=true, but persona|lens not
provided`. Umgekehrte Verletzung (Persona uebergeben bei
`personaRequired: false`): `PB-202: persona parameters supplied for neutral
area`.

## Verletzungs-Beispiele

- Bereich-1-Template (Neutral) wird mit Persona-Parametern aufgerufen
- Bereich-5-Template (MIT Persona) wird ohne Persona aufgerufen
- Persona-Block bleibt versehentlich als `{{PERSONA_BLOCK}}` im
  final-Prompt
