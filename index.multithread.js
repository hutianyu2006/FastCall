document.addEventListener('DOMContentLoaded', async function () {
    //Check the avability of APIs used
    if (!window.RTCPeerConnection || !window.RTCDataChannel || !window.RTCIceCandidate || !window.RTCSessionDescription || !window.EventSource || !window.Worker) {
        alert("您的浏览器不支持急电，请使用最新的浏览器。");
        return;
    }

    /**
     * The endpoint URL for API requests.
     * @type {string}
     */
    let endpoint = "https://p2p.i-am-cjc.tech/api";

    /**
     * Fetches credentials from the API endpoint.
     * @returns {Promise<Object>} The credentials object.
     */
    let credentials = await fetch(endpoint + "/getCredentials", { credentials: "include" }).then(res => res.json());

    /**
 * The name of the file being transferred.
 * @type {string}
 */
    let filename = "";

    /**
     * The type of data being transferred (text or file).
     * @type {string}
     */
    let dataType = "";

    /**
     * The size of the file being transferred in bytes.
     * @type {number}
     */
    let fileSize = 0;

    /**
     * The number of packets received.
     * @type {number}
     */
    let packetsGet = 0;

    /**
     * The last recorded transfer speed in bytes per second.
     * @type {number}
     */
    let lastSpeed = 0;

    /**
     * The number of bytes sent.
     * @type {number}
     */
    let bytesSent = 0;

    /**
     * Threads ended
     * @type {number}
     */
    let threadsEnded = 0;

    /**
     * The size of each chunk of data being transferred in bytes.
     * @type {number}
     */
    let chunkSize = 0;

    /**
     * The interval for updating the transfer speed.
     * @type {number}
     */
    let interval;

    /**
     * Secret key for identifying the connection.
     * @type {string}
     */
    let connectionSecret;

    /**
     * The number of data channels currently open.
     * @type {number}
     */

    let dataChannelsOpen = 0;

    /**
     * The cache worker for handling caching operations.
     * @type {Worker}
     */
    const cacheWorker = new Worker("cacheWorker.multithread.js");

    /**
     * Removes the loading page and shows the connection page.
     */
    document.getElementById("loadingPage").remove();
    document.getElementById("connectionPage").classList.remove("hidden");

    /**
     * Establishes a server-sent event (SSE) connection with the specified endpoint.
     * @param {string} endpoint - The URL of the SSE endpoint.
     * @returns {EventSource} The SSE connection object.
     */
    const evtSrc = new EventSource(endpoint + "/sse", { withCredentials: true });

    /**
     * Sends a signal to the API endpoint.
     * @param {string} data - The data to send.
     * @returns {Promise<Object>} The response object.
     * @throws {Error} If there is an error sending the signal.
     */
    async function sendSignal(data) {
        let response = await fetch(endpoint + "/signal", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: data,
            credentials: "include"
        }).then(res => res.json());
        if (response.status !== "Message broadcasted") {
            throw new Error("Error sending signal");
        }
        else {
            return response;
        }
    }

    /**
     * Adds the connection secret verification to the SDP.
     * @param {RTCSessionDescription} sdp - The SDP object.
     * @param {Number} index - The index of the peer connection.
     * @returns {Promise<RTCSessionDescription>} The modified SDP object with connection secret verification.
     */
    async function addSDPverification(sdp,index = null) {
        sdp.sdp += "\r\na=connection-secret:" + connectionSecret;
        if (index !== null) {
            sdp.sdp += "\r\na=index:" + index;
        }
        return sdp;
    }

    /**
     * Removes the connection secret verification from the SDP.
     * @param {RTCSessionDescription} sdp - The SDP object.
     * @param {Number} index - The index of the peer connection.
     * @returns {Promise<RTCSessionDescription>} The modified SDP object without connection secret verification.
     */
    async function removeSDPverification(sdp,index = null) {
        sdp.sdp = sdp.sdp.replace("\r\na=connection-secret:" + connectionSecret, "");
        if (index !== null) {
            sdp.sdp = sdp.sdp.replace("\r\na=index:" + index, "");
        }
        return sdp;
    }

    /**
     * Changes the progress of the transfer.
     * @param {string} percent - The percentage of progress.
     * @returns {Promise<void>} A promise that resolves when the progress is changed.
     */
    async function changeProgress(percent) {
        document.getElementById("progress").innerText = percent;
        document.getElementById("progressBar").style.width = percent;
    }

    /**
     * The ICE servers for establishing a WebRTC connection.
     * @type {Array<Object>}
     */
    const iceServers = [
        {
            urls: "stun:stun.l.google.com:19302"
        },
        {
            urls: "stun:stun.nexcloud.com:3478"
        },
        credentials.iceServers
    ]

    /**
     * Creates a new RTCPeerConnection with the specified ICE servers and creates a data channel.
     * @param {Array<Object>} iceServers - The ICE servers for establishing a WebRTC connection.
     * @returns {Array<RTCPeerConnection>} The newly created RTCPeerConnection object.
     */
    let peerConnections = Array.from({ length: 8 }, () => new RTCPeerConnection({ iceServers }));

    /**
     * Creates a new data channel with the specified label.
     * @param {string} label - The label for the data channel.
     * @returns {Array<RTCDataChannel>} The newly created RTCDataChannel object.
     */
    let dataChannels = peerConnections.map(peerConnection => peerConnection.createDataChannel("data"));

    
    dataChannels.forEach(dataChannel => {
        /**
     * Event handler for when the data channel is successfully opened.
     * Updates the connection status and displays the transfer page.
     * Retrieves the chunk size and candidate pair information.
     * @returns {Promise<void>} A promise that resolves when the handler is complete.
     */
        dataChannel.onopen = async function () {
            dataChannelsOpen++;
            if (dataChannelsOpen === 8) {
                document.getElementById("connectionStatus").innerText = "连接成功";
                document.getElementById("connectionPage").classList.add("hidden")
                document.getElementById("transferPage").classList.remove("hidden");
                chunkSize = peerConnection.sctp.maxMessageSize / 2;
            }
        }
        /**
     * Event handler for when the data channel is closed.
     * Reloads the page to establish a new connection.
     */
        dataChannel.onclose = () => {
            location.reload();
        };
    })

    /**
     * Event handler for when the connection secret input value changes.
     * Updates the connection secret variable.
     * @param {Event} event - The event object.
     * @returns {void}
     */
    document.getElementById("connectionSecret").onchange = (event) => {
        connectionSecret = event.target.value;
    };

    /**
     * Event handler for when an ICE candidate is generated.
     * Sends the ICE candidate to the signaling server.
     * @param {RTCPeerConnectionIceEvent} event - The ICE candidate event.
     * @returns {Promise<void>} A promise that resolves when the ICE candidate is sent.
     */
    peerConnections.forEach(peerConnection => {
        peerConnection.onicecandidate = async function (event) {
            if (event.candidate) {
                await sendSignal(JSON.stringify({ ice: event.candidate, connectionSecret }));
            }
        }
    });

    /**
     * Event handler for when a message is received from the server.
     * Handles SDP and ICE candidate messages.
     * @param {MessageEvent} event - The message event.
     * @returns {Promise<void>} A promise that resolves when the message is handled.
     */
    evtSrc.onmessage = async function (event) {
        const data = JSON.parse(event.data);
        if (data.sdp) {
            // Verify connection secret
            if (data.sdp.sdp.includes("connection-secret:" + connectionSecret)) {
                // Handle SDP
                if (data.sdp.sdp.includes("index")) {
                    const index = data.sdp.sdp.match(/index:(\d+)/)[1];
                    const peerConnection = peerConnections[index];
                    peerConnection.setRemoteDescription(data.sdp);
                    if (data.sdp.type === "offer") {
                        const answer = await peerConnection.createAnswer();
                        await peerConnection.setLocalDescription(answer);
                        await sendSignal(JSON.stringify({ sdp: await addSDPverification(answer) }));
                    }
                }
            }
            else {
                console.log("Connection secret verification failed");
            }
        }
        else if (data.ice) {
            if (data.connectionSecret === connectionSecret) {
                peerConnections.forEach(peerConnection => {
                    peerConnection.addIceCandidate(data.ice);
                })
            }
        }
    }

    /**
     * Starts the connection process by creating an SDP offer and sending it to the signaling server.
     * @returns {Promise<void>} A promise that resolves when the connection process is started.
     */
    async function startConnection() {
        if (document.getElementById("connectionSecret").value === "") {
            alert("请输入配对密钥")
        }
        else {
            peerConnections.forEach(async (peerConnection, index) => {
                // Create an SDP offer and send to signaling server
                const offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);
                document.getElementById("connectionStatus").innerText = "配对中……";
                await sendSignal(JSON.stringify({ sdp: await addSDPverification(offer,index) }));
            });
        }
    }

    /**
     * Sends a file over the data channel.
     * @async
     * @returns {Promise<void>} A promise that resolves when the file is sent.
     */
    async function sendFile() {
        document.getElementById("statusWindow").classList.remove("hidden");
        let file = document.getElementById("file").files[0];
        const reader = new FileReader();
        reader.on1oad = async function () {
            const data = reader.result;
            document.getElementById("filename").innerText = file.name;
            document.getElementById("statusWindow").classList.remove("hidden");
            const slicesSize = Math.ceil(data.byteLength / 8);
            const slices = Array.from({ length: 8 }, (_, i) => data.slice(i * slicesSize, (i + 1) * slicesSize));
            interval = setInterval(() => {
                document.getElementById("speed").innerText = (lastSpeed / 1024 / 1024).toFixed(2) + "MB/s";
                changeProgress(((bytesSent / fileSize) * 100).toFixed(2) + "%");
                lastSpeed = 0;
            }, 1000);
            let promises = Array.from({ length: 8 }, (_, index) => {
                return new Promise((resolve) => {
                    const dataChannel = dataChannels[index];
                    dataChannel.send(new TextEncoder().encode("ZCZC"));
                    dataChannel.send(new TextEncoder().encode("TYPE=FILE"));
                    dataChannel.send(new TextEncoder().encode("SIZE=" + file.size));
                    dataChannel.send(new TextEncoder().encode("NAME=" + file.name));
                    let offset = 0;
                    await new Promise((resolveOuter) => {
                        dataChannel.bufferedAmountLowThreshold = 1;
                        dataChannel.onbufferedamountlow = async () => {
                            if (offset >= slicesSize) {
                                dataChannel.send(new TextEncoder().encode("NNNN"));
                                resolve();
                            }
                            else {
                                const chunk = slices[index].slice(offset, offset + chunkSize);
                                const compressedChunk = zstd.ZstdSimple.compress(new Uint8Array(chunk));
                                dataChannel.send(compressedChunk.buffer);
                                offset += chunkSize;
                                lastSpeed += chunkSize;
                                bytesSent += chunkSize;

                            }
                        }
                        const chunk = slices[index].slice(offset, offset + chunkSize);
                        const compressedChunk = zstd.ZstdSimple.compress(new Uint8Array(chunk));
                        dataChannel.send(compressedChunk.buffer);
                        offset += chunkSize;
                        lastSpeed += chunkSize;
                        bytesSent += chunkSize;
                        resolveOuter();
                    });
                })
            })
            await Promise.all(promises);
            clearInterval(interval);
            lastSpeed = 0;
            document.getElementById("speed").innerText = "";
            await changeProgress("0%");
            document.getElementById("filename").innerText = "";
            document.getElementById("statusWindow").classList.add("hidden")
            document.getElementById("fileLabel").innerText = "拖拽文件到这里，或点击选择文件";
        }
        reader.readAsArrayBuffer(file);
    }

    peerConnections.forEach((peerConnection, index) => {
        peerConnection.ondatachannel = (event) => {
            event.channel.onmessage = async (e) => {
                const data = Array.prototype.slice.call(new Uint8Array(e.data));
                if (data.toString() == Array.from(new TextEncoder().encode("ZCZC")).toString()) {
                    if (!interval) {
                        interval = setInterval(() => {
                            document.getElementById("speed").innerText = (lastSpeed / 1024 / 1024).toFixed(2) + "MB/s";
                            changeProgress(((bytesSent / fileSize) * 100).toFixed(2) + "%");
                            lastSpeed = 0;
                        }, 1000)
                    }
                }
                else if (data.toString() === Array.from(new TextEncoder().encode("TYPE=TEXT")).toString()) {
                    // Define data type as text
                    dataType = "text";
                } else if (data.toString() === Array.from(new TextEncoder().encode("TYPE=FILE")).toString()) {
                    // Define data type as file
                    dataType = "file";
                } else if (data.toString().includes(Array.from(new TextEncoder().encode("NAME=")).toString())) {
                    // Store Filename
                    filename = new TextDecoder().decode(new Uint8Array(data)).replace("NAME=", "");
                    document.getElementById("filename").innerText = filename;
                }
                else if (data.toString().includes(Array.from(new TextEncoder().encode("SIZE=")).toString())) {
                    // Store File Size
                    fileSize = parseInt(new TextDecoder().decode(new Uint8Array(data)).replace("SIZE=", ""));
                }
                else if (data.toString() === Array.from(new TextEncoder().encode("NNNN"), toString())){
                    threadsEnded++;
                    if (threadsEnded === 8) {
                        cacheWorker.postMessage({ instruction: "read", fileSize });
                        let cacheFile = await new Promise((resolve) => {
                            cacheWorker.onmessage = (e) => {
                                resolve(e.data);
                            }
                        });
                        cacheWorker.postMessage({ instruction: "clear" });
                        if (dataType === "file") {
                            let objURL = URL.createObjectURL(cacheFile);
                            let a = document.createElement('a');
                            a.href = objURL;
                            a.download = filename;
                            a.click();
                        }
                        document.getElementById("speed").innerText = "";
                        await changeProgress("0%");
                        document.getElementById("filename").innerText = "";
                        document.getElementById("statusWindow").classList.add("hidden");
                    }
                }
                else {
                    let decompressedData = zstd.ZstdSimple.decompress(new Uint8Array(data));
                    decompressedData = new Uint8Array(Array.from(decompressedData.buffer).unshift(index));
                    cacheWorker.postMessage(decompressedData.buffer);
                    bytesSent += decompressedData.byteLength;
                    lastSpeed += decompressedData.byteLength;
                }

            }
        }
    })

    /**
     * Event handler for when the start button is clicked.
     * Starts the connection process.
     * @returns {void}
     */
    document.getElementById("startButton").onclick = startConnection;

    /**
     * Event handler for when the send button is clicked.
     * Sends a file over the data channel.
     * @returns {Promise<void>} A promise that resolves when the file is sent.
     */
    document.getElementById("sendButton").onclick = async () => {
        await sendFile();
    }

    /**
     * Event listener for the "beforeunload" event.
     * Closes the data channel and the event source and sets the return value to an empty string.
     * @param {Event} e - The beforeunload event.
     * @returns {void}
     */
    window.addEventListener("beforeunload", (e) => {
        dataChannel.close();
        evtSrc.close();
        e.returnValue = "";
    })

    /**
     * Event listener for the "dragend" event on the transfer page.
     * Prevents the default behavior of the event.
     * @param {Event} e - The dragend event.
     * @returns {void}
     */
    document.getElementById("transferPage").addEventListener("dragend", (e) => {
        e.preventDefault();
    })

    /**
     * Event listener for the "dragover" event on the transfer page.
     * Prevents the default behavior of the event.
     * @param {Event} e - The dragover event.
     * @returns {void}
     */
    document.getElementById("transferPage").addEventListener("dragover", (e) => {
        e.preventDefault();
    })

    /**
     * Event listener for the "drop" event on the transfer page.
     * Prevents the default behavior of the event, sets the selected file, and updates the file label.
     * @param {Event} e - The drop event.
     * @returns {void}
     */
    document.getElementById("transferPage").addEventListener("drop", (e) => {
        e.preventDefault();
        document.getElementById("file").files = e.dataTransfer.files;
        document.getElementById("fileLabel").innerText = document.getElementById("file").files[0].name;
    })

    /**
     * Event listener for the "input" event on the file input element.
     * Updates the file label with the selected file name.
     * @returns {void}
     */
    document.getElementById("file").oninput = () => {
        document.getElementById("fileLabel").innerText = document.getElementById("file").files[0].name;
    }
})
