export interface TreeNode {
  name: string;
  path: string;
  isFile: boolean;
  changed: boolean;
  children: TreeNode[];
}

function getOrCreateChild(
  parent: TreeNode,
  name: string,
  path: string,
  isFile: boolean
): TreeNode {
  let child = parent.children.find((c) => c.name === name);
  if (!child) {
    child = { name, path, isFile, changed: false, children: [] };
    parent.children.push(child);
  }
  return child;
}

/** Builds a nested directory tree from flat file paths, flagging changed paths. */
export function buildFileTree(allPaths: string[], changedPaths: Set<string>): TreeNode[] {
  const root: TreeNode = { name: "", path: "", isFile: false, changed: false, children: [] };

  for (const fullPath of allPaths) {
    const segments = fullPath.split("/");
    let current = root;
    let pathSoFar = "";
    segments.forEach((segment, index) => {
      pathSoFar = pathSoFar ? `${pathSoFar}/${segment}` : segment;
      const isFile = index === segments.length - 1;
      current = getOrCreateChild(current, segment, pathSoFar, isFile);
      if (isFile && changedPaths.has(pathSoFar)) current.changed = true;
    });
  }

  const sortTree = (node: TreeNode) => {
    node.children.sort((a, b) => {
      if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(sortTree);
  };
  sortTree(root);

  return root.children;
}
