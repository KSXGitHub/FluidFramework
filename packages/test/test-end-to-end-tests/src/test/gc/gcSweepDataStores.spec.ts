/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	ContainerRuntime,
	IGCRuntimeOptions,
	IOnDemandSummarizeOptions,
	ISummarizer,
	TombstoneResponseHeaderKey,
} from "@fluidframework/container-runtime";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import { channelsTreeName } from "@fluidframework/runtime-definitions";
import {
	ITestObjectProvider,
	createSummarizer,
	summarizeNow,
	waitForContainerConnection,
	mockConfigProvider,
	ITestContainerConfig,
	timeoutPromise,
} from "@fluidframework/test-utils";
import {
	describeCompat,
	ITestDataObject,
	itExpects,
	TestDataObjectType,
} from "@fluid-private/test-version-utils";
import { delay } from "@fluidframework/core-utils";
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions";
import { IErrorBase, IFluidHandle } from "@fluidframework/core-interfaces";
import { getGCDeletedStateFromSummary, getGCStateFromSummary } from "./gcTestSummaryUtils.js";

/**
 * These tests validate that SweepReady data stores are correctly swept. Swept datastores should be
 * removed from the summary, added to the GC deleted blob, and prevented from changing (sending / receiving ops,
 * loading, etc.).
 */
