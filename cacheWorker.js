let size = 0;
let cacheHandle;


self.onmessage = async (e) => {
    if (e.data instanceof ArrayBuffer) {
        cacheHandle.write(e.data, { at: size });
        cacheHandle.flush();
        size = cacheHandle.getSize();
    }
    else if (e.data instanceof Object) {
        if (e.data.instruction === "initialize") {
            const opfsRoot = await navigator.storage.getDirectory();
            const fileHandle = await opfsRoot.getFileHandle("cache", { create: true });
            cacheHandle = await fileHandle.createSyncAccessHandle();
            cacheHandle.truncate(0);
            cacheHandle.flush();
        }
        else if (e.data.instruction === "read") {
            let dataView = new DataView(new ArrayBuffer(size));
            cacheHandle.read(dataView, { at: 0 });
            let blob = new Blob([dataView]);
            postMessage(blob);
        }
        else if (e.data.instruction === "clear") {
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
