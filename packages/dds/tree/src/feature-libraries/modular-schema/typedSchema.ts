/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { areSafelyAssignable, Invariant, MakeNominal, requireFalse, requireTrue } from "../../util";
import {
    FieldSchema,
    LocalFieldKey,
    ValueSchema,
    TreeSchemaIdentifier,
    GlobalFieldKey,
    FieldKindIdentifier,
    TreeTypeSet,
} from "../../schema-stored";
import { forbidden } from "../defaultFieldKinds";
import { FieldKind } from "./fieldKind";

/**
 * APIs for building typescript types and schema together.
 * This is an example schema language which can support schema aware APIs in typescript without code gen.
 */

/**
 * Type implemented by schema to allow compile time schema access via type checking.
 */
export interface TreeSchemaTypeInfo {
    readonly local: { [key: LocalFieldKey]: FieldSchemaTypeInfo };
    readonly global: { [key: GlobalFieldKey]: 0 };
    readonly extraLocalFields: FieldSchemaTypeInfo;
    readonly extraGlobalFields: boolean;
    readonly value: ValueSchema;
}

interface FieldSchemaTypeInfo {
    types: { [key: TreeSchemaIdentifier]: 0 } | undefined;
    kind: FieldKindIdentifier;
}

type FieldKindTypeInfo = FieldKind;

/**
 * Builds a TreeSchema with the type information also captured in the
 * typescript type to allow for deriving schema aware APIs.
 */
export function typedTreeSchema<T extends TreeSchemaTypeInfo>(t: T): TypedTreeSchema<T> {
    return new TypedTreeSchema(t);
}

type EmptyMapObject = Record<never, never>;

export const emptyField = {
    types: {},
    kind: forbidden.identifier,
};

export interface Leaf<T extends ValueSchema> extends TreeSchemaTypeInfo {
    readonly local: EmptyMapObject;
    readonly global: EmptyMapObject;
    readonly extraLocalFields: typeof emptyField;
    readonly extraGlobalFields: false;
    readonly value: T;
}

/**
 * Builds a TreeSchema with the type information also captured in the
 * typescript type to allow for deriving schema aware APIs.
 */
export function typedLeafSchema<T extends ValueSchema>(t: T): Leaf<T> {
    return {
        local: {},
        global: {},
        extraLocalFields: emptyField,
        extraGlobalFields: false,
        value: t,
    };
}

/**
 * Builds a FieldSchema with the type information also captured in the
 * typescript type to allow for deriving schema aware APIs.
 */
export function typedFieldSchema<T extends FieldSchemaTypeInfo>(t: T): TypedFieldSchema<T> {
    return new TypedFieldSchema(t.kind, [...Object.keys(t.types)] as TreeSchemaIdentifier[]);
}

/**
 * Builds a FieldSchema with the type information also captured in the
 * typescript type to allow for deriving schema aware APIs.
 */
export function typedFieldKind<T extends FieldKindTypeInfo>(t: T): TypedFieldKind<T> {
    return new TypedFieldKind(t);
}

export type TypeInfo<T extends TypedTreeSchema<any>> = T extends TypedTreeSchema<infer R>
    ? R
    : unknown;

export type FieldInfo<T extends TypedFieldSchema<any>> = T extends TypedFieldSchema<infer R>
    ? R
    : unknown;

export interface TreeViewSchema<T extends TreeSchemaTypeInfo> {
    readonly localFields: ObjectToMap<LocalFieldKey, TypedFieldSchema<any>, T["local"]>;
    readonly globalFields: ReadonlySet<GlobalFieldKey>; // TODO: stronger type using T["global"]
    readonly extraLocalFields: T["extraLocalFields"];
    readonly extraGlobalFields: T["extraGlobalFields"];
    readonly value: T["value"];
}

/**
 * View Schema for a Tree node.
 *
 * TODO: 2 phase initialization so this can directly refer to other schema objects instead of identifiers.
 */
export class TypedTreeSchema<T extends TreeSchemaTypeInfo> implements TreeViewSchema<T> {
    protected typeCheck!: MakeNominal;

    public readonly localFields: ObjectToMap<LocalFieldKey, TypedFieldSchema<any>, T["local"]>;
    public readonly globalFields: ReadonlySet<GlobalFieldKey>; // TODO: stronger type using T["global"]
    public readonly extraLocalFields: T["extraLocalFields"];
    public readonly extraGlobalFields: T["extraGlobalFields"];
    public readonly value: T["value"];

    public constructor(public readonly info: T) {
        this.localFields = objectToMap<LocalFieldKey, TypedFieldSchema<any>, T["local"]>(
            info.local,
        );
        this.globalFields = new Set(Object.keys(info.global)) as Set<GlobalFieldKey>;
        this.extraLocalFields = info.extraLocalFields;
        this.extraGlobalFields = info.extraGlobalFields;
        this.value = info.value;
    }
}

