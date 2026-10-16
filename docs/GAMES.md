# Games

PS5LM Plus serves a small game store, **PS5LM Arcade**, at `http://<console IP>:8083` for any browser on your network: a phone, a PC, a tablet, or the PS5's own browser. Games run in the browser; the AI games use the model loaded on the console.

| Game | Kind | Needs a model |
|---|---|---|
| AI Quest | an adventure the model narrates, three choices per scene, health, gold and items | yes |
| Riddle Master | ten fresh riddles with four answers each, streak bonus, three levels | yes |
| Block Drop | falling blocks, with hold and a ghost piece | |
| Neon Snake | snake, faster as it grows | |
| Brick Breaker | breakout, three lives, levels with tougher bricks | |
| 2048 | slide and merge tiles | |
| Minesweeper | three field sizes, chording, flags | |
| Memory Match | find twelve pairs in as few turns as you can | |

Best scores, play counts and recently played games are kept in each browser (localStorage), not on the console.

## How it works

- `ps5/games/` is copied into the title as `/app0/games` by `scripts/build-app.sh`.
- `ps5/app/games_server.cpp` serves that folder on port 8083 (cpp-httplib, the same library llama-server uses), on its own thread, started at launch whether or not a model is loaded. Like llama-server with `patches/0005`, it listens again when the network drops.
- The same port passes `POST /v1/chat/completions`, `GET /health` and `GET /v1/models` to llama-server on loopback (port 8081), whole rather than streamed. A game therefore asks the model at its own origin: no console IP to know, no CORS. With no model loaded these answer 503 with a JSON error the games show.

## Controls

The store and every game take the same actions from the DualSense (where the browser has the Gamepad API), the keyboard and touch:

| Action | DualSense | Keyboard |
|---|---|---|
| Move | D-pad, left stick | arrows, WASD |
| Confirm | Cross | Enter, Space |
| Back | Circle | Escape, Backspace |
| Square / Triangle | Square / Triangle | X / Y |
| Categories (store) | L1 / R1 | Q / E |
| Pause | Options | P |

Phones and tablets get on-screen buttons in each game, and a mouse or the PS5 browser's cursor can click everything.

## Working on the games from a PC

```sh
scripts/serve-games.sh                                    # http://localhost:8083
LLAMA_URL=http://<console IP>:8081 scripts/serve-games.sh # the AI games use the console's model
LLAMA_URL=http://127.0.0.1:8080 scripts/serve-games.sh    # or a llama-server on the PC
```

To put a change on the console, rebuild and deploy the app (`scripts/build-app.sh`, `scripts/ps5lm-app.sh cycle`), or copy just the games over FTP to `/data/homebrew/PPSA99581/games`.

## Adding a game

1. Make a folder `ps5/games/games/<id>/` with an `index.html` and a square `icon.svg` (white on transparent; the store puts it on the game's colours).
2. Add an entry to `ps5/games/games.json`:

   ```json
   {
     "id": "my-game", "name": "My Game", "tagline": "One line for the tile",
     "category": "Arcade", "colors": ["#ff7a18", "#ff3d6e"],
     "description": "A paragraph for the game's page.",
     "controls": [["D-pad", "Move"], ["Cross", "Jump"]],
     "featured": false, "needsAi": false
   }
   ```

   `featured` games rotate in the store's banner; `needsAi` adds the AI badge and a warning when no model is loaded. A new value in `category` needs adding to `categories` too.
3. In the page, load the kit and call `Kit.init`:

   ```html
   <link rel="stylesheet" href="../../lib/kit.css">
   <div class="kit-stage"><canvas id="c" width="960" height="640"></canvas></div>
   <script src="../../lib/kit.js"></script>
   <script>
     Kit.init({ id: 'my-game', name: 'My Game',
       controls: [['D-pad', 'Move'], ['Cross', 'Jump']],   // shown on the pause screen
       touch: [['a', '✕']] });                         // on-screen buttons on phones
     Kit.fit(document.getElementById('c'), 960 / 640);     // scale the canvas to the screen
     Kit.on(function (action, repeat) { /* 'up' 'down' 'left' 'right' 'a' 'b' 'x' 'y' 'l1' 'r1' */ });
     // Kit.held('left') in a game loop; Kit.paused(); Kit.setScore(n); Kit.submit(n) saves a best;
     // Kit.banner(title, line, button) shows a message, Kit.banner(null) hides it.
   </script>
   ```

   The kit adds the bar with the way back to the store, the score and best, the pause screen (Options), and the on-screen buttons. It also records the game as recently played.
4. For an AI game, also load `lib/ai.css` and `lib/choices.js`:

   ```js
   Kit.ai([{ role: 'system', content: '...' }, { role: 'user', content: '...' }],
          { max_tokens: 300, temperature: 0.9 },
          function (err, text) { var obj = Kit.json(text); /* the first {...} in the reply */ });
   Choices.show(box, ['First', 'Second', 'Third'], function (index) { ... });  // D-pad list
   ```

   `Kit.ai` asks reasoning models (Qwen 3.x) not to think first and strips any `<think>` block. Ask for JSON in the prompt and check it: small models get the form wrong now and then, so retry once and fall back to something playable. Keep the history short (the last few exchanges); the context can be as small as 4k.

**Write plain ES5:** `var` and `function`, no arrow functions, `let`/`const`, template strings, classes or modules, and no external files. The PS5 browser renders modern bundles as a blank page (see `docs/CONSOLE.md`). Check a page before shipping it with ESLint set to `ecmaVersion: 5`.

## Not yet checked on the console

The games were tested in desktop Chromium and a phone-sized browser against the server built on a PC. On the console itself, two things are still open:

- **Does the PS5 browser expose the DualSense through the Gamepad API?** If it does not, the controller drives the browser's own cursor, which can still click everything; keyboard-style D-pad play would then need the cursor or a USB keyboard.
- **Opening the browser from the app.** The payload opens the PS5 browser with `sceSystemServiceLaunchWebBrowser`; whether a title may do the same, and what happens to the model while the browser is in front, has not been tried.
