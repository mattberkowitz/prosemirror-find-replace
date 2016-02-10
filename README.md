# prosemirror-find-replace
Find &amp; Replace plugin for ProseMirror


## Usage

Open your project in command prompt and run:

`npm install prosemirror --save`

`npm install prosemirror-find-replace --save`


In your ProseMirror initialization script:

```
import { ProseMirror } from "prosemirror"
import "prosemirror-find-replace"

let pm = new ProseMirror({
  place: document.querySelector("#target"),
  find: {}
})
```


### Options

The following options can be passed in the find object when ProseMirror is initialized:

**atuoSelectNext** *(Boolean, default: true)*: Moves user selection to the next find match after and find or replace

**findClass** *(String, default:"find")*: Class to apply to find matches


### Commands

A simple, default set of commands is included, if you choose to use them:

```
import { ProseMirror, CommandSet } from "prosemirror/dist/edit"
import { findCommands } from "prosemirror-find-replace"

let pm = new ProseMirror({
  place: document.querySelector("#target"),
  find: {},
  commands: CommandSet.default.add(findCommands)
})
```

**find** *(Meta + F)* - Highlights all matches of find term, selects next one if `autoSelectNext` option is true

**findNext** *(Alt + Meta + F)* - Moves selection to next match of previous find

**replace** *(Shift + Meta + F)* - Finds next match and replaces it

**replaceAll** *(Shift + Alt + Meta + F)* - Finds and replaces all matches

**clearFind** *(No shortcut)* - Clears highlighted find results



## Demo

To run a quick demo (based on ProseMirror demo) run the following from the `prosemirror-find-replace` directory in command prompt:

`npm install`

`npm install prosemirror` (npm > 3 will not install peerDependencies for you)

`npm run demo`

Then connect to `http://localhost:8080` in your browser
