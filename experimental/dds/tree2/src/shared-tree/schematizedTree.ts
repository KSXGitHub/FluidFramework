/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import {
	schemaDataIsEmpty,
	AllowedUpdateType,
	Compatibility,
	SimpleObservingDependent,
	SchemaData,
	ITreeCursor,
	StoredSchemaRepository,
	IEditableForest,
	initializeForest,
	ITreeCursorSynchronous,
} from "../core";
import {
	defaultSchemaPolicy,
	FieldKinds,
	allowsRepoSuperset,
	TypedSchemaCollection,
	SchemaAware,
	FieldSchema,
	ViewSchema,
	normalizeNewFieldContent,
} from "../feature-libraries";
import { fail } from "../util";
import { ITransaction } from "./sharedTreeView";

/**
 * Takes in a tree and returns a view of it that conforms to the view schema.
 * The returned view referees to and can edit the provided one: it is not a fork of it.
 * Updates the stored schema in the tree to match the provided one if requested by config and compatible.
 *
 * If the tree is uninitialized (has no nodes or schema at all),
 * it is initialized to the config's initial tree and the provided schema are stored.
 * This is done even if `AllowedUpdateType.None`.
 *
 * @remarks
 * Doing initialization here, regardless of `AllowedUpdateType`, allows a small API that is hard to use incorrectly.
 * Other approach tend to have leave easy to make mistakes.
 * For example, having a separate initialization function means apps can forget to call it, making an app that can only open existing document,
 * or call it unconditionally leaving an app that can only create new documents.
 * It also would require the schema to be passed into to separate places and could cause issues if they didn't match.
 * Since the initialization function couldn't return a typed tree, the type checking wouldn't help catch that.
 * Also, if an app manages to create a document, but the initialization fails to get persisted, an app that only calls the initialization function
 * on the create code-path (for example how a schematized factory might do it),
 * would leave the document in an unusable state which could not be repaired when it is reopened (by the same or other clients).
 * Additionally, once out of schema content adapters are properly supported (with lazy document updates),
 * this initialization could become just another out of schema content adapter: at tha point it clearly belong here in schematize.
 *
 * TODO:
 * - Support adapters for handling out of schema data.
 * - Handle initialization via an adapter.
 * - Support per adapter update policy.
 * - Support lazy schema updates.
 */
