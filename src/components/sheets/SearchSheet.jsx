import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../../lib/firebase.js";
import { normalize } from "../../lib/appUtils.js";
import { renderHighlightedText } from "../itemFormatting.jsx";
import { Sheet } from "./Sheet.jsx";

export function SearchSheet({
  user,
  lists,
  onClose,
  onOpenList,
}) {
  const [search, setSearch] = useState("");
  const [itemMap, setItemMap] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!search.trim()) {
      setItemMap({});
      setLoading(false);
      return undefined;
    }

    setLoading(true);

    const unsubscribers = lists.map((list) => {
      const itemsQuery = query(
        collection(
          db,
          "users",
          user.uid,
          "lists",
          list.id,
          "items",
        ),
        orderBy("createdAt", "asc"),
      );

      return onSnapshot(
        itemsQuery,
        (snapshot) => {
          setItemMap((current) => ({
            ...current,
            [list.id]: snapshot.docs.map((itemDocument) => ({
              id: itemDocument.id,
              ...itemDocument.data(),
            })),
          }));

          setLoading(false);
        },
        () => {
          setLoading(false);
        },
      );
    });

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [search, lists, user.uid]);

  const results = useMemo(() => {
    const term = normalize(search);

    if (!term) return [];

    return lists
      .map((list) => {
        const listMatches = normalize(list.title).includes(term);

        const matchingItems = (itemMap[list.id] || []).filter((item) =>
          normalize(
            `${item.text} ${item.rawInput || ""}`,
          ).includes(term),
        );

        if (!listMatches && matchingItems.length === 0) {
          return null;
        }

        return {
          list,
          listMatches,
          matchingItems,
        };
      })
      .filter(Boolean);
  }, [search, lists, itemMap]);

  return (
    <Sheet onClose={onClose}>
      <div className="sheet-content search-sheet">
        <div className="sheet-handle" />

        <header className="sheet-header">
          <h2>Search</h2>

          <button type="button" onClick={onClose}>
            Done
          </button>
        </header>

        <input
          className="sheet-input"
          autoFocus
          value={search}
          placeholder="Search lists and items"
          onChange={(event) => setSearch(event.target.value)}
        />

        <div className="search-results">
          {!search.trim() ? (
            <p className="search-message">
              Search across all active lists.
            </p>
          ) : loading && results.length === 0 ? (
            <p className="search-message">Searching...</p>
          ) : results.length === 0 ? (
            <p className="search-message">No matches found.</p>
          ) : (
            results.map((result) => (
              <button
                key={result.list.id}
                className="search-result"
                type="button"
                onClick={() => onOpenList(result.list)}
              >
                <strong>
                  {renderHighlightedText(result.list.title, search)}
                </strong>

                {result.matchingItems.slice(0, 3).map((item) => (
                  <span key={item.id} className="search-result-item">
                    {renderHighlightedText(item.text, search)}
                  </span>
                ))}

                {result.listMatches &&
                  result.matchingItems.length === 0 && (
                    <span className="search-result-item">
                      List title matches
                    </span>
                  )}
              </button>
            ))
          )}
        </div>
      </div>
    </Sheet>
  );
}
