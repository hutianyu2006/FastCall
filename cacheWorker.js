
/**
 * The current size of the cache.
 * @type {number}
 */
let size = 0;

/**
 * The handle to the cache.
 * @type {SyncAccessHandle}
 */
let cacheHandle;


self.onmessage = async (e) => {
    if (e.data instanceof ArrayBuffer) {
        // Write the data to the cache.
        cacheHandle.write(e.data, { at: size });
        cacheHandle.flush();
        size = cacheHandle.getSize();
    }
    else if (e.data instanceof Object) {
        // Handle the instruction.
        if (e.data.instruction === "initialize") {
            // Initialize the cache.
            const opfsRoot = await navigator.storage.getDirectory();
            const fileHandle = await opfsRoot.getFileHandle("cache", { create: true });
            cacheHandle = await fileHandle.createSyncAccessHandle();
            cacheHandle.truncate(0);
            cacheHandle.flush();
        }
        else if (e.data.instruction === "read") {
            // Read the data from the cache.
            let dataView = new DataView(new ArrayBuffer(size));
            cacheHandle.read(dataView, { at: 0 });
            let blob = new Blob([dataView]);
            postMessage(blob);
        }
        else if (e.data.instruction === "clear") {
            // Clear the cache.
            cacheHandle.truncate(0);
            cacheHandle.flush();
            size = 0;
            cacheHandle.close();
        }
        else {
            console.error("Invalid data received");
        }
    }
}
