import {defineOption} from "prosemirror/dist/edit"
import {updateCommands, Command, CommandSet} from "prosemirror/dist/edit/command"
import {TextSelection} from "prosemirror/dist/edit/selection"
import {Textblock, Pos} from "prosemirror/dist/model"

defineOption("find", false, (pm, value) => {
  if (pm.mod.find) {
    pm.mod.find.detach()
    pm.mod.find = null
  }
  if (value) {
    pm.mod.find = new Find(pm, value)
  }
})


//Currently this only ever is executed on pm.doc, but it could be used on a subtree also
function findInNode(node, findResult, path = []) {
  let ret = []

  //Not sure this is the right way to do this, but it works. node.isText() drills down to
  //individual text fragments, which wouldn't catch something like blo*ck* (markdown) searching for "block"
  if(node.isTextblock) {
    let index = 0, foundAt
    while((foundAt = node.textContent.slice(index).search(findResult.findRegExp)) > -1) {
      let sel = new TextSelection(new Pos(path, index + foundAt), new Pos(path, index + foundAt + findResult.findTerm.length))
      ret.push(sel)
      index = index + foundAt + findResult.findTerm.length
    }
  } else {
    node.content.forEach((child, i) => ret = ret.concat(findInNode(child, findResult, path.concat(i))))
  }
  return ret
}


//Finds the selection that comes after the end of the current selection
function selectNext(pm, selections) {
  if(selections.length === 0) {
    return null
  }
  for(let i=0;i<selections.length;i++) {
    if(pm.selection.to.cmp(selections[i].from) <= 0) {
      pm.setSelection(selections[i])
      return selections[i]
    }
  }
  pm.setSelection(selections[0])
  return selections[0];
}


function markFinds(pm, finds) {
  //I added volatile option to MarkedRange, to destroy a range when it's content changes
  finds.forEach(selection => {
    pm.markRange(selection.from, selection.to, {className: pm.mod.find.options.findClass})
  })
}

function removeFinds(pm, node = pm.doc) {
  pm.ranges.ranges.filter(r => r.options.className === pm.mod.find.options.findClass && pm.doc.pathNodes(r.from.path).indexOf(node) > -1).forEach(r => pm.ranges.removeRange(r))
}

function rangeFromTransform(tr) {
  let from, to
  for (let i = 0; i < tr.steps.length; i++) {
    let step = tr.steps[i], map = tr.maps[i]
    let stepFrom = map.map(step.from || step.pos, -1).pos
    let stepTo = map.map(step.to || step.pos, 1).pos
    from = from ? map.map(from, -1).pos.min(stepFrom) : stepFrom
    to = to ? map.map(to, 1).pos.max(stepTo) : stepTo
  }
  return {from, to}
}

function processNodes (pm, from, to, findResult) {
  if(!findResult) return
  let processed = []
  function processNode (node, path) {
    if(node.isTextblock && processed.indexOf(node) === -1) {
      removeFinds(pm, node)
      let matches = findInNode(node, findResult, [].concat(path))
      markFinds(pm, matches)
      processed.push(node)
    }
  }
  pm.doc.nodesBetween(from, to, (node, path, parent) => processNode(node, path))
}

function defaultFindTerm(pm) {
  if(!pm.selection.empty) {
    return pm.doc.sliceBetween(pm.selection.from, pm.selection.to).textContent
  }
  if(pm.mod.find.findResult) {
    return pm.mod.find.findResult.findTerm
  }
  return null
}

function defaultReplaceWith(pm) {
  if(pm.mod.find.findResult) {
    return pm.mod.find.findResult.replaceWith
  }
  return null
}


