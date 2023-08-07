/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	FieldKinds,
	typeNameSymbol,
	valueSymbol,
	jsonableTreeFromCursor,
	cursorFromContextualData,
	EditableTreeContext,
	DefaultEditBuilder,
	ContextuallyTypedNodeData,
	buildForest,
	cursorsFromContextualData,
	defaultSchemaPolicy,
	getEditableTreeContext,
	FieldSchema,
	SchemaBuilder,
	Any,
	TypedSchemaCollection,
	createMockNodeKeyManager,
	SchemaAware,
	isEditableTree,
} from "../../../feature-libraries";
import {
	ValueSchema,
	EmptyKey,
	JsonableTree,
	IEditableForest,
	InMemoryStoredSchemaRepository,
	initializeForest,
	SchemaData,
} from "../../../core";

const builder = new SchemaBuilder("mock data");

export const stringSchema = builder.leaf("String", ValueSchema.String);

export const int32Schema = builder.leaf("Int32", ValueSchema.Number);

export const float64Schema = builder.leaf("Float64", ValueSchema.Number);

export const boolSchema = builder.leaf("Bool", ValueSchema.Boolean);

export const simplePhonesSchema = builder.struct("Test:SimplePhones-1.0.0", {
	[EmptyKey]: SchemaBuilder.field(FieldKinds.sequence, stringSchema),
});

export const complexPhoneSchema = builder.struct("Test:Phone-1.0.0", {
	number: SchemaBuilder.field(FieldKinds.value, stringSchema),
	prefix: SchemaBuilder.field(FieldKinds.value, stringSchema),
	extraPhones: SchemaBuilder.field(FieldKinds.optional, simplePhonesSchema),
});

const phonesField = SchemaBuilder.fieldSequence(
	stringSchema,
	int32Schema,
	complexPhoneSchema,
	// array of arrays
	simplePhonesSchema,
);

export const phonesSchema = builder.fieldNode("Test:Phones-1.0.0", phonesField);

export const addressSchema = builder.struct("Test:Address-1.0.0", {
	zip: SchemaBuilder.field(FieldKinds.value, stringSchema, int32Schema),
	street: SchemaBuilder.field(FieldKinds.optional, stringSchema),
	city: SchemaBuilder.field(FieldKinds.optional, stringSchema),
	country: SchemaBuilder.field(FieldKinds.optional, stringSchema),
	phones: SchemaBuilder.field(FieldKinds.optional, phonesSchema),
	sequencePhones: SchemaBuilder.field(FieldKinds.sequence, stringSchema),
});

export const mapStringSchema = builder.map(
	"Map<String>",
	SchemaBuilder.field(FieldKinds.optional, stringSchema),
);

export const personSchema = builder.struct("Test:Person-1.0.0", {
	name: SchemaBuilder.field(FieldKinds.value, stringSchema),
	age: SchemaBuilder.field(FieldKinds.optional, int32Schema),
	adult: SchemaBuilder.field(FieldKinds.optional, boolSchema),
	salary: SchemaBuilder.field(FieldKinds.optional, float64Schema, int32Schema, stringSchema),
	friends: SchemaBuilder.field(FieldKinds.optional, mapStringSchema),
	address: SchemaBuilder.field(FieldKinds.optional, addressSchema),
});

export const optionalChildSchema = builder.struct("Test:OptionalChild-1.0.0", {
	child: SchemaBuilder.fieldOptional(Any),
});

export const arraySchema = builder.fieldNode(
	"Test:Array-1.0.0",
	SchemaBuilder.field(FieldKinds.sequence, stringSchema, int32Schema),
);

export const rootPersonSchema = SchemaBuilder.field(FieldKinds.optional, personSchema);

export const personSchemaLibrary = builder.intoLibrary();

export const fullSchemaData = buildTestSchema(rootPersonSchema);

// TODO: derive types like these from those schema, which subset EditableTree

// TODO: provide relaxed types like these based on ContextuallyTyped setters

export type Float64 = number;
export type Int32 = number;
export type Bool = boolean;

export type ComplexPhone = SchemaAware.TypedNode<typeof complexPhoneSchema>;
export type SimplePhones = SchemaAware.TypedNode<typeof simplePhonesSchema>;

