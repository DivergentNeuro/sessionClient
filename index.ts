import { EventEmitter } from "eventemitter3";

interface SessionControllerMessage {
  action: string;
  body: any;
}

export type SignalType = "rawEEG" | "powerTraining";

export class SessionClient {
  readonly controllerURL: string;
  readonly ws: WebSocket;
  // Changed events type to any because needed named import for mobile, fix this later
  readonly events: any;
  keepalive: number | undefined;

  constructor(controllerURL: string) {
    this.controllerURL = controllerURL;
    this.events = new EventEmitter();
    this.ws = new WebSocket(controllerURL);
    this.ws.addEventListener("open", () => this.onOpen());
    this.ws.addEventListener("close", () => this.onClose());
    this.ws.addEventListener("message", (msg: MessageEvent) =>
      this.onMessage(msg)
    );
    this.ws.addEventListener("error", (err: Event) => this.onError(err));
    this.keepalive = undefined;
    this.events.on("signalPacket", (message: any) => this.onSignal(message));
  }

  private onOpen() {
    console.log("connected to sessionController");
    // API Gateway terminates ws connections after 10 minutes of inactivity
    // 9 minutes * 60s/min * 1000ms/s = 540000
    this.keepalive = setInterval(() => this.ws.send("keepAlive"), 540000);

    this.events.emit("open");
  }

  private onClose() {
    console.log("websocket connection closed");
    clearInterval(this.keepalive);

    this.events.emit("close");
  }

  private onMessage(msg: MessageEvent) {
    console.log(msg);
    let message: SessionControllerMessage = JSON.parse(msg.data);
    this.events.emit(message.action, message.body);
  }

  private onError(err: Event) {
    console.error(err);
  }

  private onSignal(message: any) {
    this.events.emit(message.signalType, message.packet);
  }

  closeConnection() {
    clearInterval(this.keepalive);
    this.ws.close();
  }

  setThresholdHandler({ handler }: { handler: (args: any) => void }) {
    this.events.on("thresholdUpdate", handler);
  }

  setCloseHandler({ handler }: { handler: (args: any) => void }) {
    this.events.on("close", handler);
  }

  setSignalHandler({
    signalType,
    handler,
  }: {
    signalType: SignalType;
    handler: (args: any) => void;
  }) {
    this.events.on(signalType, handler);
  }

  setStateUpdateHandler({ handler }: { handler: (args: any) => void }) {
    this.events.on("stateUpdate", handler);
  }

  async untilConnected(): Promise<void> {
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

  async joinSession({
    clientId,
    subscribeSignals = [],
    isRequiredConnection = false,
  }: {
    clientId: string;
    subscribeSignals: SignalType[];
    isRequiredConnection: boolean;
  }) {
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

  async startSessionComponent({
    sessionComponentId,
    clientId,
    clientAge,
    clientSex,
    sessionComponentName,
    signals = {},
  }: {
    sessionComponentId: string;
    clientId: string;
    clientAge: number;
    clientSex: string;
    sessionComponentName: string;
    signals: {
      rawEEG?: any;
      powerTraining?: any;
    };
  }) {
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

  async stopSessionComponent(sessionComponentId: string, clientId: string) {
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

  async setThreshold({
    sessionComponentId,
    clientId,
    eventId,
    threshold,
  }: {
    sessionComponentId: string;
    clientId: string;
    eventId: string;
    threshold: number;
  }) {
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

  async sendSignal({
    clientId,
    sessionComponentId,
    signalType,
    signalPacket,
  }: {
    clientId: string;
    sessionComponentId: string;
    signalType: SignalType;
    signalPacket: any;
  }) {
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
