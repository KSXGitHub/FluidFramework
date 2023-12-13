/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidHandle } from "@fluidframework/core-interfaces";
import { AttachState } from "@fluidframework/container-definitions";

/**
 * Mock implementation of IFluidHandle.
 * @internal
 */
export class MockHandle<T> extends FluidHandle {
	private graphAttachState: AttachState = AttachState.Detached;

	public get isAttached(): boolean {
		return this.graphAttachState === AttachState.Attached;
	}

	constructor(
		protected readonly value: T,
		public readonly path = `mock-handle-${Math.random().toString(36).slice(2)}`,
		absolutePath: string = `/${path}`,
	) {
		super(absolutePath);
	}

	public async get(): Promise<any> {
		return this.value;
	}
	public attachGraph(): void {
		this.graphAttachState = AttachState.Attached;
	}
	public bind() {
		throw Error("MockHandle.bind() unimplemented.");
	}
}
