/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-deprecated */

import { Stack } from "./collections";
import { SlidingPreference } from "./localReference";
import { ISegment } from "./mergeTreeNodes";
import { ReferenceType, ICombiningOp } from "./ops";
import { PropertySet, MapLike } from "./properties";

/**
 * @internal
 */
export const reservedTileLabelsKey = "referenceTileLabels";
/**
 * @internal
 */
export const reservedRangeLabelsKey = "referenceRangeLabels";

/**
 * @internal
 */
export function refTypeIncludesFlag(
	refPosOrType: ReferencePosition | ReferenceType,
	flags: ReferenceType,
): boolean {
	const refType = typeof refPosOrType === "number" ? refPosOrType : refPosOrType.refType;
	// eslint-disable-next-line no-bitwise
	return (refType & flags) !== 0;
}

/**
 * @internal
 */
export const refGetTileLabels = (refPos: ReferencePosition): string[] | undefined =>
	refTypeIncludesFlag(refPos, ReferenceType.Tile) && refPos.properties
		? (refPos.properties[reservedTileLabelsKey] as string[])
		: undefined;

/**
 * @deprecated This functionality is deprecated and will be removed in a future release.
 * @internal
 */
export const refGetRangeLabels = (refPos: ReferencePosition): string[] | undefined =>
	// eslint-disable-next-line no-bitwise
	refTypeIncludesFlag(refPos, ReferenceType.NestBegin | ReferenceType.NestEnd) &&
	refPos.properties
		? (refPos.properties[reservedRangeLabelsKey] as string[])
		: undefined;

/**
 * @internal
 */
export function refHasTileLabel(refPos: ReferencePosition, label: string): boolean {
	const tileLabels = refGetTileLabels(refPos);
	return tileLabels?.includes(label) ?? false;
}

/**
 * @deprecated This functionality is deprecated and will be removed in a future release.
 * @internal
 */
export function refHasRangeLabel(refPos: ReferencePosition, label: string): boolean {
	const rangeLabels = refGetRangeLabels(refPos);
	return rangeLabels?.includes(label) ?? false;
}

/**
 * @internal
 */
export function refHasTileLabels(refPos: ReferencePosition): boolean {
	return refGetTileLabels(refPos) !== undefined;
}

/**
 * @deprecated This functionality is deprecated and will be removed in a future release.
 * @internal
 */
export function refHasRangeLabels(refPos: ReferencePosition): boolean {
	return refGetRangeLabels(refPos) !== undefined;
}

/**
 * Represents a reference to a place within a merge tree. This place conceptually remains stable over time
 * by referring to a particular segment and offset within that segment.
 * Thus, this reference's character position changes as the tree is edited.
 * @alpha
 */
export interface ReferencePosition {
	/**
	 * @returns Properties associated with this reference
	 */
	properties?: PropertySet;

	/**
	 * Defaults to forward
	 */
	slidingPreference?: SlidingPreference;

	refType: ReferenceType;

	/**
	 * Gets the segment that this reference position is semantically associated with. Returns undefined iff the
	 * reference became detached from the string.
	 */
	getSegment(): ISegment | undefined;

	/**
	 * Gets the offset for this reference position within its associated segment.
	 *
	 * @example
	 *
	 * If a merge-tree has 3 leaf segments ["hello", " ", "world"] and a ReferencePosition refers to the "l"
	 * in "world", that reference's offset would be 3 as "l" is the character at index 3 within "world".
	 */
	getOffset(): number;

	/**
	 * @param newProps - Properties to add to this reference.
	 * @param op - Combining semantics for changed properties. By default, property changes are last-write-wins.
	 * @remarks Note that merge-tree does not broadcast changes to other clients. It is up to the consumer
	 * to ensure broadcast happens if that is desired.
	 */
	addProperties(newProps: PropertySet, op?: ICombiningOp): void;
	isLeaf(): this is ISegment;
}

/**
 * @deprecated This functionality is deprecated and will be removed in a future release.
 * @alpha
 */
export type RangeStackMap = MapLike<Stack<ReferencePosition>>;

/**
 * @internal
 */
export const DetachedReferencePosition = -1;

/**
 * @internal
 */
export function minReferencePosition<T extends ReferencePosition>(a: T, b: T): T {
	return compareReferencePositions(a, b) < 0 ? a : b;
}

/**
 * @internal
 */
export function maxReferencePosition<T extends ReferencePosition>(a: T, b: T): T {
	return compareReferencePositions(a, b) > 0 ? a : b;
}

/**
 * @internal
 */
export function compareReferencePositions(a: ReferencePosition, b: ReferencePosition): number {
	const aSeg = a.getSegment();
	const bSeg = b.getSegment();
	if (aSeg === bSeg) {
		return a.getOffset() - b.getOffset();
	} else {
		return aSeg === undefined || (bSeg !== undefined && aSeg.ordinal < bSeg.ordinal) ? -1 : 1;
	}
}
