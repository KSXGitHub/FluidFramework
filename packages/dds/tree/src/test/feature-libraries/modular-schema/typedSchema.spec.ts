/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// import {
//     typedTreeSchema,
//     typedFieldSchema,
//     FieldInfo,
//     TypeInfo,
//     collectSchema as collectSchemaInfo,
//     typedFieldKind,
//     typedLeafSchema,
//     TreeSchemaTypeInfo,
//     // Allow importing from this specific file which is being tested:
//     /* eslint-disable-next-line import/no-internal-modules */
// } from "../../../feature-libraries/modular-schema/typedSchema";

// import { ValueSchema } from "../../../schema-stored";
// import { brand, requireTrue } from "../../../util";
// import { FieldKinds } from "../../../feature-libraries";
// import { fieldKinds } from "../../../feature-libraries/defaultFieldKinds";

// // These tests currently just cover the type checking, so its all compile time.

// const lk1 = "localKey1Name";

// export const lk2 = "localKey2Name";

// export const testTypeIdentifier = "testType";

// const testField = typedFieldSchema({
//     types: { testType: 0 as unknown },
//     kind: FieldKinds.value,
// });

// export const testTreeSchema = typedTreeSchema({
//     local: { localKey1Name: testField },
//     global: {},
//     extraLocalFields: testField,
//     extraGlobalFields: true,
//     value: ValueSchema.Serializable,
// });

// type TestTreeSchema = TypeInfo<typeof testTreeSchema>;

// export type _assert = requireTrue<TestTreeSchema["extraGlobalFields"]>;

// export type child = FieldInfo<TestTreeSchema["local"][typeof lk1]>;

// // This is an error since this field does not exist:
// // type invalidChildType = FieldInfo<TestTreeSchema["local"][typeof lk2]>;

// export const xxxx = testTreeSchema.localFields.get(lk1);

// // This is an error since this field does not exist:
// // const invalidChildSchema = testTreeSchema.localFields.get(lk2);

// const schemaBuiltIn = collectSchemaInfo({
//     kind: {
//         value: FieldKinds.value,
//         optional: FieldKinds.optional,
//         sequence: FieldKinds.sequence,
//         forbidden: FieldKinds.forbidden,
//         counter: FieldKinds.counter,
//     },
// });

// // export const jsonObject: NamedTreeSchema = namedTreeSchema({
// //     name: brand("Json.Object"),
// //     extraLocalFields: emptyField,
// // });

// // export const jsonArray: NamedTreeSchema = namedTreeSchema({
// //     name: brand("Json.Array"),
// //     extraLocalFields: emptyField,
// //     localFields: { [EmptyKey]: fieldSchema(FieldKinds.sequence, jsonTypes) },
// // });

// export const jsonNumber = typedLeafSchema(ValueSchema.Number);

// // export const jsonString: NamedTreeSchema = namedTreeSchema({
// //     name: brand("Json.String"),
// //     extraLocalFields: emptyField,
// //     value: ValueSchema.String,
// // });

// // export const jsonNull: NamedTreeSchema = namedTreeSchema({
// //     name: brand("Json.Null"),
// //     extraLocalFields: emptyField,
// //     value: ValueSchema.Nothing,
// // });

// // export const jsonBoolean: NamedTreeSchema = namedTreeSchema({
// //     name: brand("Json.Boolean"),
// //     extraLocalFields: emptyField,
// //     value: ValueSchema.Boolean,
// // });

// // json.push(jsonObject, jsonArray, jsonNumber, jsonString, jsonNull, jsonBoolean);
// // for (const named of json) {
// //     jsonTypes.add(named.name);
// //     jsonTypeSchema.set(named.name, named);
// // }

// // export const jsonRoot: FieldSchema = fieldSchema(FieldKinds.value, jsonTypes);

// const schemaJson = collectSchemaInfo({
//     tree: {
//         jsonNumber,
//     },
// });

// const jsonN = schemaJson.tree.jsonNumber;

// // TO get a type name into the compiler, there has to be a specific declaration for it, so need to use top level constant, like type-box.

// type JsonN = typeof jsonN;

// type EditableTree<T extends TreeSchemaTypeInfo> = { type: "x" } & { value: T["value"] };

// type JsonTree = EditableTree<JsonN>;
