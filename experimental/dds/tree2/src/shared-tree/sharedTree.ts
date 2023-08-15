/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IChannelAttributes,
	IChannelFactory,
	IChannelServices,
	IChannelStorageService,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { ISharedObject } from "@fluidframework/shared-object-base";
import { ICodecOptions, noopValidator } from "../codec";
import {
	InMemoryStoredSchemaRepository,
	Anchor,
	AnchorSet,
	AnchorNode,
	AnchorSetRootEvents,
	StoredSchemaRepository,
	IForestSubscription,
} from "../core";
import { SharedTreeBranch, SharedTreeCore } from "../shared-tree-core";
import {
	defaultSchemaPolicy,
	EditableTreeContext,
	ForestSummarizer,
	SchemaSummarizer as SchemaSummarizer,
	DefaultChangeFamily,
	DefaultEditBuilder,
	UnwrappedEditableField,
	DefaultChangeset,
	buildForest,
	ForestRepairDataStoreProvider,
	SchemaEditor,
	NodeKeyIndex,
	createNodeKeyManager,
	NewFieldContent,
	ModularChangeset,
	nodeKeyFieldKey,
	FieldSchema,
} from "../feature-libraries";
import { HasListeners, IEmitter, ISubscribable, createEmitter } from "../events";
import { JsonCompatibleReadOnly, brand } from "../util";
import { SchematizeConfiguration } from "./schematizedTree";
import {
	ISharedTreeView,
	SharedTreeView,
	ViewEvents,
	createSharedTreeView,
} from "./sharedTreeView";

/**
 * Collaboratively editable tree distributed data-structure,
 * powered by {@link @fluidframework/shared-object-base#ISharedObject}.
 *
 * See [the README](../../README.md) for details.
 * @alpha
 */
export interface ISharedTree<TRootSchema extends FieldSchema = FieldSchema>
	extends ISharedObject,
		ISharedTreeView<TRootSchema> {}

/**
 * Shared tree, configured with a good set of indexes and field kinds which will maintain compatibility over time.
 *
 * TODO: detail compatibility requirements.
 */