describeCompat("GC data store sweep tests", "NoCompat", (getTestObjectProvider) => {
	const remainingTimeUntilSweepMs = 100;
	const sweepTimeoutMs = 200;
	assert(
		remainingTimeUntilSweepMs < sweepTimeoutMs,
		"remainingTimeUntilSweepMs should be < sweepTimeoutMs",
	);
	const settings = {};

	const gcOptions: IGCRuntimeOptions = {
		inactiveTimeoutMs: 0,
		gcSweepGeneration: 1,
		sweepGracePeriodMs: 0, // Skip Tombstone, these tests focus on Sweep
	};
	const testContainerConfig: ITestContainerConfig = {
		runtimeOptions: {
			summaryOptions: {
				summaryConfigOverrides: {
					state: "disabled",
				},
			},
			gcOptions,
		},
		loaderProps: { configProvider: mockConfigProvider(settings) },
	};

	let provider: ITestObjectProvider;

	beforeEach(async function () {
		provider = getTestObjectProvider({ syncSummarizer: true });
		if (provider.driver.type !== "local") {
			this.skip();
		}
		settings["Fluid.GarbageCollection.TestOverride.SweepTimeoutMs"] = sweepTimeoutMs;
	});

	async function loadContainer(summaryVersion: string) {
		return provider.loadTestContainer(testContainerConfig, {
			[LoaderHeader.version]: summaryVersion,
		});
	}

	const loadSummarizer = async (container: IContainer, summaryVersion?: string) => {
		return createSummarizer(
			provider,
			container,
			{
				runtimeOptions: { gcOptions },
				loaderProps: { configProvider: mockConfigProvider(settings) },
			},
			summaryVersion,
		);
	};
	const summarize = async (summarizer: ISummarizer, options?: IOnDemandSummarizeOptions) => {
		await provider.ensureSynchronized();
		return summarizeNow(summarizer, options);
	};

	let opCount = 0;
	// Sends a unique op that's guaranteed to change the DDS for this specific container.
	// This can also be used to transition a client to write mode.
	const sendOpToUpdateSummaryTimestampToNow = async (summarizer: ISummarizer) => {
		const runtime = (summarizer as any).runtime as ContainerRuntime;
		const entryPoint = (await runtime.getAliasedDataStoreEntryPoint("default")) as
			| IFluidHandle<ITestDataObject>
			| undefined;
		if (entryPoint === undefined) {
			throw new Error("default dataStore must exist");
		}
		const defaultDataObject = await entryPoint.get();
		defaultDataObject._root.set("send a", `op ${opCount++}`);
	};

	// This function creates an unreferenced datastore and returns the datastore's id and the summary version that
	// datastore was unreferenced in.
	const summarizationWithUnreferencedDataStoreAfterTime = async (
		approximateUnreferenceTimestampMs: number,
	) => {
		const container = await provider.makeTestContainer(testContainerConfig);
		const defaultDataObject = (await container.getEntryPoint()) as ITestDataObject;
		await waitForContainerConnection(container);

		const handleKey = "handle";
		const dataStore =
			await defaultDataObject._context.containerRuntime.createDataStore(TestDataObjectType);
		const testDataObject = (await dataStore.entryPoint?.get()) as ITestDataObject | undefined;
		assert(
			testDataObject !== undefined,
			"Should have been able to retrieve testDataObject from entryPoint",
		);
		const unreferencedId = testDataObject._context.id;

		// Reference a datastore - important for making it live
		defaultDataObject._root.set(handleKey, testDataObject.handle);
		// Unreference a datastore
		defaultDataObject._root.delete(handleKey);

		// Summarize
		const { container: summarizingContainer1, summarizer: summarizer1 } =
			await loadSummarizer(container);
		const summaryVersion = (await summarize(summarizer1)).summaryVersion;

		// Close the containers as these containers would be closed by session expiry before sweep ready ever occurs
		container.close();
		summarizingContainer1.close();

		// Wait some time, the datastore can be in many different unreference states
		await delay(approximateUnreferenceTimestampMs);

		// Load a new container and summarizer based on the latest summary, summarize
		const { container: summarizingContainer2, summarizer: summarizer2 } = await loadSummarizer(
			container,
			summaryVersion,
		);

		const containerRuntime = (summarizer2 as any).runtime as ContainerRuntime;
		const response = await containerRuntime.resolveHandle({
			url: testDataObject.handle.absolutePath,
		});
		const summarizerDataObject = response.value as ITestDataObject;
		await sendOpToUpdateSummaryTimestampToNow(summarizer2);

		return {
			unreferencedId,
			summarizer: summarizer2,
			summarizingContainer: summarizingContainer2,
			summarizerDataObject,
			summaryVersion,
		};
	};

	/**
	 * Returns a promise that will resolve when all the passed in containers have closed dur
	 * to "DataStore was deleted" error.
	 */
	const getContainersClosePromise = async (containers: IContainer[]) => {
		const closePromises: Promise<void>[] = [];
		for (const container of containers) {
			const promise = timeoutPromise((resolve, reject) => {
				const listener = (error: IErrorBase | undefined) => {
					if (!error?.message.startsWith("DataStore was deleted:")) {
						reject(error);
					}
					container.off("closed", listener);
					resolve();
				};
				container.on("closed", listener);
			});
			closePromises.push(promise);
		}
		return Promise.all(closePromises);
	};

	describe("Using swept data stores not allowed", () => {
		// If this test starts failing due to runtime is closed errors try first adjusting `sweepTimeoutMs` above
		itExpects(
			"Send ops fails for swept datastores in summarizing container loaded before sweep timeout",
			[
				{
					eventName: "fluid:telemetry:Summarizer:Running:SweepReadyObject_Loaded",
					clientType: "noninteractive/summarizer",
				},
				{
					eventName: "fluid:telemetry:FluidDataStoreContext:GC_Deleted_DataStore_Changed",
					clientType: "noninteractive/summarizer",
				},
			],
			async () => {
				const { summarizerDataObject, summarizer } =
					await summarizationWithUnreferencedDataStoreAfterTime(sweepTimeoutMs);

				// The datastore should be swept now
				await summarize(summarizer);

				await provider.ensureSynchronized();

				// Sending an op from a datastore substantiated from the request pattern should fail!
				assert.throws(
					() => summarizerDataObject._root.set("send", "op"),
					(error: IErrorBase) => {
						const correctErrorType = error.errorType === "dataCorruptionError";
						const correctErrorMessage =
							error.message?.startsWith(`Context is deleted`) === true;
						return correctErrorType && correctErrorMessage;
					},
					`Should not be able to send ops for a swept datastore.`,
				);
			},
		);

		itExpects(
			"Send signals fails for swept datastores in summarizing container loaded before sweep timeout",
			[
				{
					eventName: "fluid:telemetry:Summarizer:Running:SweepReadyObject_Loaded",
					clientType: "noninteractive/summarizer",
				},
				{
					eventName: "fluid:telemetry:FluidDataStoreContext:GC_Deleted_DataStore_Changed",
					clientType: "noninteractive/summarizer",
				},
			],
			async () => {
				const { summarizerDataObject, summarizer } =
					await summarizationWithUnreferencedDataStoreAfterTime(sweepTimeoutMs);

				// The datastore should be swept now
				await summarize(summarizer);

				// Sending a signal from a testDataObject substantiated from the request pattern should fail!
				assert.throws(
					() => summarizerDataObject._runtime.submitSignal("send", "signal"),
					(error: IErrorBase) => {
						const correctErrorType = error.errorType === "dataCorruptionError";
						const correctErrorMessage =
							error.message?.startsWith(`Context is deleted`) === true;
						return correctErrorType && correctErrorMessage;
					},
					`Should not be able to send signals for a swept datastore.`,
				);
			},
		);
	});

	describe("Loading swept data stores not allowed", () => {
		// TODO: Receive ops scenarios - loaded before and loaded after (are these just context loading errors?)
		itExpects(
			"Requesting swept datastores fails in client loaded after sweep timeout and summarizing container",
			[
				{
					eventName: "fluid:telemetry:Summarizer:Running:SweepReadyObject_Loaded",
					clientType: "noninteractive/summarizer",
				},
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_Deleted_DataStore_Requested",
					clientType: "interactive",
				},
				// Summarizer client's request
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_Deleted_DataStore_Requested",
					clientType: "noninteractive/summarizer",
				},
			],
			async () => {
				const { unreferencedId, summarizer } =
					await summarizationWithUnreferencedDataStoreAfterTime(sweepTimeoutMs);
				await sendOpToUpdateSummaryTimestampToNow(summarizer);

				// The datastore should be swept now
				const { summaryVersion } = await summarize(summarizer);
				const container = await loadContainer(summaryVersion);

				// This request fails since the datastore is swept
				const entryPoint = (await container.getEntryPoint()) as ITestDataObject;
				const errorResponse = await (
					entryPoint._context.containerRuntime as any
				).resolveHandle({
					url: unreferencedId,
				});
				assert.equal(
					errorResponse.status,
					404,
					"Should not be able to retrieve a swept datastore loading from a non-summarizer client",
				);
				assert.equal(
					errorResponse.value,
					`DataStore was deleted: ${unreferencedId}`,
					"Expected the Sweep error message",
				);
				assert.equal(
					errorResponse.headers?.[TombstoneResponseHeaderKey],
					undefined,
					"DID NOT Expect tombstone header to be set on the response",
				);

				// This request fails since the datastore is swept
				const summarizerResponse = await (summarizer as any).runtime.resolveHandle({
					url: unreferencedId,
				});
				assert.equal(
					summarizerResponse.status,
					404,
					"Should not be able to retrieve a swept datastore from a summarizer client",
				);
				assert.equal(
					summarizerResponse.value,
					`DataStore was deleted: ${unreferencedId}`,
					"Expected the Sweep error message",
				);
				assert.equal(
					summarizerResponse.headers?.[TombstoneResponseHeaderKey],
					undefined,
					"DID NOT Expect tombstone header to be set on the response",
				);
			},
		);

		itExpects(
			"Receiving ops for swept datastores fails in client after sweep timeout and summarizing container",
			[
				{
					eventName: "fluid:telemetry:Summarizer:Running:SweepReadyObject_Loaded",
					clientType: "noninteractive/summarizer",
				},
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_Deleted_DataStore_Requested",
					clientType: "noninteractive/summarizer",
				},
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_Deleted_DataStore_Requested",
					clientType: "interactive",
				},
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_Deleted_DataStore_Requested",
					clientType: "interactive",
				},
				{
					eventName: "fluid:telemetry:Container:ContainerClose",
					clientType: "noninteractive/summarizer",
				},
				{
					eventName: "fluid:telemetry:Container:ContainerClose",
					clientType: "interactive",
				},
				{
					eventName: "fluid:telemetry:Container:ContainerClose",
					clientType: "interactive",
				},
			],
			async () => {
				const {
					unreferencedId,
					summarizingContainer,
					summarizer,
					summaryVersion: unreferencedSummaryVersion,
				} = await summarizationWithUnreferencedDataStoreAfterTime(sweepTimeoutMs);
				await sendOpToUpdateSummaryTimestampToNow(summarizer);
				const sendingContainer = await loadContainer(unreferencedSummaryVersion);
				const entryPoint = (await sendingContainer.getEntryPoint()) as ITestDataObject;
				const containerRuntime = entryPoint._context.containerRuntime as ContainerRuntime;
				const response = await containerRuntime.resolveHandle({
					url: unreferencedId,
				});
				const dataObject = response.value as ITestDataObject;

				// Pause incoming messages on the container that will send the op for deleted data stores.
				// Not doing this will cause the submit to fail since it will delete the data store on receiving GC op.
				await provider.opProcessingController.processIncoming(sendingContainer);

				// The datastore should be swept now
				const { summaryVersion } = await summarize(summarizer);
				const receivingContainer = await loadContainer(summaryVersion);

				const closePromise = getContainersClosePromise([
					sendingContainer,
					summarizingContainer,
					receivingContainer,
				]);

				// Send an op to the swept data store
				dataObject._root.set("send", "op");

				// After sending the op, resume processing so it processes the GC and above op.
				provider.opProcessingController.resumeProcessing(sendingContainer);

				// Wait for the GC and the above op to be processed which will close all the containers.
				await provider.ensureSynchronized();
				await closePromise;

				// The containers should close
				assert(
					sendingContainer.closed,
					"Sending container with deleted datastore should close on receiving an op for it",
				);
				assert(
					summarizingContainer.closed,
					"Summarizing container with deleted datastore should close on receiving an op for it",
				);
				assert(
					receivingContainer.closed,
					"Container with deleted datastore should close on receiving an op for it",
				);
			},
		);

		itExpects(
			"Receiving signals for swept datastores fails in client after sweep timeout and summarizing container",
			[
				{
					eventName: "fluid:telemetry:Summarizer:Running:SweepReadyObject_Loaded",
					clientType: "noninteractive/summarizer",
				},
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_Deleted_DataStore_Requested",
					clientType: "noninteractive/summarizer",
				},
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_Deleted_DataStore_Requested",
					clientType: "interactive",
				},
				{
					eventName: "fluid:telemetry:Container:ContainerClose",
					clientType: "noninteractive/summarizer",
				},
				{
					eventName: "fluid:telemetry:Container:ContainerClose",
					clientType: "interactive",
				},
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_Deleted_DataStore_Requested",
					clientType: "interactive",
				},
				{
					eventName: "fluid:telemetry:Container:ContainerClose",
					clientType: "interactive",
				},
			],
			async () => {
				const {
					unreferencedId,
					summarizingContainer,
					summarizer,
					summaryVersion: unreferencedSummaryVersion,
				} = await summarizationWithUnreferencedDataStoreAfterTime(sweepTimeoutMs);
				await sendOpToUpdateSummaryTimestampToNow(summarizer);
				const sendingContainer = await loadContainer(unreferencedSummaryVersion);
				const sendingDataObject =
					(await sendingContainer.getEntryPoint()) as ITestDataObject;
				const containerRuntime = sendingDataObject._context
					.containerRuntime as ContainerRuntime;
				const response = await containerRuntime.resolveHandle({
					url: unreferencedId,
				});
				const dataObject = response.value as ITestDataObject;

				// Pause incoming messages on the container that will send the op for deleted data stores.
				// Not doing this will cause the submit to fail since it will delete the data store on receiving GC op.
				// Also pause the inbound signals queue so that it is not processed before the GC op.
				await provider.opProcessingController.pauseProcessing(sendingContainer);
				await sendingContainer.deltaManager.inboundSignal.pause();

				// The datastore should be swept now
				const { summaryVersion } = await summarize(summarizer);
				const receivingContainer = await loadContainer(summaryVersion);

				const closePromise = getContainersClosePromise([
					sendingContainer,
					summarizingContainer,
					receivingContainer,
				]);

				// Send a signal to the swept data store
				dataObject._runtime.submitSignal("a", "signal");

				// Resume incoming message processing so that the delete op is processed by the sending container.
				provider.opProcessingController.resumeProcessing(sendingContainer);
				await provider.ensureSynchronized();

				// Once the GC op has been processed, resume the inbound signal queue so that the signal is processed.
				sendingContainer.deltaManager.inboundSignal.resume();

				// All the containers should have closed now.
				await closePromise;

				// The containers should close
				assert(
					sendingContainer.closed,
					"Sending container with deleted datastore should close on receiving an op for it",
				);
				assert(
					summarizingContainer.closed,
					"Summarizing container with deleted datastore should close on receiving a signal for it",
				);
				assert(
					receivingContainer.closed,
					"Container with deleted datastore should close on receiving a signal for it",
				);
			},
		);
	});

	describe("Deleted data stores in summary", () => {
		/**
		 * Validates that the given data store state is correct in the summary.
		 * e.g. if expectDelete is true::
		 * - It should be deleted from the data store summary tree.
		 * - It should not be present in the GC state in GC summary tree.
		 * - It should be present in the deleted nodes in GC summary tree.
		 *
		 * And the opposite results if false.
		 */
		function validateDataStoreStateInSummary(
			summaryTree: ISummaryTree,
			dataStoreNodePath: string,
			expectDelete: boolean = true,
		) {
			const shouldShouldNot = expectDelete ? "should" : "should not";

			// Check if the data store is deleted from the data store summary tree or not.
			const deletedDataStoreId = dataStoreNodePath.split("/")[1];
			const channelsTree = (summaryTree.tree[channelsTreeName] as ISummaryTree).tree;
			assert.notEqual(
				Object.keys(channelsTree).includes(deletedDataStoreId),
				expectDelete,
				`Data store ${deletedDataStoreId} ${shouldShouldNot} have been deleted from the summary`,
			);

			// Validate that the GC state does not contain an entry for the deleted data store.
			const gcState = getGCStateFromSummary(summaryTree);
			assert(gcState !== undefined, "GC tree is not available in the summary");
			assert.notEqual(
				Object.keys(gcState.gcNodes).includes(dataStoreNodePath),
				expectDelete,
				`Data store ${dataStoreNodePath} ${shouldShouldNot} have been removed from GC state`,
			);

			// Validate that the deleted nodes in the GC data has the deleted data store.
			const deletedNodesState = getGCDeletedStateFromSummary(summaryTree);
			assert.equal(
				deletedNodesState?.includes(dataStoreNodePath) ?? false,
				expectDelete,
				`Data store ${dataStoreNodePath} ${shouldShouldNot} be in deleted nodes`,
			);
		}

		itExpects(
			"updates deleted data store state in the summary",
			[
				{
					eventName: "fluid:telemetry:Summarizer:Running:SweepReadyObject_Loaded",
					clientType: "noninteractive/summarizer",
				},
			],
			async () => {
				const { unreferencedId, summarizer } =
					await summarizationWithUnreferencedDataStoreAfterTime(sweepTimeoutMs);
				const sweepReadyDataStoreNodePath = `/${unreferencedId}`;
				await sendOpToUpdateSummaryTimestampToNow(summarizer);

				// Summarize. In this summary, the gc op will be sent with the deleted data store id. The data store
				// will be removed in the subsequent summary.
				await summarizeNow(summarizer);

				// Summarize again so that the sweep ready blobs are now deleted from the GC data.
				const summary3 = await summarizeNow(summarizer);

				// Validate that the deleted data store's state is correct in the summary.
				validateDataStoreStateInSummary(summary3.summaryTree, sweepReadyDataStoreNodePath);
			},
		);

		itExpects(
			"disableDatastoreSweep true - DOES NOT update deleted data store state in the summary",
			[
				{
					// Since we do full tree summary, everything is loaded including the sweepReady node
					eventName: "fluid:telemetry:Summarizer:Running:SweepReadyObject_Loaded",
					clientType: "noninteractive/summarizer",
				},
			],
			async () => {
				settings["Fluid.GarbageCollection.DisableDataStoreSweep"] = true;

				const { unreferencedId, summarizer } =
					await summarizationWithUnreferencedDataStoreAfterTime(sweepTimeoutMs);
				const sweepReadyDataStoreNodePath = `/${unreferencedId}`;
				await sendOpToUpdateSummaryTimestampToNow(summarizer);

				// Summarize. If sweep was enabled, the gc op will be sent with the deleted data store id. The data store
				// will be removed in the subsequent summary.
				await summarizeNow(summarizer);

				// The datastore should NOT be swept here. If sweep was enabled, it would be deleted in this summary.
				// We need to do fullTree because the GC data won't change (since it's not swept).
				// But the validation depends on the GC subtree being present (not a handle).
				const summary3 = await summarize(summarizer, {
					reason: "end-to-end test",
					fullTree: true,
				});

				// Validate that the data store's state is correct in the summary - it shouldn't have been deleted.
				validateDataStoreStateInSummary(
					summary3.summaryTree,
					sweepReadyDataStoreNodePath,
					false /* expectDelete */,
				);
			},
		);
	});

	describe("Sweep with ValidateSummaryBeforeUpload enabled", () => {
		beforeEach(() => {
			settings["Fluid.Summarizer.ValidateSummaryBeforeUpload"] = true;
		});

		itExpects(
			"can run sweep without failing summaries due to local changes",
			[
				{
					eventName: "fluid:telemetry:Summarizer:Running:SweepReadyObject_Loaded",
					clientType: "noninteractive/summarizer",
				},
			],
			async () => {
				const { summarizer } =
					await summarizationWithUnreferencedDataStoreAfterTime(sweepTimeoutMs);
				await sendOpToUpdateSummaryTimestampToNow(summarizer);

				// Summarize. In this summary, the gc op will be sent with the deleted data store id. Validate that
				// the GC op does not fail summary due to local changes.
				await assert.doesNotReject(
					async () => summarizeNow(summarizer),
					"Summary and GC should succeed in presence of GC op",
				);

				// Summarize again so that the sweep ready blobs are now deleted from the GC data. Validate that
				// summarize and GC succeed.
				await assert.doesNotReject(
					async () => summarizeNow(summarizer),
					"Summary and GC should succeed with deleted data store",
				);
			},
		);
	});
});
