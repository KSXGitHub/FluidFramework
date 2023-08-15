/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import {
	MockFluidDataStoreRuntime,
	validateAssertionError,
} from "@fluidframework/test-runtime-utils";
import {
	SchemaBuilder,
	Any,
	TypedSchemaCollection,
	FieldSchema,
	FieldKinds,
	NewFieldContent,
	normalizeNewFieldContent,
	allowsRepoSuperset,
	defaultSchemaPolicy,
} from "../../feature-libraries";
import {
	ISharedTreeView,
	SharedTreeFactory,
	SharedTreeView,
	createSharedTreeView,
} from "../../shared-tree";
import {
	ValueSchema,
	AllowedUpdateType,
	storedEmptyFieldSchema,
	SimpleObservingDependent,
	IEditableForest,
	IForestSubscription,
	ITreeCursor,
} from "../../core";
import { typeboxValidator } from "../../external-utilities";
import {
	TestTreeProviderLite,
	expectJsonTree,
	jsonableTreeFromForest,
	wrongSchemaConfig,
} from "../utils";
import { TreeContent, schematizeView } from "../../shared-tree/schematizedTree";
import { expectTreeSequence } from "../feature-libraries/editable-tree/utils";

const builder = new SchemaBuilder("Schematize Tree Tests");
const root = builder.leaf("root", ValueSchema.Number);
const schema = builder.intoDocumentSchema(SchemaBuilder.fieldOptional(Any));

const builderGeneralized = new SchemaBuilder("Schematize Tree Tests Generalized");
const rootGeneralized = builderGeneralized.leaf("root", ValueSchema.Serializable);
const schemaGeneralized = builderGeneralized.intoDocumentSchema(SchemaBuilder.fieldOptional(Any));

const builderValue = new SchemaBuilder("Schematize Tree Tests");
const root2 = builderValue.leaf("root", ValueSchema.Number);
const schemaValueRoot = builderValue.intoDocumentSchema(SchemaBuilder.fieldValue(Any));

const emptySchema = new SchemaBuilder("Empty").intoDocumentSchema(
	SchemaBuilder.field(FieldKinds.forbidden),
);

const configEmpty = {
	allowedSchemaModifications: AllowedUpdateType.None,
	initialTree: undefined,
	schema: emptySchema,
};

const configBasic = {
	allowedSchemaModifications: AllowedUpdateType.None,
	initialTree: 10 as any,
	schema,
};

const configGeneralized = {
	allowedSchemaModifications: AllowedUpdateType.None,
	initialTree: 10 as any,
	schema: schemaGeneralized,
};

function expectForest(forest: IForestSubscription, content: TreeContent<any>): void {
	// Check schema match
	assert(allowsRepoSuperset(defaultSchemaPolicy, forest.schema, content.schema));
	assert(allowsRepoSuperset(defaultSchemaPolicy, content.schema, forest.schema));

	const expected: readonly ITreeCursor[] = normalizeNewFieldContent(
		{ schema: content.schema },
		content.schema.rootFieldSchema,
		content.initialTree,
	);

	const actual = jsonableTreeFromForest(forest);
	assert.deepEqual(actual, expected);
}

