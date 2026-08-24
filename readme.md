# SkyOffice ![License](https://img.shields.io/badge/license-MIT-blue) ![PRs Welcome](https://img.shields.io/badge/PRs-welcome-green.svg)

<img alt="Logo" align="right" src="https://user-images.githubusercontent.com/11501902/139942585-a6b044ce-3695-460a-91bd-dd9f1d4611c8.png" width="20%" />

An immersive virtual office - Winner of [2021 Monte Jade Innovation Competition](https://www.montejadese.org/innovation-competition)

- Come try it out - [Official Website](https://skyoffice.netlify.app)
- Why we built this - [Concept Video](https://www.youtube.com/watch?v=BpDqGTPh8pc)
- 🙌 Get latest updates? Follow our [Twitter](https://twitter.com/SkyOfficeApp).
- 💕 Love this project? Consider [buy me a coffee](https://www.buymeacoffee.com/skyoffice).

SkyOffice works on all PC browsers (mobile browsers are currently not supported)

## Built with

- [Phaser3](https://github.com/photonstorm/phaser) - Game engine
- [Colyseus](https://github.com/colyseus/colyseus) - WebSocket-based server framework
- [React/Redux](https://github.com/facebook/react) - Front-end framework
- [PeerJS](https://github.com/peers/peerjs) - WebRTC for video/screen sharing
- [TypeScript](https://github.com/microsoft/TypeScript) and [ES6](https://github.com/eslint/eslint) - for both client and server sides

## Features

- [Proximity Chat](#proximity-chat-distance-based-interactive-system)
- [Flexible Screen Sharing](#flexible--immediate-screen-sharing)
- [Multifunctional Rooms](#multifunctional-rooms)
- [Text Message Chat](#text-message-chat-with-real-time-dialog-bubbles)
- [Custom/Private Rooms](#customprivate-rooms)
- [Embedded Whiteboards](#embedded-whiteboards) (iframe embed of [WBO](https://github.com/lovasoa/whitebophir))

### Proximity Chat (distance-based interactive system)

![image](https://user-images.githubusercontent.com/11501902/139960852-cf0e0883-8fbe-459d-bb11-3707d0ae1360.png)

### Multifunctional Rooms

![image](https://user-images.githubusercontent.com/11501902/139961091-1801bd4d-fbd6-4400-8503-85ece744e979.png)

### Flexible & Immediate Screen Sharing

![image](https://user-images.githubusercontent.com/11501902/139961155-44a85cd9-ac25-4563-9d82-6537ed7435f6.png)

### Text Message Chat (with real time dialog bubbles)

![image](https://user-images.githubusercontent.com/11501902/145925423-3b5b9026-d3b9-429d-920b-98b0bcd6300a.png)

### Embedded Whiteboards

![image](https://user-images.githubusercontent.com/11501902/147785323-19dbf0e6-056d-44c5-8efe-e969297bbe52.png)

### Custom/Private Rooms

![image](https://user-images.githubusercontent.com/11501902/147784118-15ef50bf-0f67-4704-89d7-81b2fa7f8ceb.png)

## Controls

- `W, A, S, D, or arrow keys` to move (video chat will start if you are close to someone else)
- `E` to sit down
- `R` to use computer (for screen sharing)
- `Enter` to open chat
- `ESC` to close chat

## Prerequisites

You'll need [Node.js](https://nodejs.org/en/), [npm](https://www.npmjs.com/) installed.

## Getting Started

Clone this repository to your local machine:

```bash
git clone https://github.com/kevinshen56714/SkyOffice.git
```

This will create a folder named `SkyOffice`. You can specify a different folder name like this:

```bash
git clone https://github.com/kevinshen56714/SkyOffice.git my-folder-name
```

To start a server, go into the project folder and install dependencies/run start command:

```bash
cd SkyOffice or 'my-folder-name'
yarn && yarn start
```

To start a client, go into the client folder and install dependencies/run start command:

```bash
cd SkyOffice/client or 'my-folder-name/client'
yarn && yarn dev
```

## Server configuration

The server reads these environment variables. All are optional in development;
the first two matter for any deployment reachable from the internet.

| Variable | Purpose |
| --- | --- |
| `ALLOWED_ORIGINS` | Comma-separated origins allowed to reach the matchmaking API, e.g. `https://skyoffice.netlify.app`. Unset means any origin is accepted. |
| `COLYSEUS_MONITOR_USER` / `COLYSEUS_MONITOR_PASSWORD` | Credentials for the `/colyseus` monitor dashboard. The monitor can read every room's state and disconnect clients, so it is only mounted when both are set. With `NODE_ENV=production` and no credentials, it is not mounted at all. |
| `PORT` | Port to listen on (default `2567`). |

The client reads these at build time:

| Variable | Purpose |
| --- | --- |
| `VITE_SERVER_URL` | URL of the Colyseus server. Required for production builds. |
| `VITE_PEER_HOST` | Host of a self-hosted [PeerServer](https://github.com/peers/peerjs-server). Unset, PeerJS uses its free public broker - signalling metadata leaves your infrastructure, availability depends on a service you do not run, and peer ids share a namespace with every other app using the default. |
| `VITE_PEER_PORT` / `VITE_PEER_PATH` / `VITE_PEER_SECURE` | Optional details for the above. Default to the host's own port, `/`, and TLS on. |

## Development

```bash
yarn test           # boots a server in-process and drives it with a real client
yarn audit:check    # fails only on advisories missing from .audit-baseline.json
yarn audit:update   # re-record the baseline after upgrading or accepting one
```

CI runs a typecheck, a client build, the test suite and the audit check on every
pull request.

`.audit-baseline.json` records the advisories we already know about, so a newly
published one fails the build while the accepted backlog does not. When you fix or
accept one, run `yarn audit:update` and commit the diff.

## Credits 🎉

Big thanks to this great repo - [ourcade/phaser3-typescript-parcel-template](https://github.com/ourcade/phaser3-typescript-parcel-template)

Big thanks to pixel artist - [LimeZu](https://limezu.itch.io/)

Big thanks to open-source whiteboard project - [WBO](https://github.com/lovasoa/whitebophir)

## License

This project is licensed under MIT.

If you're using SkyOffice to power your virtual office or using our code in other projects, please consider [buy me a coffee](https://www.buymeacoffee.com/skyoffice). Thank you :)
