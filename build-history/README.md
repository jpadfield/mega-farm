# Build history

The paperwork behind the web version, kept out of the root folder so that the
root holds the game itself.

| File | What it is |
| --- | --- |
| `mega-farm-rules-data-v4.md` | The rules and data specification. **Authoritative for every number in the game.** |
| `mega-farm-build-prompt.md` | The brief the web version was built to. A historical record. |

The two are not quite the same kind of document, despite sitting together.

`mega-farm-build-prompt.md` is finished history: it says what version 1 was
asked to be, and it does not need to change again.

`mega-farm-rules-data-v4.md` is still live. Every number in `js/gamedata.js`
came from it, and `../NOTES.md` lists the points it left ambiguous, ready to be
ruled on and written back into it. If the two ever disagree, this file is right
and the code is wrong.

The game as it is actually played out loud, with three coins and a bit of paper,
is in `../verbal version/`. That is where all of this started.
