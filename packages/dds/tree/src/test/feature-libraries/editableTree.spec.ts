/*!
* Copyright (c) Microsoft Corporation and contributors. All rights reserved.
* Licensed under the MIT License.
*/
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/consistent-type-definitions */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable max-len */
import { fail, strict as assert } from "assert";
import { NamedTreeSchema, StoredSchemaRepository, namedTreeSchema, ValueSchema, fieldSchema, SchemaData, TreeSchemaIdentifier, rootFieldKey } from "../../schema-stored";
import { IEditableForest, initializeForest } from "../../forest";
import { JsonableTree, EmptyKey, Value } from "../../tree";
import { brand, Brand } from "../../util";
import {
    defaultSchemaPolicy, getEditableTree, EditableTree, buildForest, typeSymbol, UnwrappedEditableField,
    proxySymbol, emptyField, FieldKinds, valueSymbol, EditableTreeOrPrimitive,
} from "../../feature-libraries";

// eslint-disable-next-line import/no-internal-modules
import { getFieldKind, getFieldSchema, getPrimaryField, isPrimitive, isPrimitiveValue } from "../../feature-libraries/editable-tree/utilities";

// TODO: Use typed schema (ex: typedTreeSchema), here, and derive the types below from them programmatically.

const stringSchema = namedTreeSchema({
    name: brand("String"),
    extraLocalFields: emptyField,
    value: ValueSchema.String,
});
const int32Schema = namedTreeSchema({
    name: brand("Int32"),
    extraLocalFields: emptyField,
    value: ValueSchema.Number,
});
const float32Schema = namedTreeSchema({
    name: brand("Float32"),
    extraLocalFields: emptyField,
    value: ValueSchema.Number,
});

const complexPhoneSchema = namedTreeSchema({
    name: brand("Test:Phone-1.0.0"),
    localFields: {
        number: fieldSchema(FieldKinds.value, [stringSchema.name]),
        prefix: fieldSchema(FieldKinds.value, [stringSchema.name]),
    },
    extraLocalFields: emptyField,
});

// This schema is really unnecessary: it could just use a sequence field instead.
// Array nodes are only needed when you want polymorphism over array vs not-array.
// Using this tests handling of array nodes (though it makes this example not cover other use of sequence fields).
const phonesSchema = namedTreeSchema({
    name: brand("Test:Phones-1.0.0"),
    localFields: {
        [EmptyKey]: fieldSchema(FieldKinds.sequence, [stringSchema.name, int32Schema.name, complexPhoneSchema.name]),
    },
    extraLocalFields: emptyField,
});

const addressSchema = namedTreeSchema({
    name: brand("Test:Address-1.0.0"),
    localFields: {
        street: fieldSchema(FieldKinds.value, [stringSchema.name]),
        zip: fieldSchema(FieldKinds.value, [stringSchema.name]),
        phones: fieldSchema(FieldKinds.value, [phonesSchema.name]),
    },
    extraLocalFields: emptyField,
});

const mapStringSchema = namedTreeSchema({
    name: brand("Map<String>"),
    extraLocalFields: fieldSchema(FieldKinds.value, [stringSchema.name]),
});

const personSchema = namedTreeSchema({
    name: brand("Test:Person-1.0.0"),
    localFields: {
        name: fieldSchema(FieldKinds.value, [stringSchema.name]),
        age: fieldSchema(FieldKinds.value, [int32Schema.name]),
        salary: fieldSchema(FieldKinds.value, [float32Schema.name]),
        friends: fieldSchema(FieldKinds.value, [mapStringSchema.name]),
        address: fieldSchema(FieldKinds.value, [addressSchema.name]),
    },
    extraLocalFields: emptyField,
});

const optionalChildSchema = namedTreeSchema({
    name: brand("Test:OptionalChild-1.0.0"),
    localFields: {
        child: fieldSchema(FieldKinds.optional),
    },
    value: ValueSchema.Serializable,
    extraLocalFields: emptyField,
});

const emptyNode: JsonableTree = { type: optionalChildSchema.name };

const schemaTypes: Set<NamedTreeSchema> = new Set([optionalChildSchema, stringSchema, float32Schema, int32Schema, complexPhoneSchema, phonesSchema, addressSchema, mapStringSchema, personSchema]);

const schemaMap: Map<TreeSchemaIdentifier, NamedTreeSchema> = new Map();
for (const named of schemaTypes) {
    schemaMap.set(named.name, named);
}

const rootPersonSchema = fieldSchema(FieldKinds.value, [personSchema.name]);

const fullSchemaData: SchemaData = {
    treeSchema: schemaMap,
    globalFieldSchema: new Map([[rootFieldKey, rootPersonSchema]]),
};

// TODO: derive types like these from those schema, which subset EditableTree

type Int32 = Brand<number, "Int32">;
const newAge: Int32 = brand(55);