describe("schematizeForest", () => {
	function testInitialize<TRoot extends FieldSchema>(
		name: string,
		documentSchema: TypedSchemaCollection<TRoot>,
	): void {
		describe(`Initialize with ${name} root`, () => {
			it("initialize tree schema", () => {
				const factory = new SharedTreeFactory({
					jsonValidator: typeboxValidator,
					schema: {
						allowedSchemaModifications: AllowedUpdateType.None,
						initialTree: 10 as any,
						schema: documentSchema,
					},
				});
				const tree = factory.create(new MockFluidDataStoreRuntime(), "test");
				expectSchema(tree);
			});

			it("initialization works with collaboration", () => {
				const factory = new SharedTreeFactory({
					jsonValidator: typeboxValidator,
					schema: {
						allowedSchemaModifications: AllowedUpdateType.None,
						initialTree: 10 as any,
						schema: documentSchema,
					},
				});
				const provider = new TestTreeProviderLite(2, factory);
				const tree = provider.trees[0];

				const view = createSharedTreeView(configEmpty);
				schematizeView(tree, {
					allowedSchemaModifications: AllowedUpdateType.None,
					initialTree: 10 as any,
					schema: documentSchema,
				});

				expectSchema(tree);
				provider.processMessages();
				expectSchema(tree);
				expectSchema(provider.trees[1]);
			});

			it("concurrent initialization", () => {
				const provider = new TestTreeProviderLite(2, factory);
				const tree = provider.trees[0];
				const tree2 = provider.trees[1];

				tree.schematize({
					allowedSchemaModifications: AllowedUpdateType.SchemaCompatible,
					initialTree: 10 as any,
					schema: documentSchema,
				});

				tree2.schematize({
					allowedSchemaModifications: AllowedUpdateType.SchemaCompatible,
					initialTree: 10 as any,
					schema: documentSchema,
				});

				expectSchema(tree);
				expectSchema(tree2);
				provider.processMessages();
				expectSchema(tree);
				expectSchema(tree2);
			});
		});
	}

	testInitialize("optional", schema);
	testInitialize("value", schemaValueRoot);

	it("noop upgrade", () => {
		const tree = factory.create(new MockFluidDataStoreRuntime(), "test");
		tree.storedSchema.update(schema);

		// No op upgrade with AllowedUpdateType.None does not error
		const schematized = tree.schematize({
			allowedSchemaModifications: AllowedUpdateType.None,
			initialTree: 10,
			schema,
		});
		// And does not add initial tree:
		assert.equal(schematized.root, undefined);
	});

	it("upgrade schema errors when in AllowedUpdateType.None", () => {
		const tree = factory.create(new MockFluidDataStoreRuntime(), "test");
		tree.storedSchema.update(schema);
		assert.throws(() => {
			tree.schematize({
				allowedSchemaModifications: AllowedUpdateType.None,
				initialTree: "x",
				schema: schemaGeneralized,
			});
		});
	});

	it("incompatible upgrade errors", () => {
		const tree = factory.create(new MockFluidDataStoreRuntime(), "test");
		tree.storedSchema.update(schemaGeneralized);
		assert.throws(() => {
			tree.schematize({
				allowedSchemaModifications: AllowedUpdateType.None,
				initialTree: "x",
				schema,
			});
		});
	});

	it("upgrade schema", () => {
		const tree = factory.create(new MockFluidDataStoreRuntime(), "test");
		tree.storedSchema.update(schema);
		const schematized = tree.schematize({
			allowedSchemaModifications: AllowedUpdateType.SchemaCompatible,
			initialTree: "x",
			schema: schemaGeneralized,
		});
		// Initial tree should not be applied
		assert.equal(schematized.root, undefined);
	});

	it("errors if schema changes to not be compatible with view schema", () => {
		const provider = new TestTreeProviderLite(2, factory);
		const tree = provider.trees[0];
		const tree2 = provider.trees[1];

		const treeLog = [];
		tree.events.on("afterBatch", () => treeLog.push("afterBatch"));
		tree.storedSchema.registerDependent(
			new SimpleObservingDependent(() => treeLog.push("schemaChange")),
		);

		const schematized = tree.schematize({
			allowedSchemaModifications: AllowedUpdateType.SchemaCompatible,
			initialTree: "x",
			schema: schemaGeneralized,
		});

		treeLog.push("schematized");
		provider.processMessages();
		treeLog.push("processed messages");

		tree2.transaction.start();
		tree2.storedSchema.update(schema);
		tree2.transaction.commit();

		// Error should occur here, but current limitation on schema editing defers the error until the following tree content edit.
		provider.processMessages();

		assert.throws(
			() => tree.setContent(11),
			(e: Error) => validateAssertionError(e, /schema changed/),
		);
	});
});
