import 'regenerator-runtime/runtime'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { ThemeProvider } from '@mui/material/styles'

import './index.scss'
import muiTheme from './MuiTheme'
import App from './App'
import store from './stores'

const container = document.getElementById('root')
const root = createRoot(container!)
root.render(
  <React.StrictMode>
    <Provider store={store}>
      <ThemeProvider theme={muiTheme}>
        <App />
      </ThemeProvider>
    </Provider>
  </React.StrictMode>
)

/**
 * The engine comes after the first render, not before it.
 *
 * This used to be a plain `import './PhaserGame'` above, which constructed the
 * game as a side effect - so 1.4 MB of Phaser had to arrive, parse and boot
 * before React could paint anything at all, and a slow line got a white page
 * for the whole of it. Loading it here instead lets the landing screen render
 * while the engine is still on its way.
 *
 * Time to *interactive* is unchanged: the controls wait on `lobbyJoined`,
 * which the game's Bootstrap scene dispatches once it reaches the lobby. What
 * changes is that the wait now looks like the app rather than like nothing.
 */
import('./PhaserGame').then(({ startPhaserGame }) => startPhaserGame())
