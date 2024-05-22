/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";

import { RevisionMetadataSource, RevisionTag } from "../../core/index.js";
import { IdAllocator, Mutable, fail } from "../../util/index.js";
import { CrossFieldManager, CrossFieldTarget, NodeId } from "../modular-schema/index.js";

import { MarkListFactory } from "./markListFactory.js";
import {
	CellId,
	CellMark,
	Changeset,
	Mark,
	MarkEffect,
	MarkList,
	MoveIn,
	MoveOut,
	NoopMark,
	NoopMarkType,
	Remove,
} from "./types.js";
import {
	extractMarkEffect,
	getDetachOutputCellId,
	getEndpoint,
	getInputCellId,
	getOutputCellId,
	isAttach,
	isDetach,
	isImpactful,
	normalizeCellRename,
	splitMark,
	withNodeChange,
} from "./utils.js";

/**
 * Inverts a given changeset.
 * @param change - The changeset to produce the inverse of.
 * @returns The inverse of the given `change` such that the inverse can be applied after `change`.
 *
 * WARNING! This implementation is incomplete:
 * - Support for slices is not implemented.
 */
export function invert(
	change: Changeset,
	isRollback: boolean,
	genId: IdAllocator,
	crossFieldManager: CrossFieldManager,
	revisionMetadata: RevisionMetadataSource,
): Changeset {
	return invertMarkList(change, crossFieldManager as CrossFieldManager<NodeId>, revisionMetadata);
}

function invertMarkList(
	markList: MarkList,
	crossFieldManager: CrossFieldManager<NodeId>,
	revisionMetadata: RevisionMetadataSource,
): MarkList {
	const inverseMarkList = new MarkListFactory();

	for (const mark of markList) {
		const inverseMarks = invertMark(mark, crossFieldManager, revisionMetadata);
		inverseMarkList.push(...inverseMarks);
	}

	return inverseMarkList.list;
}

