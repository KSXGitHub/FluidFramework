/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { RuntimeHeaders } from "@fluidframework/container-runtime";
import {
	FluidHandle,
	IFluidHandleContext,
	IRequest,
	FluidObject,
} from "@fluidframework/core-interfaces";
import { responseToException } from "@fluidframework/runtime-utils";

/**
 * This handle is used to dynamically load a Fluid object on a remote client and is created on parsing a serialized
 * FluidObjectHandle.
 * This class is used to generate an IFluidHandle when de-serializing any all handles (including handles to DDSes,
 * custom objects) that are stored in SharedObjects. The Data Store or SharedObject corresponding to the
 * IFluidHandle can be retrieved by calling `get` on it.
 */
export class RemoteFluidObjectHandle extends FluidHandle {
	public get IFluidHandleContext() {
		return this;
	}
	public get IFluidHandle() {
		return this;
	}

	public readonly isAttached = true;
	private objectP: Promise<FluidObject> | undefined;

	/**
	 * Creates a new RemoteFluidObjectHandle when parsing an IFluidHandle.
	 * @param absolutePath - The absolute path to the handle from the container runtime.
	 * @param routeContext - The root IFluidHandleContext that has a route to this handle.
	 */
	constructor(
		absolutePath: string,
		public readonly routeContext: IFluidHandleContext,
	) {
		super(absolutePath);
		assert(
			absolutePath.startsWith("/"),
			0x19d /* "Handles should always have absolute paths" */,
		);
	}

	public async get(): Promise<any> {
		if (this.objectP === undefined) {
			// Add `viaHandle` header to distinguish from requests from non-handle paths.
			const request: IRequest = {
				url: this.absolutePath,
				headers: { [RuntimeHeaders.viaHandle]: true },
			};
			this.objectP = this.routeContext
				.resolveHandle(request)
				.then<FluidObject>((response) => {
					if (response.mimeType === "fluid/object") {
						const fluidObject: FluidObject = response.value;
						return fluidObject;
					}
					throw responseToException(response, request);
				});
		}
		return this.objectP;
	}

	public attachGraph(): void {
		return;
	}

	public bind(handle: FluidHandle): void {
		handle.attachGraph();
	}
}