type ComplexPhoneType = {
    number: string;
    prefix: string;
};

type AddressType = {
    street: string;
    zip: string;
    phones: (number | string | ComplexPhoneType)[];
};

type PersonType = {
    name: string;
    age: Int32;
    salary: number;
    friends: Record<string, string>;
    address: AddressType;
};

const person: JsonableTree = {
    type: personSchema.name,
    fields: {
        name: [{ value: "Adam", type: stringSchema.name }],
        age: [{ value: 35, type: int32Schema.name }],
        salary: [{ value: 10420.2, type: float32Schema.name }],
        friends: [{ value: {
            Mat: "Mat",
        }, type: mapStringSchema.name }],
        address: [{
            fields: {
                street: [{ value: "treeStreet", type: stringSchema.name }],
                // TODO: revisit as ideally we don't want to have undefined properties in our proxy object
                // TODO: string was missing here. Either it should be made optional. or provided. Adding a value for now.
                zip: [{ type: stringSchema.name, value: "zip-code" }],
                phones: [{
                    type: phonesSchema.name,
                    fields: {
                        [EmptyKey]: [
                            { type: stringSchema.name, value: "+49123456778" },
                            { type: int32Schema.name, value: 123456879 },
                            { type: complexPhoneSchema.name, fields: {
                                number: [{ value: "012345", type: stringSchema.name }],
                                prefix: [{ value: "0123", type: stringSchema.name }],
                            } },
                        ],
                    },
                }],
            },
            type: addressSchema.name,
        }],
    },
};

function setupForest(schema: SchemaData, data: JsonableTree[]): IEditableForest {
    const schemaRepo = new StoredSchemaRepository(defaultSchemaPolicy, schema);
    const forest = buildForest(schemaRepo);
    initializeForest(forest, data);
    return forest;
}

function buildTestProxy(data: JsonableTree): UnwrappedEditableField {
    const forest = setupForest(fullSchemaData, [data]);
    const [context, field] = getEditableTree(forest);
    return field;
}

function buildTestPerson(): EditableTree & PersonType {
    const proxy = buildTestProxy(person);
    return proxy as EditableTree & PersonType;
}

function expectTreeEquals(inputField: UnwrappedEditableField, expected: JsonableTree): void {
    assert(inputField !== undefined);
    const expectedType = schemaMap.get(expected.type) ?? fail("missing type");
    const primary = getPrimaryField(expectedType);
    if (primary !== undefined) {
        // Handle inlined primary fields
        const expectedField = expected.fields?.[primary.key];
        assert(expectedField !== undefined);
        return expectTreeSequence(inputField, expectedField);
    }

    assert(!Array.isArray(inputField));
    // Above assert fails to narrow type to exclude readonly arrays, so cast manually here:
    const node = inputField as EditableTreeOrPrimitive;
    if (isPrimitiveValue(node)) {
        // UnwrappedEditableTree loses type information (and any children),
        // so this is really all we can compare:
        assert.equal(node, expected.value);
        return;
    }
    // Confirm we have an EditableTree object.
    assert(node[proxySymbol] !== undefined);
    assert.equal(node[valueSymbol], expected.value);
    const type = node[typeSymbol];
    assert.equal(type, expectedType);
    for (const key of Object.keys(node)) {
        const subNode = node[key];
        assert(subNode !== undefined, key);
        const fields = expected.fields ?? {};
        assert.equal(key in fields, true);
        const field: JsonableTree[] = fields[key];
        const isSequence = getFieldKind(getFieldSchema(type, key)).multiplicity;
        if (isSequence) {
            expectTreeSequence(subNode, field);
        } else {
            assert.equal(field.length, 1);
            expectTreeEquals(subNode, field[0]);
        }
    }
}

function expectTreeSequence(field: UnwrappedEditableField, expected: JsonableTree[]): void {
    assert(Array.isArray(field));
    assert.equal(field.length, field.length);
    for (let index = 0; index < field.length; index++) {
        expectTreeEquals(field[index], expected[index]);
    }
}