function invertMark(
	mark: Mark,
	crossFieldManager: CrossFieldManager<NodeId>,
	revisionMetadata: RevisionMetadataSource,
): Mark[] {
	if (!isImpactful(mark, revisionMetadata)) {
		const inputId = getInputCellId(mark, revisionMetadata);
		return [invertNodeChangeOrSkip(mark.count, mark.changes, inputId)];
	}
	const type = mark.type;
	switch (type) {
		case NoopMarkType: {
			return [mark];
		}
		case "Remove": {
			assert(mark.revision !== undefined, 0x5a1 /* Unable to revert to undefined revision */);
			const outputId = getOutputCellId(mark, revisionMetadata);
			const inputId = getInputCellId(mark, revisionMetadata);
			const inverse: Mark =
				inputId === undefined
					? {
							type: "Insert",
							id: mark.id,
							cellId: outputId,
							count: mark.count,
					  }
					: {
							type: "Remove",
							id: mark.id,
							cellId: outputId,
							count: mark.count,
							idOverride: inputId,
					  };
			return [withNodeChange(inverse, mark.changes)];
		}
		case "Insert": {
			const inputId = getInputCellId(mark, revisionMetadata);
			assert(inputId !== undefined, 0x80c /* Active inserts should target empty cells */);
			const removeMark: Mutable<CellMark<Remove>> = {
				type: "Remove",
				count: mark.count,
				id: inputId.localId,
				idOverride: inputId,
			};

			const inverse = withNodeChange(removeMark, mark.changes);
			return [inverse];
		}
		case "MoveOut": {
			if (mark.changes !== undefined) {
				assert(
					mark.count === 1,
					0x6ed /* Mark with changes can only target a single cell */,
				);

				const endpoint = getEndpoint(mark);
				crossFieldManager.set(
					CrossFieldTarget.Destination,
					endpoint.revision,
					endpoint.localId,
					mark.count,
					mark.changes,
					true,
				);
			}

			const cellId = getDetachOutputCellId(mark, revisionMetadata) ?? {
				revision: mark.revision ?? fail("Revision must be defined"),
				localId: mark.id,
			};

			const moveIn: MoveIn = {
				type: "MoveIn",
				id: mark.id,
			};

			if (mark.finalEndpoint !== undefined) {
				moveIn.finalEndpoint = { localId: mark.finalEndpoint.localId };
			}
			let effect: MarkEffect = moveIn;
			const inputId = getInputCellId(mark, revisionMetadata);
			if (inputId !== undefined) {
				effect = {
					type: "AttachAndDetach",
					attach: moveIn,
					detach: {
						type: "Remove",
						id: mark.id,
						idOverride: inputId,
					},
				};
			}
			return [{ ...effect, count: mark.count, cellId }];
		}
		case "MoveIn": {
			const inputId = getInputCellId(mark, revisionMetadata);
			assert(inputId !== undefined, 0x89e /* Active move-ins should target empty cells */);
			const invertedMark: Mutable<CellMark<MoveOut>> = {
				type: "MoveOut",
				id: mark.id,
				count: mark.count,
				idOverride: inputId,
			};

			if (mark.finalEndpoint) {
				invertedMark.finalEndpoint = { localId: mark.finalEndpoint.localId };
			}
			return applyMovedChanges(invertedMark, mark.revision, crossFieldManager);
		}
		case "AttachAndDetach": {
			// Which should get the child change? Don't want to invert twice
			const attach: Mark = {
				count: mark.count,
				cellId: mark.cellId,
				...mark.attach,
			};
			const idAfterAttach = getOutputCellId(attach, undefined);

			// We put `mark.changes` on the detach so that if it is a move source
			// the changes can be sent to the endpoint.
			const detach: Mark = {
				count: mark.count,
				cellId: idAfterAttach,
				changes: mark.changes,
				...mark.detach,
			};
			const attachInverses = invertMark(attach, crossFieldManager, revisionMetadata);
			const detachInverses = invertMark(detach, crossFieldManager, revisionMetadata);

			if (detachInverses.length === 0) {
				return attachInverses;
			}

			assert(
				detachInverses.length === 1,
				0x80d /* Only expected MoveIn marks to be split when inverting */,
			);

			let detachInverse = detachInverses[0];
			assert(isAttach(detachInverse), 0x80e /* Inverse of a detach should be an attach */);

			const inverses: Mark[] = [];
			for (const attachInverse of attachInverses) {
				let detachInverseCurr: Mark = detachInverse;
				if (attachInverse.count !== detachInverse.count) {
					[detachInverseCurr, detachInverse] = splitMark(
						detachInverse,
						attachInverse.count,
					);
				}

				if (attachInverse.type === NoopMarkType) {
					if (attachInverse.changes !== undefined) {
						assert(
							detachInverseCurr.changes === undefined,
							0x80f /* Unexpected node changes */,
						);
						detachInverseCurr.changes = attachInverse.changes;
					}
					inverses.push(detachInverseCurr);
					continue;
				}
				assert(
					isDetach(attachInverse),
					0x810 /* Inverse of an attach should be a detach */,
				);

				const inverted: Mark = {
					type: "AttachAndDetach",
					count: attachInverse.count,
					attach: extractMarkEffect(detachInverseCurr),
					detach: extractMarkEffect(attachInverse),
				};

				if (detachInverseCurr.cellId !== undefined) {
					inverted.cellId = detachInverseCurr.cellId;
				}

				if (detachInverseCurr.changes !== undefined) {
					inverted.changes = detachInverseCurr.changes;
				}

				if (attachInverse.changes !== undefined) {
					assert(inverted.changes === undefined, 0x811 /* Unexpected node changes */);
					inverted.changes = attachInverse.changes;
				}

				inverses.push(normalizeCellRename(inverted));
			}

			return inverses;
		}
		default:
			unreachableCase(type);
	}
}

function applyMovedChanges(
	mark: CellMark<MoveOut>,
	revision: RevisionTag | undefined,
	manager: CrossFieldManager<NodeId>,
): Mark[] {
	// Although this is a source mark, we query the destination because this was a destination mark during the original invert pass.
	const entry = manager.get(CrossFieldTarget.Destination, revision, mark.id, mark.count, true);

	if (entry.length < mark.count) {
		const [mark1, mark2] = splitMark(mark, entry.length);
		const mark1WithChanges =
			entry.value !== undefined
				? withNodeChange<CellMark<MoveOut>, MoveOut>(mark1, entry.value)
				: mark1;

		return [mark1WithChanges, ...applyMovedChanges(mark2, revision, manager)];
	}

	if (entry.value !== undefined) {
		return [withNodeChange<CellMark<MoveOut>, MoveOut>(mark, entry.value)];
	}

	return [mark];
}

function invertNodeChangeOrSkip(count: number, changes: NodeId | undefined, cellId?: CellId): Mark {
	if (changes !== undefined) {
		assert(count === 1, 0x66c /* A modify mark must have length equal to one */);
		const noop: CellMark<NoopMark> = {
			count,
			changes,
		};
		if (cellId !== undefined) {
			noop.cellId = cellId;
		}
		return noop;
	}

	if (cellId !== undefined) {
		return { count, cellId };
	}
	return { count };
}
