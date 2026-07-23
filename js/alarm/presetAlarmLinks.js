const MAX_LINKS = 5;

export function addLink(links, newLink) {
  const withoutDup = links.filter(l => l !== newLink);
  return [newLink, ...withoutDup].slice(0, MAX_LINKS);
}

export function removeLink(links, linkToRemove) {
  return links.filter(l => l !== linkToRemove);
}
