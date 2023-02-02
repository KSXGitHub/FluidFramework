/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A browser friendly assert library.
 * Use this instead of the 'assert' package, which has a big impact on bundle sizes.
 * @param condition - The condition that should be true, if the condition is false an error will be thrown.
 * @param message - The message to include in the error when the condition does not hold.
 * A number should not be specified manually: use a string.
 * Before a release, policy-check should be run, which will convert any asserts still using strings to
 * use numbered error codes instead.
 */
export function assert(condition: boolean, message: string | number): asserts condition {
	if (!condition) {
		fail(message);
	}
}

/**
 * Fails an assertion.
 * `fail(message)` is the same as `assert(false, message)`.
 * See {@link assert}.
 *
 * @remarks
 * This can be useful for raising an error when a particular code-path is reached, for example:
 *
 * ```typescript
 *	switch (x) {
 *		case "x": {
 *			return false;
 *		}
 *		case "y": {
 *			return true;
 *		}
 *		default: {
 *			fail("unexpected input");
 *		}
 *	}
 * ```
 *
 * It is also useful for inline checks:
 *
 * ```typescript
 *	const y: number = map.get("key") ?? fail("did not find key in map");
 * ```
 *
 * @param message - The message to include in the error when the condition does not hold.
 * A number should not be specified manually: use a string.
 * Before a release, policy-check should be run, which will convert any asserts still using strings to
 * use numbered error codes instead.
 */
export function fail(message: string | number): never {
	throw new Error(
		typeof message === "number" ? `0x${message.toString(16).padStart(3, "0")}` : message,
	);
}
