# Mini Multiplayer Game Hub (v4)

Games: Tic-Tac-Toe, Connect Four, Checkers, Battleship

Run:
```
cd server
npm install
npm start
```

Render: root=server; build `npm install && npm rebuild better-sqlite3 --build-from-source`; start `node index.js`; env NODE_VERSION=20.12.2, npm_config_build_from_source=true.

GitHub Pages: copy client-ghpages to /docs and set BACKEND_URL in docs/app.js.
