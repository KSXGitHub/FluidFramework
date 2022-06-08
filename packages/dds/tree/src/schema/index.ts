/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	allowsFieldSuperset, allowsTreeSuperset, allowsValueSuperset, isNeverField, isNeverTree,
} from "./Comparison";
export {
	FieldSchema,
	GlobalFieldKey,
	LocalFieldKey,
	FieldKind,
	NamedTreeSchema,
	TreeSchema,
	TreeSchemaIdentifier,
	ValueSchema,
} from "./Schema";
export { emptyField, emptyMap, emptySet, fieldSchema, treeSchema, rootFieldKey } from "./Builders";
export { anyField, anyTree, neverField, neverTree } from "./SpecialSchema";
export { StoredSchemaRepository } from "./StoredSchemaRepository";
export {
	Adapters, adaptRepo, checkCompatibility, Compatibility, MissingFieldAdapter, TreeAdapter,
} from "./View";
