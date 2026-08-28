# SkyOffice ![License](https://img.shields.io/badge/license-MIT-blue)

An immersive virtual office: a small pixel-art building you walk around, where
standing near someone starts a video call, sitting at a desk lets you share your
screen, and every office can be shaped by whoever creates it.

> **This is an independent fork.** It began as [kevinshen56714/SkyOffice][upstream]
> and has since gone its own way - the two are no longer kept in step, and
> nothing here is maintained by the original author. Bug reports and pull
> requests belong on **this** repository. The original project's website,
> social accounts and funding links are its own and have been removed from here;
> see [Where this came from](#where-this-came-from) for what is still owed to it.

Works in desktop browsers. Mobile browsers are not supported.

[upstream]: https://github.com/kevinshen56714/SkyOffice

## Built with

- [Phaser](https://github.com/photonstorm/phaser) 4.2 - game engine
- [Colyseus](https://github.com/colyseus/colyseus) 0.16 - authoritative WebSocket server
- [React](https://github.com/facebook/react) 19 and [Redux Toolkit](https://github.com/reduxjs/redux-toolkit) - the interface over the game
- [PeerJS](https://github.com/peers/peerjs) 1.5 - WebRTC for video and screen sharing
- [TypeScript](https://github.com/microsoft/TypeScript) on both sides, sharing the `types/` folder

### Two package trees, and Phaser is in only one

The server and the client install separately - `package.json` at the root, and
`client/package.json`. Phaser is declared **only** by the client, and the server
tree must stay that way: it is a 145 MB browser engine that the server has no
use for, and the root `dependencies` are what the production image ships.

That costs one rule. Nothing under `types/` may import Phaser. `types/` is
shared by both sides and sits outside `client/`, so an import there resolves
against the root `node_modules` instead of the client's - which would put Phaser
back in the server tree, and would load two different sets of Phaser types into
the client typecheck at once if the versions ever drifted. Both have happened
before. Client-only types belong in `client/src/types/`, where
`KeyboardState.ts` now lives.

The same reasoning governs the rest of the root `dependencies`. Everything the
compiled server does not `require` at runtime belongs in `devDependencies` -
the image is built with the full tree and then reinstalled with `--production`,
so a build-time or test-only package placed in `dependencies` is carried into
the runtime image for nothing. TypeScript and `colyseus.js` are there for
`yarn build` and the integration test respectively, and are declared as dev.

## What is in it

Inherited from the original project:

- **Proximity chat** - walking near someone opens a video call, walking away ends it
- **Screen sharing** - sit at a computer and share; anyone at the same desk sees it
- **Text chat** with dialog bubbles over people's heads
- **Embedded whiteboards** - an iframe of [WBO](https://github.com/lovasoa/whitebophir)
- **Private offices** with a password, and unlisted ones reachable by ID only

Added here:

- **Generated floor plans.** An office can use the hand-drawn building or a new
  one grown from a seed, sized to hold the meeting rooms, desks and lounges you
  ask for. The generator checks its own output before serving it.
- **Offices that outlive the room.** Choose a lifetime and the office gets a
  stable share link that keeps working when nobody is inside.
- **Chat that lasts as long as the office does.** Reopening a kept link brings
  the conversation back; a disposable office remembers nothing.
- **Generated avatars** - pick a look rather than one of four fixed characters.
- **Pets** - a dog, cat or bird in the colour you choose, that follows you around
  and occasionally makes itself heard.
- **A cleaning robot** - optional, custom offices only, driven by the server so
  everyone sees it in the same place.
- **A company logo** - upload one and the browser reduces it to a handful of
  colours and hangs it in the hallway.
- **Deployment as a container stack**, configured at runtime rather than baked
  into the build - see [Deployment](#deployment).
- **A test suite and CI** - a real client driving a real server in-process, plus
  a dependency-advisory baseline.

## Controls

- `W A S D` or the arrow keys to move - a video call starts when you get close to someone
- `E` to sit down
- `R` to use a computer or a whiteboard
- `Enter` to open the chat, `Esc` to close it

## Prerequisites

[Node.js](https://nodejs.org/en/) and [Yarn](https://yarnpkg.com/).

## Getting started

```bash
git clone https://github.com/tzarumang/SkyOfficeMIH.git
cd SkyOfficeMIH
```

The server and the client are installed and run separately. In one terminal:

```bash
yarn && yarn start
```

and in another:

```bash
cd client
yarn && yarn dev
```

The client then runs on <http://localhost:5173> and looks for a server on the
same hostname at port 2567.

## Deployment

The stack runs as three containers and is meant to be deployed as a Portainer
stack pointed at this repository.

| Service | What it is | Default published port |
| --- | --- | --- |
| `client` | the built app, served by nginx | 8080 |
| `server` | the Colyseus game server | 2567 |
| `peerjs` | self-hosted WebRTC signalling | 9000 |

In Portainer: **Stacks → Add stack → Repository**, point it at this repo with
`docker-compose.yml` as the compose path, then fill in the environment
variables below. Locally, `cp .env.example .env && docker compose up --build`
does the same thing.

### Environment

Every URL here is what the **browser** is told to connect to, so it has to be
reachable from wherever people open the app. Container names will not work.

| Variable | Purpose |
| --- | --- |
| `SERVER_URL` | `ws://` or `wss://` URL of the `server` service. Leave empty and the client looks for a server on its own hostname at port 2567. |
| `PEER_HOST` | Hostname of the `peerjs` service - `peer.example.com`, not `https://peer.example.com`. A URL is read apart rather than rejected, and its scheme and port stand in for `PEER_SECURE` and `PEER_PORT`. Leave empty and the client falls back to the free public PeerJS broker, which puts call metadata on a third party. |
| `PEER_PORT` / `PEER_PATH` / `PEER_SECURE` | Details for the above. Set `PEER_SECURE=false` when reaching it over plain http. |
| `ALLOWED_ORIGINS` | Comma-separated origins allowed to reach the matchmaking API, e.g. `https://office.example.com`. Unset means any origin is accepted. |
| `COLYSEUS_MONITOR_USER` / `COLYSEUS_MONITOR_PASSWORD` | Credentials for the `/colyseus` dashboard, which reads every room's state and can disconnect clients. **It is not mounted at all unless both are set.** |
| `CLIENT_PORT` / `SERVER_PORT` / `PEER_PUBLIC_PORT` | Host ports to publish on. |
| `OFFICE_STORE_PATH` | Where offices with a lifetime are recorded, **including their chat**. Defaults to `/app/data/offices.json` in the image, backed by the `office-data` volume. Losing this file closes every office that had a lifetime and loses its conversation. |
| `BIND_ADDRESS` | Interface those ports bind to. Defaults to `127.0.0.1`, so only the host can reach them - which is what you want when a tunnel or reverse proxy on that host forwards them. Use `0.0.0.0` to expose them to your network. |

`.env.example` has worked examples for both a reverse-proxied setup and a bare
host.

### Why the client is configured at runtime

Vite inlines `VITE_*` values at build time, so a plain build would need a new
image for every deployment. The client image writes `/config.js` from its
environment when the container starts instead, which means the same image can
be pointed anywhere by changing the stack settings and restarting. Build-time
`VITE_*` values still work as a fallback, so `yarn dev` is unaffected.

### Offices that outlive the room

When creating an office you choose how long it should last. The default closes
it once everyone leaves, and its share link dies with it. Give it a lifetime and
the office gets a stable link that keeps working for that long.

The room is still disposed once empty either way - an empty office should not
cost a running process. What survives is the office *definition*, recorded in
`OFFICE_STORE_PATH`: name, description, whether it is unlisted, the password
hash, and the conversation. Reopening the link recreates the room from that
record, which is also what stops a visitor recreating a private office without
its password.

Chat lives exactly as long as the office does. The last 100 messages are kept
beside the definition and come back when the link is reopened; when the office
expires, its conversation is pruned with it. A disposable office keeps nothing -
that is the difference between the two.

Two things follow from chat being on disk. The file now holds real conversation,
so it wants the same care as anything else with people's words in it - and the
`/colyseus` dashboard, which reads full room state, can read it back. And
messages are attributed to whatever display name someone typed, which nothing
verifies; history is a convenience, not a record.

### Health checks

The server exposes `GET /health`, and both images declare a `HEALTHCHECK`, so
Portainer shows container health directly.

## Server configuration

The server reads these environment variables. All are optional in development;
the first two matter for any deployment reachable from the internet.

| Variable | Purpose |
| --- | --- |
| `ALLOWED_ORIGINS` | Comma-separated origins allowed to reach the matchmaking API, e.g. `https://office.example.com`. Unset means any origin is accepted. |
| `COLYSEUS_MONITOR_USER` / `COLYSEUS_MONITOR_PASSWORD` | Credentials for the `/colyseus` monitor dashboard. The monitor can read every room's state and disconnect clients, so it is only mounted when both are set. With `NODE_ENV=production` and no credentials, it is not mounted at all. |
| `PORT` | Port to listen on (default `2567`). |

The client is normally configured at runtime by the container - see
[Deployment](#deployment). These build-time equivalents are the fallback, used
when nothing is set at runtime, which is what `yarn dev` and any hand-rolled
static build rely on:

| Variable | Runtime equivalent |
| --- | --- |
| `VITE_SERVER_URL` | `SERVER_URL` |
| `VITE_PEER_HOST` | `PEER_HOST` |
| `VITE_PEER_PORT` / `VITE_PEER_PATH` / `VITE_PEER_SECURE` | `PEER_PORT` / `PEER_PATH` / `PEER_SECURE` |

Leaving `VITE_PEER_HOST` and `PEER_HOST` both unset makes PeerJS use its free
public broker: signalling metadata leaves your infrastructure, availability
depends on a service you do not run, and peer ids share a namespace with every
other app using the default. The stack runs a
[PeerServer](https://github.com/peers/peerjs-server) so you do not have to.

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

## Where this came from

Everything here is built on [SkyOffice][upstream] by Kuan-Hsuan Shen, which won
the 2021 Monte Jade Innovation Competition. The proximity chat, the screen
sharing, the whiteboards and the hand-drawn office are all that project's work,
and this one would not exist without it.

That project has its own website, social accounts and funding page. They are
not this fork's, so they are no longer linked from here or from the app - the
right place to support the original work is [upstream][upstream], not us.

## Credits

- [SkyOffice][upstream] by Kuan-Hsuan Shen - the project this is built on
- [LimeZu](https://limezu.itch.io/) - the pixel art
- [WBO](https://github.com/lovasoa/whitebophir) - the whiteboards
- [ourcade/phaser3-typescript-parcel-template](https://github.com/ourcade/phaser3-typescript-parcel-template) - the template the original started from

## License

MIT, and it stays MIT. The copyright notice in [LICENSE](LICENSE) is the
original author's and is kept as the licence requires - a fork does not get to
drop it, whatever else changes.
