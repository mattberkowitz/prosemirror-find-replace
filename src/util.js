export function getNodeEndpoints(root, node, offset = 0) {
  if(root == node) return { from: offset, to: offset + node.nodeSize }

  if(node.isBlock) {
    for(let i=0; i<root.content.content.length; i++) {
      let result = getNodeEndpoints(root.content.content[i], node, offset)
      if(result) return result;
      offset = offset += root.content.content[i].nodeSize
    }
    return null
  } else {
    return null
  }
}