describe.only("editable-tree", () => {
    // it("proxified forest", () => {
    // 	const proxy = buildTestPerson();
    // 	assert.ok(proxy);
    // 	assert.equal(Object.keys(proxy).length, 5);
    // 	assert.equal(proxy[typeSymbol], personSchema);
    // 	assert.deepEqual(proxy[typeSymbol](brand("age")), { name: "Int32" });
    // 	assert.deepEqual(proxy.address![typeSymbol](), { name: "Test:Address-1.0.0" });
    // 	assert.deepEqual((proxy.address!.phones![2] as EditableTree<ComplexPhoneType>)[typeSymbol](), { name: "Test:Phone-1.0.0" });
    // });

    it("traverse a complete tree", () => {
        const typedProxy = buildTestPerson();
        expectTreeEquals(typedProxy, person);
    });

    it('"in" works as expected', () => {
        const personProxy = buildTestProxy(person) as object;
        // Confirm that methods on ProxyTarget are not leaking through.
        assert.equal("free" in personProxy, false);
        // Confirm that fields on ProxyTarget are not leaking through.
        // Note that if typedProxy were non extensible, these would type error
        assert.equal("lazyCursor" in personProxy, false);
        assert.equal("context" in personProxy, false);
        // Check for expected symbols:
        assert(proxySymbol in personProxy);
        assert(typeSymbol in personProxy);
        // Check fields show up:
        assert("age" in personProxy);
        assert.equal(EmptyKey in personProxy, false);
        assert.equal("child" in personProxy, false);
        // Value does not show up when empty:
        assert.equal(valueSymbol in personProxy, false);

        const emptyOptional = buildTestProxy(emptyNode) as object;
        // Check empty field does not show up:
        assert.equal("child" in emptyOptional, false);

        const fullOptional = buildTestProxy({ type: optionalChildSchema.name, fields: { child: [{ type: int32Schema.name, value: 1 }] } }) as object;
        // Check full field does show up:
        assert("child" in fullOptional);

        const hasValue = buildTestProxy({ type: optionalChildSchema.name, value: 1 }) as object;
        // Value does show up when not empty:
        assert(valueSymbol in hasValue);
    });

    it("isPrimitive", () => {
        assert(isPrimitive(int32Schema));
        assert(isPrimitive(stringSchema));
        assert(!isPrimitive(optionalChildSchema));
    });

    it("sequence roots are arrays", () => {
        const rootSchema = fieldSchema(FieldKinds.sequence, [optionalChildSchema.name]);
        const schemaData: SchemaData = {
            treeSchema: schemaMap,
            globalFieldSchema: new Map([[rootFieldKey, rootSchema]]),
        };
        // Test empty
        {
            const forest = setupForest(schemaData, []);
            const [context, field] = getEditableTree(forest);
            assert.deepStrictEqual(field, []);
            context.free();
        }
        // Test 1 item
        {
            const forest = setupForest(schemaData, [emptyNode]);
            const [context, field] = getEditableTree(forest);
            expectTreeSequence(field, [emptyNode]);
            context.free();
        }
        // Test 2 items
        {
            const forest = setupForest(schemaData, [emptyNode, emptyNode]);
            const [context, field] = getEditableTree(forest);
            expectTreeSequence(field, [emptyNode, emptyNode]);
            context.free();
        }
    });

    it("value roots are unwrapped", () => {
        const rootSchema = fieldSchema(FieldKinds.value, [optionalChildSchema.name]);
        const schemaData: SchemaData = {
            treeSchema: schemaMap,
            globalFieldSchema: new Map([[rootFieldKey, rootSchema]]),
        };
        const forest = setupForest(schemaData, [emptyNode]);
        const [context, field] = getEditableTree(forest);
        expectTreeEquals(field, emptyNode);
        context.free();
    });

    it("optional roots are unwrapped", () => {
        const rootSchema = fieldSchema(FieldKinds.optional, [optionalChildSchema.name]);
        const schemaData: SchemaData = {
            treeSchema: schemaMap,
            globalFieldSchema: new Map([[rootFieldKey, rootSchema]]),
        };
        // Empty
        {
            const forest = setupForest(schemaData, []);
            const [context, field] = getEditableTree(forest);
            assert.strictEqual(field, undefined);
            context.free();
        }
        // With value
        {
            const forest = setupForest(schemaData, [emptyNode]);
            const [context, field] = getEditableTree(forest);
            expectTreeEquals(field, emptyNode);
            context.free();
        }
    });

    it("primitives are unwrapped at root", () => {
        const rootSchema = fieldSchema(FieldKinds.value, [int32Schema.name]);
        const schemaData: SchemaData = {
            treeSchema: schemaMap,
            globalFieldSchema: new Map([[rootFieldKey, rootSchema]]),
        };
        const forest = setupForest(schemaData, [{ type: int32Schema.name, value: 1 }]);
        const [context, field] = getEditableTree(forest);
        assert.strictEqual(field, 1);
        context.free();
    });

    it("primitives are unwrapped under node", () => {
        const rootSchema = fieldSchema(FieldKinds.value, [optionalChildSchema.name]);
        const schemaData: SchemaData = {
            treeSchema: schemaMap,
            globalFieldSchema: new Map([[rootFieldKey, rootSchema]]),
        };
        const forest = setupForest(schemaData, [{ type: optionalChildSchema.name, fields: { child: [{ type: int32Schema.name, value: 1 }] } }]);
        const [context, field] = getEditableTree(forest);
        assert.strictEqual((field as EditableTree).child, 1);
        context.free();
    });

    it("array nodes get unwrapped", () => {
        const rootSchema = fieldSchema(FieldKinds.value, [phonesSchema.name]);
        assert(getPrimaryField(phonesSchema) !== undefined);
        const schemaData: SchemaData = {
            treeSchema: schemaMap,
            globalFieldSchema: new Map([[rootFieldKey, rootSchema]]),
        };
        // Empty
        {
            const forest = setupForest(schemaData, [{ type: phonesSchema.name }]);
            const [context, field] = getEditableTree(forest);
            assert.deepStrictEqual(field, []);
            context.free();
        }
        // Non-empty
        {
            const forest = setupForest(schemaData, [{ type: phonesSchema.name, fields: { [EmptyKey]: [{ type: int32Schema.name, value: 1 }] } }]);
            const [context, field] = getEditableTree(forest);
            assert.deepStrictEqual(field, [1]);
            context.free();
        }
    });

    it("get own property descriptor", () => {
        const proxy = buildTestPerson();
        const descriptor = Object.getOwnPropertyDescriptor(proxy, "name");
        assert.deepEqual(descriptor, {
            configurable: true,
            enumerable: true,
            value: "Adam",
            writable: true,
        });
    });

    it("check has field and get value", () => {
        const proxy = buildTestPerson();
        assert.equal("name" in proxy, true);
        assert.equal(proxy.name, "Adam");
    });

    it("read downwards", () => {
        const proxy = buildTestPerson();
        assert.deepEqual(Object.keys(proxy), ["name", "age", "salary", "friends", "address"]);
        assert.equal(proxy.name, "Adam");
        assert.equal(proxy.age, 35);
        assert.equal(proxy.salary, 10420.2);
        assert.deepEqual(proxy.friends, { Mat: "Mat" });
        assert.deepEqual(Object.keys(proxy.address!), ["street", "zip", "phones"]);
        assert.equal(proxy.address?.street, "treeStreet");
    });

    it("read upwards", () => {
        const proxy = buildTestPerson();
        assert.deepEqual(Object.keys(proxy.address!), ["street", "zip", "phones"]);
        assert.equal(proxy.address?.phones![1], 123456879);
        assert.equal(proxy.address?.street, "treeStreet");
        assert.deepEqual(Object.keys(proxy), ["name", "age", "salary", "friends", "address"]);
        assert.equal(proxy.name, "Adam");
    });

    it("access array data", () => {
        const proxy = buildTestPerson();
        assert.equal(proxy.address!.phones!.length, 3);
        assert.equal(proxy.address!.phones![1], 123456879);
        const expectedPhones: Value[] = [
            "+49123456778",
            123456879,
            {
                number: "012345",
                prefix: "0123",
            },
        ];
        let i = 0;
        for (const phone of proxy.address!.phones!) {
            const expectedPhone: Value = expectedPhones[i++];
            if (!expectedPhone) {
                continue;
            }
            if (typeof phone === "string" || typeof phone === "number") {
                assert.equal(phone, expectedPhone);
            } else if (phone) {
                assert.equal(phone.number, expectedPhone.number);
                assert.equal(phone.prefix, expectedPhone.prefix);
            }
        }
        assert.equal(proxy.address!.phones![0], "+49123456778");
        assert.deepEqual(Object.keys(proxy.address!.phones!), ["0", "1", "2"]);
        assert.deepEqual(Object.getOwnPropertyNames(proxy.address!.phones), ["0", "1", "2", "length"]);
        const act = proxy.address!.phones!.map((phone: Value): unknown => {
            if (typeof phone === "string" || typeof phone === "number") {
                return phone as Value;
            } else if (phone) {
                const res: Value = {};
                for (const key of Object.keys(phone)) {
                    res[key] = phone[key];
                }
                return res;
            }
        });
        assert.deepEqual(act, expectedPhones);
    });

    it("update property", () => {
        const proxy = buildTestPerson();
        assert.throws(() => (proxy.age = newAge), "Not implemented");
    });

    it("add property", () => {
        const proxy = buildTestPerson();
        assert.throws(() => (proxy.address!.zip = "999"), "Not implemented");
    });

    // it("delete property", () => {
    // 	const proxy = buildTestPerson();
    // 	assert.throws(() => {
    // 		delete proxy.address;
    // 	}, "Not implemented");
    // });

    // it("empty forest does not crash", () => {
    // 	const emptyTree: JsonableTree = { type: brand("foo") };
    // 	const proxy = buildTestProxy(emptyTree); // TODO: this does not make an empty forest. It inserts one "foo" node.
    // 	assert.equal(Object.keys(proxy).length, 0);
    // 	assert.deepEqual(proxy[typeSymbol](), { name: "foo" });
    // 	assert.equal(Object.getOwnPropertyNames(proxy).length, 0);
    // });
});
