export const CrownRawEEGMetadata = {
    device: "Neurosity Crown",
    montage: {
        type: "unipolar",
        reference: "TP7",
    },
    ground: "TP8",
    channels: ["CP3", "C3", "F5", "PO3", "PO4", "F6", "C4", "CP4"],
    samplingRate: 256,
};
export const CrownPowerByBandMetadata = {
    device: "Neurosity Crown",
    montage: {
        type: "unipolar",
        reference: "TP7",
    },
    ground: "TP8",
    channels: ["CP3", "C3", "F5", "PO3", "PO4", "F6", "C4", "CP4"],
    prefiltering: [
        {
            bandform: "highpass",
            frequency: 2,
            characteristic: "butterworth",
            order: 2,
        },
        {
            bandform: "lowpass",
            frequency: 45,
            characteristic: "butterworth",
            order: 2,
        },
        {
            bandform: "notch",
            // notch frequency may be 50 depending on location
            frequency: 60,
            characteristic: "butterworth",
            order: 2,
        },
    ],
    frequencyBands: [
        { name: "delta", lowEnd: 1, highEnd: 3 },
        { name: "theta", lowEnd: 4, highEnd: 7 },
        { name: "alpha", lowEnd: 8, highEnd: 12 },
        { name: "beta", lowEnd: 13, highEnd: 30 },
        { name: "gamma", lowEnd: 30, highEnd: 100 },
    ],
};
/**
 * Sugary wrapper to make browser EventTarget more like NodeJS EventEmitter
 */
class EventTargetOnce extends EventTarget {
    once(event, callback) {
        const decoratedCallback = (args) => {
            this.removeEventListener(event, decoratedCallback);
            callback(args.detail);
        };
        this.addEventListener(event, decoratedCallback);
    }
    emit(event, body) {
        this.dispatchEvent(new CustomEvent(event, { detail: body }));
    }
}
export class SessionClient {
    constructor(controllerURL) {
        this.controllerURL = controllerURL;
        this.events = new EventTargetOnce();
        this.ws = new WebSocket(controllerURL);
        this.ws.addEventListener("open", () => this.onOpen());
        this.ws.addEventListener("close", () => this.onClose());
        this.ws.addEventListener("message", (msg) => this.onMessage(msg));
        this.ws.addEventListener("error", (err) => this.onError(err));
        this.keepalive = undefined;
    }
    onOpen() {
        console.log("connected to sessionController");
        // API Gateway terminates ws connections after 10 minutes of inactivity
        // 9 minutes * 60s/min * 1000ms/s = 540000
        this.keepalive = setInterval(() => this.ws.send("ping"), 540000);
        this.events.emit("open");
    }
    onClose() {
        console.log("websocket connection closed");
        clearInterval(this.keepalive);
        this.events.emit("close");
    }
    onMessage(msg) {
        console.log(msg);
        let message = JSON.parse(msg.data);
        this.events.emit(message.action, message.body);
    }
    onError(err) {
        console.error(err);
    }
    async untilConnected() {
        return new Promise((resolve, reject) => {
            switch (this.ws.readyState) {
                case this.ws.CONNECTING:
                    this.events.once("open", resolve);
                    this.events.once("close", reject);
                    break;
                case this.ws.OPEN:
                    resolve();
                    break;
                case this.ws.CLOSING:
                case this.ws.CLOSED:
                default:
                    reject();
                    break;
            }
        });
    }
    async joinSession(clientId, subscribeSignals = [], isRequiredConnection = false) {
        const joinSessionMessage = {
            action: "joinSession",
            clientId,
            subscribeSignals,
            isRequiredConnection,
        };
        this.ws.send(JSON.stringify(joinSessionMessage));
        return new Promise((resolve, reject) => {
            this.events.once("joinSession-ack", resolve);
            this.events.once("joinSession-nack", reject);
        });
    }
    async startSessionComponent(sessionComponentId, clientId, clientAge, clientSex, rawEEG, powerByBand, neurofeedback) {
        const sessionComponentMetadata = {
            sessionComponentId,
            clientId,
            clientAge,
            clientSex,
            signals: {
                rawEEG,
                powerByBand,
                neurofeedback,
            },
        };
        const startSessionComponentMessage = {
            action: "startSessionComponent",
            ...sessionComponentMetadata,
        };
        this.ws.send(JSON.stringify(startSessionComponentMessage));
        return new Promise((resolve, reject) => {
            this.events.once("startSessionComponent-ack", resolve);
            this.events.once("startSessionComponent-nack", reject);
        });
    }
    async stopSessionComponent(sessionComponentId, clientId) {
        const stopSessionComponentMessage = {
            action: "stopSessionComponent",
            sessionComponentId,
            clientId,
        };
        this.ws.send(JSON.stringify(stopSessionComponentMessage));
        return new Promise((resolve, reject) => {
            this.events.once("stopSessionComponent-ack", resolve);
            this.events.once("stopSessionComponent-nack", reject);
        });
    }
    async setThreshold(sessionComponentId, clientId, threshold) {
        const setThresholdMessage = {
            action: "setThreshold",
            sessionComponentId,
            clientId,
            threshold,
        };
        this.ws.send(JSON.stringify(setThresholdMessage));
        return new Promise((resolve, reject) => {
            this.events.once("setThreshold-ack", resolve);
            this.events.once("setThreshold-nack", reject);
        });
    }
    async forwardSignal(clientId, sessionComponentId, signalName, signalPacket) {
        const signalPacketMessage = {
            action: "sendSignal",
            clientId,
            sessionComponentId,
            signalName,
            signalPacket,
        };
        this.ws.send(JSON.stringify(signalPacketMessage));
    }
}
