/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest, IResponse } from "./fluidRouter";
import { IFluidLoadable } from "./fluidLoadable";
import { FluidObject } from "./provider";

/**
 * @alpha
 */
export const IFluidHandleContext: keyof IProvideFluidHandleContext = "IFluidHandleContext";

/**
 * @alpha
 */
export interface IProvideFluidHandleContext {
	readonly IFluidHandleContext: IFluidHandleContext;
}

/**
 * Handle to a shared {@link FluidObject}.
 */
export abstract class FluidHandle<
	// REVIEW: Constrain `T` to something? How do we support dds and datastores safely?
	T = FluidObject & IFluidLoadable,
> {
	/**
	 * @param absolutePath - The absolute path to the handle context from the root.
	 */
	protected constructor(protected readonly absolutePath: string) {}

	/**
	 * Flag indicating whether or not the entity has services attached.
	 */
	public abstract readonly isAttached: boolean;

	/**
	 * @deprecated To be removed. This is part of an internal API surface and should not be called.
	 *
	 * Runs through the graph and attach the bounded handles.
	 */
	public abstract attachGraph(): void;

	/**
	 * Returns a promise to the Fluid Object referenced by the handle.
	 */
	public abstract get(): Promise<T>;

	/**
	 * Binds the given handle to this one or attach the given handle if this handle is attached.
	 * A bound handle will also be attached once this handle is attached.
	 */
	protected abstract bind(handle: FluidHandle): void;
}

/**
 * Describes a routing context from which other `IFluidHandleContext`s are defined.
 * @alpha
 */
export interface IFluidHandleContext extends IProvideFluidHandleContext {
	/**
	 * The absolute path to the handle context from the root.
	 */
	readonly absolutePath: string;

	/**
	 * The parent IFluidHandleContext that has provided a route path to this IFluidHandleContext or undefined
	 * at the root.
	 */
	readonly routeContext?: IFluidHandleContext;

	/**
	 * Flag indicating whether or not the entity has services attached.
	 */
	readonly isAttached: boolean;

	/**
	 * Runs through the graph and attach the bounded handles.
	 */
	attachGraph(): void;

	resolveHandle(request: IRequest): Promise<IResponse>;
}

/**
 * @deprecated - use FluidHandle instead.
 *  @alpha
 */
export const IFluidHandle: keyof IProvideFluidHandle = "IFluidHandle";

/**
 * @alpha
 */
export interface IProvideFluidHandle {
	readonly IFluidHandle: FluidHandle;
}

/**
 * Handle to a shared {@link FluidObject}.
 *
 * @deprecated - use FluidHandle instead
 * @alpha
 */
export interface IFluidHandle<
	// REVIEW: Constrain `T` to something? How do we support dds and datastores safely?
	T = FluidObject & IFluidLoadable,
> extends IProvideFluidHandle {
	/**
	 * @deprecated Do not use handle's path for routing. Use `get` to get the underlying object.
	 *
	 * The absolute path to the handle context from the root.
	 */
	readonly absolutePath: string;

	/**
	 * Flag indicating whether or not the entity has services attached.
	 */
	readonly isAttached: boolean;

	/**
	 * @deprecated To be removed. This is part of an internal API surface and should not be called.
	 *
	 * Runs through the graph and attach the bounded handles.
	 */
	attachGraph(): void;

	/**
	 * Returns a promise to the Fluid Object referenced by the handle.
	 */
	get(): Promise<T>;

	/**
	 * @deprecated To be removed. This is part of an internal API surface and should not be called.
	 *
	 * Binds the given handle to this one or attach the given handle if this handle is attached.
	 * A bound handle will also be attached once this handle is attached.
	 */
	bind(handle: IFluidHandle): void;
}