export class TypedFieldSchema<T extends FieldSchemaTypeInfo> implements FieldSchema {
    protected typeCheck!: Invariant<T>;
    public constructor(
        public readonly kind: FieldKindIdentifier,
        public readonly types: TreeTypeSet | undefined,
    ) {}
}

export class TypedFieldKind<T extends FieldKindTypeInfo> {
    protected typeCheck!: Invariant<T>;
    public constructor(public readonly info: T) {}
}

type ObjectToMap<K extends number | string | symbol, V, T> = ReadonlyMap<K, V> & {
    get<X extends keyof T>(key: X): T[X];
};

function objectToMap<K extends number | string | symbol, V, T extends { [key in K]: V }>(
    t: T,
): ObjectToMap<K, V, T> {
    const map = new Map<K, V>();
    // eslint-disable-next-line no-restricted-syntax
    for (const key in t) {
        if (Object.prototype.hasOwnProperty.call(t, key)) {
            const element = t[key];
            map.set(key as unknown as K, element);
        }
    }
    return map as ObjectToMap<K, V, T>;
}

type MapsAreCompatible<A, B> = areSafelyAssignable<A[keyof A & keyof B], B[keyof A & keyof B]>;

{
    type _check2 = requireTrue<MapsAreCompatible<{ a: "a" }, { a: "a" }>>;
    type _check3 = requireFalse<MapsAreCompatible<{ a: "a" }, { a: "b" }>>;
    type _check4 = requireTrue<MapsAreCompatible<{ a: "a" }, { b: "b" }>>;
}

class RegistrationConflict<ConflictingKeys> {
    protected _makeNominal!: MakeNominal;
    public constructor(public readonly conflictingKeys: Set<ConflictingKeys>) {}
}

// Takes two Map types (as objects mapping keys to values), and unions them.
// In the case of a conflict, currently returns all duplicated keys, not just the ones that conflict.
type MergeMaps<A, B> = MapsAreCompatible<A, B> extends true
    ? A & B
    : RegistrationConflict<keyof A & keyof B>;

{
    type _check2 = requireTrue<areSafelyAssignable<MergeMaps<{ a: "a" }, { a: "a" }>, { a: "a" }>>;
    type _check3 = requireTrue<
        areSafelyAssignable<MergeMaps<{ a: "a" }, { a: "b" }>, RegistrationConflict<"a">>
    >;
    type _check4 = requireTrue<
        areSafelyAssignable<MergeMaps<{ a: "a" }, { b: "b" }>, { a: "a"; b: "b" }>
    >;
}

/**
 * Registry of view schema including both runtime compile time TypeScript type information.
 */
interface TypedSchema {
    tree: { [key: TreeSchemaIdentifier]: TypedTreeSchema<any> };
    field: { [key: GlobalFieldKey]: TypedFieldSchema<any> };
    kind: { [key: TreeSchemaIdentifier]: TypedFieldKind<any> };
}

// TODO: include field kinds
type MergeCollections<A extends TypedSchema, B extends TypedSchema> = {
    treeSchema: MergeMaps<B["treeSchema"], A["treeSchema"]>;
    globalFieldSchema: MergeMaps<B["globalFieldSchema"], A["globalFieldSchema"]>;
};

// TODO: include field kinds
type AsSchemaCollection<Schema extends GlobalLabeledFieldSchema<any> | TypedTreeSchema<any>> =
    Schema extends GlobalLabeledFieldSchema<infer Info>
        ? { treeSchema: {}; globalFieldSchema: { [key in Info["name"]]: Schema } }
        : Schema extends TypedTreeSchema<infer Info>
        ? { treeSchema: {}; globalFieldSchema: { [key in Info["name"]]: Schema } }
        : never;

type ViewSchemaRegistry = (GlobalLabeledFieldSchema<any> | TypedTreeSchema<any>)[];

type OrDefault<T, Default> = T extends undefined ? Default : T;

export function collectSchema<T extends TypedSchemaInfo>(
    t: T,
): {
    tree: OrDefault<T["tree"], unknown>;
    field: OrDefault<T["field"], unknown>;
    kind: OrDefault<T["kind"], unknown>;
} {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return { tree: t.tree ?? {}, field: t.field ?? {}, kind: t.kind ?? {} } as any;
}

interface TypedSchemaInfo {
    tree?: { [key: string]: TreeSchemaTypeInfo } | undefined;
    field?: { [key: string]: FieldSchemaTypeInfo } | undefined;
    kind?: { [key: string]: FieldKindTypeInfo } | undefined;
}
