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
    on(event, callback) {
        this.addEventListener(event, (args) => callback(args.detail));
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
        this.events.on("signalPacket", (message) => this.onSignal(message));
    }
    onOpen() {
        console.log("connected to sessionController");
        // API Gateway terminates ws connections after 10 minutes of inactivity
        // 9 minutes * 60s/min * 1000ms/s = 540000
        this.keepalive = setInterval(() => this.ws.send("keepAlive"), 540000);
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
    onSignal(message) {
        this.events.emit(message.signalName, message.packet);
    }
    closeConnection() {
        clearInterval(this.keepalive);
        this.ws.close();
    }
    setThresholdHandler({ handler }) {
        this.events.on("thresholdUpdate", handler);
    }
    setCloseHandler({ handler }) {
        this.events.on("close", handler);
    }
    setSignalHandler({ signalName, handler, }) {
        this.events.on(signalName, handler);
    }
    setStateUpdateHandler({ handler }) {
        this.events.on("stateUpdate", handler);
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
    async joinSession({ clientId, subscribeSignals = [], isRequiredConnection = false, }) {
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
    async startSessionComponent({ sessionComponentId, clientId, clientAge, clientSex, sessionComponentName, signals = {}, }) {
        const startSessionComponentMessage = {
            action: "startSessionComponent",
            sessionComponentId,
            clientId,
            clientAge,
            clientSex,
            sessionComponentName,
            signals,
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
    async setThreshold({ sessionComponentId, clientId, eventId, threshold, }) {
        const setThresholdMessage = {
            action: "setThreshold",
            sessionComponentId,
            clientId,
            eventId,
            threshold,
        };
        this.ws.send(JSON.stringify(setThresholdMessage));
        return new Promise((resolve, reject) => {
            this.events.once("setThreshold-ack", resolve);
            this.events.once("setThreshold-nack", reject);
        });
    }
    async sendSignal({ clientId, sessionComponentId, signalName, signalPacket, }) {
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