export type PhonesField = SchemaAware.TypedField<typeof phonesField>;
export type PhonesFieldData = SchemaAware.TypedField<
	typeof phonesField,
	SchemaAware.ApiMode.Flexible
>;
export type Phones = SchemaAware.TypedNode<typeof phonesSchema>;
export type PhonesData = SchemaAware.TypedNode<typeof phonesSchema, SchemaAware.ApiMode.Flexible>;

export type Address = SchemaAware.TypedNode<typeof addressSchema>;
export type Friends = SchemaAware.TypedNode<typeof mapStringSchema>;

export type Person = SchemaAware.TypedNode<typeof personSchema>;
export type PersonData = SchemaAware.TypedNode<typeof personSchema, SchemaAware.ApiMode.Flexible>;

export const personData: PersonData = getPerson();

export function personJsonableTree(): JsonableTree {
	return jsonableTreeFromCursor(
		cursorFromContextualData(
			{
				schema: fullSchemaData,
			},
			rootPersonSchema.types,
			personData,
		),
	);
}

export function getPerson(): PersonData {
	const age: Int32 = 35;
	const phonesFieldData: PhonesFieldData = [
		"+49123456778",
		123456879,
		{
			[typeNameSymbol]: complexPhoneSchema.name,
			prefix: "0123",
			number: "012345",
			extraPhones: {
				// TODO: should be able to inline this. Need to update schema aware typing for field nodes.
				[EmptyKey]: ["91919191"],
			},
		},
		{
			// TODO: should be able to inline this. Need to update schema aware typing for field nodes.
			[EmptyKey]: ["112", "113"],
		},
	];
	// TODO: some issue with schema aware API is preventing this conversion from type checking.
	const phones: PhonesData = phonesFieldData as unknown as PhonesData;
	return {
		// typed with built-in primitive type
		name: "Adam",
		// explicitly typed
		age,
		// inline typed
		adult: true,
		// Float64 | Int32
		salary: {
			[valueSymbol]: 10420.2,
			[typeNameSymbol]: float64Schema.name,
		},
		friends: {
			Mat: "Mat",
		} as any, // TODO: fix typing
		address: {
			// string | Int32
			zip: "99999",
			street: "treeStreet",
			// (Int32 | string | ComplexPhone | SimplePhones)[]
			phones,
			sequencePhones: ["113", "114"],
			city: undefined,
			country: undefined,
		},
	};
}

/**
 * Create schema supporting all type defined in this file, with the specified root field.
 */
export function buildTestSchema<T extends FieldSchema>(rootField: T) {
	return new SchemaBuilder("buildTestSchema", personSchemaLibrary).intoDocumentSchema(rootField);
}

export function getReadonlyEditableTreeContext(forest: IEditableForest): EditableTreeContext {
	// This will error if someone tries to call mutation methods on it
	const dummyEditor = {} as unknown as DefaultEditBuilder;
	return getEditableTreeContext(forest, dummyEditor, createMockNodeKeyManager());
}

export function setupForest<T extends FieldSchema>(
	schema: TypedSchemaCollection<T>,
	data: ContextuallyTypedNodeData | undefined,
): IEditableForest {
	const schemaRepo = new InMemoryStoredSchemaRepository(defaultSchemaPolicy, schema);
	const forest = buildForest(schemaRepo);
	const root = cursorsFromContextualData(
		{
			schema: schemaRepo,
		},
		schema.rootFieldSchema,
		data,
	);
	initializeForest(forest, root);
	return forest;
}

export function buildTestTree(
	data: ContextuallyTypedNodeData | undefined,
	rootField: FieldSchema = rootPersonSchema,
): EditableTreeContext {
	const schema = buildTestSchema(rootField);
	const forest = setupForest(schema, data);
	const context = getReadonlyEditableTreeContext(forest);
	return context;
}

export function buildTestPerson(): readonly [SchemaData, Person] {
	const context = buildTestTree(personData);
	assert(isEditableTree(context.unwrappedRoot));
	assert(SchemaAware.downCast(personSchema, context.unwrappedRoot));
	return [context.schema, context.unwrappedRoot];
}
