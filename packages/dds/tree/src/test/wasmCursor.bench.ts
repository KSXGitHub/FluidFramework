/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    benchmark,
    BenchmarkType,
    isInPerformanceTestingMode,
} from "@fluid-tools/benchmark";
import { walkSubtree, WasmCursor } from "compressed-tree";
import { JsonableTree, brand, singleTextCursorNew } from "../..";
import { LocalFieldKey } from "../schema-stored";
import { makeArray } from "../util";
import { setGenericTreeField } from "../tree";
// eslint-disable-next-line import/no-internal-modules
import { ITreeCursor } from "../tree/cursor";
import { mapTreeFromCursor, singleMapTreeCursor } from "../feature-libraries";

/**
 * Performance test suite that measures a variety of access patterns using WASM and ITreeCursor.
 */
describe.only("WASM Cursor Benchmarks", () => {
    for (const [fields, nodes] of isInPerformanceTestingMode
        ? [
              // [0, 0],
              [1, 10000],
              // [100, 100],
              [1000, 10],
          ]
        : [
              [0, 0],
              [1, 1],
              [2, 2],
          ]) {
        const expected = fields * nodes + 1;
        {
            let cursor: WasmCursor;
            benchmark({
                type: BenchmarkType.Measurement,
                title: `${fields} of ${nodes}: (Total Nodes: ${expected}) wasm walk`,
                before: () => {
                    cursor = new WasmCursor(fields, nodes);
                    assert.equal(walkSubtree(cursor), expected);
                    assert.equal(walkSubtree(cursor), expected);
                },
                benchmarkFn: () => {
                    walkSubtree(cursor);
                },
                after: () => {
                    cursor.free();
                },
            });
        }
        {
            let cursor: WasmCursor & ITreeCursor;
            benchmark({
                type: BenchmarkType.Measurement,
                title: `${fields} of ${nodes}: (Total Nodes: ${expected}) wasm-> JS walk`,
                before: () => {
                    cursor = new WasmCursor(fields, nodes) as WasmCursor &
                        ITreeCursor;
                    assert.equal(walkSubtree(cursor), expected);
                    assert.equal(walkSubtreeTypeScript(cursor), expected);
                    assert.equal(walkSubtree(cursor), expected);
                    assert.equal(walkSubtreeTypeScript(cursor), expected);
                },
                benchmarkFn: () => {
                    walkSubtreeTypeScript(cursor);
                },
                after: () => {
                    cursor.free();
                },
            });
        }
        {
            let cursor: ITreeCursor;
            benchmark({
                type: BenchmarkType.Measurement,
                title: `${fields} of ${nodes}: (Total Nodes: ${expected}) JsonableTree walk`,
                before: () => {
                    const tree = makeJsonableTree(fields, nodes);
                    cursor = singleTextCursorNew(tree);
                    assert.equal(walkSubtreeTypeScript(cursor), expected);
                    assert.equal(walkSubtreeTypeScript(cursor), expected);
                },
                benchmarkFn: () => {
                    walkSubtreeTypeScript(cursor);
                },
            });
        }
        {
            let cursor: ITreeCursor;
            benchmark({
                type: BenchmarkType.Measurement,
                title: `${fields} of ${nodes}: (Total Nodes: ${expected}) MapTree walk`,
                before: () => {
                    const jsonableTree = makeJsonableTree(fields, nodes);
                    const textCursor = singleTextCursorNew(jsonableTree);
                    const mapTree = mapTreeFromCursor(textCursor);
                    cursor = singleMapTreeCursor(mapTree);
                    assert.equal(walkSubtreeTypeScript(cursor), expected);
                    assert.equal(walkSubtreeTypeScript(cursor), expected);
                },
                benchmarkFn: () => {
                    walkSubtreeTypeScript(cursor);
                },
            });
        }
    }
});

function makeJsonableTree(fields: number, perField: number): JsonableTree {
    function testNode(): JsonableTree {
        const tree: JsonableTree = {
            type: brand(""),
        };
        return tree;
    }
    const root = testNode();
    for (let index = 0; index < fields; index++) {
        const key: LocalFieldKey = brand(index.toString());
        const children = makeArray(perField, () => testNode());
        setGenericTreeField(root, key, children);
    }
    return root;
}

function walkSubtreeTypeScript(n: ITreeCursor): number {
    let count = 1;
    for (let inFields = n.firstField(); inFields; inFields = n.nextField()) {
        for (let inNodes = n.firstNode(); inNodes; inNodes = n.nextNode()) {
            count += walkSubtreeTypeScript(n);
        }
    }
    return count;
}
