document.addEventListener('DOMContentLoaded', async function () {
    let endpoint = "https://p2p.i-am-cjc.tech/api";
    let credentials = await fetch(endpoint + "/getCredentials", {credentials : "include"}).then(res => res.json());
    document.getElementById("loadingPage").remove();
    document.getElementById("connectionPage").classList.remove("hidden");
    const cacheWorker = new Worker("cacheWorker.js");
    
    let filename = "";
    let dataType = "";
    let fileSize = 0;
    let packetsGet = 0;
    let lastSpeed = 0;
    let chunkSize = 0;
    let interval;

    const evtSrc = new EventSource(endpoint + "/sse", { withCredentials: true });

    async function sendSignal(data) {
        let response = await fetch(endpoint+"/signal", {
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

    let connectionSecret;

    async function addSDPverification(sdp) {
        sdp.sdp += "\r\na=connection-secret:" + connectionSecret;
        return sdp;
    }

    async function removeSDPverification(sdp) {
        sdp.sdp = sdp.sdp.replace("\r\na=connection-secret:" + connectionSecret, "");
        return sdp;
    }
    async function changeProgress(percent) {
        document.getElementById("progress").innerText = percent;
        document.getElementById("progressBar").style.width = percent;
    }

    async function sendFile() {
        document.getElementById("statusWindow").classList.remove("hidden");
        let file = document.getElementById("file").files[0];
        const reader = new FileReader();
        reader.onload = async () => {
            let data = reader.result;
            document.getElementById("filename").innerText = file.name;
            dataChannel.send(new TextEncoder().encode("ZCZC"));
            document.getElementById("statusWindow").classList.remove("hidden");
            dataChannel.send(new TextEncoder().encode("TYPE=FILE"));
            dataChannel.send(new TextEncoder().encode("SIZE=" + file.size));
            dataChannel.send(new TextEncoder().encode("NAME=" + file.name));
            let offset = 0;
            interval = setInterval(() => {
                document.getElementById("speed").innerText = (lastSpeed / 1024 / 1024).toFixed(2) + "MB/s";
                lastSpeed = 0;
            }, 1000);
            /*while (offset < data.byteLength) {
                const chunk = data.slice(offset, offset + chunkSize);
                dataChannel.send(chunk);
                offset += chunkSize;
                await new Promise((resolve) => {
                    // Wait for data channel buffer to clear
                    dataChannel.bufferedAmountLowThreshold = chunkSize;
                    dataChannel.onbufferedamountlow = () => {
                        dataChannel.bufferedAmountLowThreshold = 0;
                        resolve();
                    }
                });
                deltaTime = Date.now() - deltaTime;
                lastSpeed += chunkSize;
                await changeProgress((offset / file.size * 100).toFixed(1) + "%");
            }*/
            await new Promise((resolve) => {
                dataChannel.bufferedAmountLowThreshold = peerConnection.sctp.maxMessageSize;
                dataChannel.onbufferedamountlow = () => {
                    if (offset >= data.byteLength) {
                        resolve()
                    }
                    else {
                        const chunk = data.slice(offset, offset + chunkSize);
                        dataChannel.send(chunk);
                        offset += chunkSize;
                        lastSpeed += chunkSize;
                        changeProgress((offset / file.size * 100).toFixed(1) + "%");
                    }
                }
                const chunk = data.slice(offset, offset + chunkSize);
                dataChannel.send(chunk);
                offset += chunkSize;
                lastSpeed += chunkSize;
                changeProgress((offset / file.size * 100).toFixed(1) + "%");
            })
            dataChannel.send(new TextEncoder().encode("NNNN"));
            clearInterval(interval);
            lastSpeed = 0;
            document.getElementById("speed").innerText = "";
            await changeProgress("0%");
            document.getElementById("filename").innerText = "";
            document.getElementById("statusWindow").classList.add("hidden")
            document.getElementById("fileLabel").innerText = "拖拽文件到这里，或点击选择文件";
        };
        reader.readAsArrayBuffer(file);
    }

    
    const iceServers = [
        {
            urls: "stun:stun.l.google.com:19302"
        },
        {
            urls: "stun:stun.nexcloud.com:3478"
        },
        credentials.iceServers
    ]

    let peerConnection = new RTCPeerConnection({ iceServers });
    let dataChannel = peerConnection.createDataChannel("chat");

    dataChannel.onopen = () => {
        document.getElementById("connectionStatus").innerText = "连接成功";
        document.getElementById("connectionPage").classList.add("hidden")
        document.getElementById("transferPage").classList.remove("hidden");
        chunkSize = peerConnection.sctp.maxMessageSize;
    };

    dataChannel.onclose = () => {
        location.reload();
    };

    document.getElementById("connectionSecret").onchange = (event) => {
        connectionSecret = event.target.value;
    };


    peerConnection.onicecandidate = async (event) => {
        if (event.candidate) {
            await sendSignal(JSON.stringify({ ice: event.candidate }));
        }
    };

    // Handle incoming data channel
    peerConnection.ondatachannel = (event) => {
        event.channel.onmessage = async (e) => {
            const data = Array.prototype.slice.call(new Uint8Array(e.data));
            if (data.toString() === Array.from(new TextEncoder().encode("ZCZC")).toString()) {
                // Data write starts
                cacheWorker.postMessage({ instruction: "initialize" });
                lastSpeed = 0;
                interval = setInterval(() => {
                    document.getElementById("speed").innerText = (lastSpeed / 1024 / 1024).toFixed(2) + "MB/s";
                    lastSpeed = 0;
                    }, 1000);
                document.getElementById("statusWindow").classList.remove("hidden");
            } else if (data.toString() === Array.from(new TextEncoder().encode("TYPE=TEXT")).toString()) {
                // Define data type as text
                dataType = "text";
            } else if (data.toString() === Array.from(new TextEncoder().encode("TYPE=FILE")).toString()) {
                // Define data type as file
                dataType = "file";
            } else if (data.toString().includes(Array.from(new TextEncoder().encode("NAME=")).toString())) {
                // Store Filename
                filename = new TextDecoder().decode(new Uint8Array(data)).replace("NAME=", "");
                document.getElementById("filename").innerText = filename;
            } else if (data.toString().includes(Array.from(new TextEncoder().encode("SIZE=")).toString())) {
                // Store File Size
                fileSize = parseInt(new TextDecoder().decode(new Uint8Array(data)).replace("SIZE=", ""));
            } else if (data.toString() === Array.from(new TextEncoder().encode("NNNN")).toString()) {
                // Data write ends
                cacheWorker.postMessage({ instruction: "read" });
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

            } else {
                cacheWorker.postMessage(new Uint8Array(data).buffer);
                packetsGet += 1;
                bytesGet = packetsGet * chunkSize;
                lastSpeed += chunkSize;
                await changeProgress((bytesGet / fileSize * 100).toFixed(1) + "%");
            }
        }
    };


    evtSrc.onmessage = async (event) => {
        const data = JSON.parse(event.data);

        if (data.sdp) {
            //verify connection secret
            if (data.sdp.sdp.includes("connection-secret:" + connectionSecret)) {
                // Handle SDP
                data.sdp = await removeSDPverification(data.sdp);
                document.getElementById("connectionStatus").innerText = "配对成功,建立连接中……";
                await peerConnection.setRemoteDescription(data.sdp);
                if (data.sdp.type === "offer") {
                    document.getElementById("connectionStatus").innerText = "找到配对设备，发送应答……";
                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);
                    await sendSignal(JSON.stringify({ sdp: await addSDPverification(answer) }));
                }
            } else {
                console.log("Connection secret verification failed");
            }
        } else if (data.ice) {
            //To ensure ICE Candidate is set after SDP
            if (peerConnection.remoteDescription) {
                // Handle ICE candidate
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.ice));
            }
        }
    }
    async function startConnection() {
        if (document.getElementById("connectionSecret").value === "") {
            alert("请输入配对密钥")
        }
        else {
            // Create an SDP offer and send to signaling server
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            document.getElementById("connectionStatus").innerText = "配对中……";
            await sendSignal(JSON.stringify({ sdp: await addSDPverification(offer) }));
        }
    }

    document.getElementById("startButton").onclick = startConnection;
    document.getElementById("sendButton").onclick = async () => {
        await sendFile();
    }
    document.addEventListener("close", () => {
        dataChannel.close();
        evtSrc.close();
    })
    window.addEventListener("beforeunload", (e) => {
        dataChannel.close();
        evtSrc.close();
        e.returnValue = "";
    })
    document.getElementById("transferPage").addEventListener("dragend", (e) => {
        e.preventDefault();
    })
    document.getElementById("transferPage").addEventListener("dragover", (e) => {
        e.preventDefault();
    })
    document.getElementById("transferPage").addEventListener("drop", (e) => {
        e.preventDefault();
        document.getElementById("file").files = e.dataTransfer.files;
        document.getElementById("fileLabel").innerText = document.getElementById("file").files[0].name;
    })
    document.getElementById("file").oninput = () => {
        document.getElementById("fileLabel").innerText = document.getElementById("file").files[0].name;
    }
})
