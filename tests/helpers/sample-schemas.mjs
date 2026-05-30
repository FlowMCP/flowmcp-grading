/**
 * Sample schema fixtures for HashGenerator / SourceSnapshot tests.
 *
 * Pure factories returning fresh objects per call. No filesystem dependency.
 */

const minimalSchema = () => {
    return {
        version: '4.0.0',
        schemaVersion: '1.0.0',
        namespace: 'test',
        name: 'minimalTest',
        tools: {
            foo: { method: 'GET', path: '/foo', description: 'fetch foo', parameters: [] }
        }
    }
}


const minimalSchemaReorderedTools = () => {
    // Object-Key order is irrelevant in canonical-JSON. We mark this by inserting
    // a different key-order at construction time.
    const schema = {
        name: 'minimalTest',
        namespace: 'test',
        schemaVersion: '1.0.0',
        version: '4.0.0',
        tools: {
            foo: { description: 'fetch foo', parameters: [], method: 'GET', path: '/foo' }
        }
    }
    return schema
}


const minimalSchemaRenamedTool = () => {
    return {
        version: '4.0.0',
        schemaVersion: '1.0.0',
        namespace: 'test',
        name: 'minimalTest',
        tools: {
            bar: { method: 'GET', path: '/foo', description: 'fetch foo', parameters: [] }
        }
    }
}


const sampleSelection = () => {
    return {
        selectionId: 'demo',
        selectionVersion: '1.0.0',
        description: 'Demo selection',
        personaIds: [ 'demo-persona' ],
        domainDocId: 'demo-domain',
        aboutHash: 'aaaaaaaa',
        members: [ { schemaId: 'test.foo' } ],
        skills: [ 'demo/skill/welcome' ]
    }
}


export {
    minimalSchema,
    minimalSchemaReorderedTools,
    minimalSchemaRenamedTool,
    sampleSelection
}
