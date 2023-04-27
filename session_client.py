import websocket
import requests
import json

"""
Configure here for different accounts
"""
CLIENT_ID = 'afa93677-6c95-4d47-8c2d-818717f7f150'
DIVERGENCE_EMAIL = ""
DIVERGENCE_PASSWORD = ""
SIGNIN_URL = 'https://api-test.divergenceneuro.com/signin'
WEBSOCKET_URL = "wss://ws-test.divergenceneuro.com/"


def on_message(ws, message):
    msg = json.loads(message)
    if msg.get('action') != 'signalPacket':
        print(msg.get("body"))
    else:
        body = msg.get("body")
        signalType = body.get("signalType")
        if signalType == "rawEEG":
            pass
        elif signalType == "powerTraining":
            try:
                stimulus_intensity = body["packet"]["signal"]["stimulusIntensity"]
                print(f'stimulus intensity: {stimulus_intensity}')
            except KeyError:
                print("could not extract stimulus intensity")


def on_error(ws, error):
    print(error)


def on_close(ws):
    print("Connection closed")


def on_open(ws):
    print("Connection opened, joining session...")

    joinSessionMessage = {
        "action": "joinSession",
        'clientId': CLIENT_ID,
        "subscribeSignals": ['rawEEG', 'powerTraining'],
        "isRequiredConnection": False,
    }
    ws.send(json.dumps(joinSessionMessage))


if __name__ == "__main__":

    tokenResponse = requests.post(
        SIGNIN_URL,
        json={"email": DIVERGENCE_EMAIL, "password": DIVERGENCE_PASSWORD},
        headers={"Content-Type": "application/json"}
    )
    if (tokenResponse.status_code != 200):
        raise Exception(f'Login Failed ({tokenResponse.status_code})')

    token = tokenResponse.json().get("accessToken")

    ws = websocket.WebSocketApp(
        url=WEBSOCKET_URL,
        on_message=on_message,
        on_error=on_error,
        on_close=on_close,
        on_open=on_open,
        subprotocols=["Sec-Websocket-Protocol"],
        header={"Authorization": f'Bearer {token}'},
    )
    ws.run_forever()
