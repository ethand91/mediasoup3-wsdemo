# Mediasoup3 WS Demo

---

**Simple Mediasoupv3 demo using HTML5 Websocket as ws module**

## How to use

```bash
# Download the repo
git clone https://github.com/ethand91/mediasoup3-wsdemo.git

# Install server modules
npm i

# Install public side modules
cd public
npm i

# Build the HTML source
npm run build

# Start the server
npm start
```

Access: https://localhost:3000?options...

## Server ENV Options

Options to customize the server

| Argument | Type | Explanation | Example |
| -------- | :--: | :---------: | :-----: |
| REST_PORT | number | Port for the Koa REST server to listen on | PORT=3000 |
| LISTEN_IP | string | Ip for the socket server to listen on | LISTEN_IP=0.0.0.0 |
| LISTEN_PORT | number | Port for the socket server to listen on | LISTEN_PORT=3001 |
| CERT_FILE | string | Path to the certificate file | CERT_FILE=./ssl/server.crt |
| KEY_FILE | string | Path to the key file | KEY_FILE=./ssl/server.key |

## HTML URL Options

Options can be added to the end of the url to customize the session

| Argument | Type | Explanation | Example |
| -------- | :--: | :---------: | :-----: |
| roomId   | string(required) | Unique room id, will be created if it doesn't already exist | ?roomId=room |
| peerId | string(required) | Unique user id | ?peerId=peer |
| produce | number | 1 = produce a stream to mediasoup, anything other than 1 will not produce a stream | ?produce=1 |
| consume | number | 1 = consume streams from mediasoup, anything other than 1 will not consume any streams | ?consume=1 |
| videoCodec | string | video codec to use then producing video (default is vp8) | ?videoCodec=h264 |

**Example: https://localhost:3000?roomId=room&peerId=peer&produce=1&consume=1&videoCodec=h264**