//Unsure if this is the correct way to add new commands
CommandSet.default = CommandSet.default.add({
  find: {
    label: "Find occurances of a string",
    run: function(pm, findTerm) {
      pm.mod.find.find(findTerm)
    },
    params: [
      {label: "Find", type: "text", prefill: defaultFindTerm}
    ],
    keys: ["Mod-F"]
  },
  findNext: {
    label: "Find next occurance of last searched string",
    run: function(pm) {
      pm.mod.find.findNext()
    },
    keys: ["Alt-Mod-F"]
  },
  clearFind: {
    label: "Clear highlighted finds",
    run: function(pm) {
      pm.mod.find.clearFind()
    }
  },
  replace: {
    label: "Replaces selected/next occurance of a string",
    run: function(pm, findTerm, replaceWith) {
      pm.mod.find.replace(findTerm, replaceWith)
    },
    params: [
      {label: "Find", type: "text", prefill: defaultFindTerm},
      {label: "Replace", type: "text", prefill: defaultReplaceWith}
    ],
    keys: ["Shift-Mod-F"]
  },
  replaceAll: {
    label: "Replaces all occurances of a string",
    run: function(pm, findTerm, replaceWith) {
      pm.mod.find.replaceAll(findTerm, replaceWith)
    },
    params: [
      {label: "Find", type: "text", prefill: defaultFindTerm},
      {label: "Replace", type: "text", prefill: defaultReplaceWith}
    ],
    keys: ["Shift-Alt-Mod-F"]
  }
})

class FindResult {
  constructor(pm, findTerm, replaceWith, caseSensitive = true) {
    this.pm = pm
    this.findTerm = findTerm
    this.replaceWith = replaceWith
    this.caseSensitive = caseSensitive
  }

  get findRegExp() {
    return RegExp(this.findTerm, !this.caseSensitive ? "i" : "")
  }

  results() {
    return findInNode(this.pm.doc, this)
  }
}

class Find {
  constructor(pm, options) {
    this.pm = pm
    this.findResult = null

    this.options = Object.create(this.defaultOptions)
    for(let option in options){
      this.options[option] = options[option]
    }

    pm.mod.find = this

    pm.on("transform", function(transform) {
      if(pm.mod.find.options.highlightAll && pm.mod.find.findResult) {
        let {from, to} = rangeFromTransform(transform)
        processNodes(pm, from, to, pm.mod.find.findResult)
      }
    })

    if(!this.options.noCommands) updateCommands(pm, CommandSet.default)
  }

  detach() {
    this.clearFind()
  }

  get defaultOptions() {
    return {
      highlightAll: true, //add a MarkedRange to all matchs
      findNextAfterReplace: true, //execute a find after
      findClass: "find", //class to add to highlightAll MarkedRanges
      noCommands: false //set to true to skip adding commands, useful for non-standard UI
    }
  }

  get findResult() {
    return this._findResult
  }

  set findResult(val) {
    if(this._findResult) this.clearFind() //clear out existing results if there are any
    this._findResult = val
  }

  find(findTerm, node = this.pm.doc) {
    this.findResult = new FindResult(this.pm, findTerm)

    let selections = this.findResult.results()
    selectNext(this.pm, selections)

    if(this.options.highlightAll) {
      markFinds(pm, selections)
    }

    return selections
  }

  findNext() {
    if(this.findResult) {
      let selections = this.findResult.results()
      return selectNext(pm, selections)
    }
    return null
  }

  clearFind() {
    if(this.options.highlightAll) {
      removeFinds(this.pm)
    }
    this._findResult = null
  }

  replace(findTerm, replaceWith) {
    this.findResult = new FindResult(this.pm, findTerm, replaceWith)

    if(this.pm.doc.sliceBetween(this.pm.selection.from, this.pm.selection.to).textContent !== findTerm) {
      if(!selectNext(pm, this.findResult.results())) {
        return false
      }
    }
    this.pm.tr.typeText(replaceWith).apply({scrollIntoView: true})

    if(this.options.findNextAfterReplace) {

      let otherResults = this.findResult.results()
      if(this.options.highlightAll && otherResults.length) {
        markFinds(pm, otherResults)
      }
      selectNext(pm, otherResults)

    }

    return true
  }

  replaceAll(findTerm, replaceWith) {
    this.findResult = new FindResult(this.pm, findTerm, replaceWith)

    let selections = this.findResult.results(),
        selection, transform;

    while(selection = selections.shift()) {
      this.pm.setSelection(selection)
      transform = this.pm.tr.typeText(replaceWith).apply({scrollIntoView: true})
      selections = selections.map(s => s.map(this.pm.doc, transform.maps[0]))
    }
    return selections.length
  }


}
