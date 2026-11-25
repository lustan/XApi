import { CollectionItem, HttpRequest } from './types';
import { generateId } from './utils';

export const collectAllRequestIds = (collections: CollectionItem[]): string[] => {
  const ids: string[] = [];
  for (const col of collections) {
    for (const r of col.requests) ids.push(r.id);
    if (col.collections && col.collections.length > 0) {
      ids.push(...collectAllRequestIds(col.collections));
    }
  }
  return ids;
};

export const collectAllCollectionRequests = (collections: CollectionItem[]): HttpRequest[] => {
  const out: HttpRequest[] = [];
  for (const col of collections) {
    out.push(...col.requests);
    if (col.collections && col.collections.length > 0) {
      out.push(...collectAllCollectionRequests(col.collections));
    }
  }
  return out;
};

export const findCollectionById = (collections: CollectionItem[], id: string): CollectionItem | undefined => {
  for (const col of collections) {
    if (col.id === id) return col;
    if (col.collections) {
      const found = findCollectionById(col.collections, id);
      if (found) return found;
    }
  }
  return undefined;
};

export const updateCollectionRequest = (
  collections: CollectionItem[],
  updatedReq: HttpRequest
): CollectionItem[] =>
  collections.map((c) => ({
    ...c,
    requests: c.requests.map((r) => (r.id === updatedReq.id ? updatedReq : r)),
    collections: c.collections ? updateCollectionRequest(c.collections, updatedReq) : undefined,
  }));

export const renameRequestInCollections = (
  collections: CollectionItem[],
  reqId: string,
  newName: string
): CollectionItem[] =>
  collections.map((c) => ({
    ...c,
    requests: c.requests.map((r) => (r.id === reqId ? { ...r, name: newName } : r)),
    collections: c.collections ? renameRequestInCollections(c.collections, reqId, newName) : undefined,
  }));

export const removeRequestFromCollections = (
  collections: CollectionItem[],
  reqId: string
): CollectionItem[] =>
  collections.map((c) => ({
    ...c,
    requests: c.requests.filter((r) => r.id !== reqId),
    collections: c.collections ? removeRequestFromCollections(c.collections, reqId) : undefined,
  }));

export const insertRequestIntoCollection = (
  collections: CollectionItem[],
  colId: string,
  req: HttpRequest
): CollectionItem[] =>
  collections.map((c) => {
    if (c.id === colId) {
      return { ...c, collapsed: false, requests: [...c.requests, req] };
    }
    if (c.collections) {
      return { ...c, collections: insertRequestIntoCollection(c.collections, colId, req) };
    }
    return c;
  });

export const addSubfolderToCollections = (
  collections: CollectionItem[],
  parentColId: string,
  name: string
): CollectionItem[] =>
  collections.map((c) => {
    if (c.id === parentColId) {
      const sub: CollectionItem = { id: generateId(), name, collapsed: false, requests: [] };
      return { ...c, collapsed: false, collections: [...(c.collections || []), sub] };
    }
    if (c.collections) {
      return { ...c, collections: addSubfolderToCollections(c.collections, parentColId, name) };
    }
    return c;
  });

export const renameCollectionInTree = (
  collections: CollectionItem[],
  colId: string,
  name: string
): CollectionItem[] =>
  collections.map((c) => ({
    ...c,
    name: c.id === colId ? name : c.name,
    collections: c.collections ? renameCollectionInTree(c.collections, colId, name) : undefined,
  }));

export const toggleCollectionCollapseInTree = (
  collections: CollectionItem[],
  colId: string
): CollectionItem[] =>
  collections.map((c) => ({
    ...c,
    collapsed: c.id === colId ? !c.collapsed : c.collapsed,
    collections: c.collections ? toggleCollectionCollapseInTree(c.collections, colId) : undefined,
  }));

export const deleteCollectionFromTree = (
  collections: CollectionItem[],
  colId: string
): CollectionItem[] =>
  collections
    .filter((c) => c.id !== colId)
    .map((c) => ({
      ...c,
      collections: c.collections ? deleteCollectionFromTree(c.collections, colId) : undefined,
    }));

export const flattenCollectionsForPicker = (
  collections: CollectionItem[],
  prefix = ''
): { id: string; label: string }[] => {
  const out: { id: string; label: string }[] = [];
  for (const col of collections) {
    const label = prefix ? `${prefix} / ${col.name}` : col.name;
    out.push({ id: col.id, label });
    if (col.collections && col.collections.length > 0) {
      out.push(...flattenCollectionsForPicker(col.collections, label));
    }
  }
  return out;
};

export const filterCollectionsTree = (
  collections: CollectionItem[],
  query: string
): CollectionItem[] => {
  const q = query.trim().toLowerCase();
  if (!q) return collections;
  const out: CollectionItem[] = [];
  for (const col of collections) {
    const colMatch = col.name.toLowerCase().includes(q);
    const matchingRequests = colMatch
      ? col.requests
      : col.requests.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            r.url.toLowerCase().includes(q) ||
            r.method.toLowerCase().includes(q)
        );
    const matchingSubCols = col.collections
      ? filterCollectionsTree(col.collections, colMatch ? '' : q)
      : [];
    if (colMatch || matchingRequests.length > 0 || matchingSubCols.length > 0) {
      out.push({
        ...col,
        collapsed: false,
        requests: matchingRequests,
        collections: matchingSubCols,
      });
    }
  }
  return out;
};
