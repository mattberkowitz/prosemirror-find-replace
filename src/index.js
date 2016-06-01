import {defineOption, ProseMirror} from "prosemirror/dist/edit"
import {updateCommands, Command, CommandSet} from "prosemirror/dist/edit/command"
import {TextSelection} from "prosemirror/dist/edit/selection"
import {Textblock, Pos} from "prosemirror/dist/model"
import {getNodeEndpoints} from "./util"

window.ProseMirror = ProseMirror

defineOption("find", false, (pm, value) => {
  if (pm.mod.find) {
    pm.mod.find.detach()
    pm.mod.find = null
  }
  if (value) {
    pm.mod.find = new Find(pm, value)
  }
})


//Recursively finds matches within a given node
function findInNode(node, findResult) {
  let ret = []

  if(node.isTextblock) {
    let index = 0, foundAt, ep = getNodeEndpoints(pm.doc, node)
    while((foundAt = node.textContent.slice(index).search(findResult.findRegExp)) > -1) {
      let sel = new TextSelection(ep.from + index + foundAt , ep.from + index + foundAt + findResult.findTerm.length )
      ret.push(sel)
      index = index + foundAt + findResult.findTerm.length
    }
  } else {
    node.content.forEach((child, i) => ret = ret.concat(findInNode(child, findResult)))
  }
  return ret
}


//Finds the selection that comes after the end of the current selection
function selectNext(pm, selections) {
  if(selections.length === 0) {
    return null
  }

  for(let i=0;i<selections.length;i++) {
    if(pm.selection.to <= selections[i].from ) {
      pm.setSelection(selections[i])
      pm.scrollIntoView(selections[i].head)
      return selections[i]
    }
  }
  pm.setSelection(selections[0])
  pm.scrollIntoView(selections[0].head)
  return selections[0];
}


//Marks selections with the findClass specificed in options
function markFinds(pm, finds) {
  finds.forEach(selection => {
    pm.markRange(selection.from, selection.to, {className: pm.mod.find.options.findClass})
  })
}


//Removes MarkedRanges that reside within a given node
function removeFinds(pm, node = pm.doc) {
  pm.ranges.ranges.filter(r => r.options.className === pm.mod.find.options.findClass && pm.doc.resolve(r.from).path.indexOf(node) > -1).forEach(r => pm.ranges.removeRange(r))
}


//Calculates the start and end nodes of a transform
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


//Removes and recalcualtes finds between a start and end point
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


//Calculates default value for find input
//Selected text > Last search > Empty
function defaultFindTerm(pm) {
  if(!pm.selection.empty) {
    return pm.doc.sliceBetween(pm.selection.from, pm.selection.to).textContent
  }
  if(pm.mod.find.findOptions) {
    return pm.mod.find.findOptions.findTerm
  }
  return null
}

//Calculates default value for replace input
//Last search > Empty
function defaultReplaceWith(pm) {
  if(pm.mod.find.findOptions) {
    return pm.mod.find.findOptions.replaceWith
  }
  return null
}


//A default set of commands
export var findCommands = {
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
    run: function(pm,findTerm) {
      pm.mod.find.findNext(findTerm)
    },
    params:[
      {label: "Find", type: "text", prefill: defaultFindTerm}
    ],
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
}


//Class to handle a set of find/replace terms and results
class FindOptions {
  constructor(pm, findTerm, replaceWith, caseSensitive = true) {
    this.pm = pm
    this.findTerm = findTerm
    this.replaceWith = replaceWith
    this.caseSensitive = caseSensitive
  }

  //Constructs a regex based on find term and case sensitivity
  get findRegExp() {
    return RegExp(this.findTerm, !this.caseSensitive ? "i" : "")
  }

  //Calculates results for a set of terms
  results() {
    return findInNode(this.pm.doc, this)
  }
}



class Find {
  constructor(pm, options) {
    this.pm = pm
    this.findOptions = null

    this.options = Object.create(this.defaultOptions)
    for(let option in options){
      this.options[option] = options[option]
    }

    pm.mod.find = this

    //Recalculate changed blocks on transform
    this.onTransform = function(transform) {
      //If there was a find
      if(pm.mod.find.findOptions) {
        let {from, to} = rangeFromTransform(transform)
        processNodes(pm, from, to, pm.mod.find.findOptions)
      }
    }

    pm.on("transform", this.onTransform)
  }

  detach() {
    this.clearFind()
    pm.off("transform", this.onTransform)
  }

  //Default set of options
  get defaultOptions() {
    return {
      autoSelectNext: true, //move selection to next find after 'find' or 'replace'
      findClass: "find" //class to add to MarkedRanges
    }
  }

  //Gets last find options
  get findOptions() {
    return this._findOptions
  }

  //Clears last find display and sets new find options
  set findOptions(val) {
    if(this._findOptions) this.clearFind() //clear out existing results if there are any
    this._findOptions = val
  }

  //Find and mark instnaces of a find term, optionally case insensitive
  //Will move selection to the next match, if autoSelectNext option is true
  find(findTerm, caseSensitive = true) {
    this.findOptions = new FindOptions(this.pm, findTerm, null, caseSensitive)

    let selections = this.findOptions.results()

    markFinds(this.pm, selections)

    if(this.options.autoSelectNext) {
      selectNext(this.pm, selections)
    }



    return selections
  }

  //Moves the selection to the next instance of the find term, optionall case insensitive
  findNext(findTerm, caseSensitive = true) {
    if(findTerm) {
      this.findOptions = new FindOptions(this.pm, findTerm, null, caseSensitive)
    }
    if(this.findOptions) {
      let selections = this.findOptions.results()
      markFinds(this.pm, selections)
      return selectNext(this.pm, selections)
    }
    return null
  }

  //Clears find display and nulls out stored find options
  clearFind() {
    removeFinds(this.pm)
    this._findOptions = null
  }

  //Replaces next match of a findTerm with the repalceWith string, optionally case insensitive
  //If current selection matches the find term it will be replaced
  //Otherwise, selection  will be moved to the next match and that will be replaced
  //If options.autoFindNext is true the match that proceeds replaced on will be selected
  replace(findTerm, replaceWith, caseSensitive = true) {
    this.findOptions = new FindOptions(this.pm, findTerm, replaceWith, caseSensitive)

    if(!this.pm.doc.slice(this.pm.selection.from, this.pm.selection.to).content.textContent.match(this.findOptions.findRegExp)) {
      if(!selectNext(this.pm, this.findOptions.results())) {
        return null
      }
    }

    let transform = this.pm.tr.typeText(replaceWith).apply({scrollIntoView: true})

    if(this.options.autoSelectNext) {

      let otherResults = this.findOptions.results()
      if(otherResults.length) {
        removeFinds(this.pm)
        markFinds(this.pm, otherResults)
      }
      selectNext(this.pm, otherResults)

    }

    return transform
  }


  //Replaces all occurances of a findTerm with the replaceWith string, optionally case insensitive
  replaceAll(findTerm, replaceWith, caseSensitive = true) {
    this.findOptions = new FindOptions(this.pm, findTerm, replaceWith, caseSensitive)

    let selections = this.findOptions.results(),
        selection, transform,
        transforms = [];

    while(selection = selections.shift()) {
      this.pm.setSelection(selection)
      transform = this.pm.tr.typeText(replaceWith).apply({scrollIntoView: true})
      transforms.push(transform)
      selections = selections.map(s => s.map(this.pm.doc, transform.maps[0]))
    }
    return transforms
  }


}
