import { EventEmitter } from "eventemitter3";
export class SessionClient {
    constructor({ controllerURL, authToken, }) {
        this.controllerURL = controllerURL;
        this.events = new EventEmitter();
        this.ws = new WebSocket(controllerURL, authToken);
        this.ws.addEventListener("open", () => this.onOpen());
        this.ws.addEventListener("close", () => this.onClose());
        this.ws.addEventListener("message", (msg) => this.onMessage(msg));
        this.ws.addEventListener("error", (err) => this.onError(err));
        this.keepalive = undefined;
        this.events.on("signalPacket", (message) => this.onSignal(message));
    }
    onOpen() {
        // API Gateway terminates ws connections after 10 minutes of inactivity
        // 9 minutes * 60s/min * 1000ms/s = 540000
        this.keepalive = setInterval(() => this.ws.send("keepAlive"), 540000);
        this.events.emit("open");
    }
    onClose() {
        clearInterval(this.keepalive);
        this.events.emit("close");
    }
    onMessage(msg) {
        let message = JSON.parse(msg.data);
        this.events.emit(message.action, message.body);
    }
    onError(err) {
        console.error(err);
    }
    onSignal(message) {
        this.events.emit(message.signalType, message.packet);
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
    setSignalHandler({ signalType, handler, }) {
        this.events.on(signalType, handler);
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
    async startSessionComponent({ sessionComponentId, clientId, clientAge, clientSex, sessionComponentName, sessionComponentType, signals = {}, }) {
        const startSessionComponentMessage = {
            action: "startSessionComponent",
            sessionComponentId,
            clientId,
            clientAge,
            clientSex,
            sessionComponentName,
            sessionComponentType,
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
    async sendSignal({ clientId, sessionComponentId, signalType, signalPacket, }) {
        const signalPacketMessage = {
            action: "sendSignal",
            clientId,
            sessionComponentId,
            signalType,
            signalPacket,
        };
        this.ws.send(JSON.stringify(signalPacketMessage));
    }
}
