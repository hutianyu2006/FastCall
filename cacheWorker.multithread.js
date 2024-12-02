
/**
 * The current size of the cache.
 * @type {Array<number>}
 */
let sizes = [0,0,0,0,0,0,0,0];

/**
 * The handle to the cache.
 * @type {Array<SyncAccessHandle>}
 */
let cacheHandles = [];


self.onmessage = async (e) => {
    if (e.data instanceof ArrayBuffer) {
        // Write the data to the cache.
        /*cacheHandle.write(e.data, { at: size });
        cacheHandle.flush();
        size = cacheHandle.getSize();*/
        let index = e.data[0];
        let data = e.data.slice(1);
        cacheHandles[index].write(data, { at: sizes[index] });
        cacheHandles[index].flush();
        sizes[index] = cacheHandles
    }
    else if (e.data instanceof Object) {
        // Handle the instruction.
        if (e.data.instruction === "initialize") {
            // Initialize the cache.
            const opfsRoot = await navigator.storage.getDirectory();
            /*const fileHandle = await opfsRoot.getFileHandle("cache", { create: true });
            cacheHandle = await fileHandle.createSyncAccessHandle();
            cacheHandle.truncate(0);
            cacheHandle.flush();*/
            for (let i = 0; i < 8; i++) {
                const fileHandle = await opfsRoot.getFileHandle("cache" + i, { create: true });
                cacheHandles[i] = await fileHandle.createSyncAccessHandle();
                cacheHandles[i].truncate(0);
                cacheHandles[i].flush();
            }
        }
        else if (e.data.instruction === "read") {
            // Read the data from the cache.
            while (cacheHandle.getSize() < e.data.fileSize) { }
            let dataView = new DataView(new ArrayBuffer(size));
            //cacheHandle.read(dataView, { at: 0 });
            let atPos = 0;
            for (let i = 0; i < 8; i++) {
                cacheHandles[i].read(dataView, { at: atPos });
                atPos += sizes[i];
            }
            let blob = new Blob([dataView]);
            postMessage(blob);
        }
        else if (e.data.instruction === "clear") {
            // Clear the cache.
            /*cacheHandle.truncate(0);
            cacheHandle.flush();
            size = 0;
            cacheHandle.close();*/
            for (let i = 0; i < 8; i++) {
                cacheHandles[i].truncate(0);
                cacheHandles[i].flush();
                sizes[i] = 0;
                cacheHandles[i].close();
            }
        }
        else {
            console.error("Invalid data received");
        }
    }
}