export function schematizeForest<TRoot extends FieldSchema>(
	forest: IEditableForest,
	storedSchema: StoredSchemaRepository,
	config: SchematizeConfiguration<TRoot>,
	transaction: ITransaction,
): void {
	// Check for empty.
	// When this becomes a more proper out of schema adapter, it should be made lazy.
	{
		if (forest.isEmpty && schemaDataIsEmpty(storedSchema)) {
			transaction?.start();

			const rootSchema = config.schema.rootFieldSchema;
			const rootKind = rootSchema.kind.identifier;

			// To keep the data in schema during the update, first define a schema that tolerates the current (empty) tree as well as the final (initial) tree.
			let incrementalSchemaUpdate: SchemaData;
			if (
				rootKind === FieldKinds.sequence.identifier ||
				rootKind === FieldKinds.optional.identifier
			) {
				// These kinds are known to tolerate empty, so use the schema as is:
				incrementalSchemaUpdate = config.schema;
			} else {
				assert(rootKind === FieldKinds.value.identifier, 0x5c8 /* Unexpected kind */);
				// Replace value kind with optional kind in root field schema:
				incrementalSchemaUpdate = {
					...config.schema,
					rootFieldSchema: {
						kind: FieldKinds.optional,
						types: rootSchema.types,
					},
				};
			}

			// TODO: fix issues with schema comparison and enable this.
			// assert(
			// 	allowsRepoSuperset(defaultSchemaPolicy, tree.storedSchema, incrementalSchemaUpdate),
			// 	"Incremental Schema update should support the existing empty tree",
			// );
			assert(
				allowsRepoSuperset(defaultSchemaPolicy, config.schema, incrementalSchemaUpdate),
				0x5c9 /* Incremental Schema during update should be a allow a superset of the final schema */,
			);
			// Update to intermediate schema
			storedSchema.update(incrementalSchemaUpdate);
			// Insert initial tree
			const normalized: readonly ITreeCursor[] = normalizeNewFieldContent(
				{ schema: config.schema },
				config.schema.rootFieldSchema,
				config.initialTree,
			);
			// TODO: better sort out ITreeCursor vs ITreeCursorSynchronous to avoid casts.
			initializeForest(forest, normalized as readonly ITreeCursorSynchronous[]);

			// If intermediate schema is not final desired schema, update to the final schema:
			if (incrementalSchemaUpdate !== config.schema) {
				storedSchema.update(config.schema);
			}

			transaction?.commit();
		}
	}

	// TODO: support adapters and include them here.
	const viewSchema = new ViewSchema(defaultSchemaPolicy, {}, config.schema);
	{
		const compatibility = viewSchema.checkCompatibility(storedSchema);
		switch (config.allowedSchemaModifications) {
			case AllowedUpdateType.None: {
				if (compatibility.read !== Compatibility.Compatible) {
					fail(
						"Existing stored schema permits trees which are incompatible with the view schema",
					);
				}

				if (compatibility.write !== Compatibility.Compatible) {
					// TODO: support readonly mode in this case.
					fail("View schema permits trees which are incompatible with the stored schema");
				}

				break;
			}
			case AllowedUpdateType.SchemaCompatible: {
				if (compatibility.read !== Compatibility.Compatible) {
					fail(
						"Existing stored schema permits trees which are incompatible with the view schema, so schema can not be updated",
					);
				}
				if (compatibility.write !== Compatibility.Compatible) {
					storedSchema.update(config.schema);
				}

				break;
			}
			default: {
				unreachableCase(config.allowedSchemaModifications);
			}
		}
	}

	// Callback to cleanup afterBatch schema checking.
	// Set only when such a callback is pending.
	let afterBatchCheck: undefined | (() => void);

	// TODO: errors thrown by this will usually be in response to remote edits, and thus may not surface to the app.
	// Two fixes should be done related to this:
	// 1. Ensure errors in response to edits like this crash app and report telemetry.
	// 2. Replace these (and the above) exception based errors with
	// out of schema handlers which update the schematized view of the tree instead of throwing.
	storedSchema.registerDependent(
		new SimpleObservingDependent(() => {
			// On schema change, setup a callback (deduplicated so its only run once) after a batch of changes.
			// This avoids erroring about invalid schema in the middle of a batch of changes.
			// TODO:
			// Ideally this would run at the end of the batch containing the schema change, but currently schema changes don't trigger afterBatch.
			// Fortunately this works out ok, since the tree can't actually become out of schema until its actually edited, which should trigger after batch.
			// When batching properly handles schema edits, this documentation and related tests should be updated.
			// TODO:
			// This seems like the correct policy, but more clarity on how schematized views are updating during batches is needed.
			// TODO:
			// Maybe this should be afterBatch, but that does not exist for forest.
			afterBatchCheck ??= forest.on("afterDelta", () => {
				assert(afterBatchCheck !== undefined, 0x728 /* unregistered event ran */);
				afterBatchCheck();
				afterBatchCheck = undefined;

				const compatibility = viewSchema.checkCompatibility(storedSchema);
				if (compatibility.read !== Compatibility.Compatible) {
					fail(
						"Stored schema changed to one that permits data incompatible with the view schema",
					);
				}

				if (compatibility.write !== Compatibility.Compatible) {
					// TODO: support readonly mode in this case.
					fail(
						"Stored schema changed to one that does not support all data allowed by view schema",
					);
				}
			});
		}),
	);
}

/**
 * Content that can populate a `SharedTree`.
 *
 * @alpha
 */
export interface TreeContent<TRoot extends FieldSchema = FieldSchema> {
	/**
	 * The schema which the application wants to view the tree with.
	 */
	readonly schema: TypedSchemaCollection<TRoot>;
	/**
	 * Default tree content to initialize the tree with iff the tree is uninitialized
	 * (meaning it does not even have any schema set at all).
	 */
	readonly initialTree:
		| SchemaAware.TypedField<TRoot, SchemaAware.ApiMode.Simple>
		| readonly ITreeCursor[];
}

/**
 * Options used to schematize a `SharedTree`.
 *
 * @alpha
 */
export interface SchematizeConfiguration<TRoot extends FieldSchema = FieldSchema>
	extends TreeContent<TRoot> {
	/**
	 * Controls if and how schema from existing documents can be updated to accommodate the view schema.
	 */
	readonly allowedSchemaModifications: AllowedUpdateType;
}
