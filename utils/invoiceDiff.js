/**
 * Tạo key duy nhất để nhận diện item khi so sánh cũ/mới.
 * - rent/service: mỗi loại chỉ nên có 1 dòng -> key theo type
 * - electric/water: key theo type + utilityReadingId
 * - other: key theo type + label (+ description cho chắc)
 */
function buildItemKey(item) {
  if (!item) return "";

  const type = item.type || "";

  if (type === "rent" || type === "service") {
    return type;
  }

  if (type === "electric" || type === "water") {
    const rid = item.utilityReadingId
      ? String(item.utilityReadingId)
      : String(item.meta?.utilityReadingId || "");
    return `${type}:${rid}`;
  }

  // other
  const label = item.label || "";
  const desc = item.description || "";
  return `other:${label}:${desc}`;
}

/**
 * So sánh một trường đơn giản (number/string)
 */
function compareField(oldVal, newVal) {
  if (oldVal === undefined && newVal === undefined) return null;
  if (oldVal === null && newVal === null) return null;
  if (String(oldVal) === String(newVal)) return null;

  return {
    before: oldVal,
    after: newVal,
  };
}

/**
 * Tạo diff giữa 2 mảng items của invoice.
 * Trả về:
 * {
 *   updated: [
 *     {
 *       type,
 *       key,
 *       label,
 *       changes: {
 *         quantity: { before, after },
 *         unitPrice: { before, after },
 *         amount: { before, after },
 *         currentIndex: { before, after } // chỉ cho electric/water
 *       }
 *     }
 *   ],
 *   added: [ { ...itemNew } ],
 *   removed: [ { ...itemOld } ]
 * }
 */
function buildItemsDiff(oldItems = [], newItems = []) {
  const diff = {
    updated: [],
    added: [],
    removed: [],
  };

  const oldMap = new Map();
  const newMap = new Map();

  // Chuẩn hóa -> copy "plain" object
  const normalizeItem = (it) => {
    if (!it) return null;
    // Nếu là document mongoose -> toObject
    if (typeof it.toObject === "function") {
      return it.toObject();
    }
    return { ...it };
  };

  const oldNorm = (oldItems || []).map(normalizeItem).filter(Boolean);
  const newNorm = (newItems || []).map(normalizeItem).filter(Boolean);

  // Build map
  for (const item of oldNorm) {
    const key = buildItemKey(item);
    if (!key) continue;
    oldMap.set(key, item);
  }

  for (const item of newNorm) {
    const key = buildItemKey(item);
    if (!key) continue;
    newMap.set(key, item);
  }

  // Check removed + updated
  for (const [key, oldItem] of oldMap.entries()) {
    if (!newMap.has(key)) {
      // bị remove
      diff.removed.push(oldItem);
      continue;
    }

    const newItem = newMap.get(key);
    const changes = {};

    // Các field numeric cơ bản
    const qChange = compareField(oldItem.quantity, newItem.quantity);
    if (qChange) changes.quantity = qChange;

    const upChange = compareField(oldItem.unitPrice, newItem.unitPrice);
    if (upChange) changes.unitPrice = upChange;

    const amtChange = compareField(oldItem.amount, newItem.amount);
    if (amtChange) changes.amount = amtChange;

    // Với điện/nước: check meta.currentIndex
    if (oldItem.type === "electric" || oldItem.type === "water") {
      const oldIdx = oldItem.meta?.currentIndex;
      const newIdx = newItem.meta?.currentIndex;
      const idxChange = compareField(oldIdx, newIdx);
      if (idxChange) {
        changes.currentIndex = idxChange;
      }
    }

    if (Object.keys(changes).length > 0) {
      diff.updated.push({
        type: oldItem.type,
        key,
        label: oldItem.label,
        changes,
      });
    }
  }

  // Check added
  for (const [key, newItem] of newMap.entries()) {
    if (!oldMap.has(key)) {
      diff.added.push(newItem);
    }
  }

  return diff;
}

/**
 * Kiểm tra diff có trống không
 */
function isItemsDiffEmpty(diff) {
  if (!diff) return true;
  const { updated, added, removed } = diff;
  return (
    (!updated || updated.length === 0) &&
    (!added || added.length === 0) &&
    (!removed || removed.length === 0)
  );
}

module.exports = {
  buildItemsDiff,
  isItemsDiffEmpty,
};
