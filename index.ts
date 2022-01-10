interface Message {
  action: string;
  body: any;
}

export interface UnipolarMontage {
  type: "unipolar";
  reference: string;
}

export interface RawEEGMetadata {
  device: string;
  montage: UnipolarMontage;
  ground: string;
  prefiltering?: Filter[];
  channels: string[];
  samplingRate: number;
}

export interface PowerByBandMetadata {
  device: string;
  montage: UnipolarMontage;
  ground: string;
  prefiltering?: Filter[];
  channels: string[];
  frequencyBands: FrequencyBand[];
}

export interface NeurofeedbackMetadata {
  modality: "auditory" | "visual" | "audiovisual";
  formula: {
    inputBands: FrequencyBand[];
    equation: string;
  };
}

export interface SessionComponentMetadata {
  sessionComponentId: string;
  clientId: string;
  clientAge: number;
  clientSex: string;
  signals: {
    rawEEG?: RawEEGMetadata;
    powerByBand?: PowerByBandMetadata;
    neurofeedback?: NeurofeedbackMetadata;
  };
  startTime?: number; // written on startSessionComponent by controller
  endtime?: number; // written on endSessionComponent by controller
}

export interface Filter {
  bandform: "highpass" | "lowpass" | "notch";
  frequency: number;
  characteristic: string;
  order: number;
}

export interface FrequencyBand {
  name: string;
  lowEnd: number;
  highEnd: number;
}

export type SignalName = "rawEEG" | "powerByBand" | "neurofeedbackEvents";

export const CrownRawEEGMetadata: RawEEGMetadata = {
  device: "Neurosity Crown",
  montage: {
    type: "unipolar",
    reference: "TP7",
  },
  ground: "TP8",
  channels: ["CP3", "C3", "F5", "PO3", "PO4", "F6", "C4", "CP4"],
  samplingRate: 256,
};

export const CrownPowerByBandMetadata: PowerByBandMetadata = {
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
  once(event: string, callback: (args: any) => void) {
    const decoratedCallback = (args: any) => {
      this.removeEventListener(event, decoratedCallback);
      callback(args.detail);
    };

    this.addEventListener(event, decoratedCallback);
  }

  on(event: string, callback: (args: any) => void) {
    this.addEventListener(event, (args: any) => callback(args.detail));
  }

  emit(event: string, body?: any) {
    this.dispatchEvent(new CustomEvent(event, { detail: body }));
  }
}

export class SessionClient {
  readonly controllerURL: string;
  readonly ws: WebSocket;
  readonly events: EventTargetOnce;
  keepalive: number | undefined;

  constructor(controllerURL: string) {
    this.controllerURL = controllerURL;
    this.events = new EventTargetOnce();
    this.ws = new WebSocket(controllerURL);
    this.ws.addEventListener("open", () => this.onOpen());
    this.ws.addEventListener("close", () => this.onClose());
    this.ws.addEventListener("message", (msg: MessageEvent) =>
      this.onMessage(msg)
    );
    this.ws.addEventListener("error", (err: Event) => this.onError(err));
    this.keepalive = undefined;
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
    let message: Message = JSON.parse(msg.data);
    this.events.emit(message.action, message.body);
  }

  private onError(err: Event) {
    console.error(err);
  }

  closeConnection() {
    clearInterval(this.keepalive);
    this.ws.close();
  }

  setThresholdHandler(handler: (args: any) => void){
    this.events.on("thresholdUpdate", handler);
  }

  setCloseHandler(handler: (args: any) => void){
    this.events.on("close", handler);
  }

  setSignalHandler(signalName: SignalName, handler: (args: any) => void){
    this.events.on(signalName, handler);
  }

  setStateUpdateHandler(handler: (args: any) => void){
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

  async joinSession(
    clientId: string,
    subscribeSignals: SignalName[] = [],
    isRequiredConnection = false
  ) {
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

  async startSessionComponent(
    sessionComponentId: string,
    clientId: string,
    clientAge: number,
    clientSex: string,
    rawEEG?: RawEEGMetadata,
    powerByBand?: PowerByBandMetadata,
    neurofeedback?: NeurofeedbackMetadata
  ) {
    const sessionComponentMetadata: SessionComponentMetadata = {
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

  async setThreshold(
    sessionComponentId: string,
    clientId: string,
    threshold: number
  ) {
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

  async forwardSignal(
    clientId: string,
    sessionComponentId: string,
    signalName: SignalName,
    signalPacket: any
  ) {
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