export class SharedTree<TRootSchema extends FieldSchema>
	extends SharedTreeCore<DefaultEditBuilder, DefaultChangeset>
	implements ISharedTree<TRootSchema>
{
	private readonly _events: ISubscribable<ViewEvents> &
		IEmitter<ViewEvents> &
		HasListeners<ViewEvents>;
	private readonly view: ISharedTreeView<TRootSchema>;
	private readonly schema: SchemaEditor<InMemoryStoredSchemaRepository>;
	private readonly nodeKeyIndex: NodeKeyIndex;

	public constructor(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
		optionsParam: SharedTreeOptions<TRootSchema>,
		telemetryContextPrefix: string,
	) {
		const options = { jsonValidator: noopValidator, ...optionsParam };
		const schema = new InMemoryStoredSchemaRepository(defaultSchemaPolicy);
		const forest = buildForest(schema, new AnchorSet());
		const schemaSummarizer = new SchemaSummarizer(runtime, schema, options);
		const forestSummarizer = new ForestSummarizer(forest);
		const changeFamily = new DefaultChangeFamily(options);
		const repairProvider = new ForestRepairDataStoreProvider(
			forest,
			schema,
			(change: ModularChangeset) => changeFamily.intoDelta(change),
		);
		super(
			[schemaSummarizer, forestSummarizer],
			changeFamily,
			forest.anchors,
			repairProvider,
			options,
			id,
			runtime,
			attributes,
			telemetryContextPrefix,
		);
		this.schema = new SchemaEditor(schema, (op) => this.submitLocalMessage(op), options);
		this.nodeKeyIndex = new NodeKeyIndex(brand(nodeKeyFieldKey));
		this._events = createEmitter<ViewEvents>();
		this.view = createSharedTreeView(optionsParam.schema, {
			branch: this.getLocalBranch(),
			schema,
			forest,
			repairProvider,
			nodeKeyManager: createNodeKeyManager(this.runtime.idCompressor),
			nodeKeyIndex: this.nodeKeyIndex,
			events: this._events,
		});
	}

	public get events(): ISubscribable<ViewEvents> {
		return this._events;
	}

	public get rootEvents(): ISubscribable<AnchorSetRootEvents> {
		return this.view.rootEvents;
	}

	public get storedSchema(): StoredSchemaRepository {
		return this.schema;
	}

	public get forest(): IForestSubscription {
		return this.view.forest;
	}

	public get root(): UnwrappedEditableField {
		return this.view.root;
	}

	public setContent(data: NewFieldContent): void {
		this.view.setContent(data);
	}

	public get context(): EditableTreeContext {
		return this.view.context;
	}

	public locate(anchor: Anchor): AnchorNode | undefined {
		return this.view.locate(anchor);
	}

	public get transaction(): SharedTreeView<TRootSchema>["transaction"] {
		return this.view.transaction;
	}

	public get nodeKey(): SharedTreeView<TRootSchema>["nodeKey"] {
		return this.view.nodeKey;
	}

	public fork(): SharedTreeView<TRootSchema> {
		return this.view.fork();
	}

	public merge(view: SharedTreeView<TRootSchema>): void;
	public merge(view: SharedTreeView<TRootSchema>, disposeView: boolean): void;
	public merge(view: SharedTreeView<TRootSchema>, disposeView = true): void {
		this.view.merge(view, disposeView);
	}

	public rebase(fork: SharedTreeView<TRootSchema>): void {
		fork.rebaseOnto(this.view);
	}

	public override getLocalBranch(): SharedTreeBranch<DefaultEditBuilder, DefaultChangeset> {
		return super.getLocalBranch();
	}

	/**
	 * TODO: Shared tree needs a pattern for handling non-changeset operations.
	 * Whatever pattern is adopted should probably also handle multiple versions of changeset operations.
	 * A single top level enum listing all ops (including their different versions),
	 * with at least fine grained enough detail to direct them to the correct subsystem would be a good approach.
	 * The current use-case (with an op applying to a specific index) is a temporary hack,
	 * and its not clear how it would fit into such a system if implemented in shared-tree-core:
	 * maybe op dispatch is part of the shared-tree level?
	 */
	protected override processCore(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	) {
		if (!this.schema.tryHandleOp(message)) {
			super.processCore(message, local, localOpMetadata);
		}
	}

	protected override reSubmitCore(
		content: JsonCompatibleReadOnly,
		localOpMetadata: unknown,
	): void {
		if (!this.schema.tryResubmitOp(content)) {
			super.reSubmitCore(content, localOpMetadata);
		}
	}

	protected override async loadCore(services: IChannelStorageService): Promise<void> {
		await super.loadCore(services);
		// The identifier index must be populated after both the schema and forest have loaded.
		// TODO: Create an ISummarizer for the identifier index and ensure it loads after the other indexes.
		this.nodeKeyIndex.scanKeys(this.context);
		this._events.emit("afterBatch");
	}
}

/**
 * @alpha
 */
export interface SharedTreeOptions<TRootSchema extends FieldSchema> extends Partial<ICodecOptions> {
	schema: SchematizeConfiguration<TRootSchema>;
}

/**
 * A channel factory that creates {@link ISharedTree}s.
 * @alpha
 */
// TODO: build schematize into this, making it generic
export class SharedTreeFactory<TRootSchema extends FieldSchema> implements IChannelFactory {
	public type: string = "SharedTree";

	public attributes: IChannelAttributes = {
		type: this.type,
		snapshotFormatVersion: "0.0.0",
		packageVersion: "0.0.0",
	};

	public constructor(private readonly options: SharedTreeOptions<TRootSchema>) {}

	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		channelAttributes: Readonly<IChannelAttributes>,
	): Promise<ISharedTree<TRootSchema>> {
		const tree = new SharedTree(id, runtime, channelAttributes, this.options, "SharedTree");
		await tree.load(services);
		// TODO: support ephemeral error states or wait for load to finish (via waitContainerToCatchUp) incase there are schema impacting trailing ops.
		// TODO: maybe disable initial tree updating on this code-path?
		tree.schematize(this.options.schema);
		return tree;
	}

	public create(runtime: IFluidDataStoreRuntime, id: string): ISharedTree<TRootSchema> {
		const tree = new SharedTree(id, runtime, this.attributes, this.options, "SharedTree");
		tree.initializeLocal();
		tree.schematize(this.options.schema);
		return tree;
	}
}
