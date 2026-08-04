import { join } from "node:path";
import type { ModelsStore, ModelsStoreEntry, ModelsStoreOperationOptions } from "@earendil-works/pi-ai";
import { getAgentDir } from "../config.ts";
// modify by cxg, start: 引入 getFileRevision 用于读缓存的文件版本校验
// import { type AuthStorageBackend, FileAuthStorageBackend } from "./auth-storage.ts";
import { type AuthStorageBackend, FileAuthStorageBackend, getFileRevision } from "./auth-storage.ts";

// modify by cxg, end

type StoredModels = Record<string, ModelsStoreEntry>;

export class InMemoryCodingAgentModelsStore implements ModelsStore {
	private readonly entries = new Map<string, ModelsStoreEntry>();

	async read(providerId: string, options?: ModelsStoreOperationOptions): Promise<ModelsStoreEntry | undefined> {
		options?.signal?.throwIfAborted();
		const entry = this.entries.get(providerId);
		return entry ? structuredClone(entry) : undefined;
	}

	async write(providerId: string, entry: ModelsStoreEntry, options?: ModelsStoreOperationOptions): Promise<void> {
		options?.signal?.throwIfAborted();
		this.entries.set(providerId, structuredClone(entry));
	}

	async delete(providerId: string, options?: ModelsStoreOperationOptions): Promise<void> {
		options?.signal?.throwIfAborted();
		this.entries.delete(providerId);
	}
}

/** Locked JSON-backed storage for dynamically refreshed provider catalogs. */
export class FileModelsStore implements ModelsStore {
	private readonly storage: AuthStorageBackend;
	// add by cxg, start: 读缓存状态，避免并发 read 全部走文件锁（启动时 39 个 provider 并发刷新，锁重试指数退避互踩导致秒级延迟）
	private readonly path: string;
	private readState: { data: StoredModels; revision?: string; reload?: Promise<StoredModels> } = { data: {} };
	// add by cxg, end

	constructor(path: string = join(getAgentDir(), "models-store.json")) {
		this.storage = new FileAuthStorageBackend(path);
		// add by cxg, start: 记录路径供 getFileRevision 校验
		this.path = path;
		// add by cxg, end
	}

	private parse(content: string | undefined): StoredModels {
		return content ? (JSON.parse(content) as StoredModels) : {};
	}

	// add by cxg, start: 复用 AuthStorage.readLatestData 的模式：文件 revision 未变直接返回内存快照；变化时单次加锁重读，并发重读共享同一 Promise
	private readLatestData(options?: ModelsStoreOperationOptions): Promise<StoredModels> {
		options?.signal?.throwIfAborted();
		const revision = getFileRevision(this.path);
		if (revision !== undefined && revision === this.readState.revision) {
			return Promise.resolve(this.readState.data);
		}
		if (!this.readState.reload) {
			const reload = this.storage
				.withLockAsync(async (content) => {
					const data = this.parse(content);
					this.readState.data = data;
					this.readState.revision = getFileRevision(this.path);
					return { result: data };
				}, options)
				.catch(() => this.readState.data);
			this.readState.reload = reload;
			void reload.then(() => {
				if (this.readState.reload === reload) this.readState.reload = undefined;
			});
		}
		return this.readState.reload;
	}
	// add by cxg, end

	async read(providerId: string, options?: ModelsStoreOperationOptions): Promise<ModelsStoreEntry | undefined> {
		// modify by cxg, start: 并发读不再各自加锁，改走 revision 缓存，跨进程写入靠 revision 变化感知
		// return this.storage.withLockAsync(
		// 	async (content) => ({ result: structuredClone(this.parse(content)[providerId]) }),
		// 	options,
		// );
		const entry = (await this.readLatestData(options))[providerId];
		options?.signal?.throwIfAborted();
		return entry ? structuredClone(entry) : undefined;
		// modify by cxg, end
	}

	async write(providerId: string, entry: ModelsStoreEntry, options?: ModelsStoreOperationOptions): Promise<void> {
		// add by cxg, start: 写后同步读缓存，避免下次 read 再抢锁
		let latest: StoredModels | undefined;
		// add by cxg, end
		await this.storage.withLockAsync(async (content) => {
			const current = this.parse(content);
			current[providerId] = structuredClone(entry);
			// add by cxg, start: 捕获合并后的数据用于更新读缓存
			latest = current;
			// add by cxg, end
			return { result: undefined, next: JSON.stringify(current, null, 2) };
		}, options);
		// add by cxg, start: 更新读缓存及 revision（此时文件已写完）
		if (latest !== undefined) {
			this.readState.data = latest;
			this.readState.revision = getFileRevision(this.path);
		}
		// add by cxg, end
	}

	async delete(providerId: string, options?: ModelsStoreOperationOptions): Promise<void> {
		// add by cxg, start: 删除后同步读缓存，避免下次 read 再抢锁
		let latest: StoredModels | undefined;
		// add by cxg, end
		await this.storage.withLockAsync(async (content) => {
			const current = this.parse(content);
			delete current[providerId];
			// add by cxg, start: 捕获删除后的数据用于更新读缓存
			latest = current;
			// add by cxg, end
			return { result: undefined, next: JSON.stringify(current, null, 2) };
		}, options);
		// add by cxg, start: 更新读缓存及 revision（此时文件已写完）
		if (latest !== undefined) {
			this.readState.data = latest;
			this.readState.revision = getFileRevision(this.path);
		}
		// add by cxg, end
	}
}
