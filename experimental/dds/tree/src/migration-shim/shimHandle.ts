/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidHandle } from '@fluidframework/core-interfaces';
import { type IShim } from './types.js';

/**
 * ShimHandle is a special class to handle the fact that we are essentially creating a proxy for a DDS.
 *
 * ShimHandle is designed for MigrationShim and SharedTreeShim.
 *
 * Local handles such as the FluidObjectHandle and the SharedObjectHandle don't work as they do not properly bind the
 * Shim's underlying DDS.
 */
export class ShimHandle<TShim extends IShim> extends FluidHandle<TShim> {
	public constructor(private readonly shim: TShim) {
		super(shim.currentTree.handle.absolutePath);
	}

	public override get absolutePath(): string {
		return this.shim.currentTree.handle.absolutePath;
	}

	public get isAttached(): boolean {
		return this.shim.currentTree.handle.isAttached;
	}
	public attachGraph(): void {
		return this.shim.currentTree.handle.attachGraph();
	}
	public async get(): Promise<TShim> {
		return this.shim;
	}
	public bind(handle: FluidHandle): void {
		return this.shim.currentTree.handle.bind(handle);
	}
	public get IFluidHandle(): FluidHandle<TShim> {
		return this;
	}
}